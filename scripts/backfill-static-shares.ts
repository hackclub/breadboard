/**
 * Backfills static, server-independent play pages for projects that were
 * already submitted before the static-share pipeline existed (or before their
 * last publish predated it). Republishes each project's play page and repoints
 * playableUrl at the durable GitHub Pages URL.
 *
 * Honors SHARE_HOST_MODE:
 *   "central" (default) — publishes every non-draft project with a snapshot to
 *      the central repo via the bot token. No per-student GitHub needed, so it
 *      can cover everyone (including students who never connected GitHub).
 *   "student" — publishes into each student's own repo using their stored token;
 *      projects whose owner never connected GitHub (no token) or that lack a
 *      GitHub codeUrl are skipped and reported.
 *
 * Requires DATABASE_URL (loaded from .env.local by Bun), SHARE_PLAYER_BASE_URL,
 * and (central mode) SHARE_PAGES_REPO + SHARE_PAGES_TOKEN — same as the app.
 *
 * Imports app modules (db) that reference Next's "server-only" marker, so run
 * it with the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-static-shares.ts [--dry-run] [--id N]
 *
 *   --dry-run   report what would publish, no writes
 *   --id N      backfill a single project
 */

import { and, eq, ne, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { account, projects } from "@/lib/db/schema";
import { GITHUB_PUBLISH_PROVIDER_ID } from "@/lib/github/oauth";
import { publishStaticShare, shareHostMode } from "@/lib/projects/sharePublish";

const dryRun = process.argv.includes("--dry-run");
const idArg = (() => {
  const i = process.argv.indexOf("--id");
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

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

async function main() {
  const mode = shareHostMode();
  console.log(`Backfill mode: ${mode}${dryRun ? " (dry-run)" : ""}`);

  const rows = await db
    .select({
      id: projects.id,
      userId: projects.userId,
      title: projects.title,
      description: projects.description,
      editorData: projects.editorData,
      codeUrl: projects.codeUrl,
      status: projects.status,
    })
    .from(projects)
    .where(
      idArg
        ? eq(projects.id, idArg)
        : and(ne(projects.status, "draft"), isNotNull(projects.editorData)),
    );

  let published = 0;
  let skipped = 0;
  let failed = 0;
  const skippedNoToken: number[] = [];

  for (const p of rows) {
    if (!p.editorData) {
      skipped++;
      continue;
    }

    // Student mode needs the owner's repo + token; central mode needs neither.
    let studentToken: string | undefined;
    let studentOwner: string | undefined;
    let studentRepo: string | undefined;
    if (mode === "student") {
      const repo = p.codeUrl ? parseRepo(p.codeUrl) : null;
      if (!repo) {
        console.warn(`#${p.id} "${p.title}": no GitHub repo, skip`);
        skipped++;
        continue;
      }
      const token = await tokenFor(p.userId);
      if (!token) {
        skippedNoToken.push(p.id);
        skipped++;
        continue;
      }
      studentToken = token;
      studentOwner = repo.owner;
      studentRepo = repo.repo;
    }

    if (dryRun) {
      console.log(`#${p.id} "${p.title}": would publish`);
      published++;
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
      console.log(`#${p.id} "${p.title}": ${pagesUrl}`);
      published++;
    } catch (err) {
      console.error(
        `#${p.id} "${p.title}": FAILED — ${err instanceof Error ? err.message : err}`,
      );
      failed++;
    }
  }

  console.log(
    `\nDone. ${dryRun ? "would publish" : "published"}=${published} skipped=${skipped} failed=${failed}`,
  );
  if (skippedNoToken.length) {
    console.log(
      `Skipped (owner has no connected GitHub token): ${skippedNoToken.join(", ")}`,
    );
  }
  process.exit(0);
}

void main();
