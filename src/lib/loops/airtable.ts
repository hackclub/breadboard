import "server-only";

/**
 * Airtable sync for the Breadboard program's Loops audience.
 *
 * Per Hack Club's Loops rules we NEVER touch Loops directly (no API, forms,
 * events, webhooks, or manual contact/property edits). Instead we write rows
 * into the program's Airtable table; Hack Club's internal tool syncs that table
 * into Loops and is the only thing that handles unsubscribes, the audit log,
 * and the Loops rate limit. Subscription to the Breadboard list happens
 * automatically via the table's "Loops List - Breadboard" formula field.
 *
 * Segmentation uses TIMESTAMP milestone fields (never booleans/enums), matching
 * the table's existing "Loops - breadboard<Milestone>At" convention:
 *   - Loops - breadboardSignUpAt          createdTime, auto-set when we add the row
 *   - Loops - breadboardCreatedProjectAt  set to the user's first project time
 *   - Loops - breadboardSubmittedProjectAt set to the user's first submission time
 * The three segments are then Loops filters on emptiness (see docs above the
 * milestone fields). We only ever set a milestone, never clear it.
 *
 * Names flow through the sanctioned "Loops - Special - setFullName" formula, so
 * we populate First Name / Last Name (plus the primary Name for the Airtable UI)
 * rather than pushing a name to Loops ourselves.
 *
 * When the Airtable env vars are unset (local dev, CI) every call is a no-op.
 */

// Column names — must match the Airtable table exactly. Per the Loops training,
// the program slug ("breadboard") must mirror the unified we-ship database; it
// already does via the existing SignUpAt field. The milestone suffixes follow
// the training's lowerCamelCase "...At" convention. Email is the upsert merge key.
const EMAIL_FIELD = "Email";
const NAME_FIELD = "Name";
const FIRST_NAME_FIELD = "First Name";
const LAST_NAME_FIELD = "Last Name";
const CREATED_PROJECT_FIELD = "Loops - breadboardCreatedProjectAt";
const SUBMITTED_PROJECT_FIELD = "Loops - breadboardSubmittedProjectAt";

export type ContactRecord = {
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  // ISO 8601 timestamps. Omit or null to leave a field untouched — we never
  // clear a milestone once it's set.
  createdProjectAt?: string | null;
  submittedProjectAt?: string | null;
};

const API_BASE = "https://api.airtable.com/v0";
// Airtable caps batch writes at 10 records/request and 5 requests/second per
// base. We stay under both.
const MAX_BATCH = 10;
const THROTTLE_MS = 250;

function config() {
  const apiKey = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  const tableId = process.env.AIRTABLE_TABLE_ID?.trim();
  if (!apiKey || !baseId || !tableId) return null;
  return { apiKey, baseId, tableId };
}

export function airtableEnabled() {
  return config() !== null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toFields(record: ContactRecord) {
  const fields: Record<string, string> = { [EMAIL_FIELD]: record.email };
  const name = record.name?.trim();
  if (name) fields[NAME_FIELD] = name;
  const first = record.firstName?.trim();
  if (first) fields[FIRST_NAME_FIELD] = first;
  const last = record.lastName?.trim();
  if (last) fields[LAST_NAME_FIELD] = last;
  // Only send a milestone when we have one, so a sync never clears a timestamp.
  if (record.createdProjectAt)
    fields[CREATED_PROJECT_FIELD] = record.createdProjectAt;
  if (record.submittedProjectAt) {
    fields[SUBMITTED_PROJECT_FIELD] = record.submittedProjectAt;
  }
  return { fields };
}

async function patchBatch(
  cfg: NonNullable<ReturnType<typeof config>>,
  batch: ContactRecord[],
) {
  const url = `${API_BASE}/${cfg.baseId}/${encodeURIComponent(cfg.tableId)}`;
  const body = JSON.stringify({
    performUpsert: { fieldsToMergeOn: [EMAIL_FIELD] },
    typecast: true,
    records: batch.map(toFields),
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        createdRecords?: unknown[];
        updatedRecords?: unknown[];
      } | null;
      return {
        created: json?.createdRecords?.length ?? 0,
        updated: json?.updatedRecords?.length ?? 0,
      };
    }
    // 429 = rate limited (Airtable applies a 30s lockout). Back off and retry.
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1) + 500);
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Airtable HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error("Airtable upsert failed after retries (rate limited)");
}

/**
 * Upsert contacts into the Airtable base, keyed on email. Throws on hard
 * failures (bad token, unknown field, persistent rate limiting) so the backfill
 * script can report them; the live hooks wrap this so a failure never breaks a
 * user action. When Airtable is unconfigured this is a no-op.
 */
export async function upsertContacts(records: ContactRecord[]) {
  const cfg = config();
  if (!cfg) return { created: 0, updated: 0, skipped: records.length };

  // Dedupe by lowercased email; the last record for an email wins. This also
  // folds a waitlist email and its later account row into a single contact.
  const byEmail = new Map<string, ContactRecord>();
  for (const record of records) {
    const email = record.email?.trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { ...record, email });
  }
  const deduped = [...byEmail.values()];

  let created = 0;
  let updated = 0;
  const batches = chunk(deduped, MAX_BATCH);
  for (let i = 0; i < batches.length; i++) {
    const res = await patchBatch(cfg, batches[i]);
    created += res.created;
    updated += res.updated;
    if (i < batches.length - 1) await sleep(THROTTLE_MS);
  }
  return { created, updated, skipped: records.length - deduped.length };
}
