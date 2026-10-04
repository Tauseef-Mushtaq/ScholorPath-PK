import { AGENT_CONFIG } from "./config";
import { lookupTool } from "./tools";
import type { ApprovalRequest, ExecutableToolName } from "./types";
import { isRecord } from "./validators";

/**
 * Signed, stateless approval tokens. The server signs {user, tool, validated input, expiry}; the browser can only hand
 * the token back with a decision. It cannot alter the action (HMAC), cannot use it as another user, and cannot create
 * an approval the server did not ask for. `ApprovalSigner` is injected so this module stays pure and testable.
 * Limitation (ADR-035): no server-side store, so a token can be replayed until it expires; approval-required tools
 * are therefore idempotent updates only.
 */
export interface ApprovalSigner { sign(data: string): string; verify(data: string, signature: string): boolean }

type Payload = { v: 1; u: string; t: ExecutableToolName; i: unknown; e: number; n: string };
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export function createApprovalRequest(args: { signer: ApprovalSigner; userId: string; tool: ExecutableToolName; input: unknown; summary: string; nowMs: number; nonce: string }): ApprovalRequest {
  const def = lookupTool(args.tool);
  const expires = args.nowMs + AGENT_CONFIG.approval.ttlMs;
  const payload: Payload = { v: 1, u: args.userId, t: args.tool, i: args.input, e: expires, n: args.nonce };
  const body = b64(JSON.stringify(payload));
  return { id: args.nonce, tool: args.tool, risk: def?.risk ?? "APPROVAL_REQUIRED", summary: args.summary, token: `${body}.${args.signer.sign(body)}`, expiresAt: new Date(expires).toISOString() };
}

export type VerifiedApproval = { ok: true; tool: ExecutableToolName; input: unknown } | { ok: false; code: "invalid_token" | "expired" | "wrong_user" };

export function verifyApprovalToken(token: unknown, userId: string, nowMs: number, signer: ApprovalSigner): VerifiedApproval {
  if (typeof token !== "string" || token.length > 12_000) return { ok: false, code: "invalid_token" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: "invalid_token" };
  try {
    if (!signer.verify(parts[0], parts[1])) return { ok: false, code: "invalid_token" };
    const p: unknown = JSON.parse(unb64(parts[0]));
    if (!isRecord(p) || p.v !== 1 || typeof p.u !== "string" || typeof p.t !== "string" || typeof p.e !== "number") return { ok: false, code: "invalid_token" };
    if (p.u !== userId) return { ok: false, code: "wrong_user" };
    if (nowMs > p.e) return { ok: false, code: "expired" };
    const def = lookupTool(p.t);
    // Only a registered, executable, approval-gated tool can ever be run from a token.
    if (!def || def.risk !== "APPROVAL_REQUIRED") return { ok: false, code: "invalid_token" };
    return { ok: true, tool: def.name as ExecutableToolName, input: p.i };
  } catch {
    return { ok: false, code: "invalid_token" };
  }
}
