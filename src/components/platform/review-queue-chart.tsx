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

// Throughput chart: inflow vs reviews completed, same daily-count scale so the
// two lines sit on one axis. Reviews done is the brand crimson headline; new
// submissions is a calmer blue underneath. Blue vs red is a CVD-safe pair.
const REVIEWED_COLOR = "#BD0F32";
const SUBMITTED_COLOR = "#2a78d6";
// Backlog chart, its own scale: a single slate area for "still waiting".
const BACKLOG_COLOR = "#52514e";
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

function LegendRow({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-black/60"
        >
          <span
            className="inline-block size-3 rounded-[3px] border border-black/20"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function TooltipRow({
  label,
  color,
  value,
}: {
  label: string;
  color: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 font-semibold text-black/60">
        <span
          className="inline-block size-2.5 rounded-[2px] border border-black/20"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="font-black tabular-nums text-black">{value}</span>
    </div>
  );
}

function ThroughputTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ReviewQueuePoint | undefined;
  if (!point) return null;
  const net = point.submitted - point.reviewed;

  return (
    <div className="rounded-[10px] border border-black bg-white px-3 py-2 text-xs shadow-[3px_3px_0_#000]">
      <p className="font-black text-black">{shortDay(String(label))}</p>
      <div className="mt-1.5 space-y-0.5">
        <TooltipRow
          label="Submitted"
          color={SUBMITTED_COLOR}
          value={point.submitted}
        />
        <TooltipRow
          label="Reviewed"
          color={REVIEWED_COLOR}
          value={point.reviewed}
        />
      </div>
      <p className="mt-1.5 border-t border-black/10 pt-1.5 font-black text-black/70">
        {net === 0
          ? "Kept pace"
          : net > 0
            ? `Queue grew by ${net}`
            : `Queue shrank by ${-net}`}
      </p>
    </div>
  );
}

function BacklogTooltip({
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
        {point.backlog} awaiting review
      </p>
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

const AXIS_MARGIN = { top: 8, right: 8, bottom: 0, left: -16 } as const;

export function ReviewQueueChart({ stats }: { stats: ReviewQueueStats }) {
  return (
    <>
      <DataPanel
        title="Review throughput"
        description="Submissions received vs. reviews completed per day (US Eastern), last 30 days. When crimson dips below blue, the queue is growing."
      >
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Awaiting review" value={stats.pendingTotal} />
            <StatTile label="Design pending" value={stats.pendingDesign} />
            <StatTile label="Demo pending" value={stats.pendingDemo} />
          </div>

          <LegendRow
            items={[
              { label: "Submitted", color: SUBMITTED_COLOR },
              { label: "Reviewed", color: REVIEWED_COLOR },
            ]}
          />

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.series} margin={AXIS_MARGIN}>
                <defs>
                  <linearGradient
                    id="submittedFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={SUBMITTED_COLOR}
                      stopOpacity={0.32}
                    />
                    <stop
                      offset="100%"
                      stopColor={SUBMITTED_COLOR}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                  <linearGradient id="reviewedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={REVIEWED_COLOR}
                      stopOpacity={0.32}
                    />
                    <stop
                      offset="100%"
                      stopColor={REVIEWED_COLOR}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
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
                  cursor={{
                    stroke: INK,
                    strokeWidth: 1,
                    strokeDasharray: "3 3",
                  }}
                  content={<ThroughputTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="submitted"
                  name="Submitted"
                  stroke={SUBMITTED_COLOR}
                  strokeWidth={2}
                  fill="url(#submittedFill)"
                  fillOpacity={1}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="reviewed"
                  name="Reviewed"
                  stroke={REVIEWED_COLOR}
                  strokeWidth={2}
                  fill="url(#reviewedFill)"
                  fillOpacity={1}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </DataPanel>

      <DataPanel
        title="Review backlog"
        description="Submissions still awaiting a reviewer at the end of each day (US Eastern), last 30 days. A rising line means work is piling up faster than it clears."
      >
        <div className="space-y-5 p-5">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.series} margin={AXIS_MARGIN}>
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
                  cursor={{
                    stroke: INK,
                    strokeWidth: 1,
                    strokeDasharray: "3 3",
                  }}
                  content={<BacklogTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="backlog"
                  name="Awaiting review"
                  stroke={BACKLOG_COLOR}
                  strokeWidth={2}
                  fill={BACKLOG_COLOR}
                  fillOpacity={0.18}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </DataPanel>
    </>
  );
}
