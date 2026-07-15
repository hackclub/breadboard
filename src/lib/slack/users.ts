import "server-only";

/**
 * Resolve a Hack Clubber's Slack user ID from their email.
 *
 * Hack Club Auth only hands us slack_id when the user logs in (and grants the
 * scope), so this fills the gap for accounts that don't have one yet. Needs a
 * token with `users:read.email`. Prefers SLACK_USER_TOKEN (a personal user
 * token, `xoxp-`) when set, so you can do lookups without adding the scope to
 * the shared Tookle bot; otherwise falls back to the bot token. Returns null
 * when no token is set, the scope is missing, or no member has that email,
 * callers treat null as "leave it blank," so it degrades quietly.
 */
export async function lookupSlackIdByEmail(
  email: string,
): Promise<string | null> {
  const token =
    process.env.SLACK_USER_TOKEN?.trim() || process.env.SLACK_BOT_TOKEN?.trim();
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
