"use client";

import { useEffect, useState } from "react";
import {
  type EditorSaveState,
  subscribeEditorSaveState,
} from "@/lib/editor/saveState";

function statusLabel(status: EditorSaveState["status"]): string {
  switch (status) {
    case "idle":
      return "";
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Save failed";
  }
}

function statusColor(status: EditorSaveState["status"]): string {
  switch (status) {
    case "idle":
      return "text-[#555]";
    case "dirty":
      return "text-yellow-400";
    case "saving":
      return "text-[#888]";
    case "saved":
      return "text-green-400";
    case "error":
      return "text-red-400";
  }
}

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

export function EditorSaveStatus() {
  const [state, setState] = useState<EditorSaveState>({
    status: "idle",
    lastSavedAt: null,
    errorMessage: null,
  });

  useEffect(() => subscribeEditorSaveState((s) => setState({ ...s })), []);

  if (state.status === "idle") return null;

  return (
    <span
      className={`text-xs ${statusColor(state.status)}`}
      title={state.errorMessage ?? undefined}
    >
      {state.status === "saved" && state.lastSavedAt
        ? `Saved ${timeAgo(state.lastSavedAt)}`
        : statusLabel(state.status)}
    </span>
  );
}
