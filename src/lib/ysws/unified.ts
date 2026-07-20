import "server-only";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectJournals,
  projectReviews,
  projectSubmissions,
  projectTimelapses,
  projects,
  user,
} from "@/lib/db/schema";
import { resolvePublicOrigin } from "@/lib/projects/githubReadme";
import { storageReadUrl } from "@/lib/storage/urls";
import {
  type UnifiedJustificationParts,
  composeUnifiedJustification,
} from "@/lib/ysws/justificationTemplate";

/**
 * Unified YSWS submissions for the Breadboard program.
 *
 * Hack Club funds YSWS programs per verified project hour, and those hours only
 * count once the project lands in the Unified YSWS Database. The sanctioned
 * pipeline (docs.hackclub.com, "Unified YSWS Database / Airtable") is: projects
 * arrive in the program's own Airtable "YSWS Project Submission" table as
 * pending rows, the reviewer fills in Override Hours Spent plus a
 * justification, and ticking "Automation - Submit to Unified YSWS" pushes the
 * row into the Unified DB.
 *
 * Breadboard already does the review in-app (hours verification, checklists,
 * justification), so this module writes the finished result into the program
 * table at the moment a ship's hours become final: demo approval, build-ship
 * approval, bread-only or update-ship materials approval, and the legacy
 * reviewed -> paid_out flow. Each paying ship becomes one Airtable row, which
 * matches the Unified DB's rule that update ships are separate submissions.
 *
 * Rows are upserted on the "Breadboard Ship ID" column (the submission id), so
 * a replayed approval updates its row instead of duplicating it. By default the
 * rows land unchecked, i.e. as Pending Submission, and the reviewer flips the
 * automation checkbox in Airtable after a final glance. Set
 * AIRTABLE_YSWS_AUTO_SUBMIT=true to tick the checkbox from here and skip that
 * manual step, since the in-app review already happened.
 *
 * Everything is best-effort: a push failure is logged and never breaks the
 * approval that triggered it, and with the env vars unset every call is a
 * no-op (local dev, CI).
 */

const API_BASE = "https://api.airtable.com/v0";

// Column names, matching the Airtable "YSWS Project Submissions" component
// table exactly. Breadboard Ship ID is our own addition and the upsert key.
const SHIP_ID_FIELD = "Breadboard Ship ID";
const AUTO_SUBMIT_FIELD = "Automation - Submit to Unified YSWS";

function config() {
  const apiKey = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  const tableId = process.env.AIRTABLE_YSWS_TABLE_ID?.trim();
  if (!apiKey || !baseId || !tableId) return null;
  return {
    apiKey,
    baseId,
    tableId,
    autoSubmit: process.env.AIRTABLE_YSWS_AUTO_SUBMIT?.trim() === "true",
  };
}

export function unifiedYswsEnabled() {
  return config() !== null;
}

function githubUsernameFromCodeUrl(codeUrl: string) {
  try {
    const url = new URL(codeUrl);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return "";
    return url.pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    return "";
  }
}

// Airtable ingests attachments by fetching the URL we hand it, so the
// screenshot needs a public absolute URL. Stored screenshots resolve to
// /api/uploads/... paths that 302 to a fresh presigned S3 URL on every hit,
// which stays valid no matter when Airtable gets around to fetching; we only
// need the app's public origin in front. On a local origin the fetch would
// fail anyway, so the attachment is simply skipped.
async function screenshotAttachment(value: string) {
  if (!value) return null;
  const readUrl = storageReadUrl(value);
  if (/^https?:\/\//i.test(readUrl)) return [{ url: readUrl }];
  if (!readUrl.startsWith("/")) return null;
  const origin = await resolvePublicOrigin();
  if (!origin) return null;
  return [{ url: `${origin}${readUrl}` }];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsertShipRecord(
  cfg: NonNullable<ReturnType<typeof config>>,
  fields: Record<string, unknown>,
) {
  const url = `${API_BASE}/${cfg.baseId}/${encodeURIComponent(cfg.tableId)}`;
  const body = JSON.stringify({
    performUpsert: { fieldsToMergeOn: [SHIP_ID_FIELD] },
    typecast: true,
    records: [{ fields }],
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) return;
    // 429 = rate limited (Airtable applies a 30s lockout). Back off and retry.
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1) + 500);
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Airtable HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error("Airtable upsert failed after retries (rate limited)");
}

const CONTACT_EMAIL = "tanishq@hackclub.com";

function formatHours(seconds: number) {
  return `${(Math.max(0, seconds) / 3600).toFixed(1)}h`;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return "unknown";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString();
}

type ShipRow = {
  submission: typeof projectSubmissions.$inferSelect;
  project: typeof projects.$inferSelect;
};

async function loadShipRow(submissionId: number): Promise<ShipRow | null> {
  const [row] = await db
    .select({ submission: projectSubmissions, project: projects })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projects.id, projectSubmissions.projectId))
    .where(eq(projectSubmissions.id, submissionId))
    .limit(1);
  return row ?? null;
}

/**
 * The justification text this ship would carry into the Unified DB right now:
 * the project's manual override verbatim when one is set, otherwise the
 * template composed live from database facts. The push uses this, and the
 * admin review page uses it to display and edit the record.
 */
export async function unifiedJustificationForSubmission(submissionId: number) {
  const row = await loadShipRow(submissionId);
  if (!row) return null;
  // Per-ship override first; the project-level column is the legacy
  // project-wide freeze, read only so old data keeps working.
  const override =
    row.submission.unifiedJustificationOverride.trim() ||
    row.project.unifiedJustificationOverride.trim();
  if (override)
    return { text: override, overridden: true, parts: null } as const;
  const parts = await buildUnifiedJustificationParts(
    row,
    await resolvePublicOrigin(),
  );
  return {
    text: composeUnifiedJustification(
      parts,
      row.submission.approvedHours ?? 0,
      row.submission.internalNote ||
        row.project.overrideHoursSpentJustification ||
        "",
    ),
    overridden: false,
    parts,
  };
}

// Gathers the database-derived parts of the Unified DB "Override Hours Spent
// Justification" following the handbook's required elements
// (docs.hackclub.com, "Override Hours Spent Justification"): hours tracked
// with sources, evidence URLs a spot-checker can follow, review timeline, and
// reviewer identity. composeUnifiedJustification joins them with the two
// live inputs, the approved hours (deflation numbers) and the reviewer's own
// assessment, so the review page can preview edits before they commit.
export async function buildUnifiedJustificationParts(
  { submission: s, project: p }: ShipRow,
  origin: string | null,
): Promise<UnifiedJustificationParts> {
  const [priorShips, feedbackRounds, reviewer, recordings, journals] =
    await Promise.all([
      db
        .select({
          count: sql<number>`count(*)::int`,
          hours: sql<number>`coalesce(sum(${projectSubmissions.approvedHours}), 0)::int`,
        })
        .from(projectSubmissions)
        .where(
          and(
            eq(projectSubmissions.projectId, p.id),
            inArray(projectSubmissions.status, ["approved", "fulfilled"]),
            ne(projectSubmissions.id, s.id),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectReviews)
        .where(
          and(
            eq(projectReviews.projectId, p.id),
            eq(projectReviews.decision, "changes_requested"),
          ),
        ),
      db
        .select({ name: user.name, email: user.email })
        .from(projectReviews)
        .innerJoin(user, eq(user.id, projectReviews.reviewerId))
        .where(
          and(
            eq(projectReviews.submissionId, s.id),
            eq(projectReviews.decision, "approved"),
          ),
        )
        .orderBy(desc(projectReviews.decidedAt))
        .limit(1),
      db
        .select({
          count: sql<number>`count(*)::int`,
          seconds: sql<number>`coalesce(sum(${projectTimelapses.durationSeconds}), 0)::int`,
          urls: sql<
            string[]
          >`coalesce((array_agg(${projectTimelapses.playbackUrl} order by ${projectTimelapses.recordedAt} desc) filter (where ${projectTimelapses.playbackUrl} <> ''))[1:3], '{}')`,
        })
        .from(projectTimelapses)
        .where(eq(projectTimelapses.projectId, p.id)),
      db
        .select({
          count: sql<number>`count(*)::int`,
          seconds: sql<number>`coalesce(sum(${projectJournals.activeSecondsCovered}), 0)::int`,
        })
        .from(projectJournals)
        .where(eq(projectJournals.projectId, p.id)),
    ]);

  const [editorTime] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
      sessions: sql<number>`count(${editorActivitySessions.id})::int`,
    })
    .from(editorActivitySessions)
    .where(eq(editorActivitySessions.projectId, p.id));

  const priorCount = priorShips[0]?.count ?? 0;
  const priorHours = priorShips[0]?.hours ?? 0;
  const isUpdate = priorCount > 0;
  const shipKind =
    s.type === "demo"
      ? `the completed kit build (demo ship) of "${p.title}"`
      : p.projectType === "build"
        ? `an off-platform build ship of "${p.title}"`
        : isUpdate
          ? `update ship #${s.submissionNumber} of "${p.title}"`
          : `the first design ship of "${p.title}"`;
  // The Unified DB's update-submission rule (docs.hackclub.com, "Duplicate and
  // Updated Submissions"): an update record must say it's an update, reference
  // the previously approved hours, and approve only the new work.
  const updateContext = isUpdate
    ? ` This is an update to a project previously submitted to this program: ${priorHours}h were already approved across ${priorCount} earlier ship${
        priorCount === 1 ? "" : "s"
      }, and this record approves only the hours for the new work since.`
    : "";

  const evidence =
    s.submissionSource === "manual"
      ? `Time was measured off-platform with Breadboard's external tracker (screen-verified heartbeats), reported as ${s.hoursSpent}h for this ship.`
      : [
          `Time was tracked server-side in the Breadboard editor: ${formatHours(
            editorTime?.seconds ?? 0,
          )} of active editing across ${editorTime?.sessions ?? 0} sessions for the whole project (${formatHours(
            s.trackedSeconds,
          )} in this ship's snapshot), with periodic screen captures verifying activity.`,
          (recordings[0]?.count ?? 0) > 0
            ? `${recordings[0].count} Lapse screen recordings totaling ${formatHours(
                recordings[0].seconds,
              )} are attached${
                recordings[0].urls.length
                  ? `: ${recordings[0].urls.join(" , ")}`
                  : ""
              }.`
            : "No screen recordings were attached.",
          (journals[0]?.count ?? 0) > 0
            ? `${journals[0].count} build journal entries cover this.`
            : "No journal entries were submitted.",
        ].join(" ");

  // Evidence links a spot-checker can follow, each explained so someone who
  // has never seen Breadboard knows what they're opening. The static GitHub
  // Pages demo (written into playableUrl at demo submission) survives even if
  // breadboard.hackclub.com goes away.
  const base = origin ?? "https://breadboard.hackclub.com";
  const staticPlayable = (s.playableUrl || p.playableUrl).trim();
  const linkItems =
    s.submissionSource === "manual"
      ? staticPlayable
        ? [`Playable demo, provided by the submitter: ${staticPlayable}`]
        : []
      : [
          `Playable demo, live simulation (runs the shipped circuit and firmware interactively in the browser, rendered from the project's editor data on Breadboard's servers): ${base}/share/${p.id}`,
          ...(staticPlayable
            ? [
                `Playable demo, static (a durable, server-independent copy of the same simulation, published to GitHub Pages when the demo was submitted): ${staticPlayable}`,
              ]
            : []),
          `Editor versions (the frozen editor snapshot of every ship exactly as submitted, for comparing what changed between ships; Breadboard admin access required): ${base}/platform/admin/projects/${p.id}/versions`,
        ];
  const links = linkItems.length
    ? `Where to experience and verify the project:\n${linkItems
        .map((item) => `- ${item}`)
        .join("\n")}`
    : "";

  const reviewerLine = reviewer[0]
    ? `Hours were verified and the quality bar checked by ${reviewer[0].name} (${reviewer[0].email}) in Breadboard's admin review.`
    : "Hours were verified in Breadboard's admin review.";

  const rounds = feedbackRounds[0]?.count ?? 0;
  const roundsPhrase =
    rounds > 0
      ? ` after ${rounds} additional round${rounds === 1 ? "" : "s"} of feedback`
      : "";
  // Pushes only happen after approval, so the pending variant appears only in
  // the review page's live preview.
  const approvalIntro = s.reviewedAt
    ? `This ship was approved at ${iso(s.reviewedAt)}${roundsPhrase}.`
    : `This ship has not been approved yet${roundsPhrase}.`;

  return {
    shipLine: `This is ${shipKind} for Breadboard. Submitted ${iso(s.submittedAt)}.${updateContext}`,
    evidence,
    links,
    approvalIntro,
    reviewerLine,
    claimedHours: s.hoursSpent,
    inspectUrl: `${base}/platform/admin/review/${p.id}`,
    contactEmail: CONTACT_EMAIL,
  };
}

// Exported for the scripts/ smoke tests; the app calls it via
// pushShipToUnified and unifiedJustificationForSubmission.
export async function buildUnifiedJustification(
  row: ShipRow,
  origin: string | null,
) {
  const parts = await buildUnifiedJustificationParts(row, origin);
  return composeUnifiedJustification(
    parts,
    row.submission.approvedHours ?? 0,
    row.submission.internalNote ||
      row.project.overrideHoursSpentJustification ||
      "",
  );
}

/**
 * Push one ship (a project submission whose hours were just approved and paid)
 * into the program's YSWS Project Submission table. Reads everything fresh
 * from the database, so call it after the approving transaction commits and
 * the row carries its final status, approvedHours and internalNote. Safe to
 * replay. Never throws.
 */
export async function pushShipToUnified(submissionId: number) {
  const cfg = config();
  if (!cfg) return;
  try {
    const row = await loadShipRow(submissionId);
    if (!row) return;
    const { submission: s, project: p } = row;

    const fields: Record<string, unknown> = {
      [SHIP_ID_FIELD]: String(s.id),
    };
    // Skip empty strings so a replayed push never blanks a value someone
    // already fixed up by hand in Airtable.
    const set = (name: string, value: string | null | undefined) => {
      const clean = value?.trim();
      if (clean) fields[name] = clean;
    };
    const codeUrl = s.codeUrl || p.codeUrl;
    set("Code URL", codeUrl);
    // Build projects run off-platform, so they have no live simulation or
    // static GitHub Pages demo to point at. The Unified DB still requires a
    // Playable URL, and for a build the GitHub repo is what a reviewer opens
    // to experience the project, so fall back to the code URL there.
    const playableFallback = p.projectType === "build" ? codeUrl : undefined;
    set(
      "Playable URL",
      s.playableUrl ||
        p.playableUrl ||
        s.demoVideoUrl ||
        p.demoVideoUrl ||
        playableFallback,
    );
    set("First Name", s.firstName || p.firstName);
    set("Last Name", s.lastName || p.lastName);
    set("Email", s.email || p.email);
    set("Description", p.description || p.title);
    set("GitHub Username", githubUsernameFromCodeUrl(codeUrl));
    set("Address (Line 1)", s.addressLine1 || p.addressLine1);
    set("Address (Line 2)", s.addressLine2 || p.addressLine2);
    set("City", s.city || p.city);
    set("State / Province", s.region || p.region);
    set("Country", s.country || p.country);
    set("ZIP / Postal Code", s.postalCode || p.postalCode);
    set("Birthday", s.birthday || p.birthday);
    const hours = s.approvedHours ?? 0;
    if (hours > 0) fields["Optional - Override Hours Spent"] = hours;
    const templateOverride =
      s.unifiedJustificationOverride.trim() ||
      p.unifiedJustificationOverride.trim();
    set(
      "Optional - Override Hours Spent Justification",
      templateOverride ||
        (await buildUnifiedJustification(row, await resolvePublicOrigin())),
    );
    const screenshot = await screenshotAttachment(
      s.screenshotUrl || p.screenshotUrl,
    );
    if (screenshot) fields.Screenshot = screenshot;
    if (cfg.autoSubmit) fields[AUTO_SUBMIT_FIELD] = true;

    await upsertShipRecord(cfg, fields);
  } catch (error) {
    console.error(
      `[ysws] unified push failed for submission ${submissionId}`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * The legacy reviewed -> paid_out flow approves the materials submission in
 * markReviewed and pays later in payOutProject, which only knows the project.
 * Resolve the ship that got paid (the latest approved submission) and push it.
 * Never throws.
 */
export async function pushLatestApprovedShipToUnified(projectId: number) {
  const cfg = config();
  if (!cfg) return;
  try {
    const [latest] = await db
      .select({ id: projectSubmissions.id })
      .from(projectSubmissions)
      .where(
        and(
          eq(projectSubmissions.projectId, projectId),
          inArray(projectSubmissions.status, ["approved", "fulfilled"]),
        ),
      )
      .orderBy(desc(projectSubmissions.submittedAt))
      .limit(1);
    if (!latest) return;
    await pushShipToUnified(latest.id);
  } catch (error) {
    console.error(
      `[ysws] unified push failed for project ${projectId}`,
      error instanceof Error ? error.message : error,
    );
  }
}
