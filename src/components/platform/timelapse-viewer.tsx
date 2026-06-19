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

type ParsedSnapshot = Omit<Snapshot, "stateData"> & {
  parsed: EditorSnapshotState;
};

interface SessionInfo {
  id: number;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
  activeSeconds: number;
}

const SPEEDS = [0.5, 1, 2, 4, 8];

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
}: {
  projectId: number;
  projectTitle: string;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [snapshots, setSnapshots] = useState<ParsedSnapshot[]>([]);
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

    fetch(`/api/editor/projects/${projectId}/timelapse/frames`, {
      credentials: "include",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Failed to load timelapse");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const loaded = ((data.snapshots ?? []) as unknown[]).flatMap((item) => {
          const parsed = parseSnapshot(item);
          return parsed ? [parsed] : [];
        });
        setSessions((data.sessions ?? []) as SessionInfo[]);
        setSnapshots(loaded);
        const latest = Math.max(0, loaded.length - 1);
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
  }, [projectId, stopTimer]);

  const seekToIndex = useCallback(
    (next: number) => {
      stopTimer();
      setPlaying(false);
      const clamped = Math.max(0, Math.min(next, snapshots.length - 1));
      setIndex(clamped);
      indexRef.current = clamped;
    },
    [snapshots.length, stopTimer],
  );

  const seekTo = useCallback(
    (fraction: number) => {
      const target = Math.round(fraction * (snapshots.length - 1));
      seekToIndex(target);
    },
    [seekToIndex, snapshots.length],
  );

  const startPlayback = useCallback(() => {
    if (snapshots.length === 0) return;
    stopTimer();
    if (indexRef.current >= snapshots.length - 1) {
      setIndex(0);
      indexRef.current = 0;
    }
    const ms = Math.max(60, 600 / speed);
    timerRef.current = setInterval(() => {
      setIndex((currentIndex) => {
        if (currentIndex >= snapshots.length - 1) {
          stopTimer();
          setPlaying(false);
          indexRef.current = currentIndex;
          return currentIndex;
        }
        indexRef.current = currentIndex + 1;
        return currentIndex + 1;
      });
    }, ms);
  }, [snapshots.length, speed, stopTimer]);

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

  const current = snapshots[index];
  const parsed = current?.parsed ?? null;

  const sessionMap = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const currentSession = current?.sessionId
    ? sessionMap.get(current.sessionId)
    : null;
  const progress = snapshots.length > 1 ? index / (snapshots.length - 1) : 0;
  const totalActive = sessions.reduce(
    (sum, session) => sum + session.activeSeconds,
    0,
  );
  const firstFrame = snapshots[0];
  const lastFrame = snapshots.at(-1);
  const previous = index > 0 ? snapshots[index - 1] : null;
  const gap =
    previous && current
      ? gapLabel(previous.capturedAt, current.capturedAt)
      : null;

  if (loading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <div className="text-center">
          <p className="text-xs font-black tracking-[0.18em] text-[#BD0F32] uppercase">
            Timelapse
          </p>
          <h1 className="mt-2 text-3xl font-black text-black">
            Loading latest activity...
          </h1>
        </div>
      </div>
    );
  }

  if (error || snapshots.length === 0) {
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
            <p className="text-xs text-[#777]">
              {snapshots.length} frames stitched across {sessions.length}{" "}
              sessions · {fmtDuration(totalActive)} active
            </p>
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
              if (event.key === "End") seekToIndex(snapshots.length - 1);
            }}
          >
            <div className="relative h-3 overflow-hidden rounded-full bg-[#333]">
              <div
                className="h-full rounded-full bg-[#BD0F32] transition-[width] duration-150"
                style={{ width: `${progress * 100}%` }}
              />
              {sessions.length > 1
                ? sessions.slice(1).map((session) => {
                    const boundary = snapshots.findIndex(
                      (snapshot) => snapshot.sessionId === session.id,
                    );
                    if (boundary <= 0) return null;
                    return (
                      <span
                        key={session.id}
                        className="absolute top-0 h-full w-px bg-white/45"
                        style={{
                          left: `${(boundary / (snapshots.length - 1)) * 100}%`,
                        }}
                      />
                    );
                  })
                : null}
            </div>
          </div>

          <span className="text-xs tabular-nums text-[#888]">
            {index + 1} / {snapshots.length}
          </span>
          <span className="hidden text-xs text-[#666] lg:inline">
            {current ? fmtDateTime(current.capturedAt) : ""}
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
        </div>

        <div className="min-h-0 flex-1">
          {parsed ? (
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
