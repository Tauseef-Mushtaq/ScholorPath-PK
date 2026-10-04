"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { AgentPanel } from "./agent-panel";

type Source = { n: number; name: string | null; url: string; type: string | null; section: string | null; lastVerifiedAt: string | null; excerpt: string };
type Reply =
  | { kind: "answered"; answer: string; sources: Source[] }
  | { kind: "insufficient"; message: string }
  | { kind: "error"; message: string };

const MAX = 500;
const ERRORS: Record<number, string> = {
  400: "Please enter a question between 3 and 500 characters.",
  401: "Please sign in to ask a question.",
  404: "This scholarship could not be found.",
  503: "The assistant is not available right now. Please try again later.",
};

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.host : null;
  } catch {
    return null;
  }
}

export function AssistantPanel({ scholarshipId, isAuthenticated }: { scholarshipId: string; isAuthenticated: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);

  if (!isAuthenticated) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">Sign in</Link> to ask questions about this scholarship. Answers use only the sources recorded for it.
      </p>
    );
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setReply(null);
    try {
      const res = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarshipId, question }),
      });
      if (!res.ok) {
        setReply({ kind: "error", message: ERRORS[res.status] ?? "Something went wrong. Please try again." });
        return;
      }
      const data = (await res.json()) as { status?: string; answer?: string; message?: string; sources?: Source[] };
      if (data.status === "answered" && typeof data.answer === "string" && Array.isArray(data.sources)) {
        setReply({ kind: "answered", answer: data.answer, sources: data.sources });
      } else if (data.status === "insufficient" && typeof data.message === "string") {
        setReply({ kind: "insufficient", message: data.message });
      } else {
        setReply({ kind: "error", message: "Something went wrong. Please try again." });
      }
    } catch {
      setReply({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <AgentPanel scholarshipId={scholarshipId} />
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="assistant-question" className="sr-only">Your question about this scholarship</label>
        <textarea
          id="assistant-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX}
          rows={3}
          placeholder="For example: Is IELTS required?"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{question.length}/{MAX}</span>
          <Button type="submit" disabled={busy || question.trim().length < 3}>{busy ? "Searching sources…" : "Ask"}</Button>
        </div>
      </form>

      <div aria-live="polite" className="space-y-3">
        {reply?.kind === "error" ? <p role="alert" className="text-sm text-destructive">{reply.message}</p> : null}
        {reply?.kind === "insufficient" ? <p className="rounded-xl border px-4 py-3 text-sm">{reply.message}</p> : null}
        {reply?.kind === "answered" ? (
          <div className="space-y-3">
            <p className="whitespace-pre-line rounded-xl border px-4 py-3 text-sm">{reply.answer}</p>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Sources used</h3>
              <ol className="space-y-2">
                {reply.sources.map((s) => {
                  const host = hostOf(s.url);
                  return (
                    <li key={s.n} className="rounded-lg border px-3 py-2 text-sm">
                      <p className="font-medium">[{s.n}] {s.name ?? host ?? "Source"}{s.section ? ` — ${s.section}` : ""}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.type ? `Type: ${s.type}. ` : ""}{s.lastVerifiedAt ? `Last verified: ${s.lastVerifiedAt.slice(0, 10)}.` : "Verification date not recorded."}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">“{s.excerpt}”</p>
                      {host ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline underline-offset-4">
                          Open {host} <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">AI-generated from the recorded sources. It can be wrong or out of date. Confirm on the official website before you apply.</p>
      </div>
    </div>
  );
}
