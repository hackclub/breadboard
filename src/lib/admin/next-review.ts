import "server-only";

import { and, asc, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectSubmissions } from "@/lib/db/schema";

// The project id of the next submission still awaiting review in the same lane
// (materials or demo), oldest first to match the review queue's ordering. Used
// to auto-advance the reviewer to the next card after they decide the current
// one. `excludeProjectIds` skips past the project being reviewed (its
// submission is still pending at page-load time) plus any the reviewer chose to
// skip this session, so a deferred card doesn't reappear. Returns null when
// nothing else is queued.
export async function nextPendingReviewProjectId(
  type: "materials" | "demo",
  excludeProjectIds: number[],
): Promise<number | null> {
  const exclude = excludeProjectIds.filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  const rows = await db
    .select({ projectId: projectSubmissions.projectId })
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.type, type),
        eq(projectSubmissions.status, "pending_review"),
        exclude.length
          ? notInArray(projectSubmissions.projectId, exclude)
          : undefined,
      ),
    )
    .orderBy(asc(projectSubmissions.submittedAt))
    .limit(1);

  return rows[0]?.projectId ?? null;
}

// Parse the `?skip=` review-queue param (a comma-separated list of project ids
// the reviewer deferred this session) into a clean list of positive integers.
export function parseSkipParam(raw: string | string[] | undefined): number[] {
  if (!raw) return [];
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const seen = new Set<number>();
  for (const part of joined.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen];
}
