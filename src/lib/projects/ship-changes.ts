import "server-only";

/**
 * "What changed in this ship" for the review workspace.
 *
 * Two halves, both anchored on the previous ship of the same project:
 *   - the editor diff, read from the payloads frozen at each ship
 *     (@/lib/projects/ship-diff) — parts, wires and firmware files;
 *   - the repo diff, a GitHub compare between the two ships' commits
 *     (@/lib/github/repo-diff, ported from fallout).
 *
 * The repo half costs GitHub round-trips, so it's computed once and cached on
 * the submission row. That makes it a snapshot near the ship, not a live view:
 * pushes after the first reviewer opens the page won't appear.
 */

import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/db";
import {
  projectEditorVersions,
  projectSubmissions,
  projects,
} from "@/lib/db/schema";
import {
  GitHubReadError,
  type RepoDiffFailure,
  type RepoDiffSummary,
  headCommitSha,
  repoDiffSinceLastShip,
  repoFromUrl,
} from "@/lib/github/repo-diff";
import {
  type ShipEditorDiff,
  diffShipPayloads,
} from "@/lib/projects/ship-diff";
import { audit } from "@/lib/audit";

export type ShipChanges = {
  /** The ship being reviewed. */
  submissionNumber: number;
  /** The ship this one is compared against, null on a first ship. */
  previous: { submissionNumber: number; submittedAt: string | null } | null;
  /** Null when either ship has no frozen editor version (manual submissions). */
  editor: ShipEditorDiff | null;
  /** Null when there's no GitHub repo to compare, or the lookup failed. */
  repo: RepoDiffSummary | null;
  /** Why the repo half is missing, when it's our fault rather than nothing to
      show. The card renders this loudly — an expired token that only made
      diffs quietly stop appearing would read as "they changed nothing". */
  repoError: RepoDiffFailure | null;
  repoUrl: string;
};

/**
 * A credential or quota problem stops every repo diff at once and only an
 * operator can fix it, so it goes to the pod log (grep GITHUB_READ) and to the
 * admin audit trail rather than being swallowed.
 */
async function reportRepoFailure(
  failure: RepoDiffFailure,
  context: Record<string, unknown>,
) {
  if (failure === "unreachable") return; // transient, retries on next view
  console.error(
    `[GITHUB_READ] ${failure}: repo diffs are failing. ` +
      (failure === "auth"
        ? "GITHUB_READ_TOKEN or GH_PROXY_API_KEY is missing, expired, or revoked."
        : "The hourly quota is exhausted; an unauthenticated app only gets 60/hour."),
    context,
  );
  try {
    await audit(
      "github.repo_diff.failure",
      "project",
      String(context.projectId),
      {
        failure,
        ...context,
      },
    );
  } catch {
    // Auditing needs a session and must never be what breaks a review page.
  }
}

/**
 * Records the repo's HEAD when a ship is submitted, so the next ship can diff
 * against the exact commit rather than guessing from a timestamp. Never
 * throws: a missed capture degrades the next diff to date-anchored, which is
 * not worth failing a submission over — but it does say so in the log, so a
 * dead credential doesn't rot every future diff in silence.
 */
export async function captureShipRepoSha(
  submissionId: number,
  codeUrl: string,
) {
  try {
    const parsed = repoFromUrl(codeUrl);
    if (!parsed) return;
    const sha = await headCommitSha(parsed.owner, parsed.repo);
    if (!sha) return;
    await db
      .update(projectSubmissions)
      .set({ repoCommitSha: sha })
      .where(eq(projectSubmissions.id, submissionId));
  } catch (err) {
    if (err instanceof GitHubReadError && err.failure !== "unreachable") {
      console.error(
        `[GITHUB_READ] ${err.failure}: couldn't capture the ship commit for ` +
          `submission ${submissionId}. The next ship's diff will fall back to ` +
          `its submission timestamp.`,
      );
      return;
    }
    // Anything else is best effort by design — see above.
  }
}

/** Both diffs for a project's most recent materials ship. */
export async function shipChangesForProject(
  projectId: number,
): Promise<ShipChanges | null> {
  const [current] = await db
    .select({
      id: projectSubmissions.id,
      submissionNumber: projectSubmissions.submissionNumber,
      editorVersionNumber: projectSubmissions.editorVersionNumber,
      codeUrl: projectSubmissions.codeUrl,
      repoCommitSha: projectSubmissions.repoCommitSha,
      repoDiff: projectSubmissions.repoDiff,
      projectCodeUrl: projects.codeUrl,
    })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projectSubmissions.projectId, projects.id))
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, "materials"),
      ),
    )
    .orderBy(desc(projectSubmissions.submittedAt))
    .limit(1);
  if (!current) return null;

  const repoUrl = current.codeUrl || current.projectCodeUrl || "";

  const [previous] = await db
    .select({
      submissionNumber: projectSubmissions.submissionNumber,
      editorVersionNumber: projectSubmissions.editorVersionNumber,
      repoCommitSha: projectSubmissions.repoCommitSha,
      submittedAt: projectSubmissions.submittedAt,
    })
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, "materials"),
        lt(projectSubmissions.submissionNumber, current.submissionNumber),
      ),
    )
    .orderBy(desc(projectSubmissions.submissionNumber))
    .limit(1);

  const base: ShipChanges = {
    submissionNumber: current.submissionNumber,
    previous: null,
    editor: null,
    repo: null,
    repoError: null,
    repoUrl,
  };
  if (!previous) return base;

  base.previous = {
    submissionNumber: previous.submissionNumber,
    submittedAt: previous.submittedAt?.toISOString() ?? null,
  };

  // --- editor half ---
  if (
    current.editorVersionNumber !== null &&
    previous.editorVersionNumber !== null
  ) {
    // Two rows by number, never the whole history: a version payload runs to
    // 5MB and a long-lived project has dozens of them.
    const versions = await db
      .select({
        versionNumber: projectEditorVersions.versionNumber,
        editorData: projectEditorVersions.editorData,
      })
      .from(projectEditorVersions)
      .where(
        and(
          eq(projectEditorVersions.projectId, projectId),
          inArray(projectEditorVersions.versionNumber, [
            previous.editorVersionNumber,
            current.editorVersionNumber,
          ]),
        ),
      );
    const payload = (version: number) =>
      versions.find((row) => row.versionNumber === version)?.editorData ?? "";
    const beforeData = payload(previous.editorVersionNumber);
    const afterData = payload(current.editorVersionNumber);
    if (beforeData && afterData) {
      base.editor = diffShipPayloads(beforeData, afterData);
    }
  }

  // --- repo half ---
  if (current.repoDiff) {
    base.repo = current.repoDiff;
  } else if (repoUrl) {
    const { summary, failure } = await repoDiffSinceLastShip({
      codeUrl: repoUrl,
      baseSha: previous.repoCommitSha,
      since: previous.submittedAt ?? null,
      headSha: current.repoCommitSha || undefined,
    });
    base.repoError = failure;
    if (failure) {
      await reportRepoFailure(failure, {
        projectId,
        submissionId: current.id,
        repoUrl,
      });
    }
    if (summary) {
      base.repo = summary;
      // Cache so the next reviewer to open this ship doesn't pay for the
      // round-trips again. Only a real summary is cached, so a bad credential
      // or a GitHub outage retries on the next view instead of freezing an
      // empty card into the row forever.
      await db
        .update(projectSubmissions)
        .set({ repoDiff: summary })
        .where(eq(projectSubmissions.id, current.id));
    }
  }

  return base;
}
