// @ts-nocheck
/**
 * Touch-device detection.
 *
 * Why a hook (and a media query) instead of `navigator.maxTouchPoints > 0`?
 * On Windows 11 + Chromium/Firefox, laptops with touchscreen drivers report
 * `maxTouchPoints > 0` even when the user is on a mouse — that made
 * `PinOverlay` blow pin hit-targets up to 44 / zoom CSS pixels and cover the
 * whole board.
 *
 * Media queries alone aren't reliable either. Windows convertibles (and
 * tablet mode) can report the primary pointer as coarse AND `any-hover: none`
 * while the user works with a perfectly good mouse, which hid the hover pin
 * overlays and forced the tap-to-pick pin dialog on desktop users. So the
 * media query is only the starting guess; the first real mouse `pointermove`
 * is hard evidence that overrides it for the rest of the session. A phone or
 * tablet never produces one, a mouse-driven laptop produces one immediately.
 */

import { useEffect, useState } from "react";

const COARSE_QUERY = "(pointer: coarse) and (any-hover: none)";

// Flips true on the first pointermove whose pointerType is "mouse" and stays
// true for the session. Trust what the user's hand is actually doing over
// what the input drivers claim.
let mouseSeen = false;
const mouseSeenListeners = new Set<() => void>();

function noteMousePointer(event: PointerEvent) {
  if (event.pointerType !== "mouse") return;
  mouseSeen = true;
  window.removeEventListener("pointermove", noteMousePointer);
  for (const listener of mouseSeenListeners) listener();
  mouseSeenListeners.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointermove", noteMousePointer, { passive: true });
}

/** Snapshot read for non-React call sites (event handlers, refs, module scope). */
export function isCoarsePointer(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  if (mouseSeen) return false;
  return window.matchMedia(COARSE_QUERY).matches;
}

/** React hook — re-renders if the user docks/undocks a tablet, plugs a mouse, etc. */
export function useIsCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => isCoarsePointer());

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    if (mouseSeen) {
      setCoarse(false);
      return;
    }
    const onMouseSeen = () => setCoarse(false);
    mouseSeenListeners.add(onMouseSeen);

    const mq = window.matchMedia(COARSE_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      if (!mouseSeen) setCoarse(e.matches);
    };
    // Safari < 14 only has addListener / removeListener
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => {
        mouseSeenListeners.delete(onMouseSeen);
        mq.removeEventListener("change", handler);
      };
    }
    mq.addListener(handler);
    return () => {
      mouseSeenListeners.delete(onMouseSeen);
      mq.removeListener(handler);
    };
  }, []);

  return coarse;
}
