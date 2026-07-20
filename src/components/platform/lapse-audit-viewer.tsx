"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  Clock3,
  Crosshair,
  Film,
  Gauge,
  MinusCircle,
  Pause,
  Play,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addLapseAuditSegment,
  deleteLapseAuditSegment,
  type LapseAuditSegmentDto,
} from "@/actions/admin/time-audit";
import {
  AuditDeflationInputs,
  AuditReasonInput,
} from "@/components/platform/audit-inputs";
import {
  lapseRangesOverlap,
  lapseSegmentDeductionSeconds,
  type TimeAuditKind,
} from "@/lib/time-audit";

const SPEEDS = [0.5, 1, 2, 4, 8];

// Positions in this editor are video seconds within the recording: the Lapse
// timeline is the recording itself, whose duration counts 1:1 toward measured
// time. fallout audits the timelapse video the same way, one segment per
// stretch of footage the reviewer wants removed or deflated.
type LapseAuditFormState = {
  kind: TimeAuditKind;
  startSec: number;
  endSec: number;
  reason: string;
  deflatedPercent: number;
};

// mm:ss video timestamp (minutes may exceed 60).
function fmtClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
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

export function LapseAuditViewer({
  projectId,
  timelapseId,
  projectTitle,
  recordingName,
  playbackUrl,
  durationSeconds,
  initialSegments,
}: {
  projectId: number;
  timelapseId: number;
  projectTitle: string;
  recordingName: string;
  playbackUrl: string;
  durationSeconds: number;
  initialSegments: LapseAuditSegmentDto[];
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [segments, setSegments] =
    useState<LapseAuditSegmentDto[]>(initialSegments);
  const [currentSec, setCurrentSec] = useState(0);
  // Metadata is authoritative once the video loads; the stored duration is the
  // fallback so the timeline and form still work if playback never starts.
  const [duration, setDuration] = useState(Math.max(1, durationSeconds));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [form, setForm] = useState<LapseAuditFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed]);

  const seekTo = useCallback(
    (sec: number) => {
      const clamped = Math.min(Math.max(sec, 0), duration);
      const video = videoRef.current;
      if (video && Number.isFinite(video.duration)) {
        video.currentTime = clamped;
      }
      setCurrentSec(clamped);
    },
    [duration],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  // Snap points: recording bounds plus every existing segment edge, so a new
  // range defaults to ending at the next boundary after the playhead.
  const snapPoints = useMemo(() => {
    const points = new Set<number>([0, duration]);
    for (const segment of segments) {
      points.add(segment.startSeconds);
      points.add(segment.endSeconds);
    }
    return [...points].sort((left, right) => left - right);
  }, [duration, segments]);

  const removedDeducted = segments
    .filter((segment) => segment.kind === "removed")
    .reduce((sum, segment) => sum + segment.deductedSeconds, 0);
  const deflatedDeducted = segments
    .filter((segment) => segment.kind === "deflated")
    .reduce((sum, segment) => sum + segment.deductedSeconds, 0);
  const totalDeducted = removedDeducted + deflatedDeducted;
  const auditedSeconds = Math.max(0, durationSeconds - totalDeducted);

  const formValid = Boolean(
    form && form.reason.trim().length > 0 && form.startSec < form.endSec,
  );

  const bandStyle = useCallback(
    (startSec: number, endSec: number) => {
      const left = (startSec / duration) * 100;
      const width = Math.max(((endSec - startSec) / duration) * 100, 0.75);
      return { left: `${left}%`, width: `${width}%` };
    },
    [duration],
  );

  const openForm = useCallback(
    (kind: TimeAuditKind) => {
      const video = videoRef.current;
      if (video) video.pause();
      setError(null);
      const startSec = Math.min(
        Math.round(currentSec),
        Math.max(0, Math.floor(duration) - 1),
      );
      const next = snapPoints.find((point) => point > startSec + 1);
      setForm({
        kind,
        startSec,
        endSec: Math.round(next ?? duration),
        reason: "",
        deflatedPercent: 50,
      });
    },
    [currentSec, duration, snapPoints],
  );

  const submit = useCallback(async () => {
    if (!form) return;
    if (
      segments.some((segment) =>
        lapseRangesOverlap(segment, {
          startSeconds: form.startSec,
          endSeconds: form.endSec,
        }),
      )
    ) {
      setError("This range overlaps with an existing segment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await addLapseAuditSegment(timelapseId, {
        startSeconds: form.startSec,
        endSeconds: form.endSec,
        kind: form.kind,
        deflatedPercent: Math.round(form.deflatedPercent),
        reason: form.reason.trim(),
      });
      setSegments(next);
      setForm(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to save segment",
      );
    } finally {
      setBusy(false);
    }
  }, [form, segments, timelapseId]);

  const removeSegment = useCallback(
    async (segmentId: number) => {
      setBusy(true);
      setError(null);
      try {
        const next = await deleteLapseAuditSegment(timelapseId, segmentId);
        setSegments(next);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to delete");
      } finally {
        setBusy(false);
      }
    },
    [timelapseId],
  );

  const previewDeducted = form
    ? lapseSegmentDeductionSeconds({
        startSeconds: form.startSec,
        endSeconds: form.endSec,
        kind: form.kind,
        deflatedPercent: form.deflatedPercent,
      })
    : 0;

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
              Lapse audit
            </p>
            <span className="truncate border border-violet-300/40 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-black tracking-[0.08em] text-violet-100 uppercase">
              {recordingName || "Untitled recording"}
            </span>
          </div>
          <h1 className="truncate text-sm font-black text-white">
            {projectTitle}
          </h1>
        </div>
        <div className="hidden shrink-0 text-right text-xs text-zinc-400 md:block">
          <p className="font-black text-white">
            {fmtDuration(durationSeconds)} recording
            {totalDeducted > 0 ? (
              <span className="text-emerald-300">
                {" "}
                → {fmtDuration(auditedSeconds)} audited
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_21rem] lg:overflow-hidden">
        <section className="flex min-h-[38rem] min-w-0 flex-col border-b border-[#3d3d3d] lg:min-h-0 lg:border-b-0">
          <div className="relative min-h-[360px] flex-1 overflow-hidden bg-[#101010]">
            {playbackUrl ? (
              // biome-ignore lint/a11y/useMediaCaption: reviewer-only screen recording, no captions exist
              <video
                ref={videoRef}
                src={playbackUrl}
                controls={false}
                playsInline
                className="h-full max-h-[min(72dvh,900px)] w-full bg-black object-contain"
                onLoadedMetadata={(event) => {
                  const value = event.currentTarget.duration;
                  if (Number.isFinite(value) && value > 0) {
                    setDuration(value);
                  }
                }}
                onTimeUpdate={(event) =>
                  setCurrentSec(event.currentTarget.currentTime)
                }
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={togglePlay}
              />
            ) : (
              <div className="grid h-full min-h-[360px] place-items-center p-6 text-center">
                <div className="max-w-sm border border-violet-300/30 bg-violet-950/25 p-6 shadow-[4px_4px_0_rgba(167,139,250,0.2)]">
                  <Film className="mx-auto size-6 text-violet-200" />
                  <p className="mt-3 text-sm font-black text-violet-100">
                    No playable video
                  </p>
                  <p className="mt-1 text-xs leading-5 text-violet-200/75">
                    This recording has no playback URL. You can still mark
                    ranges by their time below.
                  </p>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-[#3d3d3d] bg-[#222] px-3 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => seekTo(currentSec - 5)}
                title="Back 5s"
                aria-label="Back 5 seconds"
                className="grid size-8 place-items-center border border-[#4b4b4b] text-zinc-300 transition hover:border-white hover:bg-[#383838] hover:text-white"
              >
                −5s
              </button>
              <button
                type="button"
                onClick={togglePlay}
                disabled={!playbackUrl}
                title={playing ? "Pause" : "Play"}
                aria-label={playing ? "Pause" : "Play"}
                className="grid size-9 place-items-center bg-[#BD0F32] text-white transition hover:bg-[#d71943] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => seekTo(currentSec + 5)}
                title="Forward 5s"
                aria-label="Forward 5 seconds"
                className="grid size-8 place-items-center border border-[#4b4b4b] text-zinc-300 transition hover:border-white hover:bg-[#383838] hover:text-white"
              >
                +5s
              </button>

              <fieldset className="ml-1 flex items-stretch border border-[#4b4b4b] bg-[#191919] p-0.5">
                <legend className="sr-only">Playback speed</legend>
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSpeed(value)}
                    aria-pressed={speed === value}
                    className={`min-w-8 px-1.5 py-1 text-[11px] font-black transition ${
                      speed === value
                        ? "bg-[#BD0F32] text-white"
                        : "text-zinc-400 hover:bg-[#363636] hover:text-white"
                    }`}
                  >
                    {value}x
                  </button>
                ))}
              </fieldset>

              <span className="ml-auto text-right text-[11px] tabular-nums text-zinc-400">
                {fmtClock(currentSec)} / {fmtClock(duration)}
              </span>
            </div>

            <div className="relative mt-3 pt-2">
              <input
                type="range"
                min={0}
                max={Math.round(duration)}
                value={Math.round(currentSec)}
                onChange={(event) => seekTo(Number(event.currentTarget.value))}
                aria-label="Seek recording"
                aria-valuetext={`${fmtClock(currentSec)} of ${fmtClock(duration)}`}
                className="relative z-10 block h-3 w-full cursor-pointer accent-[#BD0F32]"
              />
              <div className="pointer-events-none absolute inset-x-1 top-2.5 h-1 bg-[#343434]">
                <div
                  className="h-full bg-[#BD0F32]"
                  style={{ width: `${(currentSec / duration) * 100}%` }}
                />
                {segments.map((segment) => (
                  <span
                    key={`band-${segment.id}`}
                    className={`absolute -top-0.5 h-2 ${
                      segment.kind === "removed"
                        ? "bg-red-500/60"
                        : "bg-amber-500/50"
                    }`}
                    style={bandStyle(segment.startSeconds, segment.endSeconds)}
                  />
                ))}
                {form ? (
                  <span
                    className={`absolute -top-0.75 h-2.5 border border-dashed ${
                      form.kind === "removed"
                        ? "border-red-400 bg-red-500/20"
                        : "border-amber-400 bg-amber-500/20"
                    }`}
                    style={bandStyle(form.startSec, form.endSec)}
                  />
                ) : null}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-black tabular-nums text-zinc-500">
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                  <span key={frac}>{fmtClock(duration * frac)}</span>
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-black tracking-[0.06em] text-zinc-500 uppercase">
              {segments.some((segment) => segment.kind === "removed") ? (
                <span className="text-red-400">Red band: removed time</span>
              ) : null}
              {segments.some((segment) => segment.kind === "deflated") ? (
                <span className="text-amber-400">
                  Amber band: deflated time
                </span>
              ) : null}
            </div>
          </footer>
        </section>

        <aside className="min-h-0 border-[#3d3d3d] bg-[#202020] lg:overflow-y-auto lg:border-l">
          <section className="border-b border-[#3d3d3d] p-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
              <Clock3 className="size-3.5" />
              Recording time
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">
              {fmtDuration(durationSeconds)}
            </p>
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
            {totalDeducted > 0 ? (
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs font-black">
                {removedDeducted > 0 ? (
                  <span className="text-red-300">
                    −{fmtDuration(removedDeducted)} removed
                  </span>
                ) : null}
                {deflatedDeducted > 0 ? (
                  <span className="text-amber-300">
                    −{fmtDuration(deflatedDeducted)} deflated
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                No time removed or deflated yet.
              </p>
            )}

            {segments.length > 0 ? (
              <div className="mt-3 divide-y divide-[#363636] border-y border-[#363636]">
                {segments.map((segment) => {
                  const rangeSec = segment.endSeconds - segment.startSeconds;
                  const deflatedToSec = Math.round(
                    (rangeSec * (100 - segment.deflatedPercent)) / 100,
                  );
                  return (
                    <div
                      key={segment.id}
                      className="flex items-center gap-2 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => seekTo(segment.startSeconds)}
                        className="min-w-0 flex-1 text-left transition hover:text-white"
                        title={
                          segment.reviewerName
                            ? `by ${segment.reviewerName}`
                            : undefined
                        }
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
                          {fmtClock(segment.startSeconds)} –{" "}
                          {fmtClock(segment.endSeconds)}
                        </span>
                        <span className="mt-0.5 block truncate text-zinc-500">
                          {segment.reason}
                        </span>
                      </button>
                      <span className="shrink-0 font-black tabular-nums text-white">
                        {segment.kind === "removed"
                          ? `−${fmtDuration(rangeSec)}`
                          : `${fmtDuration(rangeSec)} → ${fmtDuration(deflatedToSec)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSegment(segment.id)}
                        disabled={busy}
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

            {form ? (
              <div className="mt-3 space-y-3 border border-[#4a4a4a] bg-[#1c1c1c] p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.12em] text-zinc-400 uppercase">
                  <Plus className="size-3" />
                  {form.kind === "removed" ? "Remove" : "Deflate"} time range
                </p>
                <div className="flex items-end gap-2">
                  {(
                    [
                      ["startSec", "Start"],
                      ["endSec", "End"],
                    ] as const
                  ).map(([field, label], index) => (
                    <div key={field} className="contents">
                      {index === 1 ? (
                        <span className="pb-2 text-zinc-500">–</span>
                      ) : null}
                      <label className="min-w-0 flex-1">
                        <span className="text-[10px] font-black tracking-[0.08em] text-zinc-500 uppercase">
                          {label} ({fmtClock(form[field])})
                        </span>
                        <span className="mt-1 flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={Math.round(duration)}
                            step={1}
                            value={Math.round(form[field])}
                            onChange={(event) => {
                              const secs = Number(event.currentTarget.value);
                              if (!Number.isFinite(secs)) return;
                              setError(null);
                              setForm({
                                ...form,
                                [field]: Math.min(
                                  Math.max(secs, 0),
                                  Math.round(duration),
                                ),
                              });
                            }}
                            className="w-full border border-[#4a4a4a] bg-[#141414] px-2 py-1.5 text-sm font-bold text-white"
                          />
                          <span className="shrink-0 text-xs text-zinc-400">
                            s
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setForm({
                                ...form,
                                [field]: Math.round(currentSec),
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
                  kind={form.kind}
                  value={form.reason}
                  onChange={(reason) => setForm({ ...form, reason })}
                />
                {form.kind === "deflated" ? (
                  <AuditDeflationInputs
                    key={`${form.startSec}-${form.endSec}`}
                    rangeMin={Math.max(form.endSec - form.startSec, 1) / 60}
                    deflatedPercent={form.deflatedPercent}
                    onChange={(deflatedPercent) =>
                      setForm((state) =>
                        state ? { ...state, deflatedPercent } : state,
                      )
                    }
                  />
                ) : null}
                {formValid ? (
                  <p className="text-[11px] font-bold text-zinc-400">
                    Deducts {fmtDuration(previewDeducted)} from measured time.
                  </p>
                ) : null}
                {error ? (
                  <p className="border-l-2 border-red-400 pl-2 text-xs text-red-200">
                    {error}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!formValid || busy}
                    className="bg-[#BD0F32] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#d71943] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? "Saving..." : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(null);
                      setError(null);
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
                  onClick={() => openForm("removed")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 border border-[#4a4a4a] px-2.5 py-1.5 text-xs font-black text-zinc-300 transition hover:border-red-300 hover:text-red-200 disabled:opacity-40"
                >
                  <MinusCircle className="size-3.5" />
                  Remove time
                </button>
                <button
                  type="button"
                  onClick={() => openForm("deflated")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 border border-[#4a4a4a] px-2.5 py-1.5 text-xs font-black text-zinc-300 transition hover:border-amber-300 hover:text-amber-200 disabled:opacity-40"
                >
                  <Gauge className="size-3.5" />
                  Deflate time
                </button>
              </div>
            )}
            {error && !form ? (
              <p className="mt-2 border-l-2 border-red-400 pl-2 text-xs text-red-200">
                {error}
              </p>
            ) : null}
          </section>

          <section className="p-4">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-zinc-500 uppercase">
              <CircleAlert className="size-3.5" />
              How this counts
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              This recording's {fmtDuration(durationSeconds)} counts toward the
              project's measured time. Removed ranges drop their full length;
              deflated ranges drop the chosen share. Deductions show up on the
              review page's time-audit total alongside any editor timelapse
              audit.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
