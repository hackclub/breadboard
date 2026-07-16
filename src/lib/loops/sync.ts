import "server-only";

import { eq, isNull, min } from "drizzle-orm";
import { db } from "@/lib/db/db";
import {
  emailSignups,
  projectSubmissions,
  projects,
  user,
} from "@/lib/db/schema";
import { getHackClubClaims } from "@/lib/auth/hackclub";
import {
  type ContactRecord,
  airtableEnabled,
  upsertContacts,
} from "@/lib/loops/airtable";
import { lookupSlackIdByEmail } from "@/lib/slack/users";

// user.name is a single full-name field; the sanctioned Loops name path wants
// First Name / Last Name (which feed the setFullName formula). Split on the
// first space — imperfect for multi-part names, but the internal tool only
// upgrades Loops names, never downgrades good data.
function splitName(name: string | null | undefined) {
  const clean = (name ?? "").trim();
  if (!clean) return { firstName: null, lastName: null };
  const space = clean.indexOf(" ");
  if (space === -1) return { firstName: clean, lastName: null };
  return {
    firstName: clean.slice(0, space),
    lastName: clean.slice(space + 1).trim() || null,
  };
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * A user's milestone timestamps, from the earliest project / submission they
 * have. These are what Loops segments on (see airtable.ts). SignUpAt is not
 * here — it's a createdTime field Airtable fills in when we first add the row.
 */
export async function computeMilestonesForUser(userId: string) {
  const [created] = await db
    .select({ at: min(projects.createdAt) })
    .from(projects)
    .where(eq(projects.userId, userId));
  const [submitted] = await db
    .select({ at: min(projectSubmissions.submittedAt) })
    .from(projectSubmissions)
    .where(eq(projectSubmissions.userId, userId));
  return {
    createdProjectAt: iso(created?.at ?? null),
    submittedProjectAt: iso(submitted?.at ?? null),
  };
}

// Hack Club Auth only provides slack_id at login. When it's missing, fall back
// to a Slack lookup by email and cache it on the user so the whole app benefits
// and we never look the same person up twice.
async function resolveAndPersistSlackId(userId: string, email: string) {
  const found = await lookupSlackIdByEmail(email);
  if (!found) return null;
  await db.update(user).set({ slackId: found }).where(eq(user.id, userId));
  return found;
}

// The verified address from the user's stored Hack Club Auth tokens, shaped
// for ContactRecord. Empty (so the upsert sends nothing) when the user hasn't
// linked HCA yet — on the very first sign-in the account row may not exist at
// user-create time, in which case the next sync event picks the address up.
// Errors also resolve empty: no address must never block a Loops sync.
async function addressFromHackClub(
  userId: string,
): Promise<Partial<ContactRecord>> {
  try {
    const address = (await getHackClubClaims(userId)).address ?? {};
    return {
      addressLine1: address.street_address,
      city: address.locality,
      state: address.region,
      zip: address.postal_code,
      country: address.country,
    };
  } catch {
    return {};
  }
}

async function upsertSafely(records: ContactRecord[]) {
  if (!airtableEnabled() || records.length === 0) return;
  try {
    await upsertContacts(records);
  } catch (error) {
    console.error(
      "[loops] Airtable upsert failed",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Push one user's row to Airtable: email, name, and their current milestone
 * timestamps. Best-effort — never throws, so it's safe to drop into signup /
 * project-create / submission flows. Milestones are recomputed from the DB, so
 * the call is correct no matter which event triggered it and is idempotent.
 */
export async function syncUserToLoops(userId: string) {
  if (!airtableEnabled()) return;
  try {
    const [row] = await db
      .select({ email: user.email, name: user.name, slackId: user.slackId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!row?.email) return;
    const slackId =
      row.slackId ?? (await resolveAndPersistSlackId(userId, row.email));
    const milestones = await computeMilestonesForUser(userId);
    const address = await addressFromHackClub(userId);
    const { firstName, lastName } = splitName(row.name);
    await upsertSafely([
      {
        email: row.email,
        name: row.name,
        slackId,
        firstName,
        lastName,
        ...milestones,
        ...address,
      },
    ]);
  } catch (error) {
    console.error(
      "[loops] syncUserToLoops failed",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Add a waitlist email (someone who gave an email but has no account) as a row.
 * SignUpAt is auto-set by Airtable's createdTime; no milestones. If that email
 * later becomes an account, the account sync upserts the same row by email.
 */
export async function syncWaitlistEmailToLoops(email: string) {
  await upsertSafely([{ email }]);
}

export type SyncCounts = {
  total: number;
  submitted: number;
  started: number;
  signedUp: number;
  waitlist: number;
};

/**
 * Build the full contact list from the database: every user with their earliest
 * milestone timestamps, plus every waitlist email not already an account. This
 * is what the backfill script and the /api/loops/sync endpoint push to Airtable.
 */
export async function collectAllContacts(): Promise<{
  records: ContactRecord[];
  counts: SyncCounts;
}> {
  const users = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      slackId: user.slackId,
    })
    .from(user);
  const createdRows = await db
    .select({ userId: projects.userId, at: min(projects.createdAt) })
    .from(projects)
    .groupBy(projects.userId);
  const submittedRows = await db
    .select({
      userId: projectSubmissions.userId,
      at: min(projectSubmissions.submittedAt),
    })
    .from(projectSubmissions)
    .groupBy(projectSubmissions.userId);
  const createdMap = new Map(createdRows.map((r) => [r.userId, r.at]));
  const submittedMap = new Map(submittedRows.map((r) => [r.userId, r.at]));

  const records: ContactRecord[] = [];
  const seen = new Set<string>();
  const counts: SyncCounts = {
    total: 0,
    submitted: 0,
    started: 0,
    signedUp: 0,
    waitlist: 0,
  };

  for (const u of users) {
    const email = u.email?.trim().toLowerCase();
    if (!email) continue;
    const createdProjectAt = iso(createdMap.get(u.id) ?? null);
    const submittedProjectAt = iso(submittedMap.get(u.id) ?? null);
    if (submittedProjectAt) counts.submitted++;
    else if (createdProjectAt) counts.started++;
    else counts.signedUp++;
    const { firstName, lastName } = splitName(u.name);
    seen.add(email);
    records.push({
      email,
      name: u.name,
      slackId: u.slackId,
      firstName,
      lastName,
      createdProjectAt,
      submittedProjectAt,
    });
  }

  // Waitlist emails that never became an account: just a row (SignUpAt auto).
  const waitlist = await db
    .select({ email: emailSignups.email })
    .from(emailSignups);
  for (const w of waitlist) {
    const email = w.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    counts.signedUp++;
    counts.waitlist++;
    records.push({ email });
  }

  counts.total = records.length;
  return { records, counts };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fill user.slackId for up to `budget` accounts that don't have one, by looking
 * each up in Slack by email and caching the result. Keep `budget` small so the
 * whole thing finishes well inside a request; repeated runs chip away at any
 * remainder. No-op when Slack isn't configured.
 *
 * `throttleMs` spaces out the lookups. The endpoint leaves it at 0 (its batches
 * are small enough to ride Slack's burst allowance), but big backfill runs need
 * ~1250ms to stay under users.lookupByEmail's Tier 3 limit — rate-limited
 * lookups fail silently and would leave gaps.
 */
async function enrichMissingSlackIds(budget: number, throttleMs = 0) {
  const slackConfigured =
    process.env.SLACK_USER_TOKEN?.trim() || process.env.SLACK_BOT_TOKEN?.trim();
  if (!slackConfigured || budget <= 0) {
    return { filled: 0, remaining: 0 };
  }
  const missing = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(isNull(user.slackId));
  const batch = missing.slice(0, budget);
  let filled = 0;
  for (const u of batch) {
    if (!u.email) continue;
    const found = await lookupSlackIdByEmail(u.email);
    if (found) {
      await db.update(user).set({ slackId: found }).where(eq(user.id, u.id));
      filled++;
    }
    if (throttleMs > 0) await sleep(throttleMs);
  }
  return { filled, remaining: Math.max(0, missing.length - batch.length) };
}

/**
 * Reconcile the whole audience to Airtable. Idempotent (upsert by email). The
 * Loops upsert runs first so it always completes; a small batch of missing
 * Slack IDs is resolved afterward (see enrichMissingSlackIds).
 */
export async function syncAllToLoops(options?: {
  slackLookupBudget?: number;
  slackLookupThrottleMs?: number;
}) {
  const { records, counts } = await collectAllContacts();
  const { created, updated, skipped } = await upsertContacts(records);
  const slack = await enrichMissingSlackIds(
    options?.slackLookupBudget ?? 25,
    options?.slackLookupThrottleMs ?? 0,
  );
  return {
    ...counts,
    created,
    updated,
    skipped,
    slackFilled: slack.filled,
    slackRemaining: slack.remaining,
  };
}
