"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  BREAD_PER_HOUR,
  estimateBreadFromSeconds,
  SECONDS_PER_BREAD,
} from "@/lib/constants";
import { setActivityStatusListener } from "@/lib/editor/activityTracker";

export function fmtDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m`;
}

// Live total tracked seconds for the project: the server-provided baseline
// plus growth observed through heartbeats since mount. Heartbeats report the
// CURRENT session's seconds (which reset when the server rolls sessions), so
// only the positive deltas are folded in; adding the raw value would
// double-count time already inside the baseline.
export function useLiveTrackedSeconds(initialTotalSeconds: number): number {
  const [extraSeconds, setExtraSeconds] = useState(0);
  const lastSessionSeconds = useRef<number | null>(null);

  useEffect(
    () =>
      setActivityStatusListener((status) => {
        const previous = lastSessionSeconds.current;
        if (previous !== null && status.activeSeconds > previous) {
          setExtraSeconds((total) => total + (status.activeSeconds - previous));
        }
        lastSessionSeconds.current = status.activeSeconds;
      }),
    [],
  );

  return initialTotalSeconds + extraSeconds;
}

// Shows the bread this project is on track to earn, live. The server passes
// the total tracked so far; heartbeats only report the current session's
// seconds, so we fold in the growth since mount instead of the raw value
// (which would double-count time already included in the server total).
//
// Rendered as one tall badge that starts in the header row and hangs down
// over the toolbar row beneath it (the toolbar packs its buttons to the
// left, so its right end is safe to cover). The parent gives it self-start
// and a z-index so it paints above the toolbar. Hovering it opens a card
// that walks through the calculation with the user's own numbers.
export function BreadEstimatePill({
  initialTotalSeconds,
}: {
  initialTotalSeconds: number;
}) {
  const [hovered, setHovered] = useState(false);
  const totalSeconds = useLiveTrackedSeconds(initialTotalSeconds);
  const estimate = estimateBreadFromSeconds(totalSeconds);
  const minutesPerBread = Math.round(SECONDS_PER_BREAD / 60);
  const secondsToNext =
    SECONDS_PER_BREAD - (Math.max(0, totalSeconds) % SECONDS_PER_BREAD);

  return (
    <span
      role="note"
      className="relative flex h-[70px] cursor-help select-none flex-col items-center justify-center gap-0.5 rounded-b-lg border border-t-0 border-[#3d3d3d] bg-[#2a2a2a] px-4 shadow-[0_3px_10px_rgba(0,0,0,0.4)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="flex items-center gap-2 text-xl font-black text-white">
        <Image
          src="/assets/bred.png"
          alt=""
          width={26}
          height={26}
          className="inline-block"
          unoptimized
        />
        ~{estimate}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#999]">
        bread est.
      </span>

      {hovered ? (
        <div className="absolute top-full right-0 z-[70] mt-2 w-[290px] rounded-xl border border-[#333] bg-[#181818] p-4 text-left shadow-lg">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#777]">
            How this is calculated
          </p>
          <div className="mt-2 space-y-1.5 text-xs font-semibold text-[#ccc]">
            <p className="flex justify-between gap-3">
              <span className="text-[#888]">Tracked time</span>
              <span>{fmtDuration(totalSeconds)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-[#888]">Rate</span>
              <span>
                {BREAD_PER_HOUR} bread / hour (1 per {minutesPerBread}m)
              </span>
            </p>
            <p className="flex justify-between gap-3 border-t border-[#2e2e2e] pt-1.5">
              <span className="text-[#888]">
                {fmtDuration(totalSeconds)} ÷ {minutesPerBread}m
              </span>
              <span className="font-black text-white">~{estimate} bread</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-[#888]">Next bread in</span>
              <span>{fmtDuration(secondsToNext)} of tracked time</span>
            </p>
          </div>
          <p className="mt-3 text-[11px] font-medium leading-relaxed text-[#888]">
            This is an estimate. Real bread is awarded from your approved hours
            when the project passes review.
          </p>
        </div>
      ) : null}
    </span>
  );
}
