"use client";

import { useState } from "react";
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
import {
  type DauDefinition,
  DAU_DEFINITIONS,
  type DauMetrics,
  type DauPoint,
} from "@/lib/admin/dau-types";
import { DataPanel } from "@/components/ui/table";

type View = "total" | "tenure";

// Tenure cohorts, ordered oldest -> newest. Rendered bottom (most tenured,
// darkest) to top (newest, lightest), so the stack reads as a sediment of
// long-time users with fresh arrivals riding on top. A single-hue blue ramp
// (validated ordinal, light->dark) because tenure is ordered, not categorical.
const TENURE_SERIES = [
  { key: "week3plus", label: "3+ weeks", color: "#104281" },
  { key: "week2to3", label: "2–3 weeks", color: "#1c5cab" },
  { key: "week1to2", label: "1–2 weeks", color: "#2a78d6" },
  { key: "days2to7", label: "2–7 days", color: "#5598e7" },
  { key: "first2d", label: "First 2 days", color: "#86b6ef" },
] as const;

const REACH_WINDOWS = [
  { key: "last24h", label: "Last 24h" },
  { key: "last3d", label: "Last 3 days" },
  { key: "last7d", label: "Last 7 days" },
  { key: "last30d", label: "Last 30 days" },
] as const;

const TOTAL_COLOR = "#BD0F32"; // brand crimson, the headline series
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
  view,
}: Partial<TooltipContentProps<number, string>> & { view: View }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as DauPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-[10px] border border-black bg-white px-3 py-2 text-xs shadow-[3px_3px_0_#000]">
      <p className="font-black text-black">{shortDay(String(label))}</p>
      <p className="mt-1 font-black text-black/70">
        {point.total} active {point.total === 1 ? "user" : "users"}
      </p>
      {view === "tenure" ? (
        <div className="mt-1.5 space-y-0.5">
          {TENURE_SERIES.map((series) => {
            const value = point[series.key];
            if (!value) return null;
            return (
              <div
                key={series.key}
                className="flex items-center justify-between gap-3"
              >
                <span className="inline-flex items-center gap-1.5 font-semibold text-black/60">
                  <span
                    className="inline-block size-2.5 rounded-[2px] border border-black/20"
                    style={{ backgroundColor: series.color }}
                  />
                  {series.label}
                </span>
                <span className="font-black tabular-nums text-black">
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ReachTile({ label, value }: { label: string; value: number }) {
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

export function AdminDauChart({
  metrics,
}: {
  metrics: Record<DauDefinition, DauMetrics>;
}) {
  const [definition, setDefinition] = useState<DauDefinition>("editor");
  const [view, setView] = useState<View>("total");

  const active = metrics[definition];
  const definitionLabel =
    DAU_DEFINITIONS.find((d) => d.key === definition)?.label ?? "";

  return (
    <DataPanel
      title="Daily active users"
      description={
        view === "total"
          ? `Distinct users per day (UTC), last 30 days. Active = ${definitionLabel.toLowerCase()}.`
          : `Each day's active users split by how long they've been active, counting from their first active day. Active = ${definitionLabel.toLowerCase()}.`
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={definition}
            onChange={(event) =>
              setDefinition(event.target.value as DauDefinition)
            }
            className="rounded-[10px] border border-black bg-white px-3 py-1.5 text-xs font-black text-black shadow-[2px_2px_0_#000] focus:outline-none"
            aria-label="Define an active user"
          >
            {DAU_DEFINITIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-[10px] border border-black bg-white p-0.5 shadow-[2px_2px_0_#000]">
            {(
              [
                { key: "total", label: "Total" },
                { key: "tenure", label: "By tenure" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setView(option.key)}
                className={`rounded-[7px] px-3 py-1.5 text-xs font-black transition ${
                  view === option.key
                    ? "bg-black text-white"
                    : "bg-transparent text-black/60 hover:text-black"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-black/40">
            Distinct users active within
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {REACH_WINDOWS.map((window) => (
              <ReachTile
                key={window.key}
                label={window.label}
                value={active.reach[window.key]}
              />
            ))}
          </div>
        </div>

        {view === "tenure" ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {TENURE_SERIES.map((series) => (
              <span
                key={series.key}
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
        ) : null}

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={active.series}
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
                content={<ChartTooltip view={view} />}
              />
              {view === "total" ? (
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Active users"
                  stroke={TOTAL_COLOR}
                  strokeWidth={2}
                  fill={TOTAL_COLOR}
                  fillOpacity={0.18}
                  isAnimationActive={false}
                />
              ) : (
                TENURE_SERIES.map((series) => (
                  <Area
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stackId="tenure"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    fill={series.color}
                    fillOpacity={1}
                    isAnimationActive={false}
                  />
                ))
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DataPanel>
  );
}
