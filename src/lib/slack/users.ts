import "server-only";

/**
 * Resolve a Hack Clubber's Slack user ID from their email via the Tookle bot.
 *
 * Hack Club Auth only hands us slack_id when the user logs in (and grants the
 * scope), so this fills the gap for accounts that don't have one yet. Needs the
 * bot's `users:read.email` scope. Returns null when Slack is unconfigured, the
 * scope is missing, or no workspace member has that email, callers treat null
 * as "leave it blank," so a missing scope degrades quietly.
 */
export async function lookupSlackIdByEmail(
  email: string,
): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token || !email) return null;

  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      user?: { id?: string };
    } | null;

    if (json?.ok && json.user?.id) return json.user.id;
    // "users_not_found" is the normal "not in the workspace" case; stay quiet.
    // Anything else (e.g. missing_scope, invalid_auth) is worth surfacing.
    if (json?.error && json.error !== "users_not_found") {
      console.error(`[slack] users.lookupByEmail: ${json.error}`);
    }
    return null;
  } catch (error) {
    console.error(
      "[slack] users.lookupByEmail failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
