import "server-only";

import { type SQLWrapper, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectSubmissions, projects } from "@/lib/db/schema";

export const HOURS_WINDOW_DAYS = 30;

// Ships are bucketed by their position in the project's own run of approved
// ships. Everything past the third folds into one bucket so the stack stays
// inside the four-step ordinal ramp.
export const SHIP_ORDINAL_KEYS = [
  "ship1",
  "ship2",
  "ship3",
  "ship4plus",
] as const;
export type ShipOrdinalKey = (typeof SHIP_ORDINAL_KEYS)[number];

export type HoursDayPoint = { day: string; total: number } & Record<
  ShipOrdinalKey,
  number
>;

export type DecisionDayPoint = {
  day: string;
  approved: number;
  changes: number;
  rejected: number;
};

export type ShipOrdinalTotal = {
  key: ShipOrdinalKey;
  ships: number;
  hours: number;
};

// Why a project with an approved design ship never got a kit. The buckets are
// mutually exclusive and cover every approved project, so they sum to
// approvedProjects. `breadOnly` is the residual: approved, kit-eligible, and no
// kit ordered, which is what a bread-only approval leaves behind.
export type KitReach = {
  approvedProjects: number;
  withKit: number;
  ownParts: number;
  buildShips: number;
  breadOnly: number;
};

export type HoursStats = {
  windowDays: number;
  totalApprovedHours: number;
  totalApprovedShips: number;
  avgHoursPerShip: number;
  firstShipHours: number;
  updateShipHours: number;
  ordinalTotals: ShipOrdinalTotal[];
  hoursSeries: HoursDayPoint[];
  decisions: { approved: number; changes: number; rejected: number };
  decisionsTotal: number;
  approvalRate: number;
  decisionSeries: DecisionDayPoint[];
  kit: KitReach;
};

type HoursDayRow = { day: string; bucket: number; hours: number };
type OrdinalRow = { bucket: number; ships: number; hours: number };
type DecisionDayRow = {
  day: string;
  approved: number;
  changes: number;
  rejected: number;
};
type DecisionTotalRow = { approved: number; changes: number; rejected: number };
type KitRow = {
  approved_projects: number;
  with_kit: number;
  own_parts: number;
  build_ships: number;
};

// Per-ship approved hours, as the hours that ship actually added to its
// project's verified total.
//
// The two review phases record hours differently and neither column can be
// summed on its own: a materials ship's approvedHours is an increment the
// approval adds to the project total, while a demo approval restates the total
// (the reviewer starts from the design hours and raises them to cover the
// build). So a demo ship opens a new "era": its own approvedHours is the era's
// base, and any materials ship after it stacks on top. Taking the difference
// between each ship's running total and the previous ship's gives one honest
// per-ship number that sums back to projects.overrideHoursSpent.
//
// Deltas are floored at zero so a reviewer who cut a project's total at demo
// review leaves a zero-height bar rather than a negative one.
const SHIP_DELTAS = sql`
  with ranked as (
    select
      ${projectSubmissions.projectId} as project_id,
      ${projectSubmissions.id} as submission_id,
      ${projectSubmissions.type}::text as ship_type,
      coalesce(${projectSubmissions.approvedHours}, 0) as hours,
      ${projectSubmissions.reviewedAt} as reviewed_at,
      ${projectSubmissions.submittedAt} as submitted_at,
      row_number() over (
        partition by ${projectSubmissions.projectId}
        order by ${projectSubmissions.submittedAt}, ${projectSubmissions.id}
      ) as ship_no,
      count(*) filter (where ${projectSubmissions.type} = 'demo') over (
        partition by ${projectSubmissions.projectId}
        order by ${projectSubmissions.submittedAt}, ${projectSubmissions.id}
        rows between unbounded preceding and current row
      ) as era
    from ${projectSubmissions}
    where ${projectSubmissions.status} in ('approved', 'fulfilled')
      and ${projectSubmissions.reviewedAt} is not null
  ),
  cumulative as (
    select
      ranked.*,
      case
        when era = 0 then 0
        else first_value(hours) over (
          partition by project_id, era order by submitted_at, submission_id
        )
      end
      + sum(case when ship_type = 'materials' then hours else 0 end) over (
          partition by project_id, era
          order by submitted_at, submission_id
          rows between unbounded preceding and current row
        ) as cum_hours
    from ranked
  ),
  deltas as (
    select
      project_id,
      submission_id,
      ship_no,
      reviewed_at,
      greatest(
        cum_hours - lag(cum_hours, 1, 0) over (
          partition by project_id order by submitted_at, submission_id
        ),
        0
      ) as delta_hours
    from cumulative
  )
`;

function bucketKey(bucket: number): ShipOrdinalKey {
  return SHIP_ORDINAL_KEYS[Math.min(Math.max(bucket, 1), 4) - 1] ?? "ship4plus";
}

// A continuous US Eastern day axis, so quiet days render as zeros instead of
// the chart silently closing the gap. Same construction as the review-queue and
// DAU charts, which these sit next to.
function easternDays(windowDays: number): string[] {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  const end = new Date(`${today}T00:00:00Z`);
  const days: string[] = [];
  for (let ago = windowDays; ago >= 0; ago--) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - ago);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

export async function loadHoursStats(): Promise<HoursStats> {
  const windowStart = sql`((now() at time zone 'America/New_York')::date
    - make_interval(days => ${HOURS_WINDOW_DAYS}))`;
  const easternDay = (column: SQLWrapper) =>
    sql`(${column} at time zone 'America/New_York')::date`;

  const [hoursDaily, ordinalTotalsResult, decisionDaily, decisionAll, kitRow] =
    await Promise.all([
      db.execute<HoursDayRow>(sql`
        ${SHIP_DELTAS}
        select
          to_char(${easternDay(sql`reviewed_at`)}, 'YYYY-MM-DD') as day,
          least(ship_no, 4)::int as bucket,
          sum(delta_hours)::float8 as hours
        from deltas
        where ${easternDay(sql`reviewed_at`)} >= ${windowStart}
        group by 1, 2
        order by 1, 2
      `),
      db.execute<OrdinalRow>(sql`
        ${SHIP_DELTAS}
        select
          least(ship_no, 4)::int as bucket,
          count(*)::int as ships,
          sum(delta_hours)::float8 as hours
        from deltas
        group by 1
        order by 1
      `),
      db.execute<DecisionDayRow>(sql`
        select
          to_char(
            ${easternDay(projectSubmissions.reviewedAt)},
            'YYYY-MM-DD'
          ) as day,
          count(*) filter (
            where ${projectSubmissions.status} in ('approved', 'fulfilled')
          )::int as approved,
          count(*) filter (
            where ${projectSubmissions.status} = 'needs_changes'
          )::int as changes,
          count(*) filter (
            where ${projectSubmissions.status} = 'rejected'
          )::int as rejected
        from ${projectSubmissions}
        where ${projectSubmissions.reviewedAt} is not null
          and ${easternDay(projectSubmissions.reviewedAt)} >= ${windowStart}
        group by 1
        order by 1
      `),
      db.execute<DecisionTotalRow>(sql`
        select
          count(*) filter (
            where ${projectSubmissions.status} in ('approved', 'fulfilled')
          )::int as approved,
          count(*) filter (
            where ${projectSubmissions.status} = 'needs_changes'
          )::int as changes,
          count(*) filter (
            where ${projectSubmissions.status} = 'rejected'
          )::int as rejected
        from ${projectSubmissions}
        where ${projectSubmissions.reviewedAt} is not null
      `),
      // Kit reach is measured against projects that cleared a design review,
      // since that approval is the moment a kit is (or isn't) ordered. A
      // project with no kit order is either an own-parts build, an
      // off-platform build ship, or a bread-only ship that took the payout
      // without the kit.
      db.execute<KitRow>(sql`
        with approved_designs as (
          select distinct ${projectSubmissions.projectId} as project_id
          from ${projectSubmissions}
          where ${projectSubmissions.status} in ('approved', 'fulfilled')
            and ${projectSubmissions.type} = 'materials'
        )
        select
          count(*)::int as approved_projects,
          count(*) filter (where ${projects.kitOrderId} is not null)::int
            as with_kit,
          count(*) filter (
            where ${projects.kitOrderId} is null
              and ${projects.kitType} = 'own'
          )::int as own_parts,
          count(*) filter (
            where ${projects.kitOrderId} is null
              and ${projects.kitType} <> 'own'
              and ${projects.projectType} = 'build'
          )::int as build_ships
        from approved_designs
        join ${projects} on ${projects.id} = approved_designs.project_id
      `),
    ]);

  const hoursByDay = new Map<string, Map<ShipOrdinalKey, number>>();
  for (const row of hoursDaily.rows) {
    const day = hoursByDay.get(row.day) ?? new Map<ShipOrdinalKey, number>();
    day.set(bucketKey(row.bucket), row.hours);
    hoursByDay.set(row.day, day);
  }

  const hoursSeries: HoursDayPoint[] = easternDays(HOURS_WINDOW_DAYS).map(
    (day) => {
      const buckets = hoursByDay.get(day);
      const point = {
        day,
        ship1: buckets?.get("ship1") ?? 0,
        ship2: buckets?.get("ship2") ?? 0,
        ship3: buckets?.get("ship3") ?? 0,
        ship4plus: buckets?.get("ship4plus") ?? 0,
        total: 0,
      };
      point.total = point.ship1 + point.ship2 + point.ship3 + point.ship4plus;
      return point;
    },
  );

  const ordinalTotals: ShipOrdinalTotal[] = SHIP_ORDINAL_KEYS.map((key) => {
    const row = ordinalTotalsResult.rows.find(
      (candidate) => bucketKey(candidate.bucket) === key,
    );
    return { key, ships: row?.ships ?? 0, hours: row?.hours ?? 0 };
  });

  const totalApprovedHours = ordinalTotals.reduce(
    (sum, row) => sum + row.hours,
    0,
  );
  const totalApprovedShips = ordinalTotals.reduce(
    (sum, row) => sum + row.ships,
    0,
  );
  const firstShipHours = ordinalTotals[0]?.hours ?? 0;

  const decisionsByDay = new Map(
    decisionDaily.rows.map((row) => [row.day, row]),
  );
  const decisionSeries: DecisionDayPoint[] = easternDays(HOURS_WINDOW_DAYS).map(
    (day) => {
      const row = decisionsByDay.get(day);
      return {
        day,
        approved: row?.approved ?? 0,
        changes: row?.changes ?? 0,
        rejected: row?.rejected ?? 0,
      };
    },
  );

  const decisions = {
    approved: decisionAll.rows[0]?.approved ?? 0,
    changes: decisionAll.rows[0]?.changes ?? 0,
    rejected: decisionAll.rows[0]?.rejected ?? 0,
  };
  const decisionsTotal =
    decisions.approved + decisions.changes + decisions.rejected;

  const kitCounts = kitRow.rows[0];
  const approvedProjects = kitCounts?.approved_projects ?? 0;
  const withKit = kitCounts?.with_kit ?? 0;
  const ownParts = kitCounts?.own_parts ?? 0;
  const buildShips = kitCounts?.build_ships ?? 0;

  return {
    windowDays: HOURS_WINDOW_DAYS,
    totalApprovedHours,
    totalApprovedShips,
    avgHoursPerShip:
      totalApprovedShips > 0 ? totalApprovedHours / totalApprovedShips : 0,
    firstShipHours,
    updateShipHours: totalApprovedHours - firstShipHours,
    ordinalTotals,
    hoursSeries,
    decisions,
    decisionsTotal,
    approvalRate: decisionsTotal > 0 ? decisions.approved / decisionsTotal : 0,
    decisionSeries,
    kit: {
      approvedProjects,
      withKit,
      ownParts,
      buildShips,
      breadOnly: Math.max(
        0,
        approvedProjects - withKit - ownParts - buildShips,
      ),
    },
  };
}
