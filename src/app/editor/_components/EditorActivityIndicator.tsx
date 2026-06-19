"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { setActivityStatusListener } from "@/lib/editor/activityTracker";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function EditorActivityIndicator() {
  const [status, setStatus] = useState<"active" | "idle">("idle");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setActivityStatusListener((s) => {
      setStatus(s.status);
      setSeconds(s.activeSeconds);
    });
  }, []);

  if (status === "idle" || seconds < 10) return null;

  return (
    <span className="flex items-center gap-1 text-xs text-green-400/70">
      <span className="inline-block size-1.5 rounded-full bg-green-400 animate-pulse" />
      <Clock className="size-3" />
      {fmt(seconds)}
    </span>
  );
}
