"use client";

import { useCallback, useState, useTransition } from "react";

import { approveDraft, deleteDraft, saveDraft, updateDraftContent } from "@/lib/copilot/actions";
import { DRAFT_TYPES, draftTypeLabel, type DraftType } from "@/lib/copilot/constants";
import type { ApplicationDraft } from "@/lib/copilot/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  applicationId: string;
  drafts: ApplicationDraft[];
};

export function CopilotPanel({ applicationId, drafts }: Props) {
  const [draftType, setDraftType] = useState<DraftType>("sop");
  const [question, setQuestion] = useState("");
  const [extra, setExtra] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadDraft = useCallback((d: ApplicationDraft) => {
    setSelectedId(d.id);
    setDraftType(d.draftType);
    setContent(d.content);
    setTitle(d.title ?? "");
    setWarnings([]);
    setMessage(null);
    setError(null);
  }, []);

  async function onGenerate() {
    setGenerating(true);
    setError(null);
    setMessage(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/copilot/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          draftType,
          question: draftType === "application_question" ? question : undefined,
          extraInstructions: extra || undefined,
          existingContent: content.trim() ? content : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        content?: string;
        warnings?: string[];
        message?: string;
      };
      if (!res.ok || !data.ok || typeof data.content !== "string") {
        setError(data.message ?? "Generation failed.");
        return;
      }
      setContent(data.content);
      setSelectedId(null);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setMessage("Draft generated. Review carefully, edit if needed, then save.");
    } catch {
      setError("Network error while generating.");
    } finally {
      setGenerating(false);
    }
  }

  function onSave() {
    startTransition(async () => {
      setError(null);
      const result = await saveDraft({
        applicationId,
        draftType,
        title: title || null,
        content,
        aiGenerated: true,
        promptSummary: extra ? extra.slice(0, 500) : null,
      });
      if (result.error) setError(result.error);
      else {
        setMessage(result.success ?? "Saved.");
        if (result.draftId) setSelectedId(result.draftId);
      }
    });
  }

  function onUpdate() {
    if (!selectedId) return;
    startTransition(async () => {
      setError(null);
      const result = await updateDraftContent({
        draftId: selectedId,
        applicationId,
        content,
        title: title || null,
      });
      if (result.error) setError(result.error);
      else setMessage(result.success ?? "Updated.");
    });
  }

  function onApprove(id: string) {
    startTransition(async () => {
      const result = await approveDraft(id, applicationId);
      if (result.error) setError(result.error);
      else setMessage(result.success ?? "Approved.");
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const result = await deleteDraft(id, applicationId);
      if (result.error) setError(result.error);
      else {
        setMessage(result.success ?? "Deleted.");
        if (selectedId === id) {
          setSelectedId(null);
          setContent("");
        }
      }
    });
  }

  const busy = generating || pending;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Application Copilot</CardTitle>
        <CardDescription>
          Draft SOP, essays, motivation letters, research proposals, CV summaries, and application answers.
          Uses only your profile and this scholarship — never invents achievements. Always review before submitting
          externally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Saved drafts</p>
            <ul className="space-y-2">
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <button
                    type="button"
                    className="text-left font-medium underline-offset-2 hover:underline"
                    onClick={() => loadDraft(d)}
                  >
                    {draftTypeLabel(d.draftType)}
                    {d.title ? ` — ${d.title}` : ""} · v{d.version}
                    {d.aiGenerated ? " · AI" : ""}
                    {d.userApproved ? " · reviewed" : ""}
                  </button>
                  <span className="flex gap-2">
                    {!d.userApproved ? (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onApprove(d.id)}>
                        Mark reviewed
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onDelete(d.id)}>
                      Delete
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No saved drafts yet.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="copilot-type">Draft type</Label>
            <select
              id="copilot-type"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as DraftType)}
              disabled={busy}
            >
              {DRAFT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-title">Title (optional)</Label>
            <Input
              id="copilot-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
              placeholder="e.g. SOP — DAAD EPOS"
            />
          </div>
        </div>

        {draftType === "application_question" ? (
          <div className="space-y-1.5">
            <Label htmlFor="copilot-question">Application question</Label>
            <textarea
              id="copilot-question"
              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={2000}
              disabled={busy}
              placeholder="Paste the question from the application form"
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="copilot-extra">Extra instructions (optional)</Label>
          <Input
            id="copilot-extra"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            maxLength={1000}
            disabled={busy}
            placeholder="e.g. Emphasise community work; keep under 500 words"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onGenerate} disabled={busy}>
            {generating ? "Generating…" : content.trim() ? "Revise with AI" : "Generate draft"}
          </Button>
          <Button type="button" variant="outline" onClick={onSave} disabled={busy || !content.trim()}>
            Save as new version
          </Button>
          {selectedId ? (
            <Button type="button" variant="outline" onClick={onUpdate} disabled={busy || !content.trim()}>
              Update selected
            </Button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="copilot-content">Draft</Label>
          <textarea
            id="copilot-content"
            className="min-h-[240px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm leading-relaxed shadow-xs"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={50000}
            disabled={busy}
            placeholder="Generated or manually written draft appears here…"
          />
          <p className="text-xs text-muted-foreground">{content.length.toLocaleString()} / 50,000 characters</p>
        </div>
      </CardContent>
    </Card>
  );
}
