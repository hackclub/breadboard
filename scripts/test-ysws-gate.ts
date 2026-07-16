/**
 * Smoke test for the YSWS eligibility gate (eligible OR under-19 OR
 * admin exemption). Exercises the real assertHackClubYswsEligible against the
 * local DB using a throwaway user whose Hack Club claims come from a forged
 * (unsigned) id_token payload, which is exactly what getHackClubClaims decodes.
 * No accessToken is set, so nothing talks to auth.hackclub.com.
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/test-ysws-gate.ts
 */

import { eq } from "drizzle-orm";
import { assertHackClubYswsEligible, isUnder19 } from "@/lib/auth/hackclub";
import { db, pool } from "@/lib/db/db";
import { account, user } from "@/lib/db/schema";

const USER_ID = "test-ysws-gate-user";
const ACCOUNT_ID = "test-ysws-gate-account";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`${mark}  ${name}${detail ? ` (${detail})` : ""}`);
}

function forgeIdToken(claims: Record<string, unknown>) {
  const b64 = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

async function setClaims(claims: Record<string, unknown> | null) {
  await db.delete(account).where(eq(account.id, ACCOUNT_ID));
  if (claims) {
    await db.insert(account).values({
      id: ACCOUNT_ID,
      accountId: USER_ID,
      providerId: "hackclub",
      userId: USER_ID,
      idToken: forgeIdToken(claims),
    });
  }
}

async function gateResult() {
  try {
    await assertHackClubYswsEligible(USER_ID);
    return "allowed";
  } catch {
    return "blocked";
  }
}

async function cachedEligible() {
  const [row] = await db
    .select({ yswsEligible: user.yswsEligible })
    .from(user)
    .where(eq(user.id, USER_ID))
    .limit(1);
  return row?.yswsEligible;
}

async function main() {
  const year = new Date().getFullYear();

  // Pure isUnder19 cases.
  check("isUnder19: 10-year-old", isUnder19(`${year - 10}-01-01`) === true);
  check("isUnder19: 30-year-old", isUnder19(`${year - 30}-01-01`) === false);
  check("isUnder19: missing birthdate", isUnder19("") === false);
  check("isUnder19: garbage birthdate", isUnder19("not-a-date") === false);
  check(
    "isUnder19: 19th birthday today counts as 19",
    isUnder19("2000-06-15", new Date(Date.UTC(2019, 5, 15))) === false,
  );
  check(
    "isUnder19: day before 19th birthday is under 19",
    isUnder19("2000-06-15", new Date(Date.UTC(2019, 5, 14))) === true,
  );

  // DB-backed gate cases.
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.insert(user).values({
    id: USER_ID,
    name: "YSWS Gate Test",
    email: "test-ysws-gate@example.com",
  });

  await setClaims(null);
  check(
    "no claims, no exemption -> blocked",
    (await gateResult()) === "blocked",
  );

  await db.update(user).set({ yswsExempt: true }).where(eq(user.id, USER_ID));
  check(
    "no claims, admin exemption -> allowed",
    (await gateResult()) === "allowed",
  );
  await db.update(user).set({ yswsExempt: false }).where(eq(user.id, USER_ID));

  await setClaims({ ysws_eligible: false, birthdate: `${year - 15}-01-01` });
  check(
    "not eligible but under 19 -> allowed",
    (await gateResult()) === "allowed",
  );
  check("under-19 pass leaves cache false", (await cachedEligible()) === false);

  await setClaims({ ysws_eligible: true, birthdate: "1990-01-01" });
  check("eligible and over 19 -> allowed", (await gateResult()) === "allowed");
  check("eligible pass sets cache true", (await cachedEligible()) === true);

  await setClaims({ ysws_eligible: false, birthdate: "1990-01-01" });
  check(
    "not eligible and over 19 -> blocked",
    (await gateResult()) === "blocked",
  );
  check("revoked eligibility resets cache", (await cachedEligible()) === false);

  await setClaims({ ysws_eligible: true });
  check(
    "eligible with no birthdate -> allowed",
    (await gateResult()) === "allowed",
  );

  // Cleanup (account cascades with the user).
  await db.delete(user).where(eq(user.id, USER_ID));

  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`,
  );
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.delete(user).where(eq(user.id, USER_ID));
  await pool.end();
  process.exit(1);
});
