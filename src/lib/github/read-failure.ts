/**
 * How to read a GitHub response status, kept apart from the fetching so it can
 * be unit tested without a network or Next's module graph (@/lib/github/repo-diff
 * is server-only; this is deliberately plain).
 *
 * The distinction that matters: a 404 is a legitimate answer — the base commit
 * was force-pushed away and the caller should fall back to its date anchor —
 * whereas a credential or quota problem affects every request that follows and
 * has to reach a human. Collapsing the two is what makes an expired token look
 * like "this ship changed nothing".
 */

export type RepoDiffFailure = "auth" | "rate_limit" | "unreachable";

export type GitHubReadOutcome = "ok" | "not_found" | RepoDiffFailure;

export class GitHubReadError extends Error {
  constructor(readonly failure: RepoDiffFailure) {
    super(`GitHub read failed: ${failure}`);
    this.name = "GitHubReadError";
  }
}

/**
 * `rateLimitRemaining` is the x-ratelimit-remaining header, which is the only
 * thing separating GitHub's two meanings for 403: "your quota is gone" and
 * "this credential may not do that".
 */
export function classifyGitHubResponse(
  status: number,
  rateLimitRemaining: string | null,
): GitHubReadOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 403) {
    return rateLimitRemaining === "0" ? "rate_limit" : "auth";
  }
  if (status === 404) return "not_found";
  return "unreachable";
}
