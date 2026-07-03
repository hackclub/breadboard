"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { BREAD_PER_HOUR, estimateBreadFromSeconds } from "@/lib/constants";
import { setActivityStatusListener } from "@/lib/editor/activityTracker";

// Shows the bread this project is on track to earn, live. The server passes
// the total tracked so far; heartbeats only report the current session's
// seconds, so we fold in the growth since mount instead of the raw value
// (which would double-count time already included in the server total).
export function BreadEstimatePill({
  initialTotalSeconds,
}: {
  initialTotalSeconds: number;
}) {
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

  const estimate = estimateBreadFromSeconds(initialTotalSeconds + extraSeconds);

  return (
    <span
      className="flex items-center gap-1.5 rounded bg-[#2a2a2a] px-2 py-1 text-xs font-black text-[#ddd]"
      title={`Estimate based on your tracked time (${BREAD_PER_HOUR} bread per hour, so 12 minutes = 1 bread). You officially earn bread when your work is approved in review.`}
    >
      <Image
        src="/assets/bred.png"
        alt=""
        width={16}
        height={16}
        className="inline-block"
        unoptimized
      />
      ~{estimate}
      <span className="font-semibold text-[#888]">est.</span>
    </span>
  );
}
