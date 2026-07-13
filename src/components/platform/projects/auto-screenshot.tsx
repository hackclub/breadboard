"use client";

import { domToBlob } from "modern-screenshot";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiSparkles } from "react-icons/hi2";
import {
  createProjectScreenshotUpload,
  getCircuitSnapshotForScreenshot,
} from "@/actions/uploads";
import {
  ProjectCircuitPreview,
  type CircuitSnapshot,
} from "@/components/gallery/ProjectCircuitPreview";
import { cn } from "@/lib/utils";

/**
 * Whether a stored screenshot URL is a circuit-generated one (stable
 * "/auto.png" key). Auto screenshots are refreshed from the latest circuit
 * whenever they're shown in a submit/edit flow, so they track the project the
 * way the gallery's live preview does; manually uploaded screenshots are
 * never touched.
 */
export function isAutoScreenshotUrl(url: string) {
  return url.endsWith("/auto.png");
}

// "no-circuit" = nothing to draw (external tool, empty editor): stay quiet,
// the maker was always going to upload by hand. "failed" = we had a circuit
// and tried but capture/upload broke: say so, or the maker is left staring at
// an unchecked screenshot requirement with no explanation.
type Phase =
  | "idle"
  | "loading"
  | "capturing"
  | "uploading"
  | "done"
  | "no-circuit"
  | "failed";

// Matches the 4:3 project card/gallery tile the screenshot ends up in.
const CAPTURE_WIDTH = 1200;
const CAPTURE_HEIGHT = 900;

/**
 * Shared engine for generating a project screenshot from the saved circuit:
 * renders it offscreen with the same preview canvas the gallery uses,
 * rasterizes to a PNG, and pushes it through the normal screenshot upload
 * path. `begin()` kicks off a run; mount `offscreen` somewhere in the tree
 * while a run is active.
 */
function useCircuitScreenshot(
  projectId: number,
  onCaptured: (publicUrl: string) => void,
) {
  const [circuit, setCircuit] = useState<CircuitSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  // Which timeline step broke when phase is "failed": 1 = rendering/capture,
  // 2 = upload. Lets the timeline point at the exact step instead of a
  // generic error.
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const capturedRef = useRef(false);

  const begin = useCallback(async () => {
    setPhase("loading");
    setFailedStep(null);
    capturedRef.current = false;
    try {
      const snapshot = await getCircuitSnapshotForScreenshot(projectId);
      if (snapshot) {
        setCircuit(snapshot);
        setPhase("capturing");
      } else {
        setPhase("no-circuit");
      }
    } catch {
      setPhase("no-circuit");
    }
  }, [projectId]);

  const capture = async () => {
    const container = containerRef.current;
    if (!container || capturedRef.current) return;
    capturedRef.current = true;
    let step = 1;
    try {
      const blob = await domToBlob(container, { type: "image/png" });
      if (!blob) throw new Error("Empty capture");
      setPhase("uploading");
      step = 2;
      const { uploadUrl, publicUrl } = await createProjectScreenshotUpload(
        projectId,
        "image/png",
        { auto: true },
      );
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
      if (!response.ok) throw new Error("Upload failed");
      setPhase("done");
      setCircuit(null);
      onCaptured(publicUrl);
    } catch {
      setFailedStep(step);
      setPhase("failed");
      setCircuit(null);
    }
  };

  const offscreen = circuit ? (
    <div
      ref={containerRef}
      aria-hidden
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width: CAPTURE_WIDTH,
        height: CAPTURE_HEIGHT,
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      <ProjectCircuitPreview circuit={circuit} onReady={capture} />
    </div>
  ) : null;

  return { phase, failedStep, begin, offscreen };
}

const TIMELINE_STEPS = [
  "Reading the saved circuit",
  "Drawing the schematic",
  "Uploading the image",
  "Save changes to publish it to your GitHub README",
];

/**
 * Compact step-by-step progress readout under the "Upload from Circuit"
 * button, so the maker can see what the generator is doing and what comes
 * next. The last step isn't automated from here: the image only syncs to
 * GitHub after the form is saved.
 */
function ScreenshotTimeline({
  phase,
  failedStep,
}: {
  phase: Phase;
  failedStep: number | null;
}) {
  if (
    phase === "idle" ||
    phase === "no-circuit" ||
    (phase === "failed" && failedStep === null)
  ) {
    return null;
  }
  const activeIndex =
    phase === "loading"
      ? 0
      : phase === "capturing"
        ? 1
        : phase === "uploading"
          ? 2
          : -1;
  const doneBefore =
    phase === "done" ? 3 : phase === "failed" ? (failedStep ?? 0) : activeIndex;

  return (
    <ol
      aria-live="polite"
      className="col-span-full grid gap-1.5 rounded-xl border border-black bg-white p-3"
    >
      {TIMELINE_STEPS.map((label, index) => {
        const isFailed = phase === "failed" && index === failedStep;
        const isDone = index < doneBefore;
        const isActive = index === activeIndex;
        const isNextAction = phase === "done" && index === 3;
        return (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 text-xs font-bold",
              isFailed
                ? "text-[#BD0F32]"
                : isDone || isActive || isNextAction
                  ? "text-black"
                  : "text-black/40",
            )}
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                isFailed
                  ? "bg-[#BD0F32]"
                  : isDone
                    ? "bg-black"
                    : isActive
                      ? "animate-pulse bg-[#BD0F32]"
                      : "border border-black/30",
              )}
            />
            <span>
              {label}
              {isFailed ? " — failed, upload one manually instead" : ""}
              {isActive ? "…" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Generates a project screenshot automatically when the maker never uploaded
 * one. Renders a one-line status; nothing at all if the project has no
 * circuit to draw.
 */
export function AutoScreenshotCapture({
  projectId,
  onCaptured,
}: {
  projectId: number;
  onCaptured: (publicUrl: string) => void;
}) {
  const { phase, begin, offscreen } = useCircuitScreenshot(
    projectId,
    onCaptured,
  );
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void begin();
  }, [begin]);

  // Quiet for projects with nothing to draw (external tools, empty editor):
  // the maker was always uploading by hand, no point alarming them about an
  // automation they never saw. Quiet while loading too, so the promise
  // doesn't flash for those projects.
  if (phase === "idle" || phase === "no-circuit" || phase === "loading") {
    return null;
  }

  return (
    <>
      {phase === "done" ? (
        <p className="text-xs font-bold text-black/60" aria-live="polite">
          We generated a screenshot from your circuit. You can replace it with
          your own anytime.
        </p>
      ) : phase === "failed" ? (
        <p className="text-xs font-bold text-[#BD0F32]" aria-live="polite">
          We couldn't generate a screenshot from your circuit. Upload one
          manually to continue.
        </p>
      ) : (
        <p className="text-xs font-bold text-black/60" aria-live="polite">
          Generating a screenshot from your circuit…
        </p>
      )}
      {offscreen}
    </>
  );
}

/**
 * On-demand variant for the screenshot upload field: a button that renders
 * the saved circuit and uploads the capture, instead of the maker taking and
 * uploading a screenshot by hand.
 */
export function GenerateScreenshotButton({
  projectId,
  onCaptured,
}: {
  projectId: number;
  onCaptured: (publicUrl: string) => void;
}) {
  const { phase, failedStep, begin, offscreen } = useCircuitScreenshot(
    projectId,
    onCaptured,
  );
  const busy =
    phase === "loading" || phase === "capturing" || phase === "uploading";

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void begin()}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-black bg-white px-4 py-3 text-sm font-black text-black shadow-[2px_2px_0_#000] transition hover:bg-black hover:text-white disabled:cursor-default disabled:opacity-60 disabled:hover:bg-white disabled:hover:text-black"
      >
        <HiSparkles className="size-5" />
        {phase === "uploading"
          ? "Uploading..."
          : busy
            ? "Generating..."
            : "Upload from Circuit"}
      </button>
      <ScreenshotTimeline phase={phase} failedStep={failedStep} />
      {phase === "no-circuit" ? (
        <p className="text-xs font-bold text-black/60" aria-live="polite">
          There's no saved circuit to draw yet. Add parts in the editor first,
          or upload a screenshot manually.
        </p>
      ) : null}
      {offscreen}
    </>
  );
}
