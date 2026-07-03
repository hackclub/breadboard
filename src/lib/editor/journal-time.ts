import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { editorActivitySessions, projectJournals } from "@/lib/db/schema";

// Journaling gate shared by the editor and the off-platform track page. Kept in
// a plain server-only module (not "use server") so a non-async export doesn't
// break the action modules that import it.
export const JOURNAL_MIN_SECONDS = 10 * 60;

export async function getUnjournaledSeconds(projectId: number, userId: string) {
  const latestJournal = await db
    .select({ createdAt: projectJournals.createdAt })
    .from(projectJournals)
    .where(
      and(
        eq(projectJournals.projectId, projectId),
        eq(projectJournals.userId, userId),
      ),
    )
    .orderBy(desc(projectJournals.createdAt))
    .limit(1);
  const since = latestJournal[0]?.createdAt ?? new Date(0);
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
    })
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.projectId, projectId),
        eq(editorActivitySessions.userId, userId),
        sql`${editorActivitySessions.startedAt} > ${since}`,
      ),
    );
  return rows[0]?.total ?? 0;
}
