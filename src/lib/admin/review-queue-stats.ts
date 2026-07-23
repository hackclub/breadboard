import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectSubmissions } from "@/lib/db/schema";

export const REVIEW_QUEUE_WINDOW_DAYS = 30;

// One day on the review chart: how many submissions arrived, how many reviews
// reviewers actually completed that day, and the outstanding backlog at the end
// of the day (submissions that had arrived but not yet been reviewed).
export type ReviewQueuePoint = {
  day: string;
  submitted: number;
  reviewed: number;
  backlog: number;
};

export type ReviewQueueStats = {
  series: ReviewQueuePoint[];
  // Current outstanding queue, i.e. rows still in pending_review right now. The
  // last point's `backlog` equals `pendingTotal` by construction.
  pendingTotal: number;
  pendingDesign: number;
  pendingDemo: number;
};

type DailyRow = { day: string; n: number };
type BaselineRow = { submitted_before: number; reviewed_before: number };
type PendingRow = { design: number; demo: number };

// Two honest time series over the window (US Eastern calendar days, matching the
// DAU chart): inflow keyed by submittedAt, review throughput keyed by reviewedAt.
// The backlog is a running balance seeded with everything still unreviewed when
// the window opened, so it tracks the true outstanding queue day by day rather
// than re-coloring inflow by each submission's current status.
export async function loadReviewQueueStats(): Promise<ReviewQueueStats> {
  const windowStart = sql`((now() at time zone 'America/New_York')::date
    - make_interval(days => ${REVIEW_QUEUE_WINDOW_DAYS}))`;

  const [submittedResult, reviewedResult, baselineResult, pendingResult] =
    await Promise.all([
      db.execute<DailyRow>(sql`
        select
          to_char(
            (${projectSubmissions.submittedAt} at time zone 'America/New_York')::date,
            'YYYY-MM-DD'
          ) as day,
          count(*)::int as n
        from ${projectSubmissions}
        where (${projectSubmissions.submittedAt} at time zone 'America/New_York')::date
          >= ${windowStart}
        group by 1
        order by 1
      `),
      db.execute<DailyRow>(sql`
        select
          to_char(
            (${projectSubmissions.reviewedAt} at time zone 'America/New_York')::date,
            'YYYY-MM-DD'
          ) as day,
          count(*)::int as n
        from ${projectSubmissions}
        where ${projectSubmissions.reviewedAt} is not null
          and (${projectSubmissions.reviewedAt} at time zone 'America/New_York')::date
            >= ${windowStart}
        group by 1
        order by 1
      `),
      db.execute<BaselineRow>(sql`
        select
          count(*) filter (
            where (${projectSubmissions.submittedAt} at time zone 'America/New_York')::date
              < ${windowStart}
          )::int as submitted_before,
          count(*) filter (
            where ${projectSubmissions.reviewedAt} is not null
              and (${projectSubmissions.reviewedAt} at time zone 'America/New_York')::date
                < ${windowStart}
          )::int as reviewed_before
        from ${projectSubmissions}
      `),
      db.execute<PendingRow>(sql`
        select
          count(*) filter (where ${projectSubmissions.type} <> 'demo')::int as design,
          count(*) filter (where ${projectSubmissions.type} = 'demo')::int as demo
        from ${projectSubmissions}
        where ${projectSubmissions.status} = 'pending_review'
      `),
    ]);

  const submittedByDay = new Map(submittedResult.rows.map((r) => [r.day, r.n]));
  const reviewedByDay = new Map(reviewedResult.rows.map((r) => [r.day, r.n]));

  // Build a continuous US Eastern day axis so days with no activity render as
  // zeros instead of the chart silently collapsing the gap. Anchoring the en-CA
  // (YYYY-MM-DD) date at UTC midnight lets the loop step whole days.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  const end = new Date(`${today}T00:00:00Z`);

  // Seed the running backlog with everything submitted-but-not-yet-reviewed
  // before the window opened, then walk each day adding inflow and subtracting
  // completed reviews. Because reviewedAt is set exactly once when a decision
  // lands (resubmissions are fresh rows), this stays equal to the live count of
  // pending_review rows at each day's end.
  const baseline = baselineResult.rows[0];
  let backlog =
    (baseline?.submitted_before ?? 0) - (baseline?.reviewed_before ?? 0);

  const series: ReviewQueuePoint[] = [];
  for (let ago = REVIEW_QUEUE_WINDOW_DAYS; ago >= 0; ago--) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - ago);
    const day = date.toISOString().slice(0, 10);
    const submitted = submittedByDay.get(day) ?? 0;
    const reviewed = reviewedByDay.get(day) ?? 0;
    backlog += submitted - reviewed;
    series.push({ day, submitted, reviewed, backlog: Math.max(0, backlog) });
  }

  const pendingDesign = pendingResult.rows[0]?.design ?? 0;
  const pendingDemo = pendingResult.rows[0]?.demo ?? 0;
  return {
    series,
    pendingTotal: pendingDesign + pendingDemo,
    pendingDesign,
    pendingDemo,
  };
}
