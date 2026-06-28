import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { account } from "@/lib/db/schema";

export type HackClubClaims = {
  given_name?: string;
  family_name?: string;
  name?: string;
  email?: string;
  ysws_eligible?: boolean;
  verification_status?: string;
  birthdate?: string;
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

export async function assertHackClubYswsEligible(userId: string) {
  const claims = await getHackClubClaims(userId);
  if (claims.ysws_eligible !== true) {
    throw new Error("You must be YSWS eligible to use Breadboard.");
  }
  return claims;
}

export function countryFromHackClubClaims(claims: HackClubClaims) {
  return String(claims.address?.country ?? "").trim();
}
