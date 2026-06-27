"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiArrowLeft, HiPause, HiPlay } from "react-icons/hi2";
import { VelxioSnapshotViewer } from "@/components/velxio/VelxioSnapshotViewer";
import type { EditorSnapshotState } from "@/lib/editor/captureState";

interface Snapshot {
  id: number;
  sessionId?: number;
  capturedAt: string;
  stateData: string;
}

interface ScreenFrame {
  id: number;
  sessionId?: number;
  capturedAt: string;
  imageUrl: string;
  pixelChanged: boolean;
  diffScore: number;
  paused: boolean;
}

type ParsedSnapshot = Omit<Snapshot, "stateData"> & {
  kind: "editor";
  parsed: EditorSnapshotState;
};

type TimelineFrame =
  | ParsedSnapshot
  | (ScreenFrame & { kind: "screen"; likelyInactive: boolean });

interface SessionInfo {
  id: number;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
  activeSeconds: number;
}

const SPEEDS = [0.5, 1, 2, 4, 8];
const SCREEN_FRAME_INTERVAL_SECONDS = 30;
const OFFSITE_INACTIVE_AFTER_SECONDS = 5 * 60;
const OFFSITE_DIFF_THRESHOLD = 1_800;

async function preloadImages(urls: string[]) {
  await Promise.allSettled(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = url;
        }),
    ),
  );
}

function parseSnapshot(value: unknown): ParsedSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Snapshot>;
  if (typeof candidate.stateData !== "string") return null;
  if (
    typeof candidate.id !== "number" ||
    typeof candidate.capturedAt !== "string"
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate.stateData) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("editor" in parsed) ||
      !("simulator" in parsed)
    ) {
      return null;
    }
    return {
      kind: "editor",
      id: candidate.id,
      sessionId: candidate.sessionId,
      capturedAt: candidate.capturedAt,
      parsed: parsed as EditorSnapshotState,
    };
  } catch {
    return null;
  }
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function gapLabel(previous: string, next: string): string | null {
  const diff = Math.floor(
    (new Date(next).getTime() - new Date(previous).getTime()) / 1000,
  );
  if (diff < 300) return null;
  return fmtDuration(diff);
}

export function TimelapseViewer({
  projectId,
  projectTitle,
  until,
}: {
  projectId: number;
  projectTitle: string;
  until?: string;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [frames, setFrames] = useState<TimelineFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    stopTimer();
    setPlaying(false);

    const query = until ? `?until=${encodeURIComponent(until)}` : "";
    fetch(`/api/editor/projects/${projectId}/timelapse/frames${query}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Failed to load timelapse");
        return data;
      })
      .then(async (data) => {
        if (cancelled) return;
        const loaded = ((data.snapshots ?? []) as unknown[]).flatMap((item) => {
          const parsed = parseSnapshot(item);
          return parsed ? [parsed] : [];
        });
        const rawScreenFrames = (data.screenFrames ?? []) as ScreenFrame[];
        let lastChangedAt = 0;
        const screenFrames = rawScreenFrames.map((frame) => {
          const capturedAt = new Date(frame.capturedAt).getTime();
          if (frame.pixelChanged) lastChangedAt = capturedAt;
          return {
            ...frame,
            kind: "screen" as const,
            likelyInactive:
              !frame.paused &&
              !frame.pixelChanged &&
              lastChangedAt > 0 &&
              capturedAt - lastChangedAt >= 5 * 60_000,
          };
        });
        const timeline = [...loaded, ...screenFrames].sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
        );
        await preloadImages(
          screenFrames
            .map((frame) => frame.imageUrl)
            .filter((url) => url.length > 0),
        );
        if (cancelled) return;
        setSessions((data.sessions ?? []) as SessionInfo[]);
        setFrames(timeline);
        const latest = Math.max(0, timeline.length - 1);
        setIndex(latest);
        indexRef.current = latest;
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load timelapse",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, stopTimer, until]);

  const seekToIndex = useCallback(
    (next: number) => {
      stopTimer();
      setPlaying(false);
      const clamped = Math.max(0, Math.min(next, frames.length - 1));
      setIndex(clamped);
      indexRef.current = clamped;
    },
    [frames.length, stopTimer],
  );

  const seekTo = useCallback(
    (fraction: number) => {
      const target = Math.round(fraction * (frames.length - 1));
      seekToIndex(target);
    },
    [seekToIndex, frames.length],
  );

  const startPlayback = useCallback(() => {
    if (frames.length === 0) return;
    stopTimer();
    if (indexRef.current >= frames.length - 1) {
      setIndex(0);
      indexRef.current = 0;
    }
    const ms = Math.max(60, 600 / speed);
    timerRef.current = setInterval(() => {
      setIndex((currentIndex) => {
        if (currentIndex >= frames.length - 1) {
          stopTimer();
          setPlaying(false);
          indexRef.current = currentIndex;
          return currentIndex;
        }
        indexRef.current = currentIndex + 1;
        return currentIndex + 1;
      });
    }, ms);
  }, [frames.length, speed, stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const togglePlay = useCallback(() => {
    if (playing) {
      stopTimer();
      setPlaying(false);
    } else {
      setPlaying(true);
    }
  }, [playing, stopTimer]);

  useEffect(() => {
    if (playing) startPlayback();
    else stopTimer();
  }, [playing, startPlayback, stopTimer]);

  const current = frames[index];
  const parsed = current?.kind === "editor" ? current.parsed : null;

  const sessionMap = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const currentSession = current?.sessionId
    ? sessionMap.get(current.sessionId)
    : null;
  const progress = frames.length > 1 ? index / (frames.length - 1) : 0;
  const progressDivisor = Math.max(1, frames.length - 1);
  const totalActive = sessions.reduce(
    (sum, session) => sum + session.activeSeconds,
    0,
  );
  const firstFrame = frames[0];
  const lastFrame = frames.at(-1);
  const previous = index > 0 ? frames[index - 1] : null;
  const gap =
    previous && current
      ? gapLabel(previous.capturedAt, current.capturedAt)
      : null;
  const screenFrameCount = frames.filter(
    (frame) => frame.kind === "screen",
  ).length;
  const inactiveFrameCount = frames.filter(
    (frame) => frame.kind === "screen" && frame.likelyInactive,
  ).length;
  const estimatedInactiveSeconds =
    inactiveFrameCount * SCREEN_FRAME_INTERVAL_SECONDS;
  const inactivePercent =
    screenFrameCount > 0
      ? Math.round((inactiveFrameCount / screenFrameCount) * 100)
      : 0;

  if (loading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <div className="text-center">
          <p className="text-xs font-black tracking-[0.18em] text-[#BD0F32] uppercase">
            Timelapse
          </p>
          <h1 className="mt-2 text-3xl font-black text-black">
            Loading activity...
          </h1>
        </div>
      </div>
    );
  }

  if (error || frames.length === 0) {
    return (
      <div className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <p className="text-xs font-black tracking-[0.18em] text-[#BD0F32] uppercase">
          Timelapse
        </p>
        <h1 className="mt-2 text-3xl font-black text-black">{projectTitle}</h1>
        <p className="mt-4 text-sm text-black/50">
          {error ?? "No timelapse snapshots recorded yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#1e1e1e]">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#333] bg-[#181818] p-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/platform/admin/review/${projectId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-black text-white no-underline hover:bg-[#BD0F32]"
          >
            <HiArrowLeft className="size-4" />
            Review
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">
              {projectTitle}
            </p>
            {until ? (
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#BD0F32]">
                Through shipped point
              </p>
            ) : null}
            <p className="text-xs text-[#777]">
              {frames.length} frames stitched across {sessions.length} sessions
              · {fmtDuration(totalActive)} active
            </p>
            {screenFrameCount > 0 ? (
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-purple-300">
                <span>{screenFrameCount} outside-site frames</span>
                <span>{inactivePercent}% likely inactive</span>
                <span>
                  {fmtDuration(estimatedInactiveSeconds)} suggested review
                </span>
                <span>
                  inactive after {fmtDuration(OFFSITE_INACTIVE_AFTER_SECONDS)}
                  no pixel changes
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="hidden text-right text-xs text-[#777] md:block">
          <p>Newest frame loaded first</p>
          <p>
            {firstFrame && lastFrame
              ? `${fmtDateTime(firstFrame.capturedAt)} to ${fmtDateTime(lastFrame.capturedAt)}`
              : ""}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
        <div className="flex shrink-0 items-center gap-3 border-b border-[#333] bg-[#252525] px-3 py-2">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-lg bg-[#444] p-1.5 text-white hover:bg-[#BD0F32]"
            aria-label={playing ? "Pause timelapse" : "Play timelapse"}
          >
            {playing ? (
              <HiPause className="size-3.5" />
            ) : (
              <HiPlay className="size-3.5" />
            )}
          </button>

          <div className="flex items-center gap-1">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpeed(value)}
                className={`rounded px-2 py-0.5 text-xs font-bold ${
                  speed === value
                    ? "bg-[#BD0F32] text-white"
                    : "bg-[#333] text-[#888] hover:bg-[#444]"
                }`}
              >
                {value}x
              </button>
            ))}
          </div>

          <div
            className="mx-2 flex-1 cursor-pointer"
            role="slider"
            aria-label="Seek stitched timelapse"
            aria-valuenow={Math.round(progress * 100)}
            tabIndex={0}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              seekTo((event.clientX - rect.left) / rect.width);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") seekToIndex(index - 1);
              if (event.key === "ArrowRight") seekToIndex(index + 1);
              if (event.key === "Home") seekToIndex(0);
              if (event.key === "End") seekToIndex(frames.length - 1);
            }}
          >
            <div className="relative h-3 overflow-hidden rounded-full bg-[#333]">
              <div
                className="h-full rounded-full bg-[#BD0F32] transition-[width] duration-150"
                style={{ width: `${progress * 100}%` }}
              />
              {sessions.length > 1
                ? sessions.slice(1).map((session) => {
                    const boundary = frames.findIndex(
                      (frame) => frame.sessionId === session.id,
                    );
                    if (boundary <= 0) return null;
                    return (
                      <span
                        key={session.id}
                        className="absolute top-0 h-full w-px bg-white/45"
                        style={{
                          left: `${(boundary / progressDivisor) * 100}%`,
                        }}
                      />
                    );
                  })
                : null}
              {frames.map((frame, frameIndex) =>
                frame.kind === "screen" && frame.likelyInactive ? (
                  <span
                    key={`inactive-${frame.id}`}
                    className="absolute top-0 h-full w-1 rounded-full bg-purple-400"
                    title="Likely inactive: no screen pixel changes for about 5 minutes"
                    style={{
                      left: `${(frameIndex / progressDivisor) * 100}%`,
                    }}
                  />
                ) : null,
              )}
            </div>
          </div>

          <span className="text-xs tabular-nums text-[#888]">
            {index + 1} / {frames.length}
          </span>
          <span className="hidden text-xs text-[#666] lg:inline">
            {current ? fmtDateTime(current.capturedAt) : ""}
          </span>
          <span className="hidden rounded bg-purple-500/15 px-2 py-0.5 text-xs font-bold text-purple-200 md:inline">
            Purple = likely inactive outside-site time
          </span>
          <span className="hidden text-xs text-[#777] xl:inline">
            Pixel change threshold: diff &gt;= {OFFSITE_DIFF_THRESHOLD}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-[#333] bg-[#202020] px-3 py-1.5 text-xs text-[#777]">
          <span className="font-bold text-[#aaa]">
            Session{" "}
            {currentSession
              ? sessions.findIndex(
                  (session) => session.id === currentSession.id,
                ) + 1
              : "?"}
          </span>
          {currentSession ? (
            <span>{fmtDuration(currentSession.activeSeconds)} active</span>
          ) : null}
          {gap ? (
            <span className="rounded bg-yellow-500/15 px-2 py-0.5 font-bold text-yellow-300">
              Gap before this frame: {gap}
            </span>
          ) : null}
          {current?.kind === "screen" ? (
            <span
              className={`rounded px-2 py-0.5 font-bold ${
                current.likelyInactive
                  ? "bg-purple-500/20 text-purple-200"
                  : "bg-blue-500/15 text-blue-200"
              }`}
            >
              Outside-site screen · diff {current.diffScore}
              {current.pixelChanged ? " · changed" : " · no change"}
              {current.likelyInactive ? " · likely inactive/deduct" : ""}
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          {current?.kind === "screen" ? (
            <div className="grid h-full place-items-center bg-[#111] p-6">
              <div className="max-w-5xl rounded-xl border border-purple-400/40 bg-black p-3">
                {current.imageUrl ? (
                  <img
                    src={current.imageUrl}
                    alt="Private outside-site screen evidence"
                    className="max-h-[78vh] max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="grid min-h-[320px] place-items-center rounded-lg border border-purple-400/30 bg-purple-950/30 p-8 text-center text-purple-100">
                    <div>
                      <p className="text-lg font-black">
                        No new pixels changed
                      </p>
                      <p className="mt-2 text-sm font-bold text-purple-200/80">
                        Metadata-only marker. The last readable screen frame is
                        reused for context, and this point helps estimate idle
                        deductions without uploading duplicate screenshots.
                      </p>
                    </div>
                  </div>
                )}
                <p className="mt-2 text-xs font-bold text-purple-200">
                  Private screen evidence. Never public. Used only to verify
                  outside-site work and possible idle deductions.
                </p>
              </div>
            </div>
          ) : parsed ? (
            <VelxioSnapshotViewer snapshot={parsed} />
          ) : (
            <div className="grid h-full place-items-center text-sm text-[#555]">
              No snapshot data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
