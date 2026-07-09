import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { editorActivitySessions, projectJournals } from "@/lib/db/schema";

// Journaling gate shared by the editor and the off-platform track page. Kept in
// a plain server-only module (not "use server") so a non-async export doesn't
// break the action modules that import it.
export const JOURNAL_MIN_SECONDS = 10 * 60;

export async function getUnjournaledSeconds(projectId: number, userId: string) {
  const [activityRows, journalRows] = await Promise.all([
    db
      .select({
        total: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
      })
      .from(editorActivitySessions)
      .where(
        and(
          eq(editorActivitySessions.projectId, projectId),
          eq(editorActivitySessions.userId, userId),
        ),
      ),
    db
      .select({
        covered: sql<number>`coalesce(sum(${projectJournals.activeSecondsCovered}), 0)::int`,
      })
      .from(projectJournals)
      .where(
        and(
          eq(projectJournals.projectId, projectId),
          eq(projectJournals.userId, userId),
        ),
      ),
  ]);

  // Sessions can remain open while a journal is submitted. Comparing a
  // session's start time with the latest journal would then hide all later
  // activity in that same session. Each journal records the time it covers,
  // so the reliable current remainder is total tracked time minus time already
  // covered by earlier entries.
  return Math.max(
    0,
    (activityRows[0]?.total ?? 0) - (journalRows[0]?.covered ?? 0),
  );
}
