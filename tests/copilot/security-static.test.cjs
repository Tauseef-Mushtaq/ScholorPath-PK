/**
 * Module 15 — static security checks for Application Copilot.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustInclude(file, needles, label) {
  const src = read(file);
  for (const n of needles) {
    assert.ok(src.includes(n), `${label}: expected ${file} to include ${JSON.stringify(n)}`);
  }
}

function mustNotInclude(file, needles, label) {
  const src = read(file);
  for (const n of needles) {
    assert.ok(!src.includes(n), `${label}: ${file} must not include ${JSON.stringify(n)}`);
  }
}

let n = 0;

// Migration: RLS + owns_application, no broad grants
const mig = "supabase/migrations/20261003000300_application_drafts.sql";
mustInclude(
  mig,
  [
    "enable row level security",
    "owns_application",
    "revoke all on table public.application_drafts",
    "application_drafts_select_own",
    "application_drafts_insert_own",
  ],
  "migration",
);
n += 5;

mustNotInclude(mig, ["to anon", "service_role"], "migration no anon/service grants on table policies");
n += 1;

// Actions: no service role, session identity
const actions = "src/lib/copilot/actions.ts";
mustInclude(actions, ['"use server"', "auth.getUser()", "createClient"], "actions");
mustNotInclude(actions, ["SERVICE_ROLE", "service_role", "getSupabaseServiceRoleKey"], "actions no service role");
n += 4;

// Service: no invent-facts instructions, uses profile + ownership
const service = "src/lib/copilot/service.server.ts";
mustInclude(service, ["loadOwnProfileResult", "eq(\"user_id\"", "generateDraftForUser"], "service");
n += 3;

const prompt = "src/lib/copilot/prompt.ts";
mustInclude(prompt, ["Never invent", "SYSTEM_INSTRUCTION", "neutralize"], "prompt safety");
n += 3;

// API route: auth required, origin check
const route = "src/app/api/copilot/draft/route.ts";
mustInclude(route, ["getUser()", "generateDraftForUser", "401"], "route");
mustNotInclude(route, ["SERVICE_ROLE", "service_role"], "route no service role");
n += 4;

// Client panel does not embed API keys
const panel = "src/components/copilot/copilot-panel.tsx";
mustNotInclude(panel, ["GEMINI_API_KEY", "API_KEY", "apiKey"], "panel no keys");
n += 1;

console.log(`copilot security-static: ${n} checks passed`);
