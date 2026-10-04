"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Step = { id: string; label: string; status: string };
type Check = { key: string; label: string; outcome: string; detail: string };
type Report = {
  scholarship: { id: string; name: string } | null;
  eligibility: { status: string; checks: Check[]; limitations: string[] } | null;
  missing: { what: string; where: string }[];
  conflicts: { topic: string; evidence: { sourceName: string | null; sourceUrl: string; excerpt: string }[] }[];
  evidence: { chunkId: string; sourceName: string | null; sourceUrl: string; sourceType: string | null; section: string | null; excerpt: string }[];
  createdTasks: { id: string; title: string; dueDate: string | null }[];
  roadmap: { title: string; steps: { title: string; targetDate: string | null }[] } | null;
  nextAction: string;
  modelSummary: string | null;
};
type Approval = { id: string; summary: string; token: string };
type Run = { status: string; termination: string; plan: Step[]; activity: { label: string; status: string }[]; approvals: Approval[]; report: Report | null };

const GOAL = "Prepare me for this scholarship";
const ELIGIBILITY_LABEL: Record<string, string> = { eligible: "Eligible on the documented criteria", not_eligible: "Not eligible on a documented criterion", unknown: "Unknown", needs_information: "Needs more information from you" };
const STOP_TEXT: Record<string, string> = {
  goal_unsupported: "I can only help with preparing for a scholarship.",
  scholarship_not_identified: "I could not tell which scholarship you mean.",
  max_iterations: "I stopped early to stay within safe limits. Partial results are shown.",
  max_tool_calls: "I stopped early to stay within safe limits. Partial results are shown.",
  max_model_calls: "I stopped early to stay within safe limits. Partial results are shown.",
  max_execution_time: "This took too long, so I stopped. Partial results are shown.",
  max_evidence: "I stopped early to stay within safe limits. Partial results are shown.",
  too_many_rejected_proposals: "I stopped because the plan could not be carried out safely. Partial results are shown.",
  tool_failure: "Something went wrong. Partial results are shown.",
};
const ERRORS: Record<number, string> = { 401: "Please sign in to use the preparation assistant.", 404: "This scholarship could not be found.", 503: "The assistant is not available right now. Please try again later." };

const mark = (s: string) => (s === "completed" ? "✓" : s === "failed" ? "!" : s === "skipped" ? "–" : "→");

/** Preparation-goal assistant (Module 13). Shows concise progress and results only: no reasoning, no internal tool details. */
export function AgentPanel({ scholarshipId }: { scholarshipId: string }) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Record<string, string>>({});

  async function post(body: unknown): Promise<Response | null> {
    try { return await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); } catch { return null; }
  }
  async function start() {
    if (busy) return;
    setBusy(true); setError(null); setRun(null); setDecision({});
    const res = await post({ action: "start", goal: GOAL, scholarshipId });
    if (!res) setError("Something went wrong. Please try again.");
    else if (!res.ok) setError(ERRORS[res.status] ?? "Something went wrong. Please try again.");
    else { const data = (await res.json()) as Run; if (data && Array.isArray(data.plan)) setRun(data); else setError("Something went wrong. Please try again."); }
    setBusy(false);
  }
  async function decide(a: Approval, d: "approve" | "decline") {
    setDecision((m) => ({ ...m, [a.id]: "working" }));
    const res = await post({ action: "decide", token: a.token, decision: d });
    setDecision((m) => ({ ...m, [a.id]: res && res.ok ? (d === "approve" ? "approved" : "declined") : "error" }));
  }

  const r = run?.report ?? null;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border px-4 py-4">
        <h3 className="text-sm font-semibold">Preparation assistant</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          I can check this scholarship’s recorded requirements, review your profile and documents, check eligibility, find what is missing, create preparation tasks and a roadmap, and ask your approval before changing anything you already have.
          I never submit an application, send messages or share your documents.
        </p>
        <div className="mt-3"><Button type="button" onClick={start} disabled={busy}>{busy ? "Preparing…" : "Prepare me for this scholarship"}</Button></div>
        {busy ? <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">Understanding your goal → reviewing the scholarship, your profile and the verified sources → building your plan. This can take a little while.</p> : null}
      </div>

      <div aria-live="polite" className="space-y-3">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {run ? (
          <>
            <ol className="space-y-1 text-sm" aria-label="Progress">
              {run.plan.map((s) => <li key={s.id}><span aria-hidden="true">{mark(s.status)}</span> {s.label}{s.status === "pending" ? " (not done)" : s.status === "failed" ? " (could not be completed)" : ""}</li>)}
            </ol>
            {run.status === "stopped" && STOP_TEXT[run.termination] ? <p className="rounded-xl border px-4 py-3 text-sm">{STOP_TEXT[run.termination]}</p> : null}
            {run.termination === "scholarship_not_found" ? <p className="rounded-xl border px-4 py-3 text-sm">This scholarship could not be found.</p> : null}
          </>
        ) : null}

        {r ? (
          <div className="space-y-4">
            {r.modelSummary ? <p className="rounded-xl border px-4 py-3 text-sm">{r.modelSummary} <span className="text-xs text-muted-foreground">(AI wording; check the details below)</span></p> : null}
            {r.eligibility ? (
              <section className="space-y-2">
                <h4 className="text-sm font-semibold">Eligibility: {ELIGIBILITY_LABEL[r.eligibility.status] ?? "Unknown"}</h4>
                <ul className="space-y-1 text-sm">{r.eligibility.checks.map((c) => <li key={c.key + c.label}><span className="font-medium">{c.label}</span> — {c.outcome.replace("_", " ")}. <span className="text-muted-foreground">{c.detail}</span></li>)}</ul>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">{r.eligibility.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </section>
            ) : null}
            {r.conflicts.length ? (
              <section className="rounded-xl border border-destructive/40 px-4 py-3 text-sm">
                <h4 className="font-semibold">Sources disagree — needs verification</h4>
                {r.conflicts.map((c) => <div key={c.topic} className="mt-1"><p className="font-medium">{c.topic}</p><ul className="list-disc pl-5 text-xs">{c.evidence.map((e) => <li key={e.sourceUrl + e.excerpt}>{e.sourceName ?? "Source"}: “{e.excerpt}”</li>)}</ul></div>)}
              </section>
            ) : null}
            {r.missing.length ? (<section><h4 className="text-sm font-semibold">Missing or to confirm</h4><ul className="list-disc pl-5 text-sm">{r.missing.map((m) => <li key={m.where + m.what}>{m.what}</li>)}</ul></section>) : null}
            {r.createdTasks.length ? (<section><h4 className="text-sm font-semibold">Preparation tasks created</h4><ol className="list-decimal pl-5 text-sm">{r.createdTasks.map((t) => <li key={t.id}>{t.title}{t.dueDate ? ` (due ${t.dueDate})` : ""}</li>)}</ol></section>) : null}
            {r.roadmap ? (<section><h4 className="text-sm font-semibold">{r.roadmap.title}</h4><ol className="list-decimal pl-5 text-sm">{r.roadmap.steps.map((s) => <li key={s.title}>{s.title}{s.targetDate ? ` (by ${s.targetDate})` : ""}</li>)}</ol></section>) : null}
            {r.evidence.length ? (<section><h4 className="text-sm font-semibold">Verified sources consulted</h4><ul className="space-y-1 text-xs text-muted-foreground">{r.evidence.map((e) => <li key={e.chunkId}>{e.sourceName ?? "Source"}{e.section ? ` — ${e.section}` : ""}: “{e.excerpt}”</li>)}</ul></section>) : null}
            <p className="rounded-xl border px-4 py-3 text-sm"><span className="font-semibold">Next recommended action: </span>{r.nextAction}</p>
          </div>
        ) : null}

        {run?.approvals.length ? (
          <section className="space-y-2" aria-label="Approval needed">
            <h4 className="text-sm font-semibold">Your approval is needed</h4>
            {run.approvals.map((a) => (
              <div key={a.id} className="rounded-xl border px-4 py-3 text-sm">
                <p>I would like to: {a.summary}.</p>
                {decision[a.id] === "approved" ? <p className="mt-2 text-muted-foreground">Approved and applied.</p>
                  : decision[a.id] === "declined" ? <p className="mt-2 text-muted-foreground">Declined. Nothing was changed.</p>
                  : (
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" disabled={decision[a.id] === "working"} onClick={() => decide(a, "approve")}>Approve</Button>
                      <Button type="button" size="sm" variant="outline" disabled={decision[a.id] === "working"} onClick={() => decide(a, "decline")}>Decline</Button>
                      {decision[a.id] === "error" ? <span role="alert" className="text-destructive">That did not work. Please try again.</span> : null}
                    </div>
                  )}
              </div>
            ))}
          </section>
        ) : null}
        <p className="text-xs text-muted-foreground">AI-assisted. Requirements come from recorded sources and may be out of date. Confirm everything on the official website before you apply. This assistant never submits applications.</p>
      </div>
    </div>
  );
}
