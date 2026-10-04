import { KNOWLEDGE_CONFIG, type KnowledgeErrorCode } from "./config";
import { assertPublicUrl, type Resolver } from "./url-safety";

/**
 * Bounded, SSRF-aware retrieval of a source URL (ADR-033 §3). All I/O is injected so the logic is testable.
 * Every redirect hop is re-validated (syntax + DNS) before it is requested. Cookies/credentials are never sent.
 *
 * KNOWN LIMITATION (documented in ADR-033): DNS is resolved by this module and again by the HTTP stack when
 * connecting, so a hostile DNS server could in theory answer differently the second time (rebinding). Pinning the
 * resolved IP requires a custom dispatcher and is listed as hardening work for Module 18.
 */
export type FetchLike = (url: string, init: { method: "GET"; redirect: "manual"; headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } } | null;
}>;

export type FetchedSource = { finalUrl: string; contentType: string; text: string; bytes: number };
export type FetchOutcome = { ok: true; value: FetchedSource } | { ok: false; code: KnowledgeErrorCode };

export type FetchDeps = { fetch: FetchLike; resolve: Resolver; /** test hook; defaults to KNOWLEDGE_CONFIG.fetch.timeoutMs */ timeoutMs?: number };

/** Returns the lowercased media type without parameters, or "" when absent. */
export function mediaType(header: string | null): string {
  return (header ?? "").split(";")[0].trim().toLowerCase();
}

function charsetOf(header: string | null): string {
  const m = /charset\s*=\s*"?([a-zA-Z0-9_\-:.]+)"?/i.exec(header ?? "");
  return m ? m[1].toLowerCase() : "utf-8";
}

export async function fetchSource(rawUrl: string, deps: FetchDeps): Promise<FetchOutcome> {
  const cfg = KNOWLEDGE_CONFIG.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? cfg.timeoutMs);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= cfg.maxRedirects; hop++) {
      const checked = await assertPublicUrl(current, deps.resolve);
      if (!checked.ok) return { ok: false, code: checked.code };
      let res;
      try {
        res = await deps.fetch(checked.url.toString(), {
          method: "GET",
          redirect: "manual",
          headers: { Accept: "text/html,text/plain;q=0.9", "User-Agent": cfg.userAgent },
          signal: controller.signal,
        });
      } catch {
        return { ok: false, code: controller.signal.aborted ? "fetch_timeout" : "fetch_failed" };
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        try { await res.body?.getReader().cancel(); } catch { /* ignore */ }
        if (!loc) return { ok: false, code: "http_error" };
        if (hop === cfg.maxRedirects) return { ok: false, code: "too_many_redirects" };
        try { current = new URL(loc, checked.url).toString(); } catch { return { ok: false, code: "invalid_url" }; }
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        try { await res.body?.getReader().cancel(); } catch { /* ignore */ }
        return { ok: false, code: "http_error" };
      }
      const ctHeader = res.headers.get("content-type");
      const type = mediaType(ctHeader);
      if (!cfg.allowedContentTypes.includes(type)) {
        try { await res.body?.getReader().cancel(); } catch { /* ignore */ }
        return { ok: false, code: "unsupported_content_type" };
      }
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > cfg.maxResponseBytes) {
        try { await res.body?.getReader().cancel(); } catch { /* ignore */ }
        return { ok: false, code: "response_too_large" };
      }
      if (!res.body) return { ok: false, code: "empty_content" };
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > cfg.maxResponseBytes) { try { await reader.cancel(); } catch { /* ignore */ } return { ok: false, code: "response_too_large" }; }
          chunks.push(value);
        }
      } catch {
        return { ok: false, code: controller.signal.aborted ? "fetch_timeout" : "fetch_failed" };
      }
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
      let text: string;
      try { text = new TextDecoder(charsetOf(ctHeader)).decode(buf); } catch { text = new TextDecoder("utf-8").decode(buf); }
      return { ok: true, value: { finalUrl: checked.url.toString(), contentType: type, text, bytes: total } };
    }
    return { ok: false, code: "too_many_redirects" };
  } finally {
    clearTimeout(timer);
  }
}
