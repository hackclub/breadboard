/**
 * Pushes every paid ship into the program's YSWS Project Submission Airtable
 * table (src/lib/ysws/unified.ts). The live hooks do this at each payout, but
 * pushes were silently disabled until AIRTABLE_YSWS_TABLE_ID landed in prod,
 * so ships approved before then never got a row. Upsert-by-ship-id means
 * re-running is safe, and it also works as a bulk refresh after template
 * changes.
 *
 * Requires DATABASE_URL, AIRTABLE_API_KEY, AIRTABLE_BASE_ID and
 * AIRTABLE_YSWS_TABLE_ID (loaded from .env.local by Bun, or set inline to
 * point at production). Set NEXT_PUBLIC_APP_URL so evidence links and the
 * screenshot attachment resolve to the public origin. Imports app modules
 * that use Next's "server-only" marker, so run it with the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-unified.ts [--dry-run]
 *
 *   --dry-run   list the paid ships that would be pushed, write nothing
 */

import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectSubmissions, projects } from "@/lib/db/schema";
import { pushShipToUnified, unifiedYswsEnabled } from "@/lib/ysws/unified";

const dryRun = process.argv.includes("--dry-run");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // One Airtable row per paying ship: approved or fulfilled with bread
  // attached. Kit materials approvals carry no bread (they pay at demo), so
  // they are correctly absent.
  const ships = await db
    .select({
      id: projectSubmissions.id,
      projectId: projectSubmissions.projectId,
      title: projects.title,
      approvedHours: projectSubmissions.approvedHours,
      breadAmount: projectSubmissions.breadAmount,
      status: projectSubmissions.status,
    })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projects.id, projectSubmissions.projectId))
    .where(
      and(
        inArray(projectSubmissions.status, ["approved", "fulfilled"]),
        gt(projectSubmissions.breadAmount, 0),
      ),
    )
    .orderBy(asc(projectSubmissions.submittedAt));

  console.log(`${ships.length} paid ships to push`);
  for (const ship of ships) {
    console.log(
      `  ship ${ship.id}  project ${ship.projectId} "${ship.title}"  ${ship.approvedHours ?? 0}h  ${ship.breadAmount} bread  ${ship.status}`,
    );
  }

  if (dryRun) {
    console.log("\nDry run — nothing pushed.");
    process.exit(0);
  }
  if (!unifiedYswsEnabled()) {
    console.error(
      "Unified YSWS Airtable is not configured. Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID and AIRTABLE_YSWS_TABLE_ID (or pass --dry-run).",
    );
    process.exit(1);
  }

  let done = 0;
  for (const ship of ships) {
    // Never throws; a failed push logs its own error and the row just stays
    // missing for the next run to catch.
    await pushShipToUnified(ship.id);
    done++;
    console.log(`pushed ${done}/${ships.length} (ship ${ship.id})`);
    await sleep(300); // Airtable caps writes at 5 req/s per base
  }
  console.log("Done.");
  process.exit(0);
}

void main();
