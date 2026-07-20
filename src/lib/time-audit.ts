// Reviewer time-audit math, shared by the timelapse viewer (live preview)
// and the server action that snapshots deductions. Borrowed from fallout's
// time audit step: a reviewer marks a wall-clock range of the timelapse and
// either removes its tracked time outright or deflates it by a percentage.
//
// Tracked time lives on activity sessions as activeSeconds, which is usually
// less than the session's wall-clock span (idle gaps are already discounted).
// A marked range therefore deducts active seconds in proportion to how much
// of each session's span it covers.

export type TimeAuditSessionWindow = {
  startedAt: string | Date;
  endedAt: string | Date | null;
  lastActivityAt: string | Date;
  activeSeconds: number;
};

export type TimeAuditKind = "removed" | "deflated";

export type TimeAuditRange = {
  startAt: string | Date;
  endAt: string | Date;
};

const toMs = (value: string | Date) =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

/** Server-confirmed active seconds that fall inside [startAt, endAt]. */
export function countedSecondsInRange(
  sessions: TimeAuditSessionWindow[],
  range: TimeAuditRange,
): number {
  const startMs = toMs(range.startAt);
  const endMs = toMs(range.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
    return 0;

  let counted = 0;
  for (const session of sessions) {
    const sessionStart = toMs(session.startedAt);
    const sessionEnd = toMs(session.endedAt ?? session.lastActivityAt);
    const spanSeconds = Math.max(
      (sessionEnd - sessionStart) / 1000,
      session.activeSeconds,
      1,
    );
    const overlapSeconds =
      Math.max(
        0,
        Math.min(endMs, sessionEnd) - Math.max(startMs, sessionStart),
      ) / 1000;
    if (overlapSeconds <= 0) continue;
    counted += (overlapSeconds / spanSeconds) * session.activeSeconds;
  }
  return Math.round(counted);
}

/**
 * Seconds a segment deducts from the tracked total. Removal deducts all
 * counted seconds in the range; deflation deducts deflatedPercent of them
 * (deflating by 100% is the same as removing).
 */
export function segmentDeductionSeconds(
  sessions: TimeAuditSessionWindow[],
  segment: TimeAuditRange & { kind: TimeAuditKind; deflatedPercent: number },
): number {
  const counted = countedSecondsInRange(sessions, segment);
  const percent =
    segment.kind === "removed"
      ? 100
      : Math.min(100, Math.max(0, segment.deflatedPercent));
  return Math.round((counted * percent) / 100);
}

export function timeAuditRangesOverlap(
  left: TimeAuditRange,
  right: TimeAuditRange,
): boolean {
  return (
    toMs(left.startAt) < toMs(right.endAt) &&
    toMs(right.startAt) < toMs(left.endAt)
  );
}

// The audit "tape": all sessions laid end to end as one continuous run of
// tracked time, the same shape as fallout's timelapse video where the camera
// only rolls while work happens. Positions on the tape are seconds of counted
// time; each session occupies its counted share and gaps between sessions
// take no space. This is what lets the segment editor speak in plain minutes
// exactly like fallout's, while segments are stored as wall-clock ranges.
export type TimeAuditTape = {
  spans: {
    startMs: number;
    endMs: number;
    tapeStart: number;
    tapeSeconds: number;
  }[];
  totalSeconds: number;
};

export function buildTimeAuditTape(
  sessions: TimeAuditSessionWindow[],
): TimeAuditTape {
  const spans: TimeAuditTape["spans"] = [];
  let cursor = 0;
  const ordered = [...sessions].sort(
    (left, right) => toMs(left.startedAt) - toMs(right.startedAt),
  );
  for (const session of ordered) {
    const startMs = toMs(session.startedAt);
    const endMs = toMs(session.endedAt ?? session.lastActivityAt);
    const wallSeconds = (endMs - startMs) / 1000;
    const spanSeconds = Math.max(wallSeconds, session.activeSeconds, 1);
    // Same density formula as countedSecondsInRange, so a tape range always
    // measures exactly the counted time a wall-clock range would deduct.
    const tapeSeconds = (wallSeconds / spanSeconds) * session.activeSeconds;
    if (tapeSeconds <= 0) continue;
    spans.push({ startMs, endMs, tapeStart: cursor, tapeSeconds });
    cursor += tapeSeconds;
  }
  return { spans, totalSeconds: cursor };
}

export function tapeSecondsToDate(tape: TimeAuditTape, seconds: number): Date {
  const clamped = Math.min(Math.max(seconds, 0), tape.totalSeconds);
  for (const span of tape.spans) {
    if (clamped <= span.tapeStart + span.tapeSeconds) {
      const ratio = (clamped - span.tapeStart) / span.tapeSeconds;
      return new Date(
        Math.round(span.startMs + ratio * (span.endMs - span.startMs)),
      );
    }
  }
  const last = tape.spans.at(-1);
  return new Date(last ? last.endMs : 0);
}

export function dateToTapeSeconds(
  tape: TimeAuditTape,
  value: string | Date,
): number {
  const ms = toMs(value);
  for (const span of tape.spans) {
    if (ms < span.startMs) return span.tapeStart;
    if (ms <= span.endMs) {
      const ratio = (ms - span.startMs) / (span.endMs - span.startMs);
      return span.tapeStart + ratio * span.tapeSeconds;
    }
  }
  return tape.totalSeconds;
}

// Lapse recordings need no session tape: the video's duration counts 1:1
// toward measured time, so a segment is a plain span of video seconds within
// one recording. This is fallout's per-recording audit shape (with a ×1
// multiplier, since breadboard already treats recording seconds as tracked
// seconds rather than compressed video time).
export type LapseAuditRange = {
  startSeconds: number;
  endSeconds: number;
};

export function lapseSegmentDeductionSeconds(
  segment: LapseAuditRange & { kind: TimeAuditKind; deflatedPercent: number },
): number {
  const counted = Math.max(
    0,
    Math.round(segment.endSeconds - segment.startSeconds),
  );
  const percent =
    segment.kind === "removed"
      ? 100
      : Math.min(100, Math.max(0, segment.deflatedPercent));
  return Math.round((counted * percent) / 100);
}

export function lapseRangesOverlap(
  left: LapseAuditRange,
  right: LapseAuditRange,
): boolean {
  return (
    left.startSeconds < right.endSeconds && right.startSeconds < left.endSeconds
  );
}

export const TIME_AUDIT_REMOVED_REASONS = [
  "AFK / idle screen",
  "Non-project activity",
  "Duplicate session",
  "Unrelated browsing",
  "Other",
];

export const TIME_AUDIT_DEFLATED_REASONS = [
  "Tutorial watching",
  "Slow progress / distracted",
  "Partially off-topic",
  "Debugging unrelated issue",
  "Other",
];
