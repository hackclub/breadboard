// @ts-nocheck
/**
 * useMicrophoneLevel — drive a microphone-module part from the user's real mic.
 *
 * The microphone-module already accepts a `soundLevel` (0–1023) through the
 * SensorUpdateRegistry: the panel slider dispatches it, the part's
 * attachEvents() mirrors it into the element + SPICE netlist (analog AO) and
 * the DO comparator (soundLevel > 512). This hook is a second source for that
 * same value — it captures live audio and dispatches a smoothed envelope in
 * place of the slider, so no simulation-layer changes are needed.
 *
 * Lifecycle mirrors useWebcamFrames:
 *   - start(componentId): asks for mic permission, starts the analysis loop.
 *   - stop(componentId):  tears down the stream/context, rests the pin at 512.
 *   - status:             'idle' | 'requesting' | 'listening' | 'denied' | 'error'.
 *
 * Notes:
 *   - The AudioContext is created and resumed inside start(), which callers
 *     invoke from a click handler — that user gesture is what lets resume()
 *     succeed (browsers block audio until then).
 *   - Speech/ambient RMS rarely exceeds ~0.3, so we scale by GAIN before
 *     clamping to 0–1023. GAIN is tuned so a normal speaking voice crosses
 *     the DO threshold (soundLevel > 512).
 *   - Each dispatch mirrors soundLevel into the Zustand store, which
 *     invalidates the SPICE netlist memo and forces a re-solve (see the
 *     PROPERTY_CHANGE_EVENT listener in SimulatorCanvas). That's the same
 *     path a slider drag takes, but a drag lasts a second or two while live
 *     audio runs indefinitely — so we sample at a bounded ~20 Hz (comparable
 *     to an active drag) and skip the dispatch entirely when the quantized
 *     level hasn't changed. Silence and steady tones then cost nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { dispatchSensorUpdate } from "@/lib/velxio/simulation/SensorUpdateRegistry";

export type MicStatus =
  | "idle"
  | "requesting"
  | "listening"
  | "denied"
  | "error";

export interface UseMicrophoneLevelResult {
  status: MicStatus;
  errorMessage: string | null;
  /** Latest dispatched soundLevel (0–1023), throttled for display. */
  level: number;
  start: (componentId: string) => Promise<void>;
  stop: (componentId?: string) => void;
}

// Perceptual RMS of typical speech sits well below 1.0; scale up so a normal
// voice reaches the upper half of the range and trips the DO comparator.
const GAIN = 3.0;
// Exponential smoothing on the envelope — higher = smoother/laggier. Keeps the
// analog value from jittering on every frame while staying responsive.
const SMOOTHING = 0.6;
// Resting value dispatched on stop so the pin returns to mid-scale (matches the
// slider's default) instead of freezing at the last spoken level.
const REST_LEVEL = 512;
// Sampling period (ms). ~20 Hz — a sound-level envelope doesn't need audio-rate
// updates, and this bounds how often we invalidate/re-solve the SPICE netlist.
const SAMPLE_INTERVAL_MS = 50;

export function useMicrophoneLevel(): UseMicrophoneLevelResult {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(REST_LEVEL);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const envRef = useRef(0);

  const stop = useCallback((componentId?: string) => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }
    if (ctxRef.current) {
      // close() returns a promise; we don't need to await teardown.
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    envRef.current = 0;
    if (componentId)
      dispatchSensorUpdate(componentId, { soundLevel: REST_LEVEL });
    setLevel(REST_LEVEL);
    setStatus("idle");
  }, []);

  const start = useCallback(
    async (componentId: string) => {
      setStatus("requesting");
      setErrorMessage(null);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e.name === "NotAllowedError" || e.name === "SecurityError") {
          setStatus("denied");
          setErrorMessage("Microphone permission denied");
        } else if (e.name === "NotFoundError") {
          setStatus("error");
          setErrorMessage("No microphone detected");
        } else {
          setStatus("error");
          setErrorMessage(e.message ?? "getUserMedia failed");
        }
        return;
      }
      streamRef.current = stream;

      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) {
        setStatus("error");
        setErrorMessage("Web Audio API unavailable");
        stop();
        return;
      }
      const ctx = new Ctx();
      ctxRef.current = ctx;
      // The caller invokes start() from a click, so this resume() is inside a
      // user gesture and will not be blocked.
      await ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      setStatus("listening");
      let lastDispatched = -1;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length); // 0 .. ~0.3 typical
        envRef.current = SMOOTHING * envRef.current + (1 - SMOOTHING) * rms;
        const soundLevel = Math.max(
          0,
          Math.min(1023, Math.round(envRef.current * GAIN * 1023)),
        );
        // Skip the store write / SPICE re-solve when nothing changed.
        if (soundLevel === lastDispatched) return;
        lastDispatched = soundLevel;
        dispatchSensorUpdate(componentId, { soundLevel });
        setLevel(soundLevel);
      };
      timerRef.current = window.setInterval(tick, SAMPLE_INTERVAL_MS);
    },
    [stop],
  );

  // Tear down on unmount. The panel is keyed by componentId, so switching to a
  // different sensor or closing the panel remounts it and fires this cleanup.
  useEffect(() => () => stop(), [stop]);

  return { status, errorMessage, level, start, stop };
}
