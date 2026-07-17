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

export const TIME_AUDIT_REMOVED_REASONS = [
  "AFK / idle screen",
  "Non-project activity",
  "Duplicate session",
  "Editor left open doing nothing",
  "Other",
];

export const TIME_AUDIT_DEFLATED_REASONS = [
  "Tutorial watching",
  "Slow progress / distracted",
  "Partially off-topic",
  "Debugging unrelated issue",
  "Other",
];
