import { isIP } from "node:net";

import { KNOWLEDGE_CONFIG, type KnowledgeErrorCode } from "./config";

/**
 * Source URLs are UNTRUSTED even when read from the database (ADR-033 §3).
 * This module is pure (no network). DNS resolution is injected by the fetch layer.
 */

export type ParsedUrl = { ok: true; url: URL } | { ok: false; code: Extract<KnowledgeErrorCode, "invalid_url" | "blocked_url"> };

function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n >= 0 && n <= 255) ? p : null;
}

/** Expands an IPv6 literal to 8 16-bit groups (supports `::` and an embedded IPv4 tail). */
function parseIPv6(input: string): number[] | null {
  let s = input.toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (isIP(s) !== 6) return null;
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) {
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toGroups = (h: string) => (h === "" ? [] : h.split(":").map((g) => parseInt(g, 16)));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill(0), ...rest];
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;
  if (tail.length) { groups[6] = tail[0]; groups[7] = tail[1]; }
  return groups;
}

function isPrivateIPv4(p: number[]): boolean {
  const [a, b, c] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||           // CGNAT
    (a === 169 && b === 254) ||                      // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224                                         // multicast, reserved, broadcast
  );
}

/** True when the address is NOT a public unicast address (or cannot be parsed → fail closed). */
export function isBlockedIp(address: string): boolean {
  const raw = address.trim();
  const v4 = parseIPv4(raw);
  if (v4) return isPrivateIPv4(v4);
  const g = parseIPv6(raw);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true;                                   // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;         // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true;  // link-local, site-local
  if ((g[0] & 0xff00) === 0xff00) return true;                                // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                        // documentation
  if (g[0] === 0x2002) return true;                                           // 6to4 (embeds arbitrary v4)
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true;                        // NAT64
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) { // v4-mapped / v4-compatible
    return isPrivateIPv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  return false;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".localdomain"];

/** Validates syntax, protocol, credentials, port and obviously-internal hostnames. No DNS. */
export function parseSourceUrl(raw: unknown): ParsedUrl {
  if (typeof raw !== "string") return { ok: false, code: "invalid_url" };
  const text = raw.trim();
  if (!text || text.length > KNOWLEDGE_CONFIG.fetch.maxUrlLength || /[\u0000-\u0020\u007f]/.test(text)) {
    return { ok: false, code: "invalid_url" };
  }
  let url: URL;
  try { url = new URL(text); } catch { return { ok: false, code: "invalid_url" }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, code: "blocked_url" };
  if (url.username || url.password) return { ok: false, code: "blocked_url" };
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!KNOWLEDGE_CONFIG.fetch.allowedPorts.includes(port)) return { ok: false, code: "blocked_url" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, code: "invalid_url" };
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, code: "blocked_url" };
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) {
    return isBlockedIp(host) ? { ok: false, code: "blocked_url" } : { ok: true, url };
  }
  if (!host.includes(".")) return { ok: false, code: "blocked_url" };   // single-label (intranet) names
  return { ok: true, url };
}

/** Resolver injected by the fetch layer: returns ALL A/AAAA addresses for a hostname. */
export type Resolver = (hostname: string) => Promise<string[]>;

/** parseSourceUrl + DNS check: every resolved address must be public. */
export async function assertPublicUrl(raw: unknown, resolve: Resolver): Promise<ParsedUrl | { ok: false; code: "dns_failed" }> {
  const parsed = parseSourceUrl(raw);
  if (!parsed.ok) return parsed;
  const host = parsed.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) return parsed;
  let addrs: string[];
  try { addrs = await resolve(host); } catch { return { ok: false, code: "dns_failed" }; }
  if (!Array.isArray(addrs) || addrs.length === 0) return { ok: false, code: "dns_failed" };
  if (addrs.some((a) => typeof a !== "string" || isBlockedIp(a))) return { ok: false, code: "blocked_url" };
  return parsed;
}
