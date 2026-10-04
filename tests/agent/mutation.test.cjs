// Module 13 mutation checks. Each mutation deliberately breaks one security boundary in the SOURCE; the test suites
// (unit + static) MUST fail. Every file is restored byte-for-byte afterwards (hash-verified). Usage: npm run test:agent-mutation
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), cp = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const L = "src/lib/agent/";
const M = [
  ["allow unknown tool names / prototype keys (no own-property check)", L + "tools.ts", "!Object.prototype.hasOwnProperty.call(REGISTRY, name)", "false"],
  ["let FORBIDDEN tools through the policy", L + "policy.ts", 'if (def.risk === "FORBIDDEN") return { kind: "reject", code: "forbidden_tool" };', ""],
  ["bypass approval (approval-required tools execute)", L + "policy.ts", 'if (def.risk === "APPROVAL_REQUIRED") return { kind: "approval", def, name, input: parsed.value };', ""],
  ["remove the identity requirement", L + "policy.ts", 'if (!state.userId) return { kind: "reject", code: "unauthorized" };', ""],
  ["allow cross-scholarship tool calls", L + "policy.ts", 'if (v.scholarshipId !== undefined && state.scholarshipId !== null && v.scholarshipId !== state.scholarshipId) return { kind: "reject", code: "not_allowed_now" };', ""],
  ["remove the tool-call limit", L + "policy.ts", "if (state.counters.toolCalls >= AGENT_CONFIG.limits.maxToolCalls)", "if (false)"],
  ["remove the autonomy ceiling", L + "policy.ts", "if (RANK[state.autonomy] < RANK[def.minAutonomy])", "if (false)"],
  ["remove the iteration limit", L + "orchestrator.ts", "s.counters.iterations >= AGENT_CONFIG.limits.maxIterations", "false"],
  ["remove the execution-time limit", L + "orchestrator.ts", "deps.nowMs() - start > AGENT_CONFIG.limits.maxExecutionMs", "false"],
  ["accept any tool proposed by the model during retrieval", L + "orchestrator.ts", "fromModel ? MODEL_MAY_PROPOSE : undefined", "undefined"],
  ["skip executor-output validation", L + "orchestrator.ts", "if (!validOutput(decision.name, decision.input, raw))", "if (false)"],
  ["accept ungrounded numbers in model wording", L + "orchestrator.ts", "return nums.every((n) => digest.includes(n));", "return true;"],
  ["silently drop conflicting evidence", L + "orchestrator.ts", '.filter((f) => f.status === "conflicting")', ".filter(() => false)"],
  ["treat missing information as eligible", L + "eligibility.ts", 'else status = "unknown";', 'else status = "eligible";'],
  ["let model remove REQUIRED plan steps", L + "plan.ts", "new Set<PlanStepId>([...REQUIRED_STEPS, ...include])", "new Set<PlanStepId>(include)"],
  ["let retrieved text forge prompt boundaries (no neutralisation)", L + "model.ts", 'return text.replace(CONTROL, " ").replace(/<(\\s*\\/?\\s*)(data|task)/gi, "<\\u200B$1$2");', "return text;"],
  ["accept tampered approval tokens (no signature check)", L + "approval.ts", "if (!signer.verify(parts[0], parts[1]))", "if (false)"],
  ["allow another user's approval token", L + "approval.ts", "if (p.u !== userId)", "if (false)"],
  ["allow approval tokens for non-gated tools", L + "approval.ts", 'if (!def || def.risk !== "APPROVAL_REQUIRED")', "if (!def)"],
  ["ignore token expiry", L + "approval.ts", "if (nowMs > p.e)", "if (false)"],
  ["drop the scholarship filter on RAG evidence", L + "executors.server.ts", "r.chunks.filter((c) => c.scholarshipId === scholarshipId)", "r.chunks"],
  ["drop the owner filter on documents (cross-student)", L + "executors.server.ts", '.eq("user_id", ctx.userId)', ""],
  ["discovery: accept unknown keys in the model's criteria (tool/sql/userId)", L + "model.ts", "if (Object.keys(c).some((k) => !CRITERIA_KEYS.includes(k))) return null;", ""],
  ["discovery: skip the text allow-list on criteria values", L + "discovery.ts", " || !TEXT_OK.test(t)", ""],
  ["discovery: auto-select the first of several matches", L + "discovery.ts", "search.items.length === 1 && search.total === 1 && search.dropped.length === 0", "search.items.length >= 1"],
  ["discovery: search anyway when a requested country does not exist", L + "discovery.ts", "if (r.unresolved.length) return {", "if (false) return {"],
  ["discovery: accept fabricated rows (no UUID check on search output)", L + "orchestrator.ts", "uuidField(c.id) !== null && ", ""],
  ["discovery: silently truncate keyword tokens (no dropped report)", L + "discovery.ts", "const tokens = all.slice(0, MAX_SEARCH_TOKENS);", "const tokens = all;"],
  ["discovery: several matches in the preparation flow are silently picked", L + "orchestrator.ts", 'if (result.state === "selection_required") return S.terminate(S.pauseStep(s, step), "selection_required");', ""],
  ["discovery: a failing search is reported as an empty result", L + "orchestrator.ts", "if (!found.data) return finish(", "if (false) return finish("],
  ["make the same-origin check optional in the route", "src/app/api/agent/run/route.ts", 'if (!originHost || !host || originHost !== host) return json({ error: "forbidden" }, 403);', "if (originHost && host && originHost !== host) return json({ error: \"forbidden\" }, 403);"],
  ["drop authentication in the route", "src/app/api/agent/run/route.ts", 'if (!current) return json({ error: "unauthenticated" }, 401);', ""],
  ["drop server-only from the tool adapters", L + "executors.server.ts", 'import "server-only";\n', ""],
  // Repair Session 5 — profile tool
  ["profile: tool takes the user id from the model's input", L + "executors.server.ts", "loadOwnProfileResult(supabase, ctx.userId)", "loadOwnProfileResult(supabase, (_input as { userId?: string }).userId ?? ctx.userId)"],
  ["profile: drop the user_id filter (admin / wide RLS would return another student)", "src/lib/profile/queries.ts", '    .eq("user_id", userId)\n', "\n"],
  ["profile: a failed read is reported as an empty profile", L + "executors.server.ts", 'if (r.status === "error") return fail("getStudentProfile", "unavailable");', ""],
  ["profile: education never reaches the model digest", L + "profile.ts", "p.education.forEach((e, i) =>", "p.education.slice(0, 0).forEach((e, i) =>"],
  ["profile: profile section dropped from the model digest", L + "model.ts", 'const profile = s.profile !== null ? profileDigest(s.profile) : "";', 'const profile = "";'],
  ["profile: NaN / negative / absurd numbers accepted as CGPA", L + "profile.ts", "return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;", "return n;"],
  ["profile: CGPA above its scale is believed", L + "profile.ts", "const contradicts = cgpa !== null && scale !== null && cgpa > scale;", "const contradicts = false;"],
  ["profile: unreadable / over-cap records are not counted", L + "profile.ts", "omitted: raw.length - Math.min(usable.length, cap)", "omitted: 0"],
  ["profile: tool output shape is not validated", L + "orchestrator.ts", 'case "getStudentProfile": return isAgentProfile(d.profile);', 'case "getStudentProfile": return true;'],
  ["profile: the student's full name is sent to the model", L + "profile.ts", 'full name: ${p.personal.fullName ? "recorded" : "not recorded"}', "full name: ${p.personal.fullName ?? \"not recorded\"}"],
  ["profile: stored text is not cleaned (control characters / newlines reach the prompt)", L + "profile.ts", 'v.replace(CTRL, " ").replace(/\\s+/g, " ").trim()', "v.trim()"],
  ["profile: a missing profile row is reported as 'could not be read'", L + "profile.ts", 'return ["No profile record exists for this student"];', "return [];"],
];
const run = (cmd) => cp.spawnSync("bash", ["-c", cmd], { cwd: root, encoding: "utf8" });
const original = new Map(); for (const [, f] of M) if (!original.has(f)) original.set(f, fs.readFileSync(path.join(root, f)));
const hashes = new Map([...original].map(([f, b]) => [f, sha(b)]));
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
let killed = 0, survived = 0, bad = 0;
try {
  M.forEach(([name, file, find, repl], i) => {
    if (only && !only.includes(i)) return;
    const abs = path.join(root, file), src = original.get(file).toString("utf8");
    if (!src.includes(find)) { console.log(`  ERROR #${i} ${name}: pattern not found (mutation did not apply)`); bad++; return; }
    fs.writeFileSync(abs, src.replace(find, repl));
    const u = run("bash tests/agent/run-unit.sh"), s = run("node tests/agent/security-static.test.cjs");
    fs.writeFileSync(abs, original.get(file));
    const how = [u.status !== 0 ? "unit" : null, s.status !== 0 ? "static" : null].filter(Boolean).join("+");
    if (how) { killed++; console.log(`  KILLED   #${i} ${name} (${how})`); } else { survived++; console.log(`  SURVIVED #${i} ${name}`); }
  });
} finally {
  for (const [f, b] of original) fs.writeFileSync(path.join(root, f), b);
  for (const [f, h] of hashes) if (sha(fs.readFileSync(path.join(root, f))) !== h) { console.log("  RESTORE FAILED: " + f); bad++; }
}
console.log(`\nmutations: ${killed} killed, ${survived} survived, ${bad} errors (all files restored: ${bad === 0})`);
process.exit(survived || bad ? 1 : 0);
