import { airtableEnabled } from "@/lib/loops/airtable";
import { syncAllToLoops } from "@/lib/loops/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Full-audience reconciliation. Pushes every user and waitlist email to the
 * Loops Airtable base with their current stage. Idempotent, so it doubles as
 * the one-time backfill (run once after deploy) and a scheduled self-healing
 * sweep (point a cron at it) that catches anyone a real-time hook missed.
 *
 * Protected by LOOPS_SYNC_SECRET. When that env var is unset the endpoint is
 * disabled (401), so it can never run unauthenticated. Pass the secret as
 * `Authorization: Bearer <secret>`, an `X-Loops-Sync-Secret` header, or a
 * `?secret=` query param (header preferred; query params can leak into logs).
 *
 * Each run also resolves a bounded batch of missing Slack IDs via Slack (see
 * enrichMissingSlackIds). Override the per-run batch size with `?slackBudget=N`
 * (default 25, capped at 200) to grind through a large backlog faster.
 */
function authorized(request: Request) {
  const secret = process.env.LOOPS_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header =
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() || request.headers.get("x-loops-sync-secret")?.trim();
  const query = new URL(request.url).searchParams.get("secret")?.trim();
  return header === secret || query === secret;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!airtableEnabled()) {
    return Response.json({ error: "airtable not configured" }, { status: 503 });
  }
  try {
    const budgetParam = new URL(request.url).searchParams.get("slackBudget");
    const slackLookupBudget = budgetParam
      ? Math.min(200, Math.max(0, Number(budgetParam) || 0))
      : undefined;
    const result = await syncAllToLoops({ slackLookupBudget });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "sync failed",
      },
      { status: 500 },
    );
  }
}

export const POST = run;
export const GET = run;
