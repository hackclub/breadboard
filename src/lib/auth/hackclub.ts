import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { account, user } from "@/lib/db/schema";

export type HackClubClaims = {
  given_name?: string;
  family_name?: string;
  name?: string;
  email?: string;
  ysws_eligible?: boolean;
  verification_status?: string;
  birthdate?: string;
  slack_id?: string;
  address?: {
    street_address?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
};

export async function getHackClubClaims(userId: string) {
  const [row] = await db
    .select({ accessToken: account.accessToken, idToken: account.idToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "hackclub")))
    .limit(1);
  const claims: HackClubClaims = {};

  if (row?.idToken) {
    const payload = row.idToken.split(".")[1];
    if (payload) {
      Object.assign(
        claims,
        JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
      );
    }
  }

  if (row?.accessToken) {
    const res = await fetch("https://auth.hackclub.com/oauth/userinfo", {
      headers: { Authorization: `Bearer ${row.accessToken}` },
      cache: "no-store",
    });
    if (res.ok) Object.assign(claims, await res.json());
  }

  return claims;
}

// The user's Slack id, backfilled from stored Hack Club auth tokens when the
// sign-in-time write missed it (e.g. first-login race). No re-auth needed.
export async function ensureSlackId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ slackId: user.slackId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (row?.slackId) return row.slackId;

  const claims = await getHackClubClaims(userId);
  const slackId = String(claims.slack_id ?? "").trim();
  if (!slackId) return null;
  await db
    .update(user)
    .set({ slackId, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return slackId;
}

// The OIDC birthdate claim is "YYYY-MM-DD". Under 19 is the YSWS age bar; a
// missing or malformed birthdate counts as not under 19, so it can't be used
// to slip past the gate by withholding the claim.
export function isUnder19(
  birthdate: string | null | undefined,
  now = new Date(),
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthdate ?? "").trim());
  if (!match) return false;
  const nineteenth = new Date(
    Date.UTC(Number(match[1]) + 19, Number(match[2]) - 1, Number(match[3])),
  );
  return !Number.isNaN(nineteenth.getTime()) && now < nineteenth;
}

/**
 * Re-check the ysws_eligible claim against Hack Club Auth and keep the cached
 * user.yswsEligible flag in sync. Fulfillment pages call this to decide
 * whether a not-yet-eligible note is still warranted.
 */
export async function refreshYswsEligible(userId: string) {
  const claims = await getHackClubClaims(userId);
  const eligible = claims.ysws_eligible === true;
  await db
    .update(user)
    .set({ yswsEligible: eligible, updatedAt: new Date() })
    .where(and(eq(user.id, userId), ne(user.yswsEligible, eligible)));
  return { claims, eligible };
}

/**
 * Submission gate. YSWS-eligible users pass outright. Teens whose identity
 * verification hasn't cleared yet may still submit as long as their birthdate
 * says they're under 19; fulfillment pages flag their kits until the eligible
 * claim shows up. Admins can also exempt a user by hand (user.yswsExempt).
 */
export async function assertHackClubYswsEligible(userId: string) {
  const { claims, eligible } = await refreshYswsEligible(userId);
  if (eligible) return claims;
  if (isUnder19(claims.birthdate)) return claims;
  const [row] = await db
    .select({ yswsExempt: user.yswsExempt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (row?.yswsExempt) return claims;
  throw new Error(
    "You must be YSWS eligible (or under 19) to submit. Verify your identity at auth.hackclub.com.",
  );
}

/**
 * Whether a maker's ships should be held out of the review queue: no
 * ysws_eligible claim and no admin exemption.
 *
 * The two carve-outs that let someone submit without the claim are treated
 * differently here. An exemption is an admin saying "handle this one anyway",
 * so those ships stay reviewable. An under-19 teen whose identity verification
 * hasn't cleared yet has nothing a reviewer can finish: approving them pays out
 * bread and files the ship in the Unified YSWS Database under an identity Hack
 * Club hasn't confirmed. They can still submit, and their ship waits.
 */
export function yswsReviewHold(row: {
  yswsEligible: boolean;
  yswsExempt: boolean;
}) {
  return !row.yswsEligible && !row.yswsExempt;
}

/**
 * The server-side half of that hold. The queue hides held ships, but a stale
 * tab or a typed /platform/admin/review/<id> URL still reaches the actions, so
 * every path that approves or pays checks here as well.
 *
 * The cached flag lags behind a maker who verified since their last sign-in, so
 * a hold is confirmed against Hack Club Auth before a reviewer is turned away.
 * That refresh also writes the flag through, which un-hides the card.
 */
export async function assertMakerYswsEligible(makerId: string) {
  const [row] = await db
    .select({ yswsEligible: user.yswsEligible, yswsExempt: user.yswsExempt })
    .from(user)
    .where(eq(user.id, makerId))
    .limit(1);
  if (!row) throw new Error("This project has no owner on file.");
  if (!yswsReviewHold(row)) return;
  if ((await refreshYswsEligible(makerId)).eligible) return;
  throw new Error(
    'This maker is not YSWS eligible yet, so their ship cannot be approved or paid. It sits in the queue\'s "waiting on verification" filter until they verify at auth.hackclub.com, or until an admin marks them YSWS exempt.',
  );
}

export function countryFromHackClubClaims(claims: HackClubClaims) {
  return String(claims.address?.country ?? "").trim();
}
