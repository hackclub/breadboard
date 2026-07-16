/**
 * Fills the address columns in the Loops audience Airtable (Address Line 1/2,
 * City, State, ZIP, Country, which feed the "Loops - Special - setFullAddress"
 * formula) from Hack Club Auth. For every account with a linked HCA login we
 * read the verified address from the stored tokens (the id_token payload, plus
 * a live oauth/userinfo call while the access token still works) and upsert it
 * into the contact's row, keyed on email. Rows stay untouched when HCA has no
 * address (unverified users, waitlist emails with no account), and the upsert
 * only ever sends non-empty fields, so nothing gets blanked.
 *
 * Runs against whatever DATABASE_URL is set; the stored HCA tokens live in
 * prod, so point it there (same as backfill-loops). Needs AIRTABLE_API_KEY,
 * AIRTABLE_BASE_ID and AIRTABLE_TABLE_ID unless --dry-run. Imports app modules
 * that use Next's "server-only" marker, so run it with the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-addresses.ts [--dry-run]
 *
 *   --dry-run   look everything up and report coverage, write nothing
 */

import { and, eq } from "drizzle-orm";
import { getHackClubClaims } from "@/lib/auth/hackclub";
import { db } from "@/lib/db/db";
import { account, user } from "@/lib/db/schema";
import {
  type ContactRecord,
  airtableEnabled,
  upsertContacts,
} from "@/lib/loops/airtable";

const dryRun = process.argv.includes("--dry-run");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!dryRun && !airtableEnabled()) {
    console.error(
      "Airtable is not configured. Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID and AIRTABLE_TABLE_ID (or pass --dry-run).",
    );
    process.exit(1);
  }

  const users = await db
    .selectDistinct({ id: user.id, email: user.email })
    .from(user)
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "hackclub")),
    );
  console.log(`${users.length} accounts with a Hack Club Auth login.`);

  const records: ContactRecord[] = [];
  let noAddress = 0;
  let failed = 0;
  for (const u of users) {
    const email = u.email?.trim().toLowerCase();
    if (!email) continue;
    try {
      const address = (await getHackClubClaims(u.id)).address ?? {};
      const record: ContactRecord = {
        email,
        addressLine1: String(address.street_address ?? "").trim(),
        city: String(address.locality ?? "").trim(),
        state: String(address.region ?? "").trim(),
        zip: String(address.postal_code ?? "").trim(),
        country: String(address.country ?? "").trim(),
      };
      if (
        record.addressLine1 ||
        record.city ||
        record.state ||
        record.zip ||
        record.country
      ) {
        records.push(record);
      } else {
        noAddress++;
      }
    } catch (error) {
      failed++;
      console.error(
        `  claims lookup failed for ${email}:`,
        error instanceof Error ? error.message : error,
      );
    }
    // Pace the userinfo calls a bit; there is no hurry.
    await sleep(150);
  }

  console.log(
    `Addresses found for ${records.length} of ${users.length} accounts (${noAddress} have none on HCA, ${failed} lookups failed).`,
  );

  if (dryRun) {
    console.log("\nSample (first 10, street lines withheld):");
    for (const r of records.slice(0, 10)) {
      console.log(`  ${r.email}  ${r.city}, ${r.state} ${r.zip}, ${r.country}`);
    }
    console.log("\nDry run — nothing written.");
    process.exit(0);
  }

  const result = await upsertContacts(records);
  console.log(
    `Done. created=${result.created} updated=${result.updated} skipped=${result.skipped}`,
  );
  process.exit(0);
}

void main();
