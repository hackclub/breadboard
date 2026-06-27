"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorUp, Pause, Play } from "lucide-react";
import {
  getCurrentActivitySessionId,
  recordExternalActivity,
  setActivityStatusListener,
  setActivityTrackingPaused,
} from "@/lib/editor/activityTracker";

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
const INACTIVE_AFTER_MS = 5 * 60_000;
const DIFF_THRESHOLD = 1_800;
const MAX_QUEUE = 60;
const MAX_UPLOAD_BATCH = 20;
const DIFF_WIDTH = 160;
const EVIDENCE_WIDTH = 960;
const JPEG_QUALITY = 0.72;
const ANCHOR_FRAME_MS = 5 * 60_000;

function shouldCaptureOutsideSite() {
  return document.hidden || !document.hasFocus();
}

function fmt(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function queueKey(projectId: number) {
  return `breadboard:screen-evidence:${projectId}`;
}

function compactFrame(frame: QueuedFrame): QueuedFrame {
  return { ...frame, imageData: "" };
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
  let next = frames.slice(-MAX_QUEUE);
  while (next.length > 0) {
    try {
      localStorage.setItem(queueKey(projectId), JSON.stringify(next));
      return;
    } catch {
      const imageIndex = next.findIndex((frame) => frame.imageData);
      if (imageIndex >= 0) {
        next = next.map((frame, index) =>
          index === imageIndex ? compactFrame(frame) : frame,
        );
      } else {
        next = next.slice(1);
      }
    }
  }
  localStorage.removeItem(queueKey(projectId));
}

async function uploadFrames(projectId: number, frames: QueuedFrame[]) {
  const res = await fetch(
    `/api/editor/projects/${projectId}/activity/screen-frame`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ frames }),
    },
  );
  if (!res.ok) throw new Error("Screen evidence upload failed");
}

async function flushQueue(projectId: number) {
  const queue = loadQueue(projectId);
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_UPLOAD_BATCH);
  await uploadFrames(projectId, batch);
  saveQueue(projectId, queue.slice(batch.length));
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export function ScreenShareTracker({ projectId }: { projectId: number }) {
  const [sharing, setSharing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [inactiveMs, setInactiveMs] = useState(0);
  const [outsideSite, setOutsideSite] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [dismissCountdown, setDismissCountdown] = useState(5);
  const [warningOpen, setWarningOpen] = useState(false);
  const [trackedSeconds, setTrackedSeconds] = useState(0);
  const [trackingStatus, setTrackingStatus] = useState<
    "active" | "idle" | "blocked" | "error"
  >("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previousRef = useRef<Uint8ClampedArray | null>(null);
  const lastChangeRef = useRef(Date.now());
  const lastUploadedImageRef = useRef(0);
  const wasSharingRef = useRef(false);
  const captureInFlightRef = useRef(false);
  const flushInFlightRef = useRef(false);
  const suppressEndedRef = useRef(false);

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

  const enqueue = useCallback(
    async (frame: QueuedFrame) => {
      const queue = loadQueue(projectId);
      queue.push(frame);
      saveQueue(projectId, queue);
      setQueuedCount(loadQueue(projectId).length);
      if (flushInFlightRef.current) return;
      flushInFlightRef.current = true;
      await flushQueue(projectId).catch(() => {});
      flushInFlightRef.current = false;
      setQueuedCount(loadQueue(projectId).length);
    },
    [projectId],
  );

  const captureFrame = useCallback(async () => {
    if (captureInFlightRef.current) return;
    if (!shouldCaptureOutsideSite()) {
      setOutsideSite(false);
      return;
    }
    setOutsideSite(true);
    captureInFlightRef.current = true;
    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const sessionId = getCurrentActivitySessionId();
      if (sessionId < 1) return;

      const width = DIFF_WIDTH;
      const height = Math.max(
        1,
        Math.round((video.videoHeight / video.videoWidth) * width) || 90,
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let diffScore = 0;
      const previous = previousRef.current;
      if (previous) {
        for (let i = 0; i < pixels.length; i += 16) {
          diffScore += Math.abs(pixels[i] - previous[i]);
          diffScore += Math.abs(pixels[i + 1] - previous[i + 1]);
          diffScore += Math.abs(pixels[i + 2] - previous[i + 2]);
        }
      }
      previousRef.current = new Uint8ClampedArray(pixels);

      const firstFrame = !previous;
      const pixelChanged = firstFrame || diffScore >= DIFF_THRESHOLD;
      if (pixelChanged && !paused) {
        lastChangeRef.current = Date.now();
        await recordExternalActivity();
      }

      const now = Date.now();
      setInactiveMs(now - lastChangeRef.current);
      const shouldUploadReadableImage =
        pixelChanged || now - lastUploadedImageRef.current >= ANCHOR_FRAME_MS;
      let imageData = "";
      if (shouldUploadReadableImage) {
        const imageWidth = EVIDENCE_WIDTH;
        const imageHeight = Math.max(
          1,
          Math.round((video.videoHeight / video.videoWidth) * imageWidth) ||
            540,
        );
        const imageCanvas = document.createElement("canvas");
        imageCanvas.width = imageWidth;
        imageCanvas.height = imageHeight;
        const imageCtx = imageCanvas.getContext("2d");
        if (imageCtx) {
          imageCtx.drawImage(video, 0, 0, imageWidth, imageHeight);
          imageData = imageCanvas.toDataURL("image/jpeg", JPEG_QUALITY);
          lastUploadedImageRef.current = now;
        }
      }

      await enqueue({
        sessionId,
        capturedAt: new Date().toISOString(),
        imageData,
        pixelChanged,
        diffScore,
        screenWidth: video.videoWidth || 0,
        screenHeight: video.videoHeight || 0,
        paused,
      });
    } finally {
      captureInFlightRef.current = false;
    }
  }, [enqueue, paused]);

  const startSharing = useCallback(async () => {
    setError("");
    try {
      suppressEndedRef.current = true;
      stopStream(streamRef.current);
      suppressEndedRef.current = false;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 1 },
        audio: false,
      });
      streamRef.current = stream;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      videoRef.current = video;
      previousRef.current = null;
      lastChangeRef.current = Date.now();
      setSharing(true);
      setSetupOpen(false);
      setSetupDismissed(false);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (suppressEndedRef.current) return;
        setSharing(false);
        setWarningOpen(true);
        setError(
          "Screen sharing stopped. Outside-site time cannot be verified until you share your whole screen again.",
        );
        playWarningSound();
        streamRef.current = null;
        videoRef.current = null;
      });
      await captureFrame();
    } catch {
      setError(
        "Screen sharing was not started. Share your whole screen so time outside Breadboard can count.",
      );
      setWarningOpen(true);
      playWarningSound();
    }
  }, [captureFrame, playWarningSound]);

  useEffect(() => {
    setActivityTrackingPaused(paused);
  }, [paused]);

  useEffect(() => {
    const unsubscribe = setActivityStatusListener((status) => {
      setTrackingStatus(status.status);
      setTrackedSeconds(status.activeSeconds);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const retry = () => {
      if (flushInFlightRef.current) return;
      flushInFlightRef.current = true;
      setQueuedCount(loadQueue(projectId).length);
      void flushQueue(projectId)
        .catch(() => {})
        .finally(() => {
          flushInFlightRef.current = false;
          setQueuedCount(loadQueue(projectId).length);
        });
    };
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
      navigator.sendBeacon?.(
        `/api/editor/projects/${projectId}/activity/screen-frame`,
        new Blob([body], { type: "application/json" }),
      );
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
  }, [projectId]);

  useEffect(() => {
    if (!sharing) return;
    const id = setInterval(() => void captureFrame(), CAPTURE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [captureFrame, sharing]);

  useEffect(() => {
    const updateOutsideSite = () => {
      const nextOutsideSite = shouldCaptureOutsideSite();
      setOutsideSite(nextOutsideSite);
      if (nextOutsideSite) void captureFrame();
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
  }, [captureFrame]);

  useEffect(
    () => () => {
      void flushQueue(projectId).catch(() => {});
      suppressEndedRef.current = true;
      stopStream(streamRef.current);
      setActivityTrackingPaused(false);
    },
    [projectId],
  );

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
    if (wasSharingRef.current && !sharing) {
      setWarningOpen(true);
      playWarningSound();
    }
    wasSharingRef.current = sharing;
  }, [playWarningSound, sharing]);

  useEffect(() => {
    if (!error) return;
    setWarningOpen(true);
  }, [error]);
  const pillTone = paused
    ? "bg-purple-700 text-white hover:bg-purple-600"
    : error || trackingStatus === "error"
      ? "bg-red-900 text-red-100 hover:bg-red-800"
      : trackingStatus === "blocked"
        ? "bg-yellow-900 text-yellow-100 hover:bg-yellow-800"
        : sharing
          ? outsideSite
            ? "bg-green-700 text-white hover:bg-green-600"
            : "bg-[#2a2a2a] text-green-200 hover:bg-[#3a3a3a]"
          : "bg-[#BD0F32] text-white hover:bg-[#d71943]";
  const pillLabel = paused
    ? "Paused"
    : error
      ? "Tracking issue"
      : trackingStatus === "blocked"
        ? "Journal needed"
        : sharing
          ? outsideSite
            ? "Tracking outside"
            : "Tracking ready"
          : "Set up tracking";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!sharing || error) {
            setSetupOpen(true);
            return;
          }
          setPaused((value) => !value);
        }}
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-black transition-colors ${pillTone}`}
        title="One tracking control. Click to pause/resume. If setup is needed, it opens the private whole-screen sharing prompt."
      >
        {paused ? (
          <Play className="size-3" />
        ) : (
          <MonitorUp className="size-3" />
        )}
        <span>{pillLabel}</span>
        <span className="text-white/75">{fmt(trackedSeconds)}</span>
        {queuedCount > 0 ? <span>· {queuedCount} queued</span> : null}
      </button>

      {warningOpen && (error || !sharing || queuedCount > 0) && !paused ? (
        <div className="fixed top-14 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#333] bg-[#181818] p-4 text-[#ddd] shadow-lg motion-safe:animate-[slideInFromRight_220ms_ease-out]">
          <div className="flex items-start gap-3">
            <MonitorUp className="mt-0.5 size-5 shrink-0 text-[#BD0F32]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">Tracking needs attention</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-[#aaa]">
                {error ||
                  (sharing
                    ? `${queuedCount} private evidence frame${queuedCount === 1 ? "" : "s"} queued. Breadboard will retry automatically.`
                    : "Screen sharing is off. Outside-site work cannot be verified until you share your whole screen again.")}
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
              Please share your whole screen.
            </h2>
            <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-black/70">
              <p>
                Breadboard tracks time in the editor normally. When you leave
                the site to read docs, use GitHub, or work in another tab,
                whole-screen sharing lets us verify that work time.
              </p>
              <p>
                Share your entire screen, not just this tab. Outside-site frames
                are private, never public, and only shown to reviewers for hour
                verification.
              </p>
              <p>
                Use the tracking pill to pause when you are not working. If you
                do not pause while idle, reviewers may deduct more time
                manually.
              </p>
            </div>
            {likelyInactive ? (
              <p className="mt-4 rounded-lg border border-purple-300 bg-purple-50 p-3 text-sm font-black text-purple-950">
                No screen changes for about {Math.round(inactiveMs / 60_000)}m.
                This may be marked inactive in review.
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-lg border border-[#BD0F32] bg-red-50 p-3 text-sm font-bold text-[#BD0F32]">
                {error}
              </p>
            ) : null}
            {queuedCount > 0 ? (
              <p className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm font-bold text-yellow-950">
                {queuedCount} private evidence frame
                {queuedCount === 1 ? "" : "s"} queued. Breadboard will keep
                retrying automatically.
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={startSharing}
                className="rounded-lg bg-black px-4 py-3 text-sm font-black text-white hover:bg-[#BD0F32]"
              >
                {sharing ? "Restart screen sharing" : "Share whole screen"}
              </button>
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
