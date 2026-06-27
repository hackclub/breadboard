"use client";

import { useEffect, useState } from "react";
import { Clock, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  refreshActivityTracking,
  setActivityStatusListener,
} from "@/lib/editor/activityTracker";

const JOURNAL_MIN_SECONDS = 10 * 60;
const JOURNAL_REMINDER_SECONDS = 50 * 60;
const HEARTBEAT_STALE_MS = 70_000;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function EditorActivityIndicator({ projectId }: { projectId: number }) {
  const [status, setStatus] = useState<"active" | "idle" | "blocked" | "error">(
    "idle",
  );
  const [trackedSeconds, setTrackedSeconds] = useState(0);
  const [liveUnjournaledSeconds, setLiveUnjournaledSeconds] = useState(0);
  const [validatedAt, setValidatedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [reason, setReason] = useState("");
  const [needsJournal, setNeedsJournal] = useState(false);
  const [showJournalToast, setShowJournalToast] = useState(false);
  const [journalToastDismissed, setJournalToastDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const draftKey = `breadboard:journal-draft:${projectId}`;
  const validatedElapsedSeconds =
    status === "active" && validatedAt
      ? Math.floor((now - validatedAt) / 1000)
      : 0;
  const heartbeatStale =
    status === "active" &&
    (!validatedAt || now - validatedAt > HEARTBEAT_STALE_MS);
  const displayStatus = heartbeatStale ? "error" : status;
  const displayTrackedSeconds =
    displayStatus === "active"
      ? trackedSeconds + validatedElapsedSeconds
      : trackedSeconds;
  const displayUnjournaledSeconds =
    displayStatus === "active"
      ? liveUnjournaledSeconds + validatedElapsedSeconds
      : liveUnjournaledSeconds;
  const journalDue =
    needsJournal || displayUnjournaledSeconds >= JOURNAL_REMINDER_SECONDS;

  useEffect(() => {
    setActivityStatusListener((s) => {
      setStatus(s.status);
      setTrackedSeconds(s.activeSeconds);
      setLiveUnjournaledSeconds(s.unjournaledSeconds ?? s.activeSeconds);
      setValidatedAt(s.validatedAt ?? 0);
      setNow(Date.now());
      setReason(s.reason ?? (s.needsJournal ? "Journal due" : ""));
      setNeedsJournal(Boolean(s.needsJournal));
    });
  }, []);

  useEffect(() => {
    if (status !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "blocked") setOpen(true);
  }, [status]);

  useEffect(() => {
    if (!journalDue || displayStatus === "blocked" || journalToastDismissed)
      return;
    setShowJournalToast(true);
    const timer = window.setTimeout(() => setShowJournalToast(false), 8000);
    return () => window.clearTimeout(timer);
  }, [journalDue, displayStatus, journalToastDismissed]);

  useEffect(() => {
    setContent(window.localStorage.getItem(draftKey) ?? "");
  }, [draftKey]);

  useEffect(() => {
    window.localStorage.setItem(draftKey, content);
  }, [content, draftKey]);

  async function submitJournal() {
    setSaving(true);
    const response = await fetch(`/api/editor/projects/${projectId}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error ?? "Failed to save journal");
      return;
    }
    setContent("");
    window.localStorage.removeItem(draftKey);
    setOpen(false);
    setNeedsJournal(false);
    setJournalToastDismissed(false);
    setLiveUnjournaledSeconds(0);
    setReason("");
    await refreshActivityTracking();
  }

  if (open) {
    const blocked = displayStatus === "blocked";
    const canSubmit =
      displayUnjournaledSeconds >= JOURNAL_MIN_SECONDS &&
      content.trim().length >= 10;

    return (
      <>
        {blocked ? (
          <div className="fixed inset-0 right-[360px] z-40 flex items-center justify-center bg-black/70 px-8 text-center">
            <div className="max-w-md rounded-2xl border border-[#333] bg-[#181818] p-8 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-wide text-[#999]">
                Journal required
              </p>
              <h1 className="mt-3 text-3xl font-black text-white">
                Please journal now.
              </h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-[#bbb]">
                Time tracking is paused until you submit a short journal entry.
                Use the panel on the right to write what you worked on.
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1 rounded bg-[#2a2a2a] px-2 py-1 text-xs font-semibold text-[#ddd] hover:bg-[#3a3a3a] hover:text-white"
          >
            <PanelRightClose className="size-3" />
            Journal open
          </button>
        )}
        <aside className="fixed top-10 right-0 z-50 flex h-[calc(100vh-2.5rem)] w-[360px] flex-col border-l border-[#333] bg-[#181818] shadow-[-8px_0_24px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between border-b border-[#333] px-4 py-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#777]">
                Journal draft
              </p>
              <h2 className="text-lg font-black text-white">
                What did you do?
              </h2>
            </div>
            {!blocked ? (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded bg-[#2a2a2a] p-2 text-[#aaa] hover:bg-[#333] hover:text-white"
                aria-label="Collapse journal"
              >
                <PanelRightClose className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="flex-1 p-4">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Today I added an LED that flickers when the button is pressed. I wired it to pin 8, tested the resistor value, and fixed the code so it blinks reliably."
              className="h-full min-h-80 w-full resize-none rounded-xl border border-[#333] bg-[#101010] px-3 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-[#666] focus:border-[#BD0F32]"
            />
          </div>

          <div className="space-y-3 border-t border-[#333] p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[#888]">
              <span>Draft saved automatically</span>
              <span>{fmt(displayUnjournaledSeconds)} tracked</span>
            </div>
            {displayUnjournaledSeconds < JOURNAL_MIN_SECONDS ? (
              <p className="rounded-lg border border-yellow-900/40 bg-yellow-950/40 px-3 py-2 text-xs font-semibold text-yellow-200">
                You can keep drafting now. Submit unlocks after 10 minutes of
                tracked work.
              </p>
            ) : null}
            <button
              type="button"
              disabled={saving || !canSubmit}
              onClick={submitJournal}
              className="w-full rounded-xl bg-[#BD0F32] px-4 py-3 text-sm font-black text-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving
                ? "Submitting"
                : displayUnjournaledSeconds < JOURNAL_MIN_SECONDS
                  ? "Submit unlocks at 10m"
                  : "Submit journal"}
            </button>
          </div>
        </aside>
      </>
    );
  }

  if (displayStatus === "blocked") {
    return (
      <span className="flex items-center gap-1 rounded bg-red-950 px-2 py-1 text-xs font-semibold text-red-200">
        <Clock className="size-3" />
        {reason || "Time tracking blocked"}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="underline"
        >
          Journal
        </button>
      </span>
    );
  }

  if (journalDue) {
    return (
      <>
        {showJournalToast ? (
          <div className="fixed top-14 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#333] bg-[#181818] p-4 text-[#ddd] shadow-lg motion-safe:animate-[slideInFromRight_220ms_ease-out]">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-[#aaa]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black">Please journal soon</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-[#aaa]">
                  You have unjournaled work time. Add a short update before time
                  tracking pauses.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="mt-3 rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-xs font-black text-white hover:bg-[#3a3a3a]"
                >
                  Write journal
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowJournalToast(false);
                  setJournalToastDismissed(true);
                }}
                className="rounded px-2 py-1 text-xs font-black text-[#888] hover:bg-[#2a2a2a] hover:text-white"
                aria-label="Dismiss journal reminder"
              >
                x
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded bg-yellow-950 px-2 py-1 text-xs font-semibold text-yellow-200"
        >
          <Clock className="size-3" />
          Journal due soon
        </button>
      </>
    );
  }

  if (displayStatus === "error") {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded bg-red-950 px-2 py-1 text-xs font-semibold text-red-200"
        title={
          heartbeatStale
            ? "Time tracking heartbeat is stale."
            : reason || "Time tracking heartbeat failed."
        }
      >
        <span className="inline-block size-2 rounded-full bg-red-400" />
        <Clock className="size-3" />
        <PanelRightOpen className="size-3" />
        Journal
      </button>
    );
  }

  if (displayStatus === "idle" || displayTrackedSeconds < 10) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded bg-[#2a2a2a] px-2 py-1 text-xs font-semibold text-yellow-200 hover:bg-[#3a3a3a] hover:text-white"
      >
        <span className="inline-block size-2 rounded-full bg-yellow-400" />
        <Clock className="size-3" />
        <PanelRightOpen className="size-3" />
        Journal
      </button>
    );
  }
  const canJournal = displayUnjournaledSeconds >= JOURNAL_MIN_SECONDS;

  return (
    <span className="flex items-center gap-2 text-xs text-green-400/70">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-[#2a2a2a] px-2 py-1 font-semibold text-[#ddd] hover:bg-[#3a3a3a] hover:text-white"
        title={
          canJournal
            ? undefined
            : "You can draft now. Submit unlocks after 10 minutes."
        }
      >
        <PanelRightOpen className="mr-1 inline size-3" />
        Journal
      </button>
    </span>
  );
}
