import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectSubmissions } from "@/lib/db/schema";

export const REVIEW_QUEUE_WINDOW_DAYS = 30;

// One day on the inflow chart: submissions that arrived that day, split by
// whether they still need a reviewer's attention.
export type ReviewQueuePoint = {
  day: string;
  pending: number;
  resolved: number;
  total: number;
};

export type ReviewQueueStats = {
  series: ReviewQueuePoint[];
  // Current outstanding queue, i.e. rows still in pending_review right now.
  pendingTotal: number;
  pendingDesign: number;
  pendingDemo: number;
};

type SeriesRow = { day: string; pending: number; resolved: number };
type PendingRow = { design: number; demo: number };

// Daily submission inflow over the window (US Eastern calendar days, matching
// the DAU chart), each day split into rows still awaiting review vs. already
// actioned. `pending` on an older day is backlog that has sat unreviewed since.
export async function loadReviewQueueStats(): Promise<ReviewQueueStats> {
  const [seriesResult, pendingResult] = await Promise.all([
    db.execute<SeriesRow>(sql`
      select
        to_char(
          (${projectSubmissions.submittedAt} at time zone 'America/New_York')::date,
          'YYYY-MM-DD'
        ) as day,
        count(*) filter (
          where ${projectSubmissions.status} = 'pending_review'
        )::int as pending,
        count(*) filter (
          where ${projectSubmissions.status} <> 'pending_review'
        )::int as resolved
      from ${projectSubmissions}
      where (${projectSubmissions.submittedAt} at time zone 'America/New_York')::date
        >= ((now() at time zone 'America/New_York')::date
          - make_interval(days => ${REVIEW_QUEUE_WINDOW_DAYS}))
      group by (${projectSubmissions.submittedAt} at time zone 'America/New_York')::date
      order by (${projectSubmissions.submittedAt} at time zone 'America/New_York')::date
    `),
    db.execute<PendingRow>(sql`
      select
        count(*) filter (where ${projectSubmissions.type} <> 'demo')::int as design,
        count(*) filter (where ${projectSubmissions.type} = 'demo')::int as demo
      from ${projectSubmissions}
      where ${projectSubmissions.status} = 'pending_review'
    `),
  ]);

  const byDay = new Map(seriesResult.rows.map((row) => [row.day, row]));

  // Build a continuous US Eastern day axis so days with no submissions render
  // as zeros instead of the chart silently collapsing the gap. Anchoring the
  // en-CA (YYYY-MM-DD) date at UTC midnight lets the loop step whole days.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  const end = new Date(`${today}T00:00:00Z`);
  const series: ReviewQueuePoint[] = [];
  for (let ago = REVIEW_QUEUE_WINDOW_DAYS; ago >= 0; ago--) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - ago);
    const day = date.toISOString().slice(0, 10);
    const row = byDay.get(day);
    const pending = row?.pending ?? 0;
    const resolved = row?.resolved ?? 0;
    series.push({ day, pending, resolved, total: pending + resolved });
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
