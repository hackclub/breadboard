import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { account, projects } from "@/lib/db/schema";
import { GITHUB_PUBLISH_PROVIDER_ID } from "@/lib/github/oauth";
import { publishStaticShare, shareHostMode } from "@/lib/projects/sharePublish";

/**
 * Republishes static play pages for already-submitted projects and repoints
 * their playableUrl at the durable link. Shared by the CLI script and the
 * admin API route so both behave identically.
 *
 * Projects whose playableUrl is already a github.io link are treated as done and
 * skipped, so it's safe to re-run and to process in limited batches.
 */

export type BackfillOutcome = {
  id: number;
  title: string;
  status: "published" | "would-publish" | "skipped" | "failed";
  url?: string;
  reason?: string;
};

function parseRepo(codeUrl: string) {
  try {
    const url = new URL(codeUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

async function tokenFor(userId: string) {
  const [row] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GITHUB_PUBLISH_PROVIDER_ID),
      ),
    )
    .limit(1);
  return row?.accessToken ?? null;
}

/** Already-static links point at GitHub Pages; those don't need backfilling. */
function alreadyStatic(playableUrl: string | null | undefined) {
  return !!playableUrl && playableUrl.includes(".github.io/");
}

export async function runStaticShareBackfill(
  opts: { dryRun?: boolean; limit?: number; id?: number } = {},
): Promise<{ mode: string; outcomes: BackfillOutcome[] }> {
  const mode = shareHostMode();
  const rows = await db
    .select({
      id: projects.id,
      userId: projects.userId,
      title: projects.title,
      description: projects.description,
      editorData: projects.editorData,
      codeUrl: projects.codeUrl,
      playableUrl: projects.playableUrl,
      status: projects.status,
    })
    .from(projects)
    .where(
      opts.id
        ? eq(projects.id, opts.id)
        : and(ne(projects.status, "draft"), isNotNull(projects.editorData)),
    );

  const outcomes: BackfillOutcome[] = [];
  let processed = 0;
  for (const p of rows) {
    if (opts.limit && processed >= opts.limit) break;
    const base = { id: p.id, title: p.title };

    if (!p.editorData) {
      outcomes.push({ ...base, status: "skipped", reason: "no editor data" });
      continue;
    }
    if (!opts.id && alreadyStatic(p.playableUrl)) {
      // Already backfilled; don't count against the batch limit.
      continue;
    }

    let studentToken: string | undefined;
    let studentOwner: string | undefined;
    let studentRepo: string | undefined;
    if (mode === "student") {
      const repo = p.codeUrl ? parseRepo(p.codeUrl) : null;
      if (!repo) {
        outcomes.push({ ...base, status: "skipped", reason: "no GitHub repo" });
        continue;
      }
      const token = await tokenFor(p.userId);
      if (!token) {
        outcomes.push({
          ...base,
          status: "skipped",
          reason: "owner has no connected GitHub token",
        });
        continue;
      }
      studentToken = token;
      studentOwner = repo.owner;
      studentRepo = repo.repo;
    }

    processed++;
    if (opts.dryRun) {
      outcomes.push({ ...base, status: "would-publish" });
      continue;
    }
    try {
      const { pagesUrl } = await publishStaticShare({
        projectId: p.id,
        title: p.title,
        description: p.description ?? undefined,
        editorData: p.editorData,
        studentToken,
        studentOwner,
        studentRepo,
      });
      await db
        .update(projects)
        .set({ playableUrl: pagesUrl, updatedAt: new Date() })
        .where(eq(projects.id, p.id));
      outcomes.push({ ...base, status: "published", url: pagesUrl });
    } catch (err) {
      outcomes.push({
        ...base,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { mode, outcomes };
}
