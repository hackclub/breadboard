import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/guards";
import { runStaticShareBackfill } from "@/lib/projects/backfillShares";

// Admin-only trigger to (re)publish static share pages for already-submitted
// projects, since the CLI backfill can't reach the cluster-internal prod DB.
// Runs inside the app process where the DB + compile backend are reachable.
//
//   POST /api/admin/backfill-shares?dryRun=1        → list what it would do
//   POST /api/admin/backfill-shares?limit=2         → process 2 (compiles are slow)
//   POST /api/admin/backfill-shares?id=61           → a single project
//
// Trigger from the browser while signed in as admin, e.g. in the devtools console:
//   fetch('/api/admin/backfill-shares?dryRun=1',{method:'POST'}).then(r=>r.json()).then(console.log)

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

  const result = await runStaticShareBackfill({ dryRun, limit, id });
  return NextResponse.json(result);
}
