/**
 * Recomputes stored hours to a tenth of an hour, fixing rows written by the
 * old whole-hour ceil (3h 34m 53s was stored as 4h; see commit 6686f83 which
 * switched shipping to roundHours but only for new writes).
 *
 * The raw second counts are the source of truth and were never rounded:
 *   - projectSubmissions.trackedSeconds: cumulative editor activeSeconds at
 *     ship time. A materials submission claims only the new seconds since the
 *     last approved ship, so its hoursSpent = roundHours((trackedSeconds -
 *     prior approved floor) / 3600), matching shipProjectForUser. Demo rows
 *     carry the full claim (no floor).
 *   - projects.hoursSpent: the cumulative total, recomputed from the live sum
 *     of editorActivitySessions.activeSeconds.
 *
 * Only rows with real tracked time are touched. Manual / off-platform
 * submissions (trackedSeconds = 0, hours typed by hand) and projects with no
 * activity sessions are left exactly as they are. approvedHours is never
 * changed: those are settled reviewer decisions and paid-out amounts.
 *
 * Imports app modules that use Next's "server-only" marker, so run it with the
 * stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-hours.ts [--dry-run]
 *
 *   --dry-run   print every planned change, write nothing
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { roundHours } from "@/lib/constants";
import {
  editorActivitySessions,
  projectSubmissions,
  projects,
} from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

const APPROVED_STATUSES = new Set(["approved", "fulfilled"]);

async function backfillSubmissions() {
  const rows = await db
    .select({
      id: projectSubmissions.id,
      projectId: projectSubmissions.projectId,
      submissionNumber: projectSubmissions.submissionNumber,
      type: projectSubmissions.type,
      status: projectSubmissions.status,
      hoursSpent: projectSubmissions.hoursSpent,
      trackedSeconds: projectSubmissions.trackedSeconds,
    })
    .from(projectSubmissions);

  // Group by project so a materials submission can see the tracked seconds of
  // earlier approved ships in the same project.
  const byProject = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byProject.get(row.projectId) ?? [];
    list.push(row);
    byProject.set(row.projectId, list);
  }

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const list of byProject.values()) {
    const materials = list
      .filter((r) => r.type === "materials")
      .sort((a, b) => a.submissionNumber - b.submissionNumber);

    for (const row of list) {
      // No genuine tracked time (manual / off-platform): leave the hand-typed
      // hours alone.
      if (row.trackedSeconds <= 0) {
        skipped++;
        continue;
      }

      let floorSeconds = 0;
      if (row.type === "materials") {
        for (const prior of materials) {
          if (
            prior.submissionNumber < row.submissionNumber &&
            APPROVED_STATUSES.has(prior.status)
          ) {
            floorSeconds = Math.max(floorSeconds, prior.trackedSeconds);
          }
        }
      }

      const newHours = roundHours(
        Math.max(0, row.trackedSeconds - floorSeconds) / 3600,
      );
      if (newHours === row.hoursSpent) {
        unchanged++;
        continue;
      }

      console.log(
        `${dryRun ? "[dry-run] " : ""}submission #${row.id} (project ${row.projectId}, ${row.type} #${row.submissionNumber}, ${row.status}): ` +
          `${row.hoursSpent}h -> ${newHours}h ` +
          `(${row.trackedSeconds}s tracked${floorSeconds ? ` − ${floorSeconds}s prior approved` : ""})`,
      );
      if (!dryRun) {
        await db
          .update(projectSubmissions)
          .set({ hoursSpent: newHours })
          .where(eq(projectSubmissions.id, row.id));
      }
      updated++;
    }
  }

  console.log(
    `\nSubmissions: ${updated} updated, ${unchanged} already accurate, ${skipped} skipped (no tracked time).`,
  );
}

async function backfillProjects() {
  // Cumulative tracked seconds per project, straight from the source sessions.
  const activity = await db
    .select({
      projectId: editorActivitySessions.projectId,
      activeSeconds: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
    })
    .from(editorActivitySessions)
    .groupBy(editorActivitySessions.projectId);

  const rows = await db
    .select({ id: projects.id, hoursSpent: projects.hoursSpent })
    .from(projects);
  const stored = new Map(rows.map((r) => [r.id, r.hoursSpent]));

  let updated = 0;
  let unchanged = 0;

  for (const { projectId, activeSeconds } of activity) {
    if (activeSeconds <= 0) continue;
    const current = stored.get(projectId);
    if (current === undefined) continue;
    const totalHours = roundHours(activeSeconds / 3600);
    if (totalHours === current) {
      unchanged++;
      continue;
    }
    console.log(
      `${dryRun ? "[dry-run] " : ""}project ${projectId}: ${current}h -> ${totalHours}h (${activeSeconds}s tracked)`,
    );
    if (!dryRun) {
      await db
        .update(projects)
        .set({ hoursSpent: totalHours })
        .where(eq(projects.id, projectId));
    }
    updated++;
  }

  console.log(
    `Projects: ${updated} updated, ${unchanged} already accurate (projects with no activity sessions left untouched).`,
  );
}

async function main() {
  await backfillSubmissions();
  await backfillProjects();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
