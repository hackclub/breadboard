"use client";

import { CheckCircle2, MonitorUp, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  refreshActivityTracking,
  setActivityStatusListener,
} from "@/lib/editor/activityTracker";

type TrackingIssue = {
  reason: string;
  lastValidatedAt: number;
  totalTrackedSeconds: number;
};

function formatDuration(seconds: number) {
  const total = Math.floor(Math.max(0, seconds));
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return "less than a minute";
}

function lastSavedLabel(value: number) {
  if (!value) return "No time has been confirmed yet.";
  return `Last confirmed ${new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })}.`;
}

function playTrackingAlertSound() {
  try {
    const AudioContext =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof window.AudioContext })
        .webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.06;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {}
}

// This is deliberately persistent while tracking is unhealthy. A background
// toast that fades away is not enough when the user could otherwise work for
// hours believing their time is being saved.
export function TrackingHealthNotice({ projectId }: { projectId: number }) {
  const [issue, setIssue] = useState<TrackingIssue | null>(null);
  const [warning, setWarning] = useState<TrackingIssue | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hadIssue = useRef(false);
  const lastAlertKey = useRef("");

  useEffect(
    () =>
      setActivityStatusListener((status) => {
        if (status.projectId !== projectId) return;
        if (status.warning) {
          setWarning({
            reason: status.warning,
            lastValidatedAt: status.validatedAt ?? 0,
            totalTrackedSeconds: status.totalTrackedSeconds ?? 0,
          });
        }
        if (
          status.status === "error" ||
          (status.status === "blocked" && !status.needsJournal)
        ) {
          hadIssue.current = true;
          setRecovered(false);
          setIssue({
            reason: status.reason ?? "Time tracking could not save.",
            lastValidatedAt: status.validatedAt ?? 0,
            totalTrackedSeconds: status.totalTrackedSeconds ?? 0,
          });
          return;
        }
        if (status.status === "active" && hadIssue.current) {
          hadIssue.current = false;
          setIssue(null);
          setRecovered(true);
        }
      }),
    [projectId],
  );

  useEffect(() => {
    if (!recovered) return;
    const timer = window.setTimeout(() => setRecovered(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [recovered]);

  useEffect(() => {
    const alertKey = issue
      ? `issue:${issue.reason}`
      : warning
        ? `warning:${warning.reason}`
        : "";
    if (!alertKey) {
      lastAlertKey.current = "";
      return;
    }
    if (lastAlertKey.current === alertKey) return;
    lastAlertKey.current = alertKey;
    playTrackingAlertSound();
  }, [issue, warning]);

  async function retry() {
    setRetrying(true);
    await refreshActivityTracking();
    setRetrying(false);
  }

  if (issue) {
    return (
      <div
        role="alert"
        className="fixed top-14 right-4 z-[90] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#333] bg-[#181818] p-4 text-[#ddd] shadow-lg motion-safe:animate-[slideInFromRight_220ms_ease-out]"
      >
        <div className="flex items-start gap-3">
          <MonitorUp className="mt-0.5 size-5 shrink-0 text-[#BD0F32]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black">Time is not being saved</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-[#aaa]">
              {issue.reason}
            </p>
            <p className="mt-2 text-xs font-semibold text-[#888]">
              {lastSavedLabel(issue.lastValidatedAt)} Confirmed total:{" "}
              {formatDuration(issue.totalTrackedSeconds)}.
            </p>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-xs font-black text-white hover:bg-[#3a3a3a] disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 ${retrying ? "animate-spin" : ""}`}
              />
              {retrying ? "Retrying" : "Retry now"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (warning) {
    return (
      <div
        role="alert"
        className="fixed top-14 right-4 z-[90] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#333] bg-[#181818] p-4 text-[#ddd] shadow-lg motion-safe:animate-[slideInFromRight_220ms_ease-out]"
      >
        <div className="flex items-start gap-3">
          <MonitorUp className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black">Some time needs review</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-[#aaa]">
              {warning.reason}
            </p>
            <p className="mt-2 text-xs font-semibold text-[#888]">
              Confirmed total: {formatDuration(warning.totalTrackedSeconds)}.
              Keep screen sharing on and watch for a green tracking state.
            </p>
            <button
              type="button"
              onClick={() => setWarning(null)}
              className="mt-3 rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-xs font-black text-white hover:bg-[#3a3a3a]"
            >
              I understand
            </button>
          </div>
          <button
            type="button"
            onClick={() => setWarning(null)}
            className="rounded p-1 text-[#888] hover:bg-[#2a2a2a] hover:text-white"
            aria-label="Dismiss tracking warning"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!recovered) return null;
  return (
    <div className="fixed top-14 right-4 z-[90] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl border border-[#333] bg-[#181818] px-4 py-3 text-xs font-black text-emerald-200 shadow-lg motion-safe:animate-[slideInFromRight_220ms_ease-out]">
      <CheckCircle2 className="size-4 shrink-0" />
      Time tracking resumed. New time is saving again.
    </div>
  );
}
