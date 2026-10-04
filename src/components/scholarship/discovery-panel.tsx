"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Candidate = {
  id: string; name: string; provider: string; degreeLevel: string; field: string | null; fundingType: string;
  deadline: string | null; country: string | null; university: string | null;
};
type Discovery = {
  state: "selected" | "selection_required" | "no_results" | "invalid_criteria";
  candidates: Candidate[];
  total: number;
  explanation: string;
};
type Run = { status: string; termination: string; report: { discovery: Discovery | null; nextAction: string } | null };

const MAX = 500;
const EXAMPLE = "Find fully funded Master's scholarships in Germany for Computer Science";
const FUNDING: Record<string, string> = { fully_funded: "Fully funded", partially_funded: "Partially funded", not_funded: "Admission only" };
const ERRORS: Record<number, string> = {
  400: "Please describe what you are looking for in 3 to 500 characters.",
  401: "Please sign in to use scholarship discovery.",
  503: "The assistant is not available right now. Please try again later.",
};

/**
 * Natural-language scholarship discovery. Sends the request to the existing agent route; shows ONLY what the server returns:
 * real database rows and a server-written explanation. Nothing here is generated in the browser.
 */
export function DiscoveryPanel() {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", goal }) });
      if (!res.ok) setError(ERRORS[res.status] ?? "Something went wrong. Please try again.");
      else {
        const data = (await res.json()) as Run;
        if (data && typeof data.status === "string") setRun(data);
        else setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const d = run?.report?.discovery ?? null;
  const unsupported = run && !d && run.status === "stopped";
  return (
    <section aria-labelledby="discovery-heading" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id="discovery-heading" className="text-sm font-semibold">Describe the scholarship you want</h2>
      <p className="text-sm text-muted-foreground">
        Write it in your own words. The assistant turns it into filters and searches the recorded scholarships. It never invents scholarships and never picks one for you.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="discovery-goal" className="sr-only">Describe the scholarship you want</label>
        <input
          id="discovery-goal"
          type="text"
          value={goal}
          maxLength={MAX}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={EXAMPLE}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={busy || goal.trim().length < 3}>{busy ? "Searching…" : "Find scholarships"}</Button>
      </form>

      <div aria-live="polite" className="space-y-3">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {unsupported ? <p className="text-sm">I could not search for that. Try describing the country, degree level, field or funding you want.</p> : null}
        {d ? (
          <>
            <p className="text-sm">{d.explanation}</p>
            {d.candidates.length ? (
              <ul className="space-y-2">
                {d.candidates.map((c) => (
                  <li key={c.id} className="rounded-lg border px-3 py-2 text-sm">
                    <Link href={`/scholarships/${c.id}`} className="font-medium underline underline-offset-4">{c.name}</Link>
                    <p className="text-xs text-muted-foreground">
                      {[c.provider, c.country, c.university, c.degreeLevel, c.field, FUNDING[c.fundingType] ?? null, c.deadline ? `Deadline ${c.deadline}` : "Deadline not listed"].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {run?.report?.nextAction ? <p className="text-xs text-muted-foreground">{run.report.nextAction}</p> : null}
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">AI-assisted search. Results come from recorded scholarship data and may be out of date. Confirm everything on the official website.</p>
    </section>
  );
}
