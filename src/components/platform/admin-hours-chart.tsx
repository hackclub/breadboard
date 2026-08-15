"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { DataPanel } from "@/components/ui/table";
import type {
  DecisionDayPoint,
  HoursDayPoint,
  HoursStats,
  ShipOrdinalKey,
} from "@/lib/admin/hours-stats";

// Ship position is an ordered scale, not a set of identities, so the stack uses
// one validated blue ramp read light -> dark: a project's first ship is the
// darkest band at the bottom, later updates ride lighter on top. Same ramp the
// DAU tenure chart uses.
const SHIP_SERIES: { key: ShipOrdinalKey; label: string; color: string }[] = [
  { key: "ship1", label: "First ship", color: "#104281" },
  { key: "ship2", label: "2nd ship", color: "#2a78d6" },
  { key: "ship3", label: "3rd ship", color: "#5598e7" },
  { key: "ship4plus", label: "4th+ ship", color: "#86b6ef" },
];

// Review outcomes are states, not series, so they wear the reserved status
// colors. Every one of them carries a written label in the legend, the tooltip
// and the tiles below, so the color never has to speak alone.
const DECISION_SERIES: {
  key: "approved" | "changes" | "rejected";
  label: string;
  color: string;
}[] = [
  { key: "approved", label: "Approved", color: "#0ca30c" },
  { key: "changes", label: "Changes requested", color: "#fab219" },
  { key: "rejected", label: "Rejected", color: "#d03b3b" },
];

const KIT_COLOR = "#BD0F32"; // brand crimson: the segment the panel is about
const NO_KIT_COLOR = "#c4c2ba";
const AXIS = "#898781";
const GRID = "#e1e0d9";
const SURFACE = "#ffffff";

function shortDay(day: string) {
  // "2026-07-03" -> "Jul 3", parsed as UTC so it never drifts a day.
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatHours(hours: number) {
  if (hours >= 100) return Math.round(hours).toLocaleString("en-US");
  return hours.toFixed(1).replace(/\.0$/, "");
}

function formatPercent(fraction: number) {
  return `${Math.round(fraction * 100)}%`;
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-3 shrink-0 rounded-[3px] border border-black/20"
      style={{ backgroundColor: color }}
    />
  );
}

function LegendRow({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-black/60"
        >
          <Swatch color={item.color} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-4">
      <p className="text-3xl font-black leading-none tabular-nums text-black">
        {value}
      </p>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-black/45">
        {label}
      </p>
      {hint ? (
        <p className="mt-1 text-xs font-semibold text-black/40">{hint}</p>
      ) : null}
    </div>
  );
}

// Part-to-whole bar. Segments are separated by a 2px surface gap and every one
// carries its own written label underneath, so the split is readable without
// resolving four blues against each other.
function SplitBar({
  segments,
  formatValue,
}: {
  segments: { label: string; color: string; value: number }[];
  formatValue: (value: number) => string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[6px]">
        {visible.length > 0 ? (
          visible.map((segment) => (
            <span
              key={segment.label}
              className="h-full"
              style={{
                backgroundColor: segment.color,
                width: `${(segment.value / total) * 100}%`,
              }}
            />
          ))
        ) : (
          <span className="h-full w-full bg-[#e1e0d9]" />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-black/60"
          >
            <Swatch color={segment.color} />
            {segment.label}
            <span className="tabular-nums font-black text-black">
              {formatValue(segment.value)}
            </span>
            <span className="tabular-nums text-black/40">
              {total > 0 ? formatPercent(segment.value / total) : "0%"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TooltipShell({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: ReactNode;
  footer: string;
}) {
  return (
    <div className="rounded-[10px] border border-black bg-white px-3 py-2 text-xs shadow-[3px_3px_0_#000]">
      <p className="font-black text-black">{title}</p>
      <div className="mt-1.5 space-y-0.5">{rows}</div>
      <p className="mt-1.5 border-t border-black/10 pt-1.5 font-black text-black/70">
        {footer}
      </p>
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
  value: string;
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

function HoursTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as HoursDayPoint | undefined;
  if (!point) return null;

  return (
    <TooltipShell
      title={shortDay(String(label))}
      rows={SHIP_SERIES.map((series) =>
        point[series.key] > 0 ? (
          <TooltipRow
            key={series.key}
            label={series.label}
            color={series.color}
            value={`${formatHours(point[series.key])}h`}
          />
        ) : null,
      )}
      footer={`${formatHours(point.total)}h approved`}
    />
  );
}

function DecisionTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as DecisionDayPoint | undefined;
  if (!point) return null;
  const total = point.approved + point.changes + point.rejected;

  return (
    <TooltipShell
      title={shortDay(String(label))}
      rows={DECISION_SERIES.map((series) =>
        point[series.key] > 0 ? (
          <TooltipRow
            key={series.key}
            label={series.label}
            color={series.color}
            value={String(point[series.key])}
          />
        ) : null,
      )}
      footer={`${total} ${total === 1 ? "decision" : "decisions"}`}
    />
  );
}

const AXIS_MARGIN = { top: 8, right: 8, bottom: 0, left: -12 } as const;

// Recharts identifies axes and bars by the element type of BarChart's direct
// children, so these props are spread inline rather than pulled out into a
// shared <DayAxis /> wrapper, which the chart would not recognise.
const DAY_AXIS_PROPS = {
  dataKey: "day",
  tickFormatter: shortDay,
  tick: { fill: AXIS, fontSize: 11, fontWeight: 700 },
  tickLine: false,
  axisLine: { stroke: GRID },
  minTickGap: 28,
  interval: "preserveStartEnd",
} as const;

export function AdminHoursChart({ stats }: { stats: HoursStats }) {
  const { kit } = stats;
  const kitRate =
    kit.approvedProjects > 0 ? kit.withKit / kit.approvedProjects : 0;
  const withoutKit = kit.approvedProjects - kit.withKit;

  return (
    <div className="space-y-5">
      <DataPanel
        title="Approved hours"
        description={`Hours a reviewer verified, counted once per ship: a design ship's approved hours, and the hours a demo or update ship added on top. Daily bars cover the last ${stats.windowDays} days (US Eastern); the tiles and split are all time.`}
      >
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Approved hours"
              value={formatHours(stats.totalApprovedHours)}
            />
            <StatTile
              label="Ships approved"
              value={stats.totalApprovedShips.toLocaleString("en-US")}
            />
            <StatTile
              label="Hours per ship"
              value={`${stats.avgHoursPerShip.toFixed(1)}h`}
              hint="mean across approved ships"
            />
            <StatTile
              label="Projects that get a kit"
              value={formatPercent(kitRate)}
              hint={`${kit.withKit.toLocaleString("en-US")} of ${kit.approvedProjects.toLocaleString("en-US")} approved`}
            />
          </div>

          <div>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-black/40">
              Approved hours by ship position
            </p>
            <SplitBar
              segments={SHIP_SERIES.map((series) => ({
                label: series.label,
                color: series.color,
                value:
                  stats.ordinalTotals.find((row) => row.key === series.key)
                    ?.hours ?? 0,
              }))}
              formatValue={(value) => `${formatHours(value)}h`}
            />
            <p className="mt-2.5 text-xs font-semibold text-black/45">
              {formatHours(stats.updateShipHours)}h of the total (
              {stats.totalApprovedHours > 0
                ? formatPercent(
                    stats.updateShipHours / stats.totalApprovedHours,
                  )
                : "0%"}
              ) came from update ships rather than a project&rsquo;s first ship.
            </p>
          </div>

          <div>
            {/* The split bar above is the legend for this chart: same four
                colours, same order, each with its label spelled out. */}
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.hoursSeries} margin={AXIS_MARGIN}>
                  <CartesianGrid
                    stroke={GRID}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis {...DAY_AXIS_PROPS} />
                  <YAxis
                    width={48}
                    tick={{ fill: AXIS, fontSize: 11, fontWeight: 700 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `${formatHours(value)}h`}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    content={<HoursTooltip />}
                  />
                  {SHIP_SERIES.map((series, index) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      stackId="ships"
                      fill={series.color}
                      stroke={SURFACE}
                      strokeWidth={1}
                      radius={
                        index === SHIP_SERIES.length - 1
                          ? [4, 4, 0, 0]
                          : undefined
                      }
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </DataPanel>

      <DataPanel
        title="Review decisions"
        description={`Every ship a reviewer has decided on. Daily bars cover the last ${stats.windowDays} days (US Eastern); the tiles are all time. A ship sent back for changes comes back as a new ship, so one project can land in more than one bucket.`}
      >
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Approval rate"
              value={formatPercent(stats.approvalRate)}
              hint={`${stats.decisionsTotal.toLocaleString("en-US")} decisions`}
            />
            <StatTile
              label="Approved"
              value={stats.decisions.approved.toLocaleString("en-US")}
            />
            <StatTile
              label="Changes requested"
              value={stats.decisions.changes.toLocaleString("en-US")}
            />
            <StatTile
              label="Rejected"
              value={stats.decisions.rejected.toLocaleString("en-US")}
            />
          </div>

          <div>
            <LegendRow items={DECISION_SERIES} />
            <div className="mt-3 h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.decisionSeries} margin={AXIS_MARGIN}>
                  <CartesianGrid
                    stroke={GRID}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis {...DAY_AXIS_PROPS} />
                  <YAxis
                    allowDecimals={false}
                    width={44}
                    tick={{ fill: AXIS, fontSize: 11, fontWeight: 700 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    content={<DecisionTooltip />}
                  />
                  {DECISION_SERIES.map((series, index) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      stackId="decisions"
                      fill={series.color}
                      stroke={SURFACE}
                      strokeWidth={1}
                      radius={
                        index === DECISION_SERIES.length - 1
                          ? [4, 4, 0, 0]
                          : undefined
                      }
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </DataPanel>

      <DataPanel
        title="Kit reach"
        description="Share of projects with an approved design ship that had a kit ordered for them. A kit is ordered at the first design approval, so the rest are makers who never needed one."
      >
        <div className="space-y-4 p-5">
          <p className="text-5xl font-black leading-none tabular-nums text-black">
            {formatPercent(kitRate)}
          </p>
          <SplitBar
            segments={[
              { label: "Kit ordered", color: KIT_COLOR, value: kit.withKit },
              { label: "No kit", color: NO_KIT_COLOR, value: withoutKit },
            ]}
            formatValue={(value) => value.toLocaleString("en-US")}
          />
          <p className="text-xs font-semibold text-black/45">
            {withoutKit > 0
              ? `Of the ${withoutKit.toLocaleString("en-US")} without a kit: ${kit.ownParts.toLocaleString("en-US")} building with their own parts, ${kit.buildShips.toLocaleString("en-US")} off-platform builds, ${kit.breadOnly.toLocaleString("en-US")} bread-only.`
              : "Every approved project had a kit ordered."}
          </p>
        </div>
      </DataPanel>
    </div>
  );
}
