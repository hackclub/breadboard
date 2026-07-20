/**
 * Heuristic detector for pasted / AI-dumped code in the editor, from the CLI.
 *
 * The editor never records "typed vs pasted" per keystroke (Monaco's onChange
 * only sees resulting content), but the stored history is enough to reconstruct
 * how the code grew, and pasting leaves a shape typing doesn't. The actual
 * analysis lives in src/lib/editor/codeAuthenticity.ts and is shared with the
 * reviewer UI (an admin-only panel in the review workspace). This script just
 * fetches the rows and prints the report. See that module for the full method.
 *
 * Read-only. Safe to point at prod.
 *
 * Run with the server-only stub preload (see scripts/backfill-hours.ts):
 *
 *   # detail: full burst timeline for one project
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/detect-code-bursts.ts --project 1234
 *
 *   # scan: rank every project with editor history by suspicion
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/detect-code-bursts.ts --all
 *
 * Flags:
 *   --project <id>   analyse one project in detail (full timeline + every burst)
 *   --all            scan all projects, print a ranked summary table
 *   --burst-lines N  lines added in one step to count as a burst (default 25)
 *   --window N       max wall-clock seconds for a burst step (default 120)
 *   --top N          rows to show in --all mode (default 40)
 *   --json           emit machine-readable JSON instead of the text report
 */

import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import {
  type AuthenticityOptions,
  type CodeAuthenticityReport,
  analyzeCodeAuthenticity,
} from "@/lib/editor/codeAuthenticity";
import {
  editorActivitySessions,
  editorTimelapseSnapshots,
  projectEditorVersions,
  projects,
  user,
} from "@/lib/db/schema";

const argv = process.argv.slice(2);
function argValue(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const TOP = Number(argValue("--top") ?? 40);
const asJson = argv.includes("--json");
const scanAll = argv.includes("--all");
const projectArg = argValue("--project");

const options: Partial<AuthenticityOptions> = {};
if (argValue("--burst-lines"))
  options.burstLines = Number(argValue("--burst-lines"));
if (argValue("--window"))
  options.burstWindowSeconds = Number(argValue("--window"));

interface Owner {
  id: string | null;
  name: string | null;
  email: string | null;
}

type ReportWithMeta = CodeAuthenticityReport & {
  projectId: number;
  owner: Owner;
};

async function analyseProject(
  projectId: number,
  owner: Owner,
): Promise<ReportWithMeta> {
  const [versions, snapshots, activeRow] = await Promise.all([
    db
      .select({
        editorData: projectEditorVersions.editorData,
        reason: projectEditorVersions.reason,
        createdAt: projectEditorVersions.createdAt,
      })
      .from(projectEditorVersions)
      .where(eq(projectEditorVersions.projectId, projectId))
      .orderBy(asc(projectEditorVersions.createdAt)),
    db
      .select({
        stateData: editorTimelapseSnapshots.stateData,
        capturedAt: editorTimelapseSnapshots.capturedAt,
      })
      .from(editorTimelapseSnapshots)
      .innerJoin(
        editorActivitySessions,
        eq(editorTimelapseSnapshots.sessionId, editorActivitySessions.id),
      )
      .where(eq(editorActivitySessions.projectId, projectId))
      .orderBy(asc(editorTimelapseSnapshots.capturedAt)),
    db
      .select({
        total: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
      })
      .from(editorActivitySessions)
      .where(eq(editorActivitySessions.projectId, projectId)),
  ]);

  const report = analyzeCodeAuthenticity({
    versions,
    snapshots,
    activeSeconds: activeRow[0]?.total ?? 0,
    options,
  });
  return { ...report, projectId, owner };
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s ? ` ${s}s` : ""}`;
}

function ownerLabel(o: Owner): string {
  return o.name
    ? `${o.name}${o.email ? ` <${o.email}>` : ""}`
    : (o.id ?? "unknown");
}

function printDetail(r: ReportWithMeta) {
  console.log(`\n=== Project ${r.projectId} — ${ownerLabel(r.owner)} ===`);
  console.log(`verdict: ${r.verdict.toUpperCase()}`);
  console.log(`why: ${r.summary}`);
  console.log(
    `\ntimeline points: ${r.timelinePoints} ` +
      `(${r.trimmedPoints} trimmed/undiffable), ` +
      `final code: ${r.finalCodeLines} lines, ` +
      `active time: ${fmtDuration(r.activeSeconds)}`,
  );
  console.log(`velocity: ${r.velocity.why}`);

  if (r.bursts.length === 0) {
    console.log(`\nno paste-shaped bursts found.`);
    return;
  }
  console.log(`\n${r.bursts.length} burst(s):`);
  for (const b of r.bursts) {
    console.log(
      `  +${b.addedLines} lines in ${fmtDuration(b.wallSeconds)}  ` +
        `[${b.file}]  ${b.at} (${b.fromSource}->${b.toReason})`,
    );
    console.log(`      why: ${b.why}`);
    if (b.firstLine) console.log(`      starts: ${b.firstLine}`);
  }
}

function printScanRow(r: ReportWithMeta) {
  const flag =
    r.verdict === "suspicious"
      ? "SUSPICIOUS"
      : r.verdict === "review"
        ? "review    "
        : "clean     ";
  const vel =
    r.linesPerActiveMinute === null
      ? "  n/a"
      : r.linesPerActiveMinute.toFixed(0).padStart(5);
  console.log(
    `${String(r.projectId).padStart(6)}  ${flag}  ` +
      `vel:${vel}/min  biggest:+${String(r.biggestBurst).padStart(4)}  ` +
      `pasted:${String(r.pastedLineTotal).padStart(5)}  ` +
      `code:${String(r.finalCodeLines).padStart(5)}  ` +
      `active:${fmtDuration(r.activeSeconds).padStart(7)}  ` +
      `${r.owner.name ?? r.owner.id ?? ""}`,
  );
}

async function ownerOf(projectId: number): Promise<Owner> {
  const rows = await db
    .select({ id: projects.userId, name: user.name, email: user.email })
    .from(projects)
    .leftJoin(user, eq(projects.userId, user.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  return rows[0] ?? { id: null, name: null, email: null };
}

async function runDetail(projectId: number) {
  const owner = await ownerOf(projectId);
  const r = await analyseProject(projectId, owner);
  if (asJson) console.log(JSON.stringify(r, null, 2));
  else printDetail(r);
}

async function runScan() {
  const withHistory = await db
    .selectDistinct({ projectId: projectEditorVersions.projectId })
    .from(projectEditorVersions);
  const ids = withHistory.map((r) => r.projectId);
  if (ids.length === 0) {
    console.log("No projects with stored editor versions.");
    return;
  }

  const owners = await db
    .select({
      id: projects.id,
      userId: projects.userId,
      name: user.name,
      email: user.email,
    })
    .from(projects)
    .leftJoin(user, eq(projects.userId, user.id))
    .where(inArray(projects.id, ids));
  const ownerById = new Map<number, Owner>(
    owners.map((o) => [o.id, { id: o.userId, name: o.name, email: o.email }]),
  );

  const reports: ReportWithMeta[] = [];
  for (const id of ids) {
    reports.push(
      await analyseProject(
        id,
        ownerById.get(id) ?? { id: null, name: null, email: null },
      ),
    );
  }

  const rank = (r: ReportWithMeta) =>
    r.verdict === "suspicious" ? 2 : r.verdict === "review" ? 1 : 0;
  reports.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(b) - rank(a);
    if (b.biggestBurst !== a.biggestBurst)
      return b.biggestBurst - a.biggestBurst;
    return (b.linesPerActiveMinute ?? 0) - (a.linesPerActiveMinute ?? 0);
  });

  if (asJson) {
    console.log(JSON.stringify(reports.slice(0, TOP), null, 2));
    return;
  }

  const flagged = reports.filter((r) => r.verdict !== "clean");
  console.log(
    `Scanned ${reports.length} projects with editor history. ` +
      `${flagged.length} flagged (not clean).\n`,
  );
  console.log(
    `${"proj".padStart(6)}  ${"verdict".padEnd(10)}  velocity   biggest    pasted   code    active   owner`,
  );
  for (const r of reports.slice(0, TOP)) printScanRow(r);
  console.log(
    `\nRun --project <id> on any row for its full burst timeline + why. ` +
      `These are heuristics; eyeball the flagged blocks before concluding.`,
  );
}

async function main() {
  if (!scanAll && !projectArg) {
    console.error(
      "Usage: detect-code-bursts.ts --project <id> | --all [--burst-lines N] [--window N] [--top N] [--json]",
    );
    process.exit(2);
  }
  if (projectArg) {
    const id = Number(projectArg);
    if (!Number.isInteger(id)) {
      console.error(`Invalid --project id: ${projectArg}`);
      process.exit(2);
    }
    await runDetail(id);
  } else {
    await runScan();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
