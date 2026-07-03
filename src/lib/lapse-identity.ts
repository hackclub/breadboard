import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";
import { lapseProgramKeyConfigured, queryLapseUserByEmail } from "@/lib/lapse";

export async function storeLapseIdentity(
  userId: string,
  identity: { id: string; handle: string },
) {
  await db
    .update(user)
    .set({
      lapseUserId: identity.id,
      lapseHandle: identity.handle,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

// Resolves (and caches) the user's Lapse account for program-key reads: stored
// id first, then an email auto-match persisted for next time. Server-only —
// callers must pass the *session* user, never client input.
export async function resolveLapseUserId(sessionUser: {
  id: string;
  email: string;
}): Promise<string | null> {
  const [account] = await db
    .select({ lapseUserId: user.lapseUserId })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);
  if (account?.lapseUserId) return account.lapseUserId;
  if (!lapseProgramKeyConfigured()) return null;
  const matched = await queryLapseUserByEmail(sessionUser.email);
  if (!matched) return null;
  await storeLapseIdentity(sessionUser.id, matched);
  return matched.id;
}
