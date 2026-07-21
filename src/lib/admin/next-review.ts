import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectSubmissions } from "@/lib/db/schema";

// The project id of the next submission still awaiting review in the same lane
// (materials or demo), oldest first to match the review queue's ordering. Used
// to auto-advance the reviewer to the next card after they decide the current
// one. Excludes the project being reviewed so we skip past it even though its
// submission is still pending at page-load time. Returns null when nothing else
// is queued.
export async function nextPendingReviewProjectId(
  type: "materials" | "demo",
  excludeProjectId: number,
): Promise<number | null> {
  const rows = await db
    .select({ projectId: projectSubmissions.projectId })
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.type, type),
        eq(projectSubmissions.status, "pending_review"),
        ne(projectSubmissions.projectId, excludeProjectId),
      ),
    )
    .orderBy(asc(projectSubmissions.submittedAt))
    .limit(1);

  return rows[0]?.projectId ?? null;
}
