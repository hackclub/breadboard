import "server-only";

/**
 * "What changed in the repo since the last ship" — ported from Hack Club's
 * fallout (app/services/review_repo_diff_service.rb + github_service.rb).
 *
 * Every design ship carries a GitHub repo link, so an update ship can be read
 * as a compare between two commits. The anchor is the HEAD SHA captured when
 * the previous ship was submitted; when that SHA is missing (ships that
 * pre-date capture) or was force-pushed out of the repo, it falls back to the
 * commit that was on the branch at the previous ship's submission time. The
 * fallback is approximate, and the summary says so, because a diff a reviewer
 * can't trust the boundaries of is worse than one labelled fuzzy.
 *
 * Computed once per ship and cached on project_submissions.repo_diff: it's a
 * near-submission snapshot, not a live view of the repo.
 */

import { GITHUB_HEADERS, parseGitHubRepoUrl } from "@/lib/github/contents";
import {
  GitHubReadError,
  type RepoDiffFailure,
  classifyGitHubResponse,
} from "@/lib/github/read-failure";

export type RepoDiffFile = {
  filename: string;
  status: string;
  /** Optional because summaries cached before these fields existed are read
      back from jsonb as-is; the card defaults them rather than re-fetching. */
  additions?: number;
  deletions?: number;
  /** GitHub's unified diff for this file, trimmed to MAX_PATCH_LINES. Empty
      when GitHub omits it, which it does for binary files and very large
      diffs. Optional because rows cached before this existed lack it. */
  patch?: string;
  patchTruncated?: boolean;
};

export type RepoDiffSummary = {
  commits: number;
  added: number;
  modified: number;
  removed: number;
  renamed: number;
  /** Total lines across every changed file. Optional: rows cached before this
      field existed won't have it. */
  addedLines?: number;
  removedLines?: number;
  files: RepoDiffFile[];
  /** "sha" = anchored on the exact commit the last ship was reviewed at.
      "date" = approximated from when the last ship was submitted. */
  basis: "sha" | "date";
  /** ISO timestamp of the previous ship, for the "since ..." label. */
  since: string | null;
  baseSha: string;
  headSha: string;
};

// Keep the whole card bounded: a student who commits node_modules once
// shouldn't push a 3000-entry array into a jsonb column and the review page.
const MAX_FILES = 300;
// Per-file patch cap, and a whole-summary ceiling so one ship can't write a
// multi-megabyte row. Files past the budget keep their counts, lose their patch.
const MAX_PATCH_LINES = 80;
const MAX_TOTAL_PATCH_CHARS = 200_000;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Hack Club's shared GitHub proxy (same one fallout uses) when its key is set,
 * otherwise GitHub directly. Direct and unauthenticated works but only gets 60
 * requests an hour per IP, which a busy review queue will exhaust — set
 * GH_PROXY_API_KEY or GITHUB_READ_TOKEN in production.
 */
function endpoint(path: string, params: Record<string, string> = {}) {
  const proxyKey = process.env.GH_PROXY_API_KEY?.trim();
  const token = process.env.GITHUB_READ_TOKEN?.trim();
  const base = proxyKey
    ? `https://gh-proxy.hackclub.com/gh/${path}`
    : `https://api.github.com/${path}`;
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return {
    url: url.toString(),
    headers: {
      ...GITHUB_HEADERS,
      ...(proxyKey ? { "X-API-Key": proxyKey } : {}),
      ...(!proxyKey && token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

/**
 * Why a diff couldn't be produced. "auth" and "rate_limit" are operator
 * problems — a token that expired or a missing credential — and the card says
 * so out loud, because the failure is otherwise invisible: diffs just quietly
 * stop appearing and reviewers assume nothing changed. The status-to-failure
 * policy lives in @/lib/github/read-failure so it can be tested on its own.
 */
export {
  GitHubReadError,
  type RepoDiffFailure,
} from "@/lib/github/read-failure";

/**
 * Returns parsed JSON, or null when the answer is a legitimate "no": a 404
 * means the base commit is gone (force-pushed) and the caller falls back to
 * the date anchor.
 *
 * Credential and quota problems throw instead. They apply to every subsequent
 * request too, so retrying the fallback chain would only burn more of a quota
 * that's already gone, and the reviewer needs to know the difference between
 * "nothing changed" and "we couldn't look".
 */
async function get<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  const { url, headers } = endpoint(path, params);
  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // DNS, TLS, timeout — transient, and worth retrying on the next view.
    throw new GitHubReadError("unreachable");
  }

  const outcome = classifyGitHubResponse(
    res.status,
    res.headers.get("x-ratelimit-remaining"),
  );
  if (outcome === "not_found") return null;
  if (outcome !== "ok") throw new GitHubReadError(outcome);

  try {
    return (await res.json()) as T;
  } catch {
    throw new GitHubReadError("unreachable");
  }
}

/** Tolerates the bare "github.com/owner/repo" a maker can paste by hand. */
export function repoFromUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseGitHubRepoUrl(
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
  );
}

async function defaultBranch(owner: string, repo: string) {
  const meta = await get<{ default_branch?: string }>(`repos/${owner}/${repo}`);
  return meta?.default_branch ?? "main";
}

/** Latest commit on the default branch, or null when GitHub can't be reached. */
export async function headCommitSha(
  owner: string,
  repo: string,
): Promise<string | null> {
  const branch = await defaultBranch(owner, repo);
  const commits = await get<Array<{ sha?: string }>>(
    `repos/${owner}/${repo}/commits`,
    { sha: branch, per_page: "1" },
  );
  return Array.isArray(commits) ? (commits[0]?.sha ?? null) : null;
}

/** Most recent commit at or before `until` — the date-based fallback anchor. */
async function commitShaAt(
  owner: string,
  repo: string,
  until: Date,
): Promise<string | null> {
  const branch = await defaultBranch(owner, repo);
  const commits = await get<Array<{ sha?: string }>>(
    `repos/${owner}/${repo}/commits`,
    { sha: branch, until: until.toISOString(), per_page: "1" },
  );
  return Array.isArray(commits) ? (commits[0]?.sha ?? null) : null;
}

type CompareResponse = {
  total_commits?: number;
  files?: Array<{
    filename?: string;
    status?: string;
    additions?: number;
    deletions?: number;
    patch?: string;
  }>;
};

function trimPatch(patch: string) {
  const lines = patch.split("\n");
  if (lines.length <= MAX_PATCH_LINES) {
    return { patch, patchTruncated: false };
  }
  return {
    patch: lines.slice(0, MAX_PATCH_LINES).join("\n"),
    patchTruncated: true,
  };
}

async function compare(
  owner: string,
  repo: string,
  base: string,
  head: string,
) {
  const data = await get<CompareResponse>(
    `repos/${owner}/${repo}/compare/${base}...${head}`,
  );
  if (!data) return null;

  // Patches are kept in order and stop once the whole-summary budget is spent,
  // so the files a reviewer reads first are the ones that keep their diff.
  let patchBudget = MAX_TOTAL_PATCH_CHARS;
  const files: RepoDiffFile[] = [];
  for (const file of data.files ?? []) {
    if (typeof file.filename !== "string") continue;
    const entry: RepoDiffFile = {
      filename: file.filename,
      status: file.status ?? "modified",
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    };
    if (typeof file.patch === "string" && patchBudget > 0) {
      const { patch, patchTruncated } = trimPatch(file.patch);
      if (patch.length <= patchBudget) {
        entry.patch = patch;
        entry.patchTruncated = patchTruncated;
        patchBudget -= patch.length;
      } else {
        patchBudget = 0;
      }
    }
    files.push(entry);
  }

  return { totalCommits: data.total_commits ?? 0, files };
}

export type RepoDiffAnchor = {
  /** Repo link recorded on the ship being reviewed. */
  codeUrl: string;
  /** HEAD SHA captured when the previous ship was submitted, if we have it. */
  baseSha: string;
  /** When the previous ship was submitted, for the date-based fallback. */
  since: Date | null;
  /** HEAD SHA captured when *this* ship was submitted. Present, it pins the
      far end of the diff to the ship itself rather than to whatever the maker
      has pushed since — the difference between "what this ship changed" and
      "what changed since the last one". */
  headSha?: string;
};

export type RepoDiffResult = {
  /** Null when there's nothing to compare, or when `failure` explains why. */
  summary: RepoDiffSummary | null;
  /** Set only when the lookup broke. Null summary + null failure just means
      there was nothing to diff (first ship, non-GitHub link). */
  failure: RepoDiffFailure | null;
};

/**
 * The summary for one ship. A null summary with a null failure means there was
 * genuinely nothing to compare; a non-null failure means we couldn't look, and
 * the caller is expected to say so rather than render an empty card.
 */
export async function repoDiffSinceLastShip(
  anchor: RepoDiffAnchor,
): Promise<RepoDiffResult> {
  const nothing: RepoDiffResult = { summary: null, failure: null };
  if (!anchor.baseSha && !anchor.since) return nothing;
  const parsed = repoFromUrl(anchor.codeUrl);
  if (!parsed) return nothing;
  const { owner, repo } = parsed;

  // Anchored on the previous ship's SHA when we have it; otherwise on the
  // commit that was on the branch when that ship was submitted. The same
  // fallback covers a SHA that was force-pushed out of the repo, which comes
  // back from the compare endpoint as a 404 (null).
  const attempt = async (head: string) => {
    const bySha = anchor.baseSha
      ? await compare(owner, repo, anchor.baseSha, head)
      : null;
    if (bySha) {
      return { basis: "sha" as const, base: anchor.baseSha, head, ...bySha };
    }
    if (!anchor.since) return null;
    const base = await commitShaAt(owner, repo, anchor.since);
    if (!base) return null;
    const byDate = await compare(owner, repo, base, head);
    return byDate ? { basis: "date" as const, base, head, ...byDate } : null;
  };

  let result: Awaited<ReturnType<typeof attempt>> = null;
  try {
    if (anchor.headSha) result = await attempt(anchor.headSha);
    if (!result) {
      // Either nothing was captured for this ship, or what was captured is
      // gone from the repo now. Live HEAD still tells the reviewer something.
      const live = await headCommitSha(owner, repo);
      if (!live) return nothing;
      result = await attempt(live);
    }
  } catch (err) {
    if (err instanceof GitHubReadError) {
      return { summary: null, failure: err.failure };
    }
    throw err;
  }
  if (!result) return nothing;

  const count = (...statuses: string[]) =>
    result.files.filter((file) => statuses.includes(file.status)).length;

  const sum = (pick: (file: RepoDiffFile) => number) =>
    result.files.reduce((total, file) => total + pick(file), 0);

  return {
    summary: {
      commits: result.totalCommits,
      added: count("added"),
      modified: count("modified", "changed"),
      removed: count("removed"),
      renamed: count("renamed"),
      addedLines: sum((file) => file.additions ?? 0),
      removedLines: sum((file) => file.deletions ?? 0),
      files: result.files.slice(0, MAX_FILES),
      basis: result.basis,
      since: anchor.since?.toISOString() ?? null,
      baseSha: result.base,
      headSha: result.head,
    },
    failure: null,
  };
}
