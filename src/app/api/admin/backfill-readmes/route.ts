import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/guards";
import { runReadmeBackfill } from "@/lib/projects/githubReadme";

// Admin-only trigger to re-sync the full published artifact set for every
// editor project with a published repo: README, committed screenshot, and
// the static play page. READMEs published before screenshots were committed
// into repos reference dead or unreachable image URLs; this rewrites them
// all with the current format. Safe to re-run: repos whose README and
// screenshot already match get no commits. Static page republish compiles
// firmware, so batches with ?limit= are recommended at scale.
//
//   POST /api/admin/backfill-readmes?dryRun=1   → list what it would sync
//   POST /api/admin/backfill-readmes?limit=5    → process 5 projects
//   POST /api/admin/backfill-readmes?id=17      → a single project
//
// Trigger from the browser while signed in as admin, e.g. in the devtools console:
//   fetch('/api/admin/backfill-readmes?dryRun=1',{method:'POST'}).then(r=>r.json()).then(console.log)

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const id = Number(url.searchParams.get("id")) || undefined;

  const result = await runReadmeBackfill({ dryRun, limit, id });
  return NextResponse.json(result);
}
