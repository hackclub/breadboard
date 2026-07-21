"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { DataPanel } from "@/components/ui/table";
import type {
  ReviewQueuePoint,
  ReviewQueueStats,
} from "@/lib/admin/review-queue-stats";

// Two categorical buckets: still-waiting work in brand crimson (the headline),
// already-actioned work in a muted slate underneath.
const PENDING_COLOR = "#BD0F32";
const RESOLVED_COLOR = "#9a9892";
const AXIS = "#898781";
const GRID = "#e1e0d9";
const INK = "#52514e";

function shortDay(day: string) {
  // "2026-07-03" -> "Jul 3", parsed as UTC so it never drifts a day.
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ChartTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ReviewQueuePoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-[10px] border border-black bg-white px-3 py-2 text-xs shadow-[3px_3px_0_#000]">
      <p className="font-black text-black">{shortDay(String(label))}</p>
      <p className="mt-1 font-black text-black/70">
        {point.total} {point.total === 1 ? "submission" : "submissions"}
      </p>
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-black/60">
            <span
              className="inline-block size-2.5 rounded-[2px] border border-black/20"
              style={{ backgroundColor: PENDING_COLOR }}
            />
            Awaiting review
          </span>
          <span className="font-black tabular-nums text-black">
            {point.pending}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-black/60">
            <span
              className="inline-block size-2.5 rounded-[2px] border border-black/20"
              style={{ backgroundColor: RESOLVED_COLOR }}
            />
            Reviewed
          </span>
          <span className="font-black tabular-nums text-black">
            {point.resolved}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-4">
      <p className="text-3xl font-black leading-none tabular-nums text-black">
        {value}
      </p>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-black/45">
        {label}
      </p>
    </div>
  );
}

export function ReviewQueueChart({ stats }: { stats: ReviewQueueStats }) {
  return (
    <DataPanel
      title="Review queue"
      description="Submissions received per day (US Eastern), last 30 days. Crimson is still awaiting a reviewer."
    >
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Awaiting review" value={stats.pendingTotal} />
          <StatTile label="Design pending" value={stats.pendingDesign} />
          <StatTile label="Demo pending" value={stats.pendingDemo} />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {[
            { label: "Awaiting review", color: PENDING_COLOR },
            { label: "Reviewed", color: RESOLVED_COLOR },
          ].map((series) => (
            <span
              key={series.label}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-black/60"
            >
              <span
                className="inline-block size-3 rounded-[3px] border border-black/20"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </span>
          ))}
        </div>

        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={stats.series}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid
                stroke={GRID}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tickFormatter={shortDay}
                tick={{ fill: AXIS, fontSize: 11, fontWeight: 700 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                width={44}
                tick={{ fill: AXIS, fontSize: 11, fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: INK, strokeWidth: 1, strokeDasharray: "3 3" }}
                content={<ChartTooltip />}
              />
              <Area
                type="monotone"
                dataKey="resolved"
                name="Reviewed"
                stackId="queue"
                stroke="#ffffff"
                strokeWidth={1.5}
                fill={RESOLVED_COLOR}
                fillOpacity={1}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="pending"
                name="Awaiting review"
                stackId="queue"
                stroke="#ffffff"
                strokeWidth={1.5}
                fill={PENDING_COLOR}
                fillOpacity={1}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DataPanel>
  );
}
