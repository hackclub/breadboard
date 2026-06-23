"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Github, Save, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import {
  type EditorSaveState,
  subscribeEditorSaveState,
  triggerManualSave,
} from "@/lib/editor/saveState";
import { EditorActivityIndicator } from "./EditorActivityIndicator";

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

function statusDot(status: EditorSaveState["status"]): string {
  switch (status) {
    case "dirty":
      return "bg-yellow-400";
    case "saving":
      return "bg-blue-400 animate-pulse";
    case "saved":
      return "bg-green-400";
    case "error":
      return "bg-red-400";
    default:
      return "bg-transparent";
  }
}

function statusText(
  status: EditorSaveState["status"],
  lastSavedAt: number | null,
): string {
  switch (status) {
    case "idle":
      return "";
    case "dirty":
      return "Unsaved";
    case "saving":
      return "Saving...";
    case "saved":
      return lastSavedAt ? timeAgo(lastSavedAt) : "Saved";
    case "error":
      return "Error";
  }
}

export function EditorHeader({
  backHref,
  backLabel,
  projectTitle,
  projectId,
  projectStatus,
  version,
  readOnly,
  reviewLabel,
}: {
  backHref: string;
  backLabel: string;
  projectTitle: string;
  projectId: number;
  projectStatus: string;
  version?: number;
  readOnly?: boolean;
  reviewLabel?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<EditorSaveState>({
    status: "idle",
    lastSavedAt: null,
    errorMessage: null,
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishError, setPublishError] = useState("");

  useEffect(() => subscribeEditorSaveState((s) => setState({ ...s })), []);

  const handleBack = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (readOnly) {
        router.push(backHref);
        return;
      }
      setSaving(true);
      triggerManualSave()
        .catch(() => {})
        .finally(() => router.push(backHref));
    },
    [backHref, readOnly, router],
  );

  const handleManualSave = useCallback(async () => {
    if (readOnly) return;
    if (saving || state.status === "saving") return;
    setSaving(true);
    await triggerManualSave().catch(() => {});
    setSaving(false);
  }, [readOnly, saving, state.status]);

  const handlePublish = useCallback(async () => {
    if (readOnly || publishing) return;
    setPublishing(true);
    setPublishError("");
    try {
      await triggerManualSave().catch(() => {});

      const res = await fetch(`/api/projects/${projectId}/github/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ overwrite: true }),
      });

      if (res.status === 409) {
        const payload = (await res.json().catch(() => null)) as {
          needsGitHubAuth?: boolean;
        } | null;
        if (payload?.needsGitHubAuth) {
          await authClient.signIn.oauth2({
            providerId: "github",
            callbackURL: window.location.href,
          });
          return;
        }
      }

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "GitHub publish failed");
      }

      const payload = (await res.json()) as { repoUrl: string };
      setPublishUrl(payload.repoUrl);
      setPublishModalOpen(false);
      window.open(payload.repoUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : "GitHub publish failed",
      );
    } finally {
      setPublishing(false);
    }
  }, [projectId, publishing, readOnly]);

  const showStatus = state.status !== "idle";
  const trackingBlocked = [
    "materials_review",
    "shipped",
    "reviewed",
    "approved",
    "paid_out",
    "fulfilled",
    "kit_approved",
    "kit_fulfillment",
    "kit_sent",
    "building",
    "demo_review",
    "done",
  ].includes(projectStatus);

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[#333] px-3 select-none bg-[#1e1e1e]">
      <a
        href={backHref}
        onClick={handleBack}
        className="flex items-center gap-1 text-sm text-[#888] hover:text-white transition-colors cursor-pointer"
      >
        <ChevronLeft className="size-4" />
        {backLabel}
      </a>
      <span className="text-[#444] text-sm">/</span>
      <span className="text-sm text-[#ccc] truncate">{projectTitle}</span>
      {version !== undefined && (
        <>
          <span className="text-[#444] text-sm">/</span>
          <span className="text-sm text-[#666]">v{version}</span>
        </>
      )}
      {readOnly ? (
        <span className="rounded-full border border-[#444] px-2 py-0.5 text-[11px] font-semibold text-[#999]">
          {reviewLabel ?? "Read-only review"}
        </span>
      ) : null}
      {trackingBlocked && !readOnly ? (
        <span className="rounded border border-[#BD0F32] bg-[#BD0F32] px-3 py-1 text-sm font-black tracking-[0.04em] text-white uppercase">
          No extra time here will be tracked
        </span>
      ) : null}
      {readOnly ? (
        <span className="hidden text-[11px] font-semibold text-[#777] md:inline">
          Read-only. Live edits are not shown here.
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        {!readOnly && !trackingBlocked ? (
          <EditorActivityIndicator projectId={projectId} />
        ) : null}
        {showStatus && (
          <span
            className="flex items-center gap-1.5 text-xs text-[#888]"
            title={`Last saved: ${state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleString() : "never"}${
              state.errorMessage ? `\n${state.errorMessage}` : ""
            }`}
          >
            <span
              className={`inline-block size-2 rounded-full ${statusDot(state.status)}`}
            />
            {statusText(state.status, state.lastSavedAt)}
          </span>
        )}
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setPublishModalOpen(true)}
            disabled={publishing || state.status === "saving"}
            className="flex items-center gap-1 rounded bg-[#BD0F32] px-2 py-1 text-xs font-black text-white hover:bg-[#d71943] disabled:opacity-40 transition-colors"
            title={
              publishUrl ?? "Publish schematic, code, and README to GitHub"
            }
          >
            {publishing ? "Publishing..." : "Publish"}
          </button>
        ) : null}
        {!readOnly ? (
          <button
            type="button"
            onClick={handleManualSave}
            disabled={saving || state.status === "saving"}
            className="flex items-center gap-1 rounded bg-[#2a2a2a] px-2 py-1 text-xs text-[#aaa] hover:bg-[#3a3a3a] hover:text-white disabled:opacity-40 transition-colors"
          >
            <Save className="size-3" />
            Save
          </button>
        ) : null}
      </div>
      {publishModalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,.72)",
            padding: 16,
            color: "#fff",
            fontFamily:
              'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              overflow: "hidden",
              borderRadius: 22,
              border: "1px solid #3a3a3a",
              background: "#1f1f1f",
              boxShadow: "0 24px 80px rgba(0,0,0,.45)",
            }}
          >
            <div className="flex items-center justify-between border-b border-[#333] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-[#BD0F32] text-white">
                  <Github className="size-5" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm">
                    Publish to GitHub
                  </h2>
                  <p className="text-[#888] text-xs">
                    Repo, README, firmware, BOM, and schematic snapshot
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="rounded p-1 text-[#888] transition hover:bg-[#333] hover:text-white"
                aria-label="Close publish dialog"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-4 px-5 py-4">
              <div className="rounded-xl border border-[#3a3a3a] bg-[#171717] p-3 text-[#aaa] text-xs leading-5">
                Publishing is safe to run again. Breadboard will overwrite the
                generated files it owns:{" "}
                <span className="text-white">README.md</span>,{" "}
                <span className="text-white">breadboard-project.json</span>, and{" "}
                <span className="text-white">firmware/*</span>. Other files in
                the repo are left alone.
              </div>
              <div className="rounded-xl border border-[#3a3a3a] bg-[#111] p-3 text-[#aaa] text-xs leading-5">
                Publish also creates a read-only simulation link for reviewers.
                It has no editor controls, no component picker, no store, and no
                time tracking. Users can only run the simulation.
              </div>
              {publishUrl ? (
                <a
                  href={publishUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#ff6b86] text-xs font-bold hover:text-white"
                >
                  Last published repo: {publishUrl}
                </a>
              ) : null}
              {publishError ? (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-200 text-xs font-bold">
                  {publishError}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#333] px-5 py-4">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="rounded-lg px-3 py-2 text-[#aaa] text-xs font-bold transition hover:bg-[#333] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || state.status === "saving"}
                className="rounded-lg bg-[#BD0F32] px-4 py-2 text-white text-xs font-black transition hover:bg-[#d71943] disabled:opacity-40"
              >
                {publishing ? "Publishing..." : "Publish and overwrite"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
