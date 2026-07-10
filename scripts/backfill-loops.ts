/**
 * Backfills the Loops audience (the Breadboard program's Airtable table, which
 * Hack Club's internal tool syncs to Loops) from the database: every user gets
 * a row keyed on email with their earliest milestone timestamps
 * (Loops - breadboardCreatedProjectAt / ...SubmittedProjectAt), and every
 * waitlist email that never became an account gets a bare row (SignUpAt is
 * auto-set by Airtable). Upsert-by-email means re-running is safe.
 *
 * This runs the same reconciliation the /api/loops/sync endpoint does, against
 * whatever DATABASE_URL is set. Point it at production's DATABASE_URL to load
 * existing prod users (a fresh local .env.local points at the local DB).
 *
 * Requires AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID and
 * DATABASE_URL (loaded from .env.local by Bun). Imports app modules that use
 * Next's "server-only" marker, so run it with the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-loops.ts [--dry-run]
 *
 *   --dry-run   compute and report the breakdown, write nothing
 */

import { airtableEnabled } from "@/lib/loops/airtable";
import { collectAllContacts, syncAllToLoops } from "@/lib/loops/sync";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!dryRun && !airtableEnabled()) {
    console.error(
      "Airtable is not configured. Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID and AIRTABLE_TABLE_ID (or pass --dry-run).",
    );
    process.exit(1);
  }

  if (dryRun) {
    const { records, counts } = await collectAllContacts();
    console.log(
      `Contacts: ${counts.total} total — submitted=${counts.submitted}, started=${counts.started}, signedUp=${counts.signedUp} (${counts.waitlist} from waitlist)`,
    );
    console.log("\nSample (first 10):");
    for (const r of records.slice(0, 10)) {
      console.log(
        `  ${r.email}  created=${r.createdProjectAt ?? "-"}  submitted=${r.submittedProjectAt ?? "-"}`,
      );
    }
    console.log("\nDry run — nothing written.");
    process.exit(0);
  }

  const result = await syncAllToLoops();
  console.log(
    `Contacts: ${result.total} total — submitted=${result.submitted}, started=${result.started}, signedUp=${result.signedUp} (${result.waitlist} from waitlist)`,
  );
  console.log(
    `Done. created=${result.created} updated=${result.updated} skipped=${result.skipped}`,
  );
  process.exit(0);
}

void main();
