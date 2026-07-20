/**
 * Code-authenticity heuristics: does a project's code look typed or pasted?
 *
 * The editor never records "typed vs pasted" per keystroke (Monaco's onChange
 * only sees resulting content). But pasting leaves a shape typing doesn't: a
 * large block of finished code appears between two adjacent saves, with little
 * or no active editing time to account for it. This module reconstructs the
 * timeline from the stored history and reports where that shape shows up.
 *
 * Pure and framework-free: it takes already-fetched rows so both the reviewer
 * API route and the offline scripts/detect-code-bursts.ts can share it. No DB,
 * no "server-only" marker, no React.
 *
 * Two signals:
 *   1. BURST — a single timeline step adds >= burstLines lines of real code in
 *      <= burstWindowSeconds wall-clock. Nobody hand-types 25 finished lines
 *      between two 60s autosaves and lands them all at once.
 *   2. VELOCITY — total real lines / total active-minutes. Sustained human
 *      authoring (with thinking, not transcription) stays well under ~15/min.
 *
 * Heuristics, not proof. A burst can be a legit paste of the student's own
 * earlier work, boilerplate, or a library file. Every finding carries a plain
 * "why" string and the first line of the block so a reviewer can judge.
 */

export interface AuthenticityOptions {
  /** Lines added in one step to count as a burst. */
  burstLines: number;
  /** Max wall-clock seconds for a step to count as a burst. */
  burstWindowSeconds: number;
  /** Sustained lines/active-minute above this reads as transcription. */
  velocitySuspicious: number;
  /** Below this much active time, velocity is noise and is suppressed. */
  minActiveSecondsForVelocity: number;
}

export const DEFAULT_AUTHENTICITY_OPTIONS: AuthenticityOptions = {
  burstLines: 25,
  burstWindowSeconds: 120,
  velocitySuspicious: 40,
  minActiveSecondsForVelocity: 120,
};

export interface VersionRow {
  editorData: string;
  reason: string;
  createdAt: Date;
}

export interface SnapshotRow {
  stateData: string;
  capturedAt: Date;
}

export interface AnalyzeInput {
  versions: VersionRow[];
  snapshots: SnapshotRow[];
  activeSeconds: number;
  options?: Partial<AuthenticityOptions>;
}

export interface Burst {
  file: string;
  addedLines: number;
  wallSeconds: number;
  at: string; // ISO timestamp of the step's end
  fromSource: "version" | "snapshot";
  toReason: string;
  firstLine: string;
  why: string;
}

export interface CodeAuthenticityReport {
  timelinePoints: number;
  trimmedPoints: number;
  finalCodeLines: number;
  activeSeconds: number;
  linesPerActiveMinute: number | null;
  velocity: { suspicious: boolean; why: string };
  bursts: Burst[];
  pastedLineTotal: number;
  biggestBurst: number;
  verdict: "clean" | "review" | "suspicious";
  summary: string;
}

const TRIM_MARKER = "// [trimmed in timelapse capture]";

// ---- content extraction ------------------------------------------------------

type FileMap = Map<string, string>; // "groupId/filename" -> content

/** Pull file contents out of a stored payload, whichever shape it is. */
function filesFromPayload(raw: string): { files: FileMap; trimmed: boolean } {
  const files: FileMap = new Map();
  let trimmed = false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { files, trimmed };
  }
  const root = parsed as {
    fileGroups?: Record<string, unknown>;
    editor?: { fileGroups?: Record<string, unknown> };
  };
  // Version rows: VlxPayload.fileGroups. Snapshot rows: editor.fileGroups.
  const groups = root?.fileGroups ?? root?.editor?.fileGroups ?? {};
  for (const [groupId, list] of Object.entries(groups)) {
    if (!Array.isArray(list)) continue;
    for (const f of list as Array<{ name?: string; content?: string }>) {
      const name = f?.name ?? "unknown";
      const content = typeof f?.content === "string" ? f.content : "";
      if (content.includes(TRIM_MARKER)) trimmed = true;
      files.set(`${groupId}/${name}`, content);
    }
  }
  return { files, trimmed };
}

/** Non-blank lines only: blank-line churn shouldn't read as authored code. */
function codeLines(content: string): string[] {
  return content.split("\n").filter((l) => l.trim().length > 0);
}

function totalCodeLines(files: FileMap): number {
  let n = 0;
  for (const c of files.values()) n += codeLines(c).length;
  return n;
}

// ---- line diff ---------------------------------------------------------------

/**
 * Count lines in `next` not matched in `prev`, via an LCS on non-blank lines.
 * Files here are student sketches (capped at 120k chars), so O(n*m) is fine; we
 * fall back to a net-count delta above a cap to stay bounded.
 */
export function addedLineCount(prev: string, next: string): number {
  const a = codeLines(prev);
  const b = codeLines(next);
  if (a.length === 0) return b.length;
  if (b.length === 0) return 0;
  if (a.length * b.length > 4_000_000) {
    return Math.max(0, b.length - a.length);
  }
  const n = b.length;
  let prevRow = new Array<number>(n + 1).fill(0);
  let curRow = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= n; j++) {
      curRow[j] =
        a[i - 1] === b[j - 1]
          ? prevRow[j - 1] + 1
          : Math.max(prevRow[j], curRow[j - 1]);
    }
    [prevRow, curRow] = [curRow, prevRow];
  }
  return n - prevRow[n]; // lines in b outside the common subsequence
}

/** First non-blank line that's new in `next` vs `prev`. */
function firstNewLine(prev: string, next: string): string {
  const prevSet = new Set(codeLines(prev).map((l) => l.trim()));
  for (const l of codeLines(next)) {
    if (!prevSet.has(l.trim())) return l.trim().slice(0, 120);
  }
  return "";
}

// ---- timeline ----------------------------------------------------------------

interface TimelinePoint {
  at: Date;
  source: "version" | "snapshot";
  reason: string;
  files: FileMap;
  trimmed: boolean;
}

function buildTimeline(input: AnalyzeInput): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  for (const v of input.versions) {
    const { files, trimmed } = filesFromPayload(v.editorData);
    points.push({
      at: v.createdAt,
      source: "version",
      reason: v.reason,
      files,
      trimmed,
    });
  }
  for (const s of input.snapshots) {
    const { files, trimmed } = filesFromPayload(s.stateData);
    points.push({
      at: s.capturedAt,
      source: "snapshot",
      reason: "timelapse",
      files,
      trimmed,
    });
  }
  points.sort((a, b) => a.at.getTime() - b.at.getTime());
  return points;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s ? ` ${s}s` : ""}`;
}

// ---- analysis ----------------------------------------------------------------

export function analyzeCodeAuthenticity(
  input: AnalyzeInput,
): CodeAuthenticityReport {
  const opts = { ...DEFAULT_AUTHENTICITY_OPTIONS, ...(input.options ?? {}) };
  const points = buildTimeline(input);

  const finalFiles =
    [...points].reverse().find((p) => !p.trimmed)?.files ?? new Map();
  const finalCodeLines = totalCodeLines(finalFiles);

  // --- bursts ---
  const bursts: Burst[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.trimmed || cur.trimmed) continue; // can't diff trimmed content
    const wallSeconds = (cur.at.getTime() - prev.at.getTime()) / 1000;
    if (wallSeconds < 0) continue;
    const paths = new Set([...prev.files.keys(), ...cur.files.keys()]);
    for (const path of paths) {
      const before = prev.files.get(path) ?? "";
      const after = cur.files.get(path) ?? "";
      if (before === after) continue;
      const added = addedLineCount(before, after);
      if (added >= opts.burstLines && wallSeconds <= opts.burstWindowSeconds) {
        const rate = wallSeconds > 0 ? added / wallSeconds : added;
        bursts.push({
          file: path,
          addedLines: added,
          wallSeconds,
          at: cur.at.toISOString(),
          fromSource: prev.source,
          toReason: cur.reason,
          firstLine: firstNewLine(before, after),
          why:
            `${added} lines of code appeared in a single ` +
            `${fmtDuration(wallSeconds)} step` +
            (wallSeconds > 0
              ? ` (~${rate.toFixed(1)} lines/sec)`
              : " (same instant)") +
            `, landing all at once instead of growing line by line. ` +
            `That's the shape of a paste, not typing.`,
        });
      }
    }
  }
  bursts.sort((a, b) => b.addedLines - a.addedLines);

  // --- velocity ---
  const canMeasureVelocity =
    input.activeSeconds >= opts.minActiveSecondsForVelocity &&
    finalCodeLines > 0;
  const linesPerActiveMinute = canMeasureVelocity
    ? finalCodeLines / (input.activeSeconds / 60)
    : null;
  const velocitySuspicious =
    linesPerActiveMinute !== null &&
    linesPerActiveMinute > opts.velocitySuspicious;
  const velocityWhy = canMeasureVelocity
    ? `${finalCodeLines} lines of code over ${fmtDuration(input.activeSeconds)} ` +
      `of active editing = ${linesPerActiveMinute!.toFixed(1)} lines/active-minute` +
      (velocitySuspicious
        ? `, well above the ~${opts.velocitySuspicious}/min ceiling for ` +
          `hand-authored code. More code exists than there was time to write it.`
        : `, within the range a person could plausibly type.`)
    : `Not enough tracked editing time ` +
      `(< ${Math.round(opts.minActiveSecondsForVelocity / 60)} min) to judge velocity reliably.`;

  const biggestBurst = bursts[0]?.addedLines ?? 0;
  const pastedLineTotal = bursts.reduce((s, b) => s + b.addedLines, 0);

  // --- verdict + summary ---
  let verdict: CodeAuthenticityReport["verdict"] = "clean";
  if (velocitySuspicious && bursts.length > 0) verdict = "suspicious";
  else if (velocitySuspicious || bursts.length > 0) verdict = "review";

  const trimmedPoints = points.filter((p) => p.trimmed).length;
  const parts: string[] = [];
  if (bursts.length > 0) {
    parts.push(
      `${bursts.length} large block${bursts.length === 1 ? "" : "s"} ` +
        `(up to ${biggestBurst} lines) appeared in one step each.`,
    );
  }
  if (velocitySuspicious) {
    parts.push(
      `Overall pace of ${linesPerActiveMinute!.toFixed(0)} lines/active-min ` +
        `exceeds what typing accounts for.`,
    );
  }
  if (parts.length === 0) {
    parts.push(
      points.length < 2
        ? `Not enough saved history to reconstruct how the code was written.`
        : `Code grew incrementally with no paste-shaped jumps; ` +
            `pace is consistent with typing.`,
    );
  }
  if (trimmedPoints > 0) {
    parts.push(
      `${trimmedPoints} snapshot${trimmedPoints === 1 ? " was" : "s were"} ` +
        `too large to diff and were skipped, so coverage is partial.`,
    );
  }

  return {
    timelinePoints: points.length,
    trimmedPoints,
    finalCodeLines,
    activeSeconds: input.activeSeconds,
    linesPerActiveMinute,
    velocity: { suspicious: velocitySuspicious, why: velocityWhy },
    bursts,
    pastedLineTotal,
    biggestBurst,
    verdict,
    summary: parts.join(" "),
  };
}
