import "server-only";

/**
 * Resolve a Hack Clubber's Slack user ID from their email.
 *
 * Hack Club Auth only hands us slack_id at login, so this fills the gap for
 * accounts that don't have one yet. Uses, in order of preference:
 *   - SLACK_USER_TOKEN — a user token (`xoxp-`) or a browser session token
 *     (`xoxc-`). For an `xoxc-` token, also set SLACK_USER_COOKIE to the
 *     matching `xoxd-` cookie value; it's sent as the `d` cookie (Slack only
 *     accepts an xoxc token alongside its cookie). Session tokens rotate and are
 *     a full-account credential, so use them for a one-off backfill and then
 *     remove them; don't leave them in prod.
 *   - SLACK_BOT_TOKEN — the Tookle bot (`xoxb-`); needs the users:read.email scope.
 *
 * Returns null when no token is set, the scope/session is invalid, or no member
 * has that email — callers treat null as "leave it blank," so it degrades quietly.
 */
export async function lookupSlackIdByEmail(
  email: string,
): Promise<string | null> {
  const token =
    process.env.SLACK_USER_TOKEN?.trim() || process.env.SLACK_BOT_TOKEN?.trim();
  if (!token || !email) return null;
  const cookie = process.env.SLACK_USER_COOKIE?.trim();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    };
    // An xoxc web-client token is only valid alongside its `d` (xoxd) cookie.
    if (cookie) headers.Cookie = `d=${encodeURIComponent(cookie)}`;
    const res = await fetch("https://slack.com/api/users.lookupByEmail", {
      method: "POST",
      headers,
      body: `token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      user?: { id?: string };
    } | null;

    if (json?.ok && json.user?.id) return json.user.id;
    // "users_not_found" is the normal "not in the workspace" case; stay quiet.
    // Anything else (missing_scope, invalid_auth, not_authed) is worth logging.
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
