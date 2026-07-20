"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  HiArrowTopRightOnSquare,
  HiChevronDown,
  HiChevronRight,
  HiShieldCheck,
} from "react-icons/hi2";
import type { CodeAuthenticityReport } from "@/lib/editor/codeAuthenticity";

// Admin-only sidebar card for the review workspace. Fetches the paste/AI-dump
// heuristics for a project and shows, for each flag, WHY it fired. The analysis
// itself lives in @/lib/editor/codeAuthenticity (shared with the CLI script).

const VERDICT_STYLE: Record<
  CodeAuthenticityReport["verdict"],
  { label: string; badge: string; dot: string }
> = {
  clean: {
    label: "Looks typed",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-500",
    dot: "bg-emerald-500",
  },
  review: {
    label: "Worth a look",
    badge: "bg-amber-100 text-amber-900 border-amber-500",
    dot: "bg-amber-500",
  },
  suspicious: {
    label: "Likely pasted",
    badge: "bg-red-100 text-[#BD0F32] border-[#BD0F32]",
    dot: "bg-[#BD0F32]",
  },
};

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s ? ` ${s}s` : ""}`;
}

export function CodeAuthenticityCard({ projectId }: { projectId: number }) {
  const [report, setReport] = useState<CodeAuthenticityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openBursts, setOpenBursts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/editor/projects/${projectId}/code-authenticity`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            (await res.json().catch(() => null))?.error ??
              `Request failed (${res.status})`,
          );
        }
        return res.json() as Promise<CodeAuthenticityReport>;
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const style = report ? VERDICT_STYLE[report.verdict] : null;

  return (
    <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-black">
          <HiShieldCheck className="size-5 text-[#BD0F32]" />
          Code authenticity
        </div>
        {style ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${style.badge}`}
          >
            {style.label}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs font-semibold text-black/50">
        Was the code typed or pasted in? Reconstructed from saved edit history.
      </p>

      {loading ? (
        <p className="mt-3 text-sm font-semibold text-black/40">
          Analysing edit history…
        </p>
      ) : error ? (
        <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>
      ) : report ? (
        <div className="mt-3 space-y-3 text-sm text-black/70">
          {/* Top-level "why". */}
          <p className="font-semibold text-black">{report.summary}</p>

          {/* Quick stats. */}
          <div className="space-y-1.5 rounded-[10px] bg-black/[0.03] p-2.5 text-xs">
            <div className="flex justify-between gap-3">
              <span>Final code</span>
              <span className="font-black text-black">
                {report.finalCodeLines} lines
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Active editing</span>
              <span className="font-black text-black">
                {fmtDuration(report.activeSeconds)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Pace</span>
              <span
                className={`font-black ${
                  report.velocity.suspicious ? "text-[#BD0F32]" : "text-black"
                }`}
              >
                {report.linesPerActiveMinute === null
                  ? "n/a"
                  : `${report.linesPerActiveMinute.toFixed(0)} lines/min`}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>History points</span>
              <span className="font-black text-black">
                {report.timelinePoints}
                {report.trimmedPoints > 0
                  ? ` (${report.trimmedPoints} skipped)`
                  : ""}
              </span>
            </div>
          </div>

          {/* Velocity "why". */}
          <div className="text-xs">
            <p className="font-black text-black/45">Why this pace reading</p>
            <p className="mt-0.5 font-semibold text-black/70">
              {report.velocity.why}
            </p>
          </div>

          {/* Bursts, each with its own "why". */}
          {report.bursts.length > 0 ? (
            <div className="border-t border-black/10 pt-2">
              <button
                type="button"
                onClick={() => setOpenBursts((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-xs font-black text-black"
              >
                <span>
                  {report.bursts.length} pasted-looking block
                  {report.bursts.length === 1 ? "" : "s"} (
                  {report.pastedLineTotal} lines)
                </span>
                {openBursts ? (
                  <HiChevronDown className="size-4" />
                ) : (
                  <HiChevronRight className="size-4" />
                )}
              </button>
              {openBursts ? (
                <ul className="mt-2 space-y-2.5">
                  {report.bursts.map((b, i) => (
                    <li
                      key={`${b.file}-${b.at}-${i}`}
                      className="rounded-[10px] border border-black/10 p-2.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-black text-[#BD0F32]">
                          +{b.addedLines} lines
                        </span>
                        <span className="text-[11px] font-semibold text-black/40">
                          in {fmtDuration(b.wallSeconds)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-black/50">
                        {b.file}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-black/70">
                        {b.why}
                      </p>
                      {b.firstLine ? (
                        <pre className="mt-1.5 overflow-x-auto rounded bg-black/[0.04] p-1.5 text-[11px] text-black/70">
                          {b.firstLine}
                        </pre>
                      ) : null}
                      <Link
                        href={`/platform/admin/projects/${projectId}/timelapse?focus=${encodeURIComponent(
                          b.at,
                        )}`}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-[#BD0F32] hover:underline"
                      >
                        <HiArrowTopRightOnSquare className="size-3.5" />
                        Jump to this moment in the timelapse
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <p className="border-t border-black/10 pt-2 text-[11px] font-semibold text-black/35">
            Heuristic, not proof. A block can be a legit paste of the student's
            own earlier work or boilerplate. Cross-check the timelapse and
            screen evidence before deciding.
          </p>
        </div>
      ) : null}
    </section>
  );
}
