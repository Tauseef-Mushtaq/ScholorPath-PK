import { KNOWLEDGE_CONFIG, type KnowledgeErrorCode } from "./config";
import { normalizeText } from "./normalize";

/** A run of text under one heading (section = nearest preceding h1–h3, or null). */
export type TextBlock = { section: string | null; text: string };
export type Extracted = { title: string | null; blocks: TextBlock[] };
export type ExtractOutcome = { ok: true; value: Extracted } | { ok: false; code: KnowledgeErrorCode };

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", bull: "•", middot: "·", euro: "€", pound: "£",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : "";
    }
    return NAMED[e] ?? m;
  });
}

const H = "\u0001", E = "\u0002";   // markers; control chars are stripped from input first

function htmlToBlocks(html: string): Extracted {
  let s = html.replace(/[\u0001\u0002]/g, "");
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(s);
  const title = t ? normalizeText(decodeEntities(t[1].replace(/<[^>]*>/g, " "))) || null : null;
  s = s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|head|nav|footer|aside|form|button|select)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, _l, inner: string) => `\n${H}${inner.replace(/<[^>]*>/g, " ")}${E}\n`)
    .replace(/<\/?(p|div|li|ul|ol|br|tr|table|section|article|header|main|blockquote|pre|h[4-6]|dd|dt|dl|figure|figcaption)\b[^>]*>/gi, "\n\n")
    .replace(/<\/(td|th)\s*>/gi, " | ")
    .replace(/<[^>]*>/g, " ");
  const text = decodeEntities(s);
  const blocks: TextBlock[] = [];
  let section: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const body = normalizeText(buf.join("\n")); buf = [];
    if (body) blocks.push({ section, text: body });
  };
  for (const part of text.split(new RegExp(`(${H}[^${E}]*${E})`))) {
    if (part.startsWith(H)) {
      flush();
      section = normalizeText(part.slice(1, -1)).slice(0, 300) || null;
    } else buf.push(part);
  }
  flush();
  return { title, blocks };
}

export function extractText(contentType: string, raw: string): ExtractOutcome {
  const type = contentType.toLowerCase();
  let out: Extracted;
  if (type === "text/html" || type === "application/xhtml+xml") out = htmlToBlocks(raw);
  else if (type === "text/plain") {
    const body = normalizeText(raw);
    out = { title: null, blocks: body ? [{ section: null, text: body }] : [] };
  } else return { ok: false, code: "unsupported_content_type" };

  const total = out.blocks.reduce((n, b) => n + b.text.length, 0);
  if (total === 0) return { ok: false, code: "empty_content" };
  if (total > KNOWLEDGE_CONFIG.extract.maxExtractedChars) return { ok: false, code: "content_too_large" };
  return { ok: true, value: out };
}
