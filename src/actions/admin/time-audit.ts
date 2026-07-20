"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectTimeAuditSegments,
  projectTimelapses,
  projects,
  user,
} from "@/lib/db/schema";
import {
  lapseRangesOverlap,
  lapseSegmentDeductionSeconds,
  segmentDeductionSeconds,
  type TimeAuditKind,
  timeAuditRangesOverlap,
} from "@/lib/time-audit";

const REASON_LIMIT = 500;

export type TimeAuditSegmentDto = {
  id: number;
  startAt: string;
  endAt: string;
  kind: TimeAuditKind;
  deflatedPercent: number;
  reason: string;
  deductedSeconds: number;
  reviewerName: string;
  createdAt: string;
};

async function listSegments(projectId: number): Promise<TimeAuditSegmentDto[]> {
  const rows = await db
    .select({
      id: projectTimeAuditSegments.id,
      startAt: projectTimeAuditSegments.startAt,
      endAt: projectTimeAuditSegments.endAt,
      kind: projectTimeAuditSegments.kind,
      deflatedPercent: projectTimeAuditSegments.deflatedPercent,
      reason: projectTimeAuditSegments.reason,
      deductedSeconds: projectTimeAuditSegments.deductedSeconds,
      reviewerName: user.name,
      createdAt: projectTimeAuditSegments.createdAt,
    })
    .from(projectTimeAuditSegments)
    .leftJoin(user, eq(projectTimeAuditSegments.reviewerId, user.id))
    // Editor segments only; lapse segments live in the same table but carry a
    // timelapseId and video-second coordinates the tape viewer can't map.
    .where(
      and(
        eq(projectTimeAuditSegments.projectId, projectId),
        isNull(projectTimeAuditSegments.timelapseId),
      ),
    )
    .orderBy(asc(projectTimeAuditSegments.startAt));
  return rows.map((row) => ({
    ...row,
    reviewerName: row.reviewerName ?? "",
    startAt: (row.startAt ?? new Date(0)).toISOString(),
    endAt: (row.endAt ?? new Date(0)).toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

function revalidateReviewSurfaces(projectId: number) {
  revalidatePath(`/platform/admin/projects/${projectId}/timelapse`);
  revalidatePath(`/platform/admin/review/${projectId}`);
}

export async function addTimeAuditSegment(
  projectId: number,
  input: {
    startAt: string;
    endAt: string;
    kind: TimeAuditKind;
    deflatedPercent?: number;
    reason: string;
  },
): Promise<TimeAuditSegmentDto[]> {
  const session = await requireAdminSession();

  const id = Math.floor(Number(projectId));
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid project id");

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error("Invalid time range");
  }
  if (endAt.getTime() <= startAt.getTime()) {
    throw new Error("End must be after start");
  }

  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required");
  if (reason.length > REASON_LIMIT) throw new Error("Reason is too long");

  if (input.kind !== "removed" && input.kind !== "deflated") {
    throw new Error("Invalid segment kind");
  }
  const deflatedPercent =
    input.kind === "removed"
      ? 100
      : Math.round(Number(input.deflatedPercent ?? 0));
  if (
    !Number.isFinite(deflatedPercent) ||
    deflatedPercent < 1 ||
    deflatedPercent > 100
  ) {
    throw new Error("Deflation must be between 1% and 100%");
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const existing = await db
    .select({
      startAt: projectTimeAuditSegments.startAt,
      endAt: projectTimeAuditSegments.endAt,
    })
    .from(projectTimeAuditSegments)
    .where(
      and(
        eq(projectTimeAuditSegments.projectId, id),
        isNull(projectTimeAuditSegments.timelapseId),
      ),
    );
  if (
    existing.some(
      (segment) =>
        segment.startAt &&
        segment.endAt &&
        timeAuditRangesOverlap(
          { startAt: segment.startAt, endAt: segment.endAt },
          { startAt, endAt },
        ),
    )
  ) {
    throw new Error("This range overlaps an existing audit segment");
  }

  const sessions = await db
    .select({
      startedAt: editorActivitySessions.startedAt,
      endedAt: editorActivitySessions.endedAt,
      lastActivityAt: editorActivitySessions.lastActivityAt,
      activeSeconds: editorActivitySessions.activeSeconds,
    })
    .from(editorActivitySessions)
    .where(eq(editorActivitySessions.projectId, id));

  const deductedSeconds = segmentDeductionSeconds(sessions, {
    startAt,
    endAt,
    kind: input.kind,
    deflatedPercent,
  });

  const [inserted] = await db
    .insert(projectTimeAuditSegments)
    .values({
      projectId: id,
      reviewerId: session.user.id,
      startAt,
      endAt,
      kind: input.kind,
      deflatedPercent,
      reason,
      deductedSeconds,
    })
    .returning({ id: projectTimeAuditSegments.id });

  await audit("admin.time_audit.segment_added", "project", String(id), {
    segmentId: inserted.id,
    kind: input.kind,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    deflatedPercent,
    deductedSeconds,
    reason,
  });
  revalidateReviewSurfaces(id);
  return listSegments(id);
}

export async function deleteTimeAuditSegment(
  projectId: number,
  segmentId: number,
): Promise<TimeAuditSegmentDto[]> {
  await requireAdminSession();

  const id = Math.floor(Number(projectId));
  const sid = Math.floor(Number(segmentId));
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid project id");
  if (!Number.isFinite(sid) || sid <= 0) throw new Error("Invalid segment id");

  const [removed] = await db
    .delete(projectTimeAuditSegments)
    .where(
      and(
        eq(projectTimeAuditSegments.id, sid),
        eq(projectTimeAuditSegments.projectId, id),
      ),
    )
    .returning({
      kind: projectTimeAuditSegments.kind,
      deductedSeconds: projectTimeAuditSegments.deductedSeconds,
      reason: projectTimeAuditSegments.reason,
    });
  if (!removed) throw new Error("Segment not found");

  await audit("admin.time_audit.segment_deleted", "project", String(id), {
    segmentId: sid,
    kind: removed.kind,
    deductedSeconds: removed.deductedSeconds,
    reason: removed.reason,
  });
  revalidateReviewSurfaces(id);
  return listSegments(id);
}

// --- Lapse recording audit (fallout's per-recording video-time model) ---

export type LapseAuditSegmentDto = {
  id: number;
  timelapseId: number;
  startSeconds: number;
  endSeconds: number;
  kind: TimeAuditKind;
  deflatedPercent: number;
  reason: string;
  deductedSeconds: number;
  reviewerName: string;
  createdAt: string;
};

async function listLapseSegments(
  timelapseId: number,
): Promise<LapseAuditSegmentDto[]> {
  const rows = await db
    .select({
      id: projectTimeAuditSegments.id,
      startSeconds: projectTimeAuditSegments.startSeconds,
      endSeconds: projectTimeAuditSegments.endSeconds,
      kind: projectTimeAuditSegments.kind,
      deflatedPercent: projectTimeAuditSegments.deflatedPercent,
      reason: projectTimeAuditSegments.reason,
      deductedSeconds: projectTimeAuditSegments.deductedSeconds,
      reviewerName: user.name,
      createdAt: projectTimeAuditSegments.createdAt,
    })
    .from(projectTimeAuditSegments)
    .leftJoin(user, eq(projectTimeAuditSegments.reviewerId, user.id))
    .where(eq(projectTimeAuditSegments.timelapseId, timelapseId))
    .orderBy(asc(projectTimeAuditSegments.startSeconds));
  return rows.map((row) => ({
    id: row.id,
    timelapseId,
    startSeconds: row.startSeconds ?? 0,
    endSeconds: row.endSeconds ?? 0,
    kind: row.kind,
    deflatedPercent: row.deflatedPercent,
    reason: row.reason,
    deductedSeconds: row.deductedSeconds,
    reviewerName: row.reviewerName ?? "",
    createdAt: row.createdAt.toISOString(),
  }));
}

function revalidateLapseSurfaces(projectId: number, timelapseId: number) {
  revalidatePath(
    `/platform/admin/projects/${projectId}/timelapse/recording/${timelapseId}`,
  );
  revalidatePath(`/platform/admin/review/${projectId}`);
}

export async function addLapseAuditSegment(
  timelapseId: number,
  input: {
    startSeconds: number;
    endSeconds: number;
    kind: TimeAuditKind;
    deflatedPercent?: number;
    reason: string;
  },
): Promise<LapseAuditSegmentDto[]> {
  const session = await requireAdminSession();

  const tid = Math.floor(Number(timelapseId));
  if (!Number.isFinite(tid) || tid <= 0) throw new Error("Invalid recording");

  const [recording] = await db
    .select({
      projectId: projectTimelapses.projectId,
      durationSeconds: projectTimelapses.durationSeconds,
    })
    .from(projectTimelapses)
    .where(eq(projectTimelapses.id, tid))
    .limit(1);
  if (!recording) throw new Error("Recording not found");
  if (recording.durationSeconds <= 0) {
    throw new Error("This recording has no known duration to audit");
  }

  const startSeconds = Math.max(0, Math.round(Number(input.startSeconds)));
  const endSeconds = Math.min(
    recording.durationSeconds,
    Math.round(Number(input.endSeconds)),
  );
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    throw new Error("Invalid time range");
  }
  if (endSeconds <= startSeconds) {
    throw new Error("End must be after start");
  }

  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required");
  if (reason.length > REASON_LIMIT) throw new Error("Reason is too long");

  if (input.kind !== "removed" && input.kind !== "deflated") {
    throw new Error("Invalid segment kind");
  }
  const deflatedPercent =
    input.kind === "removed"
      ? 100
      : Math.round(Number(input.deflatedPercent ?? 0));
  if (
    !Number.isFinite(deflatedPercent) ||
    deflatedPercent < 1 ||
    deflatedPercent > 100
  ) {
    throw new Error("Deflation must be between 1% and 100%");
  }

  const existing = await db
    .select({
      startSeconds: projectTimeAuditSegments.startSeconds,
      endSeconds: projectTimeAuditSegments.endSeconds,
    })
    .from(projectTimeAuditSegments)
    .where(eq(projectTimeAuditSegments.timelapseId, tid));
  if (
    existing.some(
      (segment) =>
        segment.startSeconds !== null &&
        segment.endSeconds !== null &&
        lapseRangesOverlap(
          {
            startSeconds: segment.startSeconds,
            endSeconds: segment.endSeconds,
          },
          { startSeconds, endSeconds },
        ),
    )
  ) {
    throw new Error("This range overlaps an existing audit segment");
  }

  const deductedSeconds = lapseSegmentDeductionSeconds({
    startSeconds,
    endSeconds,
    kind: input.kind,
    deflatedPercent,
  });

  const [inserted] = await db
    .insert(projectTimeAuditSegments)
    .values({
      projectId: recording.projectId,
      reviewerId: session.user.id,
      timelapseId: tid,
      startSeconds,
      endSeconds,
      kind: input.kind,
      deflatedPercent,
      reason,
      deductedSeconds,
    })
    .returning({ id: projectTimeAuditSegments.id });

  await audit(
    "admin.time_audit.lapse_segment_added",
    "project",
    String(recording.projectId),
    {
      segmentId: inserted.id,
      timelapseId: tid,
      kind: input.kind,
      startSeconds,
      endSeconds,
      deflatedPercent,
      deductedSeconds,
      reason,
    },
  );
  revalidateLapseSurfaces(recording.projectId, tid);
  return listLapseSegments(tid);
}

export async function deleteLapseAuditSegment(
  timelapseId: number,
  segmentId: number,
): Promise<LapseAuditSegmentDto[]> {
  await requireAdminSession();

  const tid = Math.floor(Number(timelapseId));
  const sid = Math.floor(Number(segmentId));
  if (!Number.isFinite(tid) || tid <= 0) throw new Error("Invalid recording");
  if (!Number.isFinite(sid) || sid <= 0) throw new Error("Invalid segment id");

  const [removed] = await db
    .delete(projectTimeAuditSegments)
    .where(
      and(
        eq(projectTimeAuditSegments.id, sid),
        eq(projectTimeAuditSegments.timelapseId, tid),
      ),
    )
    .returning({
      projectId: projectTimeAuditSegments.projectId,
      kind: projectTimeAuditSegments.kind,
      deductedSeconds: projectTimeAuditSegments.deductedSeconds,
      reason: projectTimeAuditSegments.reason,
    });
  if (!removed) throw new Error("Segment not found");

  await audit(
    "admin.time_audit.lapse_segment_deleted",
    "project",
    String(removed.projectId),
    {
      segmentId: sid,
      timelapseId: tid,
      kind: removed.kind,
      deductedSeconds: removed.deductedSeconds,
      reason: removed.reason,
    },
  );
  revalidateLapseSurfaces(removed.projectId, tid);
  return listLapseSegments(tid);
}
