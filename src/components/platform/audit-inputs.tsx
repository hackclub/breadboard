"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import {
  TIME_AUDIT_DEFLATED_REASONS,
  TIME_AUDIT_REMOVED_REASONS,
  type TimeAuditKind,
} from "@/lib/time-audit";

// Shared between the editor timelapse audit and the Lapse recording audit.
// fallout's DeflationInputs: minutes is the source of truth, percentage is
// derived, and both describe what REMAINS after deflation. Typing in one
// field updates the other live; the field being typed in is never rewritten.
// Remount (via key) when the range changes.
export function AuditDeflationInputs({
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
export function AuditReasonInput({
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
