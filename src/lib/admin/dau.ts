import "server-only";

import { type SQL, sql } from "drizzle-orm";
import {
  type DauDefinition,
  DAU_WINDOW_DAYS,
  type DauMetrics,
  type DauPoint,
  type DauReach,
} from "@/lib/admin/dau-types";
import { db } from "@/lib/db/db";
import { editorActivitySessions, session } from "@/lib/db/schema";

// A subquery producing the distinct (user_id, day) pairs that count as active
// under one definition. `day` is a US Eastern calendar date (DST-aware).
const ACTIVITY_SOURCE: Record<DauDefinition, SQL> = {
  editor: sql`
    select
      ${editorActivitySessions.userId} as user_id,
      (${editorActivitySessions.lastActivityAt} at time zone 'America/New_York')::date as day
    from ${editorActivitySessions}
    group by user_id, day
  `,
  // A session keeps only its latest updated_at, so a single long-lived session
  // marks its login day and its last-seen day. Unioning both is the best
  // day-level presence we can get without per-request tracking.
  onsite: sql`
    select user_id, day from (
      select ${session.userId} as user_id,
        (${session.createdAt} at time zone 'America/New_York')::date as day from ${session}
      union
      select ${session.userId} as user_id,
        (${session.updatedAt} at time zone 'America/New_York')::date as day from ${session}
    ) s
    group by user_id, day
  `,
};

// The column each definition reads for "last seen", used by the rolling-window
// reach counts.
const REACH_SOURCE: Record<DauDefinition, SQL> = {
  editor: sql`
    select ${editorActivitySessions.userId} as user_id,
      ${editorActivitySessions.lastActivityAt} as seen_at
    from ${editorActivitySessions}
  `,
  onsite: sql`
    select ${session.userId} as user_id, ${session.updatedAt} as seen_at
    from ${session}
  `,
};

type DauRow = {
  day: string;
  first_2d: number;
  days_2_7: number;
  week_1_2: number;
  week_2_3: number;
  week_3_plus: number;
};

type ReachRow = {
  last24h: number;
  last3d: number;
  last7d: number;
  last30d: number;
};

// Daily active users over the window, each day split by how long the user has
// been active (days since their first-ever active day). A user lands in exactly
// one tenure bucket per day, so the buckets sum to that day's DAU. first_seen
// is computed over all history, not just the window, so tenure is correct for
// users whose first active day predates the chart.
async function loadSeries(definition: DauDefinition): Promise<DauPoint[]> {
  const result = await db.execute<DauRow>(sql`
    with activity as (${ACTIVITY_SOURCE[definition]}),
    first_seen as (
      select user_id, min(day) as first_day from activity group by user_id
    )
    select
      to_char(a.day, 'YYYY-MM-DD') as day,
      count(*) filter (where a.day - fs.first_day < 2)::int as first_2d,
      count(*) filter (where a.day - fs.first_day between 2 and 6)::int as days_2_7,
      count(*) filter (where a.day - fs.first_day between 7 and 13)::int as week_1_2,
      count(*) filter (where a.day - fs.first_day between 14 and 20)::int as week_2_3,
      count(*) filter (where a.day - fs.first_day >= 21)::int as week_3_plus
    from activity a
    join first_seen fs on fs.user_id = a.user_id
    where a.day >= ((now() at time zone 'America/New_York')::date - make_interval(days => ${DAU_WINDOW_DAYS}))
    group by a.day
    order by a.day
  `);

  const byDay = new Map(result.rows.map((row) => [row.day, row]));

  // Build a continuous US Eastern day axis so gaps (days with no activity)
  // render as zeros instead of the chart quietly skipping them. en-CA formats
  // as YYYY-MM-DD; anchoring it at UTC midnight lets the loop below step whole
  // days with setUTCDate.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  const end = new Date(`${today}T00:00:00Z`);
  const series: DauPoint[] = [];
  for (let ago = DAU_WINDOW_DAYS; ago >= 0; ago--) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - ago);
    const day = date.toISOString().slice(0, 10);
    const row = byDay.get(day);
    const first2d = row?.first_2d ?? 0;
    const days2to7 = row?.days_2_7 ?? 0;
    const week1to2 = row?.week_1_2 ?? 0;
    const week2to3 = row?.week_2_3 ?? 0;
    const week3plus = row?.week_3_plus ?? 0;
    series.push({
      day,
      first2d,
      days2to7,
      week1to2,
      week2to3,
      week3plus,
      total: first2d + days2to7 + week1to2 + week2to3 + week3plus,
    });
  }
  return series;
}

// Distinct users active within each rolling window ending now. A user counts
// once per window if their most recent activity falls inside it.
async function loadReach(definition: DauDefinition): Promise<DauReach> {
  const result = await db.execute<ReachRow>(sql`
    with seen as (${REACH_SOURCE[definition]})
    select
      count(distinct user_id) filter (where seen_at >= now() - make_interval(hours => 24))::int as last24h,
      count(distinct user_id) filter (where seen_at >= now() - make_interval(days => 3))::int as last3d,
      count(distinct user_id) filter (where seen_at >= now() - make_interval(days => 7))::int as last7d,
      count(distinct user_id) filter (where seen_at >= now() - make_interval(days => 30))::int as last30d
    from seen
  `);
  const row = result.rows[0];
  return {
    last24h: row?.last24h ?? 0,
    last3d: row?.last3d ?? 0,
    last7d: row?.last7d ?? 0,
    last30d: row?.last30d ?? 0,
  };
}

// Everything both definitions need, computed in parallel so the page pays for
// one round of queries, not four sequential ones.
export async function loadDauMetrics(): Promise<
  Record<DauDefinition, DauMetrics>
> {
  const [onsiteSeries, editorSeries, onsiteReach, editorReach] =
    await Promise.all([
      loadSeries("onsite"),
      loadSeries("editor"),
      loadReach("onsite"),
      loadReach("editor"),
    ]);
  return {
    onsite: { series: onsiteSeries, reach: onsiteReach },
    editor: { series: editorSeries, reach: editorReach },
  };
}
