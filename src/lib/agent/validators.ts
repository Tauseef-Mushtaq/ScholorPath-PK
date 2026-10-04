import { AGENT_CONFIG } from "./config";

export type Parsed<T> = { ok: true; value: T } | { ok: false };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export function cleanText(s: string): string { return s.replace(CONTROL, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); }

export function uuidField(v: unknown): string | null { return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null; }
/** Required text within [min,max] after cleaning, or null. */
export function textField(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = cleanText(v);
  return t.length >= min && t.length <= max ? t : null;
}
/** Optional text: undefined/null/"" => null (valid); a present value must be valid text or the whole input is invalid. */
export function optText(v: unknown, max: number): Parsed<string | null> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  const t = textField(v, 1, max);
  return t === null ? { ok: false } : { ok: true, value: t };
}
export function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}
export function optDate(v: unknown): Parsed<string | null> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  const d = isoDate(v);
  return d === null ? { ok: false } : { ok: true, value: d };
}
export function intInRange(v: unknown, min: number, max: number, dflt: number): number | null {
  if (v === undefined || v === null) return dflt;
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}
export const LIMITS = AGENT_CONFIG;
