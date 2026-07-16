"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorUp, Pause, Play } from "lucide-react";
import {
  getCurrentActivitySessionId,
  recordExternalActivity,
  setActivityStatusListener,
  setActivityTrackingPaused,
  setScreenShareTracking,
  startActivityTracking,
  stopActivityTracking,
} from "@/lib/editor/activityTracker";
import { TrackingHealthNotice } from "./TrackingHealthNotice";

type QueuedFrame = {
  sessionId: number;
  capturedAt: string;
  imageData: string;
  pixelChanged: boolean;
  diffScore: number;
  screenWidth: number;
  screenHeight: number;
  paused: boolean;
};

const CAPTURE_INTERVAL_MS = 30_000;
const INACTIVE_AFTER_MS = 120_000;
const DIFF_THRESHOLD = 1_800;
const MAX_QUEUE = 60;
const MAX_UPLOAD_BATCH = 8;
const DIFF_WIDTH = 160;
const EVIDENCE_WIDTH = 960;
const JPEG_QUALITY = 0.72;
const EVIDENCE_UPLOAD_TIMEOUT_MS = 20_000;

function shouldCaptureOutsideSite() {
  return document.hidden || !document.hasFocus();
}

function fmt(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : `${minutes}m ${seconds}s`;
}

function queueKey(projectId: number) {
  return `breadboard:screen-evidence:${projectId}`;
}

function loadQueue(projectId: number): QueuedFrame[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(queueKey(projectId)) ?? "[]",
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(projectId: number, frames: QueuedFrame[]) {
  // Evidence must never be silently compacted or dropped just because local
  // storage is full. Callers surface a persistent warning and try a direct
  // upload instead.
  if (frames.length > MAX_QUEUE) return false;
  try {
    if (frames.length === 0) localStorage.removeItem(queueKey(projectId));
    else localStorage.setItem(queueKey(projectId), JSON.stringify(frames));
    return true;
  } catch {
    return false;
  }
}

async function uploadFrames(projectId: number, frames: QueuedFrame[]) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    EVIDENCE_UPLOAD_TIMEOUT_MS,
  );
  try {
    const res = await fetch(
      `/api/editor/projects/${projectId}/activity/screen-frame`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ frames }),
        signal: controller.signal,
      },
    );
    const result = (await res.json().catch(() => null)) as {
      storedCount?: number;
    } | null;
    if (!res.ok || result?.storedCount !== frames.length) {
      throw new Error("Screen evidence upload failed");
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

async function flushQueue(projectId: number) {
  const queue = loadQueue(projectId);
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_UPLOAD_BATCH);
  await uploadFrames(projectId, batch);
  const uploaded = new Set(
    batch.map((frame) => `${frame.sessionId}:${frame.capturedAt}`),
  );
  // Reload after the request. A capture may have been appended while this
  // batch was uploading, and removing by identity preserves that new frame.
  const remaining = loadQueue(projectId).filter(
    (frame) => !uploaded.has(`${frame.sessionId}:${frame.capturedAt}`),
  );
  if (!saveQueue(projectId, remaining)) {
    throw new Error("Screen evidence queue could not be updated");
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

// Browsers only hand out one display surface per getDisplayMedia() call, so
// multi-monitor users add screens one at a time. Each shared screen keeps its
// own diff buffer; evidence frames stitch all live screens into one composite.
const MAX_SHARED_SCREENS = 3;

type SharedScreen = {
  id: number;
  stream: MediaStream;
  video: HTMLVideoElement;
  previous: Uint8ClampedArray | null;
};

export function ScreenShareTracker({
  projectId,
  promptOnMount = true,
  managesActivityTracking = false,
}: {
  projectId: number;
  promptOnMount?: boolean;
  // When true, this component owns the activity-tracking lifecycle: nothing is
  // tracked until the user sets up tracking (starts sharing), and it runs
  // without auto-pausing on inactivity. Used on the off-platform track page,
  // where the page shouldn't start counting time on load.
  managesActivityTracking?: boolean;
}) {
  const [screenCount, setScreenCount] = useState(0);
  const sharing = screenCount > 0;
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [inactiveMs, setInactiveMs] = useState(0);
  const [outsideSite, setOutsideSite] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  // Screens panel: live previews of every shared screen with per-screen stop.
  const [screensOpen, setScreensOpen] = useState(false);
  // Off-platform pages defer the share prompt until the user starts tracking
  // themselves (promptOnMount={false}); the editor keeps prompting on load.
  const [setupDismissed, setSetupDismissed] = useState(!promptOnMount);
  const [dismissCountdown, setDismissCountdown] = useState(5);
  const [warningOpen, setWarningOpen] = useState(false);
  // The visible number is the server-confirmed project total. It deliberately
  // does not tick optimistically: a stalled request must never make the UI
  // claim time that was not actually saved.
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [trackingStatus, setTrackingStatus] = useState<
    "active" | "idle" | "blocked" | "error"
  >("idle");
  const [trackingReason, setTrackingReason] = useState("");
  const screensRef = useRef<SharedScreen[]>([]);
  const nextScreenIdRef = useRef(1);
  const lastChangeRef = useRef(Date.now());
  const captureInFlightRef = useRef(false);
  // Whether the OS reports more than one display (Window Management API,
  // Chrome/Edge). Used only to nudge multi-monitor users in the setup modal.
  const [multiDisplay, setMultiDisplay] = useState(false);
  const flushInFlightRef = useRef(false);
  const flushRequestedRef = useRef(false);
  const suppressEndedRef = useRef(false);
  // Whether we've kicked off activity tracking yet (managesActivityTracking).
  const trackingStartedRef = useRef(false);

  const playWarningSound = useCallback(() => {
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
  }, []);

  const flushEvidenceQueue = useCallback(async () => {
    if (flushInFlightRef.current) {
      flushRequestedRef.current = true;
      return;
    }
    flushInFlightRef.current = true;
    setQueuedCount(loadQueue(projectId).length);
    try {
      do {
        flushRequestedRef.current = false;
        await flushQueue(projectId);
      } while (flushRequestedRef.current || loadQueue(projectId).length > 0);
      setEvidenceError("");
    } catch {
      setEvidenceError(
        "Screen evidence is waiting to upload. Check your connection before relying on outside-site time.",
      );
    } finally {
      flushInFlightRef.current = false;
      setQueuedCount(loadQueue(projectId).length);
    }
  }, [projectId]);

  const enqueue = useCallback(
    async (frame: QueuedFrame) => {
      const queue = loadQueue(projectId);
      queue.push(frame);
      if (!saveQueue(projectId, queue)) {
        try {
          await uploadFrames(projectId, [frame]);
          await flushEvidenceQueue();
        } catch {
          setEvidenceError(
            "Screen evidence could not be queued or uploaded. Check your connection and keep this tab open before relying on outside-site time.",
          );
        }
        setQueuedCount(loadQueue(projectId).length);
        return;
      }
      setQueuedCount(loadQueue(projectId).length);
      await flushEvidenceQueue();
    },
    [flushEvidenceQueue, projectId],
  );

  const captureFrame = useCallback(async () => {
    if (captureInFlightRef.current) return;
    const outsideSiteNow = shouldCaptureOutsideSite();
    setOutsideSite(outsideSiteNow);
    // The off-platform track page requires screen evidence for every
    // heartbeat, including while its own tab is focused, so it must keep
    // capturing frames here. The editor skips focused captures because
    // on-site time is verified through editor activity instead.
    if (!managesActivityTracking && !outsideSiteNow) return;
    captureInFlightRef.current = true;
    try {
      const screens = screensRef.current.filter(
        (entry) => entry.video.readyState >= 2 && entry.video.videoWidth > 0,
      );
      if (screens.length === 0) return;
      const sessionId = getCurrentActivitySessionId();
      if (sessionId < 1) return;

      // Diff each screen against its own previous frame. Activity on ANY
      // shared screen counts, so a builder working on their second monitor
      // still accrues time while the first sits idle.
      let diffScore = 0;
      let anyChanged = false;
      let anyFirstFrame = false;
      for (const entry of screens) {
        const width = DIFF_WIDTH;
        const height = Math.max(
          1,
          Math.round(
            (entry.video.videoHeight / entry.video.videoWidth) * width,
          ) || 90,
        );
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;

        ctx.drawImage(entry.video, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        const previous = entry.previous;
        let entryDiff = 0;
        if (previous && previous.length === pixels.length) {
          for (let i = 0; i < pixels.length; i += 16) {
            entryDiff += Math.abs(pixels[i] - previous[i]);
            entryDiff += Math.abs(pixels[i + 1] - previous[i + 1]);
            entryDiff += Math.abs(pixels[i + 2] - previous[i + 2]);
          }
          if (entryDiff >= DIFF_THRESHOLD) anyChanged = true;
        } else {
          anyFirstFrame = true;
        }
        entry.previous = new Uint8ClampedArray(pixels);
        diffScore += entryDiff;
      }

      const pixelChanged = anyFirstFrame || anyChanged;
      if (pixelChanged && !paused) lastChangeRef.current = Date.now();

      const now = Date.now();
      setInactiveMs(now - lastChangeRef.current);
      let imageData = "";
      let compositeWidth = 0;
      let compositeHeight = 0;
      // Store a readable image for every capture, including unchanged frames.
      // The server independently marks whether pixels changed, while reviewers
      // get a continuous visual replay instead of sparse five-minute anchors.
      const perScreenWidth = Math.round(
        Math.min(EVIDENCE_WIDTH, 1920 / screens.length),
      );
      const heights = screens.map((entry) =>
        Math.max(
          1,
          Math.round(
            (entry.video.videoHeight / entry.video.videoWidth) * perScreenWidth,
          ) || 540,
        ),
      );
      compositeWidth = perScreenWidth * screens.length;
      compositeHeight = Math.max(...heights);
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = compositeWidth;
      imageCanvas.height = compositeHeight;
      const imageCtx = imageCanvas.getContext("2d");
      if (imageCtx) {
        imageCtx.fillStyle = "#000";
        imageCtx.fillRect(0, 0, compositeWidth, compositeHeight);
        screens.forEach((entry, index) => {
          imageCtx.drawImage(
            entry.video,
            index * perScreenWidth,
            0,
            perScreenWidth,
            heights[index],
          );
        });
        imageData = imageCanvas.toDataURL("image/jpeg", JPEG_QUALITY);
      }

      await enqueue({
        sessionId,
        capturedAt: new Date().toISOString(),
        imageData,
        pixelChanged,
        diffScore,
        screenWidth: compositeWidth || screens[0].video.videoWidth || 0,
        screenHeight: compositeHeight || screens[0].video.videoHeight || 0,
        paused,
      });
      // Evidence reaches the server before this heartbeat asks for the
      // screen-share grace window. Otherwise a throttled background tab can
      // lose the session just before the proof arrives.
      if (pixelChanged && !paused) await recordExternalActivity();
    } finally {
      captureInFlightRef.current = false;
    }
  }, [enqueue, managesActivityTracking, paused]);

  // Add one shared screen (browsers only grant one display per prompt, so
  // multi-monitor users click this once per screen, up to the cap).
  const addScreen = useCallback(async () => {
    setError("");
    if (screensRef.current.length >= MAX_SHARED_SCREENS) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 1 },
        audio: false,
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      const entry: SharedScreen = {
        id: nextScreenIdRef.current++,
        stream,
        video,
        previous: null,
      };
      screensRef.current = [...screensRef.current, entry];
      setScreenCount(screensRef.current.length);
      setScreenShareTracking(
        managesActivityTracking || shouldCaptureOutsideSite(),
      );
      lastChangeRef.current = Date.now();
      setSetupOpen(false);
      setSetupDismissed(false);
      // Begin accruing time only now that the user has set up tracking.
      if (managesActivityTracking && !trackingStartedRef.current) {
        trackingStartedRef.current = true;
        await startActivityTracking(projectId, () => ({}), {
          ignoreInactivity: true,
          screenShare: true,
          captureSnapshots: false,
          externalTracking: true,
        });
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (suppressEndedRef.current) return;
        screensRef.current = screensRef.current.filter(
          (item) => item.id !== entry.id,
        );
        const remaining = screensRef.current.length;
        setScreenCount(remaining);
        setWarningOpen(true);
        setError(
          remaining > 0
            ? `One of your shared screens stopped (${remaining} still sharing). Re-share it so work on that screen keeps counting.`
            : "Screen sharing stopped. Outside-site time cannot be verified until you share your whole screen again.",
        );
        playWarningSound();
        // Stop accruing when the LAST screen ends: with ignoreInactivity the
        // heartbeat loop never self-pauses, so leaving it running would bank
        // unverifiable time until the tab closes. Re-sharing restarts it.
        if (
          remaining === 0 &&
          managesActivityTracking &&
          trackingStartedRef.current
        ) {
          stopActivityTracking();
          trackingStartedRef.current = false;
        }
        if (remaining === 0) setScreenShareTracking(false);
      });
      await captureFrame();
    } catch {
      setError(
        "Screen sharing was not started. Share your whole screen so time outside Breadboard can count.",
      );
      setWarningOpen(true);
      playWarningSound();
    }
  }, [captureFrame, playWarningSound, projectId, managesActivityTracking]);

  // Deliberately stop sharing one screen from the screens panel. Unlike a
  // browser-initiated drop this is the user's own action, so no warning
  // sound; and track.stop() never fires the track's "ended" listener, so the
  // bookkeeping has to happen here.
  const removeScreen = useCallback(
    (id: number) => {
      const entry = screensRef.current.find((item) => item.id === id);
      if (!entry) return;
      suppressEndedRef.current = true;
      stopStream(entry.stream);
      suppressEndedRef.current = false;
      screensRef.current = screensRef.current.filter((item) => item.id !== id);
      const remaining = screensRef.current.length;
      setScreenCount(remaining);
      if (remaining === 0) setScreenShareTracking(false);
      if (
        remaining === 0 &&
        managesActivityTracking &&
        trackingStartedRef.current
      ) {
        stopActivityTracking();
        trackingStartedRef.current = false;
      }
    },
    [managesActivityTracking],
  );

  useEffect(() => {
    setActivityTrackingPaused(paused);
  }, [paused]);

  useEffect(() => {
    const unsubscribe = setActivityStatusListener((status) => {
      if (status.projectId !== projectId) return;
      setTrackingStatus(status.status);
      setTrackingReason(status.reason ?? "");
      setDisplaySeconds((current) =>
        Math.max(current, status.totalTrackedSeconds ?? status.activeSeconds),
      );
    });
    return () => {
      unsubscribe();
    };
  }, [projectId]);

  useEffect(() => {
    const retry = () => void flushEvidenceQueue();
    retry();
    const retryId = setInterval(retry, 60_000);
    const onOnline = retry;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (loadQueue(projectId).length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onPageHide = () => {
      const queue = loadQueue(projectId).slice(0, MAX_UPLOAD_BATCH);
      if (queue.length === 0) return;
      const body = JSON.stringify({ frames: queue });
      void fetch(`/api/editor/projects/${projectId}/activity/screen-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(retryId);
    };
  }, [flushEvidenceQueue, projectId]);

  useEffect(() => {
    if (!sharing) return;
    const id = setInterval(() => void captureFrame(), CAPTURE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [captureFrame, sharing]);

  useEffect(() => {
    const updateOutsideSite = () => {
      const nextOutsideSite = shouldCaptureOutsideSite();
      setOutsideSite(nextOutsideSite);
      setScreenShareTracking(
        sharing && (managesActivityTracking || nextOutsideSite),
      );
      if (nextOutsideSite) void captureFrame();
      else if (sharing && !managesActivityTracking) {
        void recordExternalActivity();
      }
    };
    updateOutsideSite();
    window.addEventListener("blur", updateOutsideSite);
    window.addEventListener("focus", updateOutsideSite);
    document.addEventListener("visibilitychange", updateOutsideSite);
    return () => {
      window.removeEventListener("blur", updateOutsideSite);
      window.removeEventListener("focus", updateOutsideSite);
      document.removeEventListener("visibilitychange", updateOutsideSite);
    };
  }, [captureFrame, managesActivityTracking, sharing]);

  useEffect(
    () => () => {
      void flushQueue(projectId).catch(() => {});
      suppressEndedRef.current = true;
      for (const entry of screensRef.current) stopStream(entry.stream);
      screensRef.current = [];
      setScreenShareTracking(false);
      setActivityTrackingPaused(false);
      if (managesActivityTracking) stopActivityTracking();
    },
    [projectId, managesActivityTracking],
  );

  useEffect(() => {
    const s = window.screen as Screen & { isExtended?: boolean };
    setMultiDisplay(s.isExtended === true);
  }, []);

  const likelyInactive = inactiveMs >= INACTIVE_AFTER_MS;
  const showSetupModal =
    (setupOpen || (!sharing && !setupDismissed) || likelyInactive) && !paused;

  useEffect(() => {
    if (!showSetupModal || sharing) return;
    setDismissCountdown(5);
    const id = window.setInterval(() => {
      setDismissCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [sharing, showSetupModal]);

  useEffect(() => {
    if (!error && !evidenceError) return;
    setWarningOpen(true);
  }, [error, evidenceError]);
  const pillTone = paused
    ? "bg-purple-700 text-white hover:bg-purple-600"
    : error || evidenceError || trackingStatus === "error"
      ? "bg-red-900 text-red-100 hover:bg-red-800"
      : trackingStatus === "blocked"
        ? trackingReason.toLowerCase().includes("journal")
          ? "bg-yellow-900 text-yellow-100 hover:bg-yellow-800"
          : "bg-red-900 text-red-100 hover:bg-red-800"
        : sharing
          ? outsideSite
            ? "bg-green-700 text-white hover:bg-green-600"
            : "bg-[#2a2a2a] text-green-200 hover:bg-[#3a3a3a]"
          : "bg-[#BD0F32] text-white hover:bg-[#d71943]";
  const pillLabel = paused
    ? "Paused · Resume"
    : error || evidenceError
      ? "Tracking issue"
      : trackingStatus === "blocked"
        ? trackingReason.toLowerCase().includes("journal")
          ? "Journal needed"
          : "Evidence needed"
        : sharing
          ? "Pause"
          : "Set up tracking";

  return (
    <>
      <TrackingHealthNotice projectId={projectId} />
      <button
        type="button"
        onClick={() => {
          if (
            !sharing ||
            error ||
            evidenceError ||
            trackingStatus === "blocked"
          ) {
            setSetupOpen(true);
            return;
          }
          setPaused((value) => !value);
        }}
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-black transition-colors ${pillTone}`}
        title={
          paused
            ? "Paused. Click to resume time tracking."
            : sharing
              ? trackingStatus === "blocked"
                ? trackingReason ||
                  "Screen evidence is needed before time can save."
                : "Server-confirmed screen-share time. Click to pause."
              : "Click to set up whole-screen tracking."
        }
      >
        {paused ? (
          <Play className="size-3" />
        ) : sharing &&
          !error &&
          !evidenceError &&
          trackingStatus !== "blocked" ? (
          <Pause className="size-3" />
        ) : (
          <MonitorUp className="size-3" />
        )}
        <span>{pillLabel}</span>
        <span className="text-white/75">{fmt(displaySeconds)} total</span>
        {queuedCount > 0 ? <span>· {queuedCount} queued</span> : null}
      </button>

      {sharing && !paused ? (
        <button
          type="button"
          onClick={() => setScreensOpen((value) => !value)}
          className="flex items-center gap-1 rounded bg-[#2a2a2a] px-2 py-1 text-xs font-black text-white transition-colors hover:bg-[#3a3a3a]"
          title="Preview your shared screens, stop individual ones, or add another."
        >
          <MonitorUp className="size-3" />
          <span>
            {screenCount} screen{screenCount > 1 ? "s" : ""}
          </span>
        </button>
      ) : null}

      {screensOpen ? (
        <div className="fixed top-14 right-4 z-[70] w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#333] bg-[#181818] p-4 text-[#ddd] shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black">Shared screens</p>
            <button
              type="button"
              onClick={() => setScreensOpen(false)}
              className="rounded px-2 py-1 text-xs font-black text-[#888] hover:bg-[#2a2a2a] hover:text-white"
              aria-label="Close screens panel"
            >
              x
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {screensRef.current.map((entry, index) => {
              const label = entry.stream.getVideoTracks()[0]?.label ?? "";
              return (
                <div
                  key={entry.id}
                  className="overflow-hidden rounded-lg border border-[#333]"
                >
                  <video
                    ref={(el) => {
                      if (el && el.srcObject !== entry.stream) {
                        el.srcObject = entry.stream;
                      }
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="aspect-video w-full bg-black object-contain"
                  />
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate font-black text-[#aaa]">
                      Screen {index + 1}
                      {label ? ` · ${label}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeScreen(entry.id)}
                      className="shrink-0 font-black text-[#ff7a7a] hover:text-[#ffa3a3]"
                    >
                      Stop sharing
                    </button>
                  </div>
                </div>
              );
            })}
            {screenCount === 0 ? (
              <p className="text-xs font-semibold text-[#888]">
                No screens are being shared. Outside-site time only counts while
                at least one screen is shared.
              </p>
            ) : null}
          </div>
          {screenCount < MAX_SHARED_SCREENS ? (
            <button
              type="button"
              onClick={() => void addScreen()}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2a2a2a] px-3 py-2 text-xs font-black text-white hover:bg-[#3a3a3a]"
            >
              <MonitorUp className="size-3" />
              {screenCount > 0 ? "Share another screen" : "Share a screen"}
            </button>
          ) : null}
        </div>
      ) : null}

      {warningOpen &&
      (error || evidenceError || trackingStatus === "blocked" || !sharing) &&
      !paused ? (
        <div className="fixed top-14 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#333] bg-[#181818] p-4 text-[#ddd] shadow-lg motion-safe:animate-[slideInFromRight_220ms_ease-out]">
          <div className="flex items-start gap-3">
            <MonitorUp className="mt-0.5 size-5 shrink-0 text-[#BD0F32]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">Tracking needs attention</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-[#aaa]">
                {error ||
                  evidenceError ||
                  trackingReason ||
                  "Screen sharing is off. Outside-site work cannot be verified until you share your whole screen again."}
              </p>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="mt-3 rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-xs font-black text-white hover:bg-[#3a3a3a]"
              >
                Open tracking setup
              </button>
            </div>
            <button
              type="button"
              onClick={() => setWarningOpen(false)}
              className="rounded px-2 py-1 text-xs font-black text-[#888] hover:bg-[#2a2a2a] hover:text-white"
              aria-label="Dismiss tracking warning"
            >
              x
            </button>
          </div>
        </div>
      ) : null}

      {showSetupModal ? (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-white p-6 text-black">
          <div className="w-full max-w-xl rounded-xl border border-black bg-white p-6 shadow-[5px_5px_0_#000]">
            <p className="text-xs font-black tracking-[0.16em] text-black/45 uppercase">
              Time tracking
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight">
              Share your screen so all your time counts.
            </h2>
            <div className="mt-4 space-y-3 text-sm font-medium leading-6 text-black/70">
              <p>
                We track your time in the editor automatically. Sharing your
                screen counts the time you spend outside it too, on docs,
                GitHub, or another tab, and counted time earns you{" "}
                <strong>5 bread per hour</strong> of approved work to spend in
                the shop.
              </p>
              <p>
                Share your whole screen, not just this tab. Anything outside
                Breadboard stays private and is only ever seen by a reviewer
                confirming your hours.
              </p>
              <p>
                Taking a break? Tap the tracking pill to pause, so your hours
                stay accurate.
              </p>
              {multiDisplay && screenCount < MAX_SHARED_SCREENS ? (
                <p>
                  Looks like you have more than one display. Share each of them
                  (up to {MAX_SHARED_SCREENS}) so work on every monitor counts.
                </p>
              ) : null}
            </div>
            {likelyInactive ? (
              <p className="mt-4 rounded-lg border border-purple-300 bg-purple-50 p-3 text-sm font-black text-purple-950">
                No screen changes for {fmt(Math.floor(inactiveMs / 1000))}. New
                outside-site time pauses until a changed screen frame is saved.
              </p>
            ) : null}
            {error || evidenceError || trackingStatus === "blocked" ? (
              <p className="mt-4 rounded-lg border border-[#BD0F32] bg-red-50 p-3 text-sm font-bold text-[#BD0F32]">
                {error || evidenceError || trackingReason}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {screenCount < MAX_SHARED_SCREENS ? (
                <button
                  type="button"
                  onClick={() => void addScreen()}
                  className="rounded-lg bg-black px-4 py-3 text-sm font-black text-white hover:bg-[#BD0F32]"
                >
                  {sharing ? "Share another screen" : "Share whole screen"}
                </button>
              ) : null}
              {!sharing ? (
                <button
                  type="button"
                  disabled={dismissCountdown > 0}
                  onClick={() => {
                    setSetupDismissed(true);
                    setSetupOpen(false);
                  }}
                  className="rounded-lg border border-black px-4 py-3 text-sm font-black text-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {dismissCountdown > 0
                    ? `I can't screen share (${dismissCountdown}s)`
                    : "I can't screen share"}
                </button>
              ) : null}
              {sharing ? (
                <button
                  type="button"
                  onClick={() => setSetupOpen(false)}
                  className="rounded-lg border border-black px-4 py-3 text-sm font-black text-black hover:bg-black hover:text-white"
                >
                  Continue
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
