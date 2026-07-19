"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Crosshair,
  Frame,
  Gauge,
  Layers3,
  MinusCircle,
  Monitor,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addTimeAuditSegment,
  deleteTimeAuditSegment,
  type TimeAuditSegmentDto,
} from "@/actions/admin/time-audit";
import { VelxioSnapshotViewer } from "@/components/velxio/VelxioSnapshotViewer";
import type { EditorSnapshotState } from "@/lib/editor/captureState";
import {
  buildTimeAuditTape,
  dateToTapeSeconds,
  TIME_AUDIT_DEFLATED_REASONS,
  TIME_AUDIT_REMOVED_REASONS,
  tapeSecondsToDate,
  type TimeAuditKind,
  timeAuditRangesOverlap,
} from "@/lib/time-audit";

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
  screenWidth: number;
  screenHeight: number;
  paused: boolean;
}

interface SessionInfo {
  id: number;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
  activeSeconds: number;
}

type ParsedSnapshot = Omit<Snapshot, "stateData"> & {
  kind: "editor";
  parsed: EditorSnapshotState;
};

type TimelineFrame =
  | ParsedSnapshot
  | (ScreenFrame & { kind: "screen"; likelyInactive: boolean });

type SourceFilter = "all" | "editor" | "screen";

type SessionSummary = SessionInfo & {
  captureCount: number;
  editorCaptureCount: number;
  screenCaptureCount: number;
  lastCaptureAt: string | null;
};

type GapEvent = {
  frame: TimelineFrame;
  previous: TimelineFrame;
  duration: string;
};

const SPEEDS = [0.5, 1, 2, 4, 8];
const SCREEN_FRAME_INTERVAL_SECONDS = 30;
const OFFSITE_INACTIVE_AFTER_SECONDS = 120;

function frameKey(frame: TimelineFrame) {
  return `${frame.kind}:${frame.id}`;
}

async function preloadImages(urls: string[]) {
  await Promise.allSettled(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          const timeout = window.setTimeout(resolve, 3000);
          image.onload = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          image.onerror = () => {
            window.clearTimeout(timeout);
            resolve();
          };
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

function fmtDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function gapLabel(
  previous: string,
  next: string,
  thresholdSeconds = 300,
): string | null {
  const diff = Math.floor(
    (new Date(next).getTime() - new Date(previous).getTime()) / 1000,
  );
  return diff >= thresholdSeconds ? fmtDuration(diff) : null;
}

function sourceLabel(frame: TimelineFrame) {
  return frame.kind === "editor" ? "Editor state" : "Screen evidence";
}

function SourcePill({ frame }: { frame: TimelineFrame }) {
  const isEditor = frame.kind === "editor";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-black tracking-[0.08em] uppercase ${
        isEditor
          ? "border-sky-300/30 bg-sky-400/10 text-sky-100"
          : "border-violet-300/30 bg-violet-400/10 text-violet-100"
      }`}
    >
      {isEditor ? (
        <Layers3 className="size-3" />
      ) : (
        <Monitor className="size-3" />
      )}
      {sourceLabel(frame)}
    </span>
  );
}

// Positions in the segment editor are seconds on the audit tape: all
// sessions laid end to end as one continuous run of tracked time, the same
// shape as fallout's timelapse video time.
type AuditFormState = {
  kind: TimeAuditKind;
  startSec: number;
  endSec: number;
  reason: string;
  deflatedPercent: number;
};

// fallout's video-time stamp: minutes:seconds, minutes may exceed 60.
function fmtTapeStamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

// fallout's DeflationInputs: minutes is the source of truth, percentage is
// derived, and both describe what REMAINS after deflation. Typing in one
// field updates the other live; the field being typed in is never rewritten.
// Remount (via key) when the range changes.
function AuditDeflationInputs({
  rangeMin,
  deflatedPercent,
  onChange,
}: {
  rangeMin: number;
  deflatedPercent: number;
  onChange: (deflatedPercent: number) => void;
}) {
  const initRemaining =
    Math.round(((rangeMin * (100 - deflatedPercent)) / 100) * 100) / 100;
  const [minText, setMinText] = useState(String(initRemaining));
  const [pctText, setPctText] = useState(
    String(Math.round((100 - deflatedPercent) * 100) / 100),
  );

  const handleMinChange = (value: string) => {
    setMinText(value);
    const mins = Number(value);
    if (!Number.isNaN(mins) && rangeMin > 0) {
      const remainPct =
        Math.round(Math.min(100, Math.max(0, (mins / rangeMin) * 100)) * 100) /
        100;
      setPctText(String(remainPct));
      onChange(Math.round((100 - remainPct) * 100) / 100);
    }
  };

  const handlePctChange = (value: string) => {
    setPctText(value);
    const pct = Number(value);
    if (!Number.isNaN(pct)) {
      const remainPct = Math.min(100, Math.max(0, pct));
      const mins = Math.round(((rangeMin * remainPct) / 100) * 100) / 100;
      setMinText(String(mins));
      onChange(Math.round((100 - remainPct) * 100) / 100);
    }
  };

  return (
    <div className="flex items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="text-[10px] font-black tracking-[0.08em] text-zinc-500 uppercase">
          Deflate to
        </span>
        <span className="mt-1 flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={0.5}
            value={minText}
            onChange={(event) => handleMinChange(event.currentTarget.value)}
            className="w-full border border-[#4a4a4a] bg-[#1c1c1c] px-2 py-1.5 text-sm font-bold text-white"
          />
          <span className="shrink-0 text-xs text-zinc-400">min</span>
        </span>
      </label>
      <span className="pb-2 text-zinc-500">≈</span>
      <label className="min-w-0 flex-1">
        <span className="text-[10px] font-black tracking-[0.08em] text-zinc-500 uppercase">
          Percentage
        </span>
        <span className="mt-1 flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={pctText}
            onChange={(event) => handlePctChange(event.currentTarget.value)}
            className="w-full border border-[#4a4a4a] bg-[#1c1c1c] px-2 py-1.5 text-sm font-bold text-white"
          />
          <span className="shrink-0 text-xs text-zinc-400">%</span>
        </span>
      </label>
    </div>
  );
}

// fallout's reason field: free text with a preset dropdown behind the
// sparkles button that fills the input.
function AuditReasonInput({
  kind,
  value,
  onChange,
}: {
  kind: TimeAuditKind;
  value: string;
  onChange: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const presets =
    kind === "removed"
      ? TIME_AUDIT_REMOVED_REASONS
      : TIME_AUDIT_DEFLATED_REASONS;

  return (
    <div className="relative flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Reason..."
        className="min-w-0 flex-1 border border-[#4a4a4a] bg-[#141414] px-2 py-1.5 text-sm font-bold text-white placeholder:text-zinc-600"
      />
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        title="Preset reasons"
        aria-label="Preset reasons"
        aria-expanded={open}
        className="grid size-8 shrink-0 place-items-center border border-[#4a4a4a] text-zinc-400 transition hover:border-white hover:text-white"
      >
        <Sparkles className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-20 mt-1 w-56 border border-[#4a4a4a] bg-[#242424] shadow-[4px_4px_0_#000]">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                onChange(preset);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-xs font-bold text-zinc-300 transition hover:bg-[#363636] hover:text-white"
            >
              {preset}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const [allFrames, setAllFrames] = useState<TimelineFrame[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [totalCaptures, setTotalCaptures] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedFrameKey, setSelectedFrameKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [customSpeedText, setCustomSpeedText] = useState("");
  const [auditSegments, setAuditSegments] = useState<TimeAuditSegmentDto[]>([]);
  const [auditForm, setAuditForm] = useState<AuditFormState | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedFrameKeyRef = useRef<string | null>(null);
  const visibleFramesRef = useRef<TimelineFrame[]>([]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setTruncated(false);
    stopTimer();
    setPlaying(false);

    const search = new URLSearchParams({ refresh: String(reloadKey) });
    if (until) search.set("until", until);
    const query = `?${search.toString()}`;
    fetch(`/api/editor/projects/${projectId}/timelapse/frames${query}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load timelapse");
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const snapshots = ((data.snapshots ?? []) as unknown[]).flatMap(
          (item) => {
            const parsed = parseSnapshot(item);
            return parsed ? [parsed] : [];
          },
        );
        let lastChangedAt: number | null = null;
        const screenFrames = ((data.screenFrames ?? []) as ScreenFrame[]).map(
          (frame) => {
            const capturedAt = new Date(frame.capturedAt).getTime();
            if (frame.paused || frame.pixelChanged) lastChangedAt = capturedAt;
            return {
              ...frame,
              kind: "screen" as const,
              likelyInactive:
                !frame.paused &&
                !frame.pixelChanged &&
                lastChangedAt !== null &&
                capturedAt - lastChangedAt >=
                  OFFSITE_INACTIVE_AFTER_SECONDS * 1000,
            };
          },
        );
        const timeline = [...snapshots, ...screenFrames].sort(
          (left, right) =>
            new Date(left.capturedAt).getTime() -
            new Date(right.capturedAt).getTime(),
        );

        setSessions((data.sessions ?? []) as SessionInfo[]);
        setAuditSegments((data.auditSegments ?? []) as TimeAuditSegmentDto[]);
        setAuditForm(null);
        setAuditError(null);
        setAllFrames(timeline);
        setTruncated(Boolean(data.truncated));
        setTotalCaptures(
          (Number(data.totalSnapshots) || 0) +
            (Number(data.totalScreenFrames) || 0),
        );
        const latest = timeline.at(-1);
        const latestKey = latest ? frameKey(latest) : null;
        selectedFrameKeyRef.current = latestKey;
        setSelectedFrameKey(latestKey);
        void preloadImages(
          screenFrames
            .slice(-12)
            .map((frame) => frame.imageUrl)
            .filter((url) => url.length > 0),
        );
      })
      .catch((caught) => {
        if (
          !cancelled &&
          !(caught instanceof DOMException && caught.name === "AbortError")
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Failed to load timelapse",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, reloadKey, stopTimer, until]);

  const visibleFrames = useMemo(
    () =>
      sourceFilter === "all"
        ? allFrames
        : allFrames.filter((frame) => frame.kind === sourceFilter),
    [allFrames, sourceFilter],
  );

  useEffect(() => {
    visibleFramesRef.current = visibleFrames;
    if (visibleFrames.length === 0) return;
    if (
      !selectedFrameKey ||
      !visibleFrames.some((frame) => frameKey(frame) === selectedFrameKey)
    ) {
      const latestFrame = visibleFrames.at(-1);
      if (latestFrame) {
        const nextKey = frameKey(latestFrame);
        selectedFrameKeyRef.current = nextKey;
        setSelectedFrameKey(nextKey);
      }
    }
  }, [selectedFrameKey, visibleFrames]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const current =
    visibleFrames.find((frame) => frameKey(frame) === selectedFrameKey) ??
    visibleFrames.at(-1);
  const currentScreen = current?.kind === "screen" ? current : null;
  // A metadata-only marker can exist in historical data. Carry the latest
  // readable image forward within its session, so replay stays visual.
  const visibleScreenImage = useMemo(() => {
    if (!currentScreen) return null;
    if (currentScreen.imageUrl) return currentScreen;
    const currentTime = new Date(currentScreen.capturedAt).getTime();
    for (let index = allFrames.length - 1; index >= 0; index -= 1) {
      const frame = allFrames[index];
      if (
        frame.kind === "screen" &&
        frame.imageUrl &&
        frame.sessionId === currentScreen.sessionId &&
        new Date(frame.capturedAt).getTime() <= currentTime
      ) {
        return frame;
      }
    }
    return null;
  }, [allFrames, currentScreen]);
  const carriesPreviousScreenImage =
    Boolean(currentScreen && visibleScreenImage) &&
    visibleScreenImage?.id !== currentScreen?.id;
  const currentIndex = current
    ? Math.max(
        0,
        visibleFrames.findIndex(
          (frame) => frameKey(frame) === frameKey(current),
        ),
      )
    : 0;
  const progressDivisor = Math.max(1, visibleFrames.length - 1);
  const progress =
    visibleFrames.length > 1 ? currentIndex / (visibleFrames.length - 1) : 0;

  const selectFrame = useCallback(
    (frame: TimelineFrame) => {
      stopTimer();
      setPlaying(false);
      const nextKey = frameKey(frame);
      selectedFrameKeyRef.current = nextKey;
      setSelectedFrameKey(nextKey);
    },
    [stopTimer],
  );

  const selectIndex = useCallback(
    (nextIndex: number) => {
      const frame = visibleFramesRef.current[nextIndex];
      if (frame) selectFrame(frame);
    },
    [selectFrame],
  );

  const startPlayback = useCallback(() => {
    const playbackFrames = visibleFramesRef.current;
    if (playbackFrames.length === 0) return;

    stopTimer();
    const selectedIndex = playbackFrames.findIndex(
      (frame) => frameKey(frame) === selectedFrameKeyRef.current,
    );
    if (selectedIndex >= playbackFrames.length - 1) {
      const firstKey = frameKey(playbackFrames[0]);
      selectedFrameKeyRef.current = firstKey;
      setSelectedFrameKey(firstKey);
    }

    timerRef.current = setInterval(
      () => {
        const frames = visibleFramesRef.current;
        const activeIndex = frames.findIndex(
          (frame) => frameKey(frame) === selectedFrameKeyRef.current,
        );
        const nextIndex = activeIndex < 0 ? 0 : activeIndex + 1;
        if (nextIndex >= frames.length) {
          stopTimer();
          setPlaying(false);
          return;
        }
        const nextKey = frameKey(frames[nextIndex]);
        selectedFrameKeyRef.current = nextKey;
        setSelectedFrameKey(nextKey);
      },
      // 16ms floor (~60fps) so custom multipliers beyond 8x still speed up.
      Math.max(16, 700 / speed),
    );
  }, [speed, stopTimer]);

  useEffect(() => {
    if (playing) startPlayback();
    else stopTimer();
  }, [playing, startPlayback, stopTimer]);

  const sessionMap = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const currentSession = current?.sessionId
    ? sessionMap.get(current.sessionId)
    : undefined;
  const totalActive = sessions.reduce(
    (sum, session) => sum + session.activeSeconds,
    0,
  );
  const editorFrameCount = allFrames.filter(
    (frame) => frame.kind === "editor",
  ).length;
  const screenFrames = allFrames.filter((frame) => frame.kind === "screen");
  const screenFrameCount = screenFrames.length;
  const readableScreenFrameCount = screenFrames.filter(
    (frame) => frame.imageUrl.length > 0,
  ).length;
  const changedScreenFrameCount = screenFrames.filter(
    (frame) => frame.pixelChanged,
  ).length;
  const inactiveFrameCount = screenFrames.filter(
    (frame) => frame.likelyInactive,
  ).length;
  const estimatedInactiveSeconds =
    inactiveFrameCount * SCREEN_FRAME_INTERVAL_SECONDS;

  // On long histories the API evenly samples frames, which stretches the
  // normal spacing between consecutive captures. Scale the gap threshold off
  // the median spacing so sampling artifacts aren't flagged as capture gaps.
  const gapThresholdSeconds = useMemo(() => {
    const spacings = allFrames
      .slice(1)
      .map(
        (frame, index) =>
          (new Date(frame.capturedAt).getTime() -
            new Date(allFrames[index].capturedAt).getTime()) /
          1000,
      )
      .filter((value) => value > 0)
      .sort((left, right) => left - right);
    const median = spacings[Math.floor(spacings.length / 2)] ?? 0;
    return Math.max(300, median * 5);
  }, [allFrames]);

  const gapEvents = useMemo<GapEvent[]>(
    () =>
      allFrames.slice(1).flatMap((frame, index) => {
        const previous = allFrames[index];
        const duration = gapLabel(
          previous.capturedAt,
          frame.capturedAt,
          gapThresholdSeconds,
        );
        return duration ? [{ frame, previous, duration }] : [];
      }),
    [allFrames, gapThresholdSeconds],
  );

  const sessionSummaries = useMemo<SessionSummary[]>(
    () =>
      sessions.map((session) => {
        const captures = allFrames.filter(
          (frame) => frame.sessionId === session.id,
        );
        const editorCaptures = captures.filter(
          (frame) => frame.kind === "editor",
        ).length;
        const screenCaptures = captures.length - editorCaptures;
        return {
          ...session,
          captureCount: captures.length,
          editorCaptureCount: editorCaptures,
          screenCaptureCount: screenCaptures,
          lastCaptureAt: captures.at(-1)?.capturedAt ?? null,
        };
      }),
    [allFrames, sessions],
  );

  const firstFrame = allFrames[0];
  const lastFrame = allFrames.at(-1);
  const previous = currentIndex > 0 ? visibleFrames[currentIndex - 1] : null;
  const gapBeforeCurrent =
    previous && current
      ? gapLabel(previous.capturedAt, current.capturedAt, gapThresholdSeconds)
      : null;

  const jumpToSession = useCallback(
    (sessionId: number) => {
      const target = allFrames.find((frame) => frame.sessionId === sessionId);
      if (!target) return;
      setSourceFilter("all");
      selectFrame(target);
    },
    [allFrames, selectFrame],
  );

  const jumpToGap = useCallback(
    (event: GapEvent) => {
      setSourceFilter("all");
      selectFrame(event.frame);
    },
    [selectFrame],
  );

  const changeSourceFilter = useCallback(
    (next: SourceFilter) => {
      stopTimer();
      setPlaying(false);
      setSourceFilter(next);
    },
    [stopTimer],
  );

  // --- Time audit (fallout's remove / deflate model) ---

  const removedDeductedSeconds = auditSegments
    .filter((segment) => segment.kind === "removed")
    .reduce((sum, segment) => sum + segment.deductedSeconds, 0);
  const deflatedDeductedSeconds = auditSegments
    .filter((segment) => segment.kind === "deflated")
    .reduce((sum, segment) => sum + segment.deductedSeconds, 0);
  const totalDeductedSeconds = removedDeductedSeconds + deflatedDeductedSeconds;
  const auditedSeconds = Math.max(0, totalActive - totalDeductedSeconds);

  // The segment editor works in tape time, fallout's video-time equivalent:
  // all sessions laid end to end as one continuous run of tracked minutes.
  const auditTape = useMemo(() => buildTimeAuditTape(sessions), [sessions]);
  const auditTotalMin = Math.round((auditTape.totalSeconds / 60) * 10) / 10;
  const currentTapeSec = current
    ? dateToTapeSeconds(auditTape, current.capturedAt)
    : 0;

  // fallout's snap points: range ends default to the next boundary — a
  // session edge or an existing segment — after the playhead.
  const auditSnapPoints = useMemo(() => {
    const points = new Set<number>([0, auditTape.totalSeconds]);
    for (const span of auditTape.spans) {
      points.add(span.tapeStart);
      points.add(span.tapeStart + span.tapeSeconds);
    }
    for (const segment of auditSegments) {
      points.add(dateToTapeSeconds(auditTape, segment.startAt));
      points.add(dateToTapeSeconds(auditTape, segment.endAt));
    }
    return [...points].sort((left, right) => left - right);
  }, [auditTape, auditSegments]);

  const auditFormRange = auditForm
    ? {
        startAt: tapeSecondsToDate(auditTape, auditForm.startSec).toISOString(),
        endAt: tapeSecondsToDate(auditTape, auditForm.endSec).toISOString(),
      }
    : null;
  const auditFormValid = Boolean(
    auditForm &&
      auditForm.reason.trim().length > 0 &&
      auditForm.startSec < auditForm.endSec,
  );

  // The scrubber is frame-index based, so time ranges map onto it through
  // frame positions (same as the gap and idle markers).
  const bandForRange = useCallback(
    (startAt: string, endAt: string) => {
      const startMs = new Date(startAt).getTime();
      const endMs = new Date(endAt).getTime();
      let startIndex = -1;
      let endIndex = -1;
      visibleFrames.forEach((frame, index) => {
        const time = new Date(frame.capturedAt).getTime();
        if (time >= startMs && startIndex === -1) startIndex = index;
        if (time <= endMs) endIndex = index;
      });
      if (startIndex === -1 || endIndex < startIndex) return null;
      return {
        left: (startIndex / progressDivisor) * 100,
        width: Math.max(
          ((endIndex - startIndex) / progressDivisor) * 100,
          0.75,
        ),
      };
    },
    [progressDivisor, visibleFrames],
  );

  const openAuditForm = useCallback(
    (kind: TimeAuditKind) => {
      stopTimer();
      setPlaying(false);
      setAuditError(null);
      // fallout's defaults: start at the playhead, end at the next snap
      // point after it (or the end of the tape).
      const startSec = Math.min(
        Math.round(currentTapeSec),
        Math.max(0, Math.floor(auditTape.totalSeconds) - 1),
      );
      const next = auditSnapPoints.find((point) => point > startSec + 1);
      setAuditForm({
        kind,
        startSec,
        endSec: Math.round(next ?? auditTape.totalSeconds),
        reason: "",
        deflatedPercent: 50,
      });
    },
    [auditSnapPoints, auditTape, currentTapeSec, stopTimer],
  );

  const submitAuditSegment = useCallback(async () => {
    if (!auditForm || !auditFormRange) return;
    // fallout validates overlap when Add is pressed, not by disabling it.
    if (
      auditSegments.some((segment) =>
        timeAuditRangesOverlap(segment, auditFormRange),
      )
    ) {
      setAuditError("This range overlaps with an existing segment.");
      return;
    }
    setAuditBusy(true);
    setAuditError(null);
    try {
      const segments = await addTimeAuditSegment(projectId, {
        startAt: auditFormRange.startAt,
        endAt: auditFormRange.endAt,
        kind: auditForm.kind,
        deflatedPercent: Math.round(auditForm.deflatedPercent),
        reason: auditForm.reason.trim(),
      });
      setAuditSegments(segments);
      setAuditForm(null);
    } catch (caught) {
      setAuditError(
        caught instanceof Error ? caught.message : "Failed to save segment",
      );
    } finally {
      setAuditBusy(false);
    }
  }, [auditForm, auditFormRange, auditSegments, projectId]);

  const removeAuditSegment = useCallback(
    async (segmentId: number) => {
      setAuditBusy(true);
      setAuditError(null);
      try {
        const segments = await deleteTimeAuditSegment(projectId, segmentId);
        setAuditSegments(segments);
      } catch (caught) {
        setAuditError(
          caught instanceof Error ? caught.message : "Failed to delete",
        );
      } finally {
        setAuditBusy(false);
      }
    },
    [projectId],
  );

  const jumpToTime = useCallback(
    (iso: string) => {
      const targetMs = new Date(iso).getTime();
      const frame =
        visibleFrames.find(
          (candidate) => new Date(candidate.capturedAt).getTime() >= targetMs,
        ) ?? visibleFrames.at(-1);
      if (frame) selectFrame(frame);
    },
    [selectFrame, visibleFrames],
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[#181818] p-6 text-white">
        <div className="flex items-center gap-3 border border-[#454545] bg-[#242424] px-5 py-4 shadow-[4px_4px_0_#000]">
          <RefreshCw className="size-5 animate-spin text-[#BD0F32]" />
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-[#BD0F32] uppercase">
              Timelapse review
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              Loading evidence
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[#181818] p-6 text-white">
        <div className="max-w-lg border border-red-400/40 bg-[#242424] p-6 shadow-[4px_4px_0_#000]">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-300" />
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-red-300 uppercase">
                Timelapse unavailable
              </p>
              <h1 className="mt-2 text-xl font-black">{projectTitle}</h1>
              <p className="mt-2 text-sm text-zinc-300">{error}</p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReloadKey((currentKey) => currentKey + 1)}
              className="inline-flex items-center gap-2 bg-[#BD0F32] px-3 py-2 text-xs font-black text-white hover:bg-[#d71943]"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
            <Link
              href={`/platform/admin/review/${projectId}`}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-black text-zinc-300 hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              Review
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (allFrames.length === 0) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-[#181818] text-white">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#3d3d3d] bg-[#202020] px-3 py-3">
          <Link
            href={`/platform/admin/review/${projectId}`}
            title="Back to project review"
            aria-label="Back to project review"
            className="grid size-9 place-items-center border border-[#555] text-zinc-200 hover:border-[#BD0F32] hover:bg-[#BD0F32] hover:text-white"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-black tracking-[0.16em] text-[#BD0F32] uppercase">
              Timelapse review
            </p>
            <h1 className="truncate text-sm font-black">{projectTitle}</h1>
          </div>
        </header>
        <main className="grid flex-1 place-items-center p-6">
          <div className="max-w-md border border-[#444] bg-[#242424] p-6 shadow-[4px_4px_0_#000]">
            <Frame className="size-6 text-zinc-400" />
            <h2 className="mt-4 text-lg font-black">No visual evidence yet</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Server-confirmed active time: {fmtDuration(totalActive)} across{" "}
              {sessions.length} session{sessions.length === 1 ? "" : "s"}.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const currentFrameSessionIndex = currentSession
    ? sessions.findIndex((session) => session.id === currentSession.id) + 1
    : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#181818] text-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#3d3d3d] bg-[#202020] px-3 py-3">
        <Link
          href={`/platform/admin/review/${projectId}`}
          title="Back to project review"
          aria-label="Back to project review"
          className="grid size-9 shrink-0 place-items-center border border-[#555] text-zinc-200 transition hover:border-[#BD0F32] hover:bg-[#BD0F32] hover:text-white"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="shrink-0 text-[10px] font-black tracking-[0.16em] text-[#BD0F32] uppercase">
              Timelapse review
            </p>
            {until ? (
              <span className="truncate border border-[#BD0F32]/50 bg-[#BD0F32]/10 px-1.5 py-0.5 text-[10px] font-black tracking-[0.08em] text-red-100 uppercase">
                At submission
              </span>
            ) : null}
          </div>
          <h1 className="truncate text-sm font-black text-white">
            {projectTitle}
          </h1>
        </div>
        <div className="hidden shrink-0 text-right text-xs text-zinc-400 md:block">
          <p className="font-black text-white">
            {fmtDuration(totalActive)} confirmed
            {totalDeductedSeconds > 0 ? (
              <span className="text-emerald-300">
                {" "}
                → {fmtDuration(auditedSeconds)} audited
              </span>
            ) : null}
          </p>
          <p>
            {firstFrame && lastFrame
              ? `${fmtDateTime(firstFrame.capturedAt)} - ${fmtDateTime(lastFrame.capturedAt)}`
              : ""}
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_21rem] lg:overflow-hidden">
        <section className="flex min-h-[38rem] min-w-0 flex-col border-b border-[#3d3d3d] lg:min-h-0 lg:border-b-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#3d3d3d] bg-[#252525] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-400">
              {current ? (
                <>
                  <SourcePill frame={current} />
                  <span className="truncate tabular-nums">
                    {fmtDateTime(current.capturedAt)}
                  </span>
                </>
              ) : (
                <span className="font-black text-amber-200">
                  No matching frames
                </span>
              )}
            </div>
            <fieldset className="flex border border-[#4a4a4a] bg-[#1c1c1c] p-0.5">
              <legend className="sr-only">Evidence source</legend>
              {(
                [
                  ["all", "All"],
                  ["editor", "Editor"],
                  ["screen", "Screen"],
                ] as const
              ).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => changeSourceFilter(filter)}
                  aria-pressed={sourceFilter === filter}
                  className={`px-2 py-1 text-[11px] font-black transition ${
                    sourceFilter === filter
                      ? "bg-[#BD0F32] text-white"
                      : "text-zinc-400 hover:bg-[#363636] hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </fieldset>
          </div>

          <div className="relative min-h-[360px] flex-1 overflow-hidden bg-[#101010]">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3">
              <div className="border border-white/15 bg-black/75 px-2.5 py-2 backdrop-blur-sm">
                <p className="text-[10px] font-black tracking-[0.12em] text-zinc-400 uppercase">
                  Frame {currentIndex + 1} of {visibleFrames.length}
                </p>
                <p className="mt-0.5 text-xs font-black text-white">
                  {current ? fmtTime(current.capturedAt) : ""}
                </p>
              </div>
              {currentScreen ? (
                <div
                  className={`border px-2.5 py-2 text-right text-[10px] font-black tracking-[0.08em] uppercase backdrop-blur-sm ${
                    currentScreen.likelyInactive
                      ? "border-amber-300/50 bg-amber-950/80 text-amber-100"
                      : currentScreen.pixelChanged
                        ? "border-emerald-300/50 bg-emerald-950/80 text-emerald-100"
                        : "border-violet-300/40 bg-violet-950/80 text-violet-100"
                  }`}
                >
                  {currentScreen.likelyInactive
                    ? "Potentially inactive"
                    : currentScreen.pixelChanged
                      ? "Screen changed"
                      : currentScreen.paused
                        ? "Capture paused"
                        : "No visual change"}
                </div>
              ) : null}
            </div>

            {currentScreen ? (
              <div className="grid h-full min-h-[360px] place-items-center p-3 sm:p-6">
                {visibleScreenImage ? (
                  <img
                    src={visibleScreenImage.imageUrl}
                    alt={
                      carriesPreviousScreenImage
                        ? "Previous private screen evidence carried forward because the current capture did not change"
                        : "Private screen evidence"
                    }
                    className="max-h-[min(68dvh,900px)] max-w-full border border-violet-300/35 bg-black object-contain shadow-[4px_4px_0_rgba(167,139,250,0.25)]"
                  />
                ) : (
                  <div className="max-w-sm border border-violet-300/30 bg-violet-950/25 p-6 text-center shadow-[4px_4px_0_rgba(167,139,250,0.2)]">
                    <Monitor className="mx-auto size-6 text-violet-200" />
                    <p className="mt-3 text-sm font-black text-violet-100">
                      No readable screen image yet
                    </p>
                    <p className="mt-1 text-xs leading-5 text-violet-200/75">
                      This marker has no image and there is no earlier image in
                      this session to carry forward.
                    </p>
                  </div>
                )}
                {carriesPreviousScreenImage ? (
                  <div className="absolute right-3 bottom-3 max-w-[calc(100%-1.5rem)] border border-violet-300/40 bg-black/80 px-2.5 py-2 text-right text-[10px] font-black tracking-[0.06em] text-violet-100 uppercase backdrop-blur-sm">
                    Same screen as{" "}
                    {fmtTime(visibleScreenImage?.capturedAt ?? "")}
                    <span className="ml-2 text-violet-200/60">
                      Current marker: {fmtTime(currentScreen.capturedAt)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : current?.kind === "editor" ? (
              <VelxioSnapshotViewer snapshot={current.parsed} />
            ) : (
              <div className="grid h-full min-h-[360px] place-items-center p-6 text-center">
                <div className="max-w-xs border border-[#4a4a4a] bg-[#202020] p-5">
                  <Frame className="mx-auto size-5 text-zinc-400" />
                  <p className="mt-3 text-sm font-black text-white">
                    No {sourceFilter} frames
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-[#3d3d3d] bg-[#222] px-3 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => selectIndex(0)}
                title="First frame"
                aria-label="First frame"
                className="grid size-8 place-items-center border border-[#4b4b4b] text-zinc-300 transition hover:border-white hover:bg-[#383838] hover:text-white disabled:opacity-35"
                disabled={currentIndex === 0}
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => selectIndex(currentIndex - 1)}
                title="Previous frame"
                aria-label="Previous frame"
                className="grid size-8 place-items-center border border-[#4b4b4b] text-zinc-300 transition hover:border-white hover:bg-[#383838] hover:text-white disabled:opacity-35"
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setPlaying((value) => !value)}
                title={playing ? "Pause replay" : "Play replay"}
                aria-label={playing ? "Pause replay" : "Play replay"}
                className="grid size-9 place-items-center bg-[#BD0F32] text-white transition hover:bg-[#d71943] disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!current}
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => selectIndex(currentIndex + 1)}
                title="Next frame"
                aria-label="Next frame"
                className="grid size-8 place-items-center border border-[#4b4b4b] text-zinc-300 transition hover:border-white hover:bg-[#383838] hover:text-white disabled:opacity-35"
                disabled={currentIndex >= visibleFrames.length - 1}
              >
                <ChevronRight className="size-4" />
              </button>

              <fieldset className="ml-1 flex items-stretch border border-[#4b4b4b] bg-[#191919] p-0.5">
                <legend className="sr-only">Replay speed</legend>
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setCustomSpeedText("");
                      setSpeed(value);
                    }}
                    aria-pressed={
                      speed === value && customSpeedText.length === 0
                    }
                    className={`min-w-8 px-1.5 py-1 text-[11px] font-black transition ${
                      speed === value && customSpeedText.length === 0
                        ? "bg-[#BD0F32] text-white"
                        : "text-zinc-400 hover:bg-[#363636] hover:text-white"
                    }`}
                  >
                    {value}x
                  </button>
                ))}
                <label className="flex items-center">
                  <span className="sr-only">Custom replay speed</span>
                  <input
                    type="number"
                    min={0.1}
                    max={100}
                    step={0.5}
                    value={customSpeedText}
                    placeholder="?x"
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      setCustomSpeedText(text);
                      const parsed = Number(text);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setSpeed(Math.min(parsed, 100));
                      }
                    }}
                    className={`w-14 [appearance:textfield] px-1.5 py-1 text-center text-[11px] font-black transition placeholder:text-zinc-600 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                      customSpeedText.length > 0
                        ? "bg-[#BD0F32] text-white placeholder:text-red-200"
                        : "bg-transparent text-zinc-400 hover:bg-[#363636]"
                    }`}
                  />
                </label>
              </fieldset>

              <span className="ml-auto text-right text-[11px] tabular-nums text-zinc-400">
                {current ? fmtDateTime(current.capturedAt) : ""}
              </span>
            </div>

            <div className="relative mt-3 pt-2">
              <input
                type="range"
                min={0}
                max={Math.max(0, visibleFrames.length - 1)}
                value={currentIndex}
                onChange={(event) =>
                  selectIndex(Number(event.currentTarget.value))
                }
                aria-label="Seek timelapse"
                className="relative z-10 block h-3 w-full cursor-pointer accent-[#BD0F32]"
              />
              <div className="pointer-events-none absolute inset-x-1 top-2.5 h-1 bg-[#343434]">
                <div
                  className="h-full bg-[#BD0F32]"
                  style={{ width: `${progress * 100}%` }}
                />
                {sessions.slice(1).map((session) => {
                  const boundary = visibleFrames.findIndex(
                    (frame) => frame.sessionId === session.id,
                  );
                  if (boundary <= 0) return null;
                  return (
                    <span
                      key={`session-${session.id}`}
                      className="absolute top-[-2px] h-2 w-px bg-white/70"
                      style={{ left: `${(boundary / progressDivisor) * 100}%` }}
                    />
                  );
                })}
                {visibleFrames.slice(1).map((frame, offset) => {
                  const frameIndex = offset + 1;
                  const duration = gapLabel(
                    visibleFrames[frameIndex - 1].capturedAt,
                    frame.capturedAt,
                    gapThresholdSeconds,
                  );
                  if (!duration) return null;
                  return (
                    <span
                      key={`gap-${frameKey(frame)}`}
                      className="absolute top-[-2px] h-2 w-1 bg-amber-300"
                      title={`Capture gap: ${duration}`}
                      style={{
                        left: `${(frameIndex / progressDivisor) * 100}%`,
                      }}
                    />
                  );
                })}
                {visibleFrames.map((frame, frameIndex) =>
                  frame.kind === "screen" && frame.likelyInactive ? (
                    <span
                      key={`inactive-${frame.id}`}
                      className="absolute top-[-2px] h-2 w-1 bg-violet-300"
                      title="Possible idle period"
                      style={{
                        left: `${(frameIndex / progressDivisor) * 100}%`,
                      }}
                    />
                  ) : null,
                )}
                {auditSegments.map((segment) => {
                  const band = bandForRange(segment.startAt, segment.endAt);
                  if (!band) return null;
                  return (
                    <span
                      key={`audit-${segment.id}`}
                      className={`absolute -top-0.5 h-2 ${
                        segment.kind === "removed"
                          ? "bg-red-500/60"
                          : "bg-amber-500/50"
                      }`}
                      style={{
                        left: `${band.left}%`,
                        width: `${band.width}%`,
                      }}
                    />
                  );
                })}
                {auditForm && auditFormRange
                  ? (() => {
                      const band = bandForRange(
                        auditFormRange.startAt,
                        auditFormRange.endAt,
                      );
                      if (!band) return null;
                      return (
                        <span
                          className={`absolute -top-0.75 h-2.5 border border-dashed ${
                            auditForm.kind === "removed"
                              ? "border-red-400 bg-red-500/20"
                              : "border-amber-400 bg-amber-500/20"
                          }`}
                          style={{
                            left: `${band.left}%`,
                            width: `${band.width}%`,
                          }}
                        />
                      );
                    })()
                  : null}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-black tracking-[0.06em] text-zinc-500 uppercase">
              <span>{visibleFrames.length} visible frames</span>
              <span className="text-amber-300">Amber: capture gap</span>
              <span className="text-violet-300">Violet: idle signal</span>
              {auditSegments.some((segment) => segment.kind === "removed") ? (
                <span className="text-red-400">Red band: removed time</span>
              ) : null}
              {auditSegments.some((segment) => segment.kind === "deflated") ? (
                <span className="text-amber-400">
                  Amber band: deflated time
                </span>
              ) : null}
              {gapBeforeCurrent ? (
                <span className="text-amber-200">
                  Gap before this frame: {gapBeforeCurrent}
                </span>
              ) : null}
            </div>
          </footer>
        </section>

        <aside className="min-h-0 border-[#3d3d3d] bg-[#202020] lg:overflow-y-auto lg:border-l">
          <section className="border-b border-[#3d3d3d] p-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
              <Clock3 className="size-3.5" />
              Confirmed time
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">
              {fmtDuration(totalActive)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-px border border-[#414141] bg-[#414141] text-xs">
              <div className="bg-[#252525] px-2.5 py-2">
                <p className="text-[10px] font-black tracking-[0.08em] text-zinc-500 uppercase">
                  Sessions
                </p>
                <p className="mt-1 font-black text-white">{sessions.length}</p>
              </div>
              <div className="bg-[#252525] px-2.5 py-2">
                <p className="text-[10px] font-black tracking-[0.08em] text-zinc-500 uppercase">
                  Captures
                </p>
                <p className="mt-1 font-black text-white">{allFrames.length}</p>
              </div>
            </div>
            {truncated ? (
              <p className="mt-3 border-l-2 border-amber-300 pl-2 text-xs leading-5 text-amber-100">
                Long history: showing {allFrames.length.toLocaleString()} of{" "}
                {totalCaptures.toLocaleString()} captures, sampled evenly across
                the full timeline.
              </p>
            ) : null}
          </section>

          <section className="border-b border-[#3d3d3d] p-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
              <Scissors className="size-3.5" />
              Time audit
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">
              {fmtDuration(auditedSeconds)}
              <span className="ml-2 text-xs font-black tracking-[0.08em] text-zinc-500 uppercase">
                audited
              </span>
            </p>
            {totalDeductedSeconds > 0 ? (
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs font-black">
                {removedDeductedSeconds > 0 ? (
                  <span className="text-red-300">
                    −{fmtDuration(removedDeductedSeconds)} removed
                  </span>
                ) : null}
                {deflatedDeductedSeconds > 0 ? (
                  <span className="text-amber-300">
                    −{fmtDuration(deflatedDeductedSeconds)} deflated
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                No time removed or deflated yet.
              </p>
            )}

            {auditSegments.length > 0 ? (
              <div className="mt-3 divide-y divide-[#363636] border-y border-[#363636]">
                {auditSegments.map((segment) => {
                  const startTape = dateToTapeSeconds(
                    auditTape,
                    segment.startAt,
                  );
                  const endTape = dateToTapeSeconds(auditTape, segment.endAt);
                  const rangeMin =
                    Math.round(((endTape - startTape) / 60) * 10) / 10;
                  const deflatedToMin =
                    Math.round(
                      ((rangeMin * (100 - segment.deflatedPercent)) / 100) * 10,
                    ) / 10;
                  return (
                    <div
                      key={segment.id}
                      className="flex items-center gap-2 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => jumpToTime(segment.startAt)}
                        className="min-w-0 flex-1 text-left transition hover:text-white"
                        title={`${fmtDateTime(segment.startAt)} – ${fmtDateTime(
                          segment.endAt,
                        )}${
                          segment.reviewerName
                            ? ` — by ${segment.reviewerName}`
                            : ""
                        }`}
                      >
                        <span
                          className={`font-black capitalize ${
                            segment.kind === "removed"
                              ? "text-red-300"
                              : "text-amber-300"
                          }`}
                        >
                          {segment.kind}
                        </span>
                        <span className="ml-2 text-zinc-400 tabular-nums">
                          {fmtTapeStamp(startTape)} – {fmtTapeStamp(endTape)}
                        </span>
                        <span className="mt-0.5 block truncate text-zinc-500">
                          {segment.reason}
                        </span>
                      </button>
                      <span className="shrink-0 font-black tabular-nums text-white">
                        {segment.kind === "removed"
                          ? `−${rangeMin}m`
                          : `${rangeMin}m → ${deflatedToMin}m`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAuditSegment(segment.id)}
                        disabled={auditBusy}
                        title="Delete segment"
                        aria-label="Delete segment"
                        className="grid size-6 shrink-0 place-items-center text-zinc-500 transition hover:text-red-300 disabled:opacity-40"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {auditForm ? (
              <div className="mt-3 space-y-3 border border-[#4a4a4a] bg-[#1c1c1c] p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.12em] text-zinc-400 uppercase">
                  <Plus className="size-3" />
                  {auditForm.kind === "removed" ? "Remove" : "Deflate"} time
                  range
                </p>
                <div className="flex items-end gap-2">
                  {(
                    [
                      ["startSec", "Start (min)"],
                      ["endSec", "End (min)"],
                    ] as const
                  ).map(([field, label], index) => (
                    <div key={field} className="contents">
                      {index === 1 ? (
                        <span className="pb-2 text-zinc-500">–</span>
                      ) : null}
                      <label className="min-w-0 flex-1">
                        <span className="text-[10px] font-black tracking-[0.08em] text-zinc-500 uppercase">
                          {label}
                        </span>
                        <span className="mt-1 flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={auditTotalMin}
                            step={0.5}
                            value={Math.round(auditForm[field] / 6) / 10}
                            onChange={(event) => {
                              const minutes = Number(event.currentTarget.value);
                              if (!Number.isFinite(minutes)) return;
                              setAuditError(null);
                              setAuditForm({
                                ...auditForm,
                                [field]: Math.min(
                                  Math.max(minutes * 60, 0),
                                  auditTape.totalSeconds,
                                ),
                              });
                            }}
                            className="w-full border border-[#4a4a4a] bg-[#141414] px-2 py-1.5 text-sm font-bold text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setAuditError(null);
                              setAuditForm({
                                ...auditForm,
                                [field]: Math.round(currentTapeSec * 10) / 10,
                              });
                            }}
                            title="Set to current playback time"
                            aria-label={`Set ${label} to current playback time`}
                            className="grid size-8 shrink-0 place-items-center border border-[#4a4a4a] text-zinc-400 transition hover:border-white hover:text-white"
                          >
                            <Crosshair className="size-3.5" />
                          </button>
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
                <AuditReasonInput
                  kind={auditForm.kind}
                  value={auditForm.reason}
                  onChange={(reason) => setAuditForm({ ...auditForm, reason })}
                />
                {auditForm.kind === "deflated" ? (
                  <AuditDeflationInputs
                    key={`${auditForm.startSec}-${auditForm.endSec}`}
                    rangeMin={
                      Math.max(auditForm.endSec - auditForm.startSec, 60) / 60
                    }
                    deflatedPercent={auditForm.deflatedPercent}
                    onChange={(deflatedPercent) =>
                      setAuditForm((form) =>
                        form ? { ...form, deflatedPercent } : form,
                      )
                    }
                  />
                ) : null}
                {auditError ? (
                  <p className="border-l-2 border-red-400 pl-2 text-xs text-red-200">
                    {auditError}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={submitAuditSegment}
                    disabled={!auditFormValid || auditBusy}
                    className="bg-[#BD0F32] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#d71943] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {auditBusy ? "Saving..." : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuditForm(null);
                      setAuditError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-black text-zinc-400 transition hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openAuditForm("removed")}
                  disabled={!current || auditBusy}
                  className="inline-flex items-center gap-1.5 border border-[#4a4a4a] px-2.5 py-1.5 text-xs font-black text-zinc-300 transition hover:border-red-300 hover:text-red-200 disabled:opacity-40"
                >
                  <MinusCircle className="size-3.5" />
                  Remove time
                </button>
                <button
                  type="button"
                  onClick={() => openAuditForm("deflated")}
                  disabled={!current || auditBusy}
                  className="inline-flex items-center gap-1.5 border border-[#4a4a4a] px-2.5 py-1.5 text-xs font-black text-zinc-300 transition hover:border-amber-300 hover:text-amber-200 disabled:opacity-40"
                >
                  <Gauge className="size-3.5" />
                  Deflate time
                </button>
              </div>
            )}
            {auditError && !auditForm ? (
              <p className="mt-2 border-l-2 border-red-400 pl-2 text-xs text-red-200">
                {auditError}
              </p>
            ) : null}
          </section>

          <section className="border-b border-[#3d3d3d] p-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
              <CircleAlert className="size-3.5" />
              Review signals
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-400">Capture gaps</dt>
                <dd
                  className={
                    gapEvents.length > 0
                      ? "font-black text-amber-200"
                      : "font-black text-emerald-300"
                  }
                >
                  {gapEvents.length}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-400">Idle signals</dt>
                <dd
                  className={
                    inactiveFrameCount > 0
                      ? "font-black text-violet-200"
                      : "font-black text-emerald-300"
                  }
                >
                  {inactiveFrameCount}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-400">Editor captures</dt>
                <dd className="font-black text-sky-200">{editorFrameCount}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-400">Screen images</dt>
                <dd className="font-black text-violet-200">
                  {readableScreenFrameCount} / {screenFrameCount}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-zinc-400">Changed screens</dt>
                <dd className="font-black text-violet-200">
                  {changedScreenFrameCount}
                </dd>
              </div>
            </dl>
            {inactiveFrameCount > 0 ? (
              <p className="mt-3 border-l-2 border-violet-300 pl-2 text-xs leading-5 text-violet-100">
                {fmtDuration(estimatedInactiveSeconds)} of screen markers may
                need review.
              </p>
            ) : null}
          </section>

          <section className="border-b border-[#3d3d3d] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
                Current capture
              </p>
              {current ? <SourcePill frame={current} /> : null}
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-400">Captured</dt>
                <dd className="text-right font-black text-white">
                  {current ? fmtDateTime(current.capturedAt) : "-"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-400">Session</dt>
                <dd className="text-right font-black text-white">
                  {currentFrameSessionIndex
                    ? `${currentFrameSessionIndex} of ${sessions.length}`
                    : "Not linked"}
                </dd>
              </div>
              {currentSession ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-400">Session active</dt>
                  <dd className="text-right font-black text-white">
                    {fmtDuration(currentSession.activeSeconds)}
                  </dd>
                </div>
              ) : null}
              {currentScreen ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-400">Screen state</dt>
                  <dd className="text-right font-black text-white">
                    {currentScreen.paused
                      ? "Paused"
                      : currentScreen.pixelChanged
                        ? "Changed"
                        : "Unchanged"}
                  </dd>
                </div>
              ) : null}
              {currentScreen ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-400">Visual context</dt>
                  <dd className="text-right font-black text-white">
                    {visibleScreenImage
                      ? carriesPreviousScreenImage
                        ? `Carried from ${fmtTime(visibleScreenImage.capturedAt)}`
                        : "Current capture"
                      : "No image in this session"}
                  </dd>
                </div>
              ) : null}
              {currentScreen ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-400">Pixel difference</dt>
                  <dd className="text-right font-black text-white">
                    {currentScreen.diffScore.toLocaleString()}
                  </dd>
                </div>
              ) : null}
              {currentScreen &&
              currentScreen.screenWidth > 0 &&
              currentScreen.screenHeight > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-400">Screen size</dt>
                  <dd className="text-right font-black text-white">
                    {currentScreen.screenWidth} x {currentScreen.screenHeight}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {gapEvents.length > 0 ? (
            <section className="border-b border-[#3d3d3d] p-4">
              <p className="text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
                Capture gaps
              </p>
              <div className="mt-2 divide-y divide-[#363636] border-y border-[#363636]">
                {gapEvents.slice(-8).map((event) => (
                  <button
                    key={`${frameKey(event.previous)}-${frameKey(event.frame)}`}
                    type="button"
                    onClick={() => jumpToGap(event)}
                    className="flex w-full items-center justify-between gap-3 px-0 py-2 text-left text-xs transition hover:text-amber-100"
                  >
                    <span className="font-black text-amber-200">
                      {event.duration}
                    </span>
                    <span className="truncate text-zinc-400">
                      {fmtDateTime(event.frame.capturedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="p-4">
            <p className="text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
              Sessions
            </p>
            <div className="mt-2 divide-y divide-[#363636] border-y border-[#363636]">
              {sessionSummaries.map((session, index) => {
                const selected = currentSession?.id === session.id;
                const hasCapture = session.captureCount > 0;
                return (
                  <button
                    key={session.id}
                    type="button"
                    disabled={!hasCapture}
                    onClick={() => jumpToSession(session.id)}
                    className={`w-full px-0 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      selected
                        ? "text-white"
                        : "text-zinc-300 hover:bg-[#292929] hover:text-white"
                    }`}
                    title={
                      hasCapture
                        ? `Jump to session ${index + 1}`
                        : "No captured evidence in this session"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black">Session {index + 1}</span>
                      <span className="font-black tabular-nums text-white">
                        {fmtDuration(session.activeSeconds)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-zinc-500">
                      <span>{fmtDateTime(session.startedAt)}</span>
                      <span>
                        {session.captureCount} captures
                        {session.screenCaptureCount > 0
                          ? ` · ${session.screenCaptureCount} screen`
                          : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
