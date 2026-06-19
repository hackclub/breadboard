"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Save } from "lucide-react";
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
  version,
  readOnly,
}: {
  backHref: string;
  backLabel: string;
  projectTitle: string;
  version?: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<EditorSaveState>({
    status: "idle",
    lastSavedAt: null,
    errorMessage: null,
  });
  const [saving, setSaving] = useState(false);

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

  const showStatus = state.status !== "idle";

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
          Read-only review
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        {!readOnly ? <EditorActivityIndicator /> : null}
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
            onClick={handleManualSave}
            disabled={saving || state.status === "saving"}
            className="flex items-center gap-1 rounded bg-[#2a2a2a] px-2 py-1 text-xs text-[#aaa] hover:bg-[#3a3a3a] hover:text-white disabled:opacity-40 transition-colors"
          >
            <Save className="size-3" />
            Save
          </button>
        ) : null}
      </div>
    </header>
  );
}
