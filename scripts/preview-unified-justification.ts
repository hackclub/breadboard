/**
 * Prints the composed Unified YSWS justification for a ship, exactly as
 * pushShipToUnified would submit it, so a reviewer can eyeball the template
 * before it lands in Airtable. Reads whatever DATABASE_URL points at.
 *
 * Imports app modules that use Next's "server-only" marker, so run it with
 * the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/preview-unified-justification.ts [submissionId]
 *
 * Without an argument it picks the most recently reviewed approved submission,
 * falling back to the latest submission of any status.
 */

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectSubmissions, projects } from "@/lib/db/schema";
import { buildUnifiedJustification } from "@/lib/ysws/unified";

const idArg = Number(process.argv[2]);

async function pickRow() {
  const base = db
    .select({ submission: projectSubmissions, project: projects })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projects.id, projectSubmissions.projectId));
  if (Number.isFinite(idArg) && idArg > 0) {
    const [row] = await base.where(eq(projectSubmissions.id, idArg)).limit(1);
    return row;
  }
  const [approved] = await base
    .where(inArray(projectSubmissions.status, ["approved", "fulfilled"]))
    .orderBy(desc(projectSubmissions.reviewedAt))
    .limit(1);
  if (approved) return approved;
  const [latest] = await base
    .orderBy(desc(projectSubmissions.submittedAt))
    .limit(1);
  return latest;
}

async function main() {
  const row = await pickRow();
  if (!row) {
    console.log("No matching submission in the database.");
    process.exit(0);
  }
  console.log(
    `Submission #${row.submission.id} (${row.submission.status}, type ${row.submission.type}) of project ${row.project.id} "${row.project.title}"`,
  );
  const override = row.project.unifiedJustificationOverride.trim();
  if (override) {
    console.log("--- custom override (this is what gets sent) ---");
    console.log(override);
    console.log("--- generated template (currently unused) ---");
  } else {
    console.log("---");
  }
  console.log(
    await buildUnifiedJustification(row, "https://breadboard.hackclub.com"),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
