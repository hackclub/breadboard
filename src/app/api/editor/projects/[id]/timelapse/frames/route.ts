import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  editorScreenEvidenceFrames,
  editorTimelapseSnapshots,
  projectTimeAuditSegments,
  projects,
  user,
} from "@/lib/db/schema";

const MAX_STITCHED_FRAMES = 600;

// Evenly sample rows down to `max`, always keeping the first and last, so a
// long history spans the whole timeline at lower density instead of losing
// its oldest frames to a newest-N cutoff.
function sampleEvenly<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = (rows.length - 1) / (max - 1);
  const sampled: T[] = [];
  let lastIndex = -1;
  for (let position = 0; position < max; position += 1) {
    const index = Math.round(position * step);
    if (index !== lastIndex) {
      sampled.push(rows[index]);
      lastIndex = index;
    }
  }
  return sampled;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId))
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const url = new URL(request.url);
  const sessionIdParam = url.searchParams.get("session_id");
  const untilParam = url.searchParams.get("until");
  const until = untilParam ? new Date(untilParam) : null;
  if (untilParam && (!until || Number.isNaN(until.getTime()))) {
    return NextResponse.json({ error: "Invalid until" }, { status: 400 });
  }

  const sess = await getSession();
  if (!sess)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminSession(sess);
  const rows = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = rows[0];
  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionIdParam) {
    const sessions = await db
      .select({
        id: editorActivitySessions.id,
        startedAt: editorActivitySessions.startedAt,
        endedAt: editorActivitySessions.endedAt,
        lastActivityAt: editorActivitySessions.lastActivityAt,
        activeSeconds: editorActivitySessions.activeSeconds,
      })
      .from(editorActivitySessions)
      .where(
        until
          ? and(
              eq(editorActivitySessions.projectId, projectId),
              lte(editorActivitySessions.startedAt, until),
            )
          : eq(editorActivitySessions.projectId, projectId),
      )
      .orderBy(asc(editorActivitySessions.startedAt));

    if (sessions.length === 0) {
      return NextResponse.json({ sessions: [], snapshots: [] });
    }

    const sessionIds = sessions.map((session) => session.id);
    // Snapshot rows carry the full editor state JSON, so sampling happens on
    // a lightweight id index first and only the sampled rows are fetched in
    // full. Screen frame rows are metadata only (the image is served by a
    // separate endpoint), so those sample in memory directly.
    const [snapshotIndex, allScreenFrames, auditSegments] = await Promise.all([
      db
        .select({ id: editorTimelapseSnapshots.id })
        .from(editorTimelapseSnapshots)
        .where(
          until
            ? and(
                inArray(editorTimelapseSnapshots.sessionId, sessionIds),
                lte(editorTimelapseSnapshots.capturedAt, until),
              )
            : inArray(editorTimelapseSnapshots.sessionId, sessionIds),
        )
        .orderBy(asc(editorTimelapseSnapshots.capturedAt)),
      db
        .select({
          id: editorScreenEvidenceFrames.id,
          sessionId: editorScreenEvidenceFrames.sessionId,
          // Client capture clocks are useful for local ordering but not trusted
          // review evidence. The review timeline uses the server receipt time.
          capturedAt: editorScreenEvidenceFrames.receivedAt,
          imageUrl: sql<string>`case when ${editorScreenEvidenceFrames.imageKey} = '' then '' else '/api/editor/projects/' || ${projectId} || '/timelapse/screen-frame/' || ${editorScreenEvidenceFrames.id} end`,
          pixelChanged: editorScreenEvidenceFrames.pixelChanged,
          diffScore: editorScreenEvidenceFrames.diffScore,
          screenWidth: editorScreenEvidenceFrames.screenWidth,
          screenHeight: editorScreenEvidenceFrames.screenHeight,
          paused: editorScreenEvidenceFrames.paused,
        })
        .from(editorScreenEvidenceFrames)
        .where(
          until
            ? and(
                inArray(editorScreenEvidenceFrames.sessionId, sessionIds),
                lte(editorScreenEvidenceFrames.receivedAt, until),
              )
            : inArray(editorScreenEvidenceFrames.sessionId, sessionIds),
        )
        .orderBy(asc(editorScreenEvidenceFrames.receivedAt)),
      db
        .select({
          id: projectTimeAuditSegments.id,
          startAt: projectTimeAuditSegments.startAt,
          endAt: projectTimeAuditSegments.endAt,
          kind: projectTimeAuditSegments.kind,
          deflatedPercent: projectTimeAuditSegments.deflatedPercent,
          reason: projectTimeAuditSegments.reason,
          deductedSeconds: projectTimeAuditSegments.deductedSeconds,
          reviewerName: sql<string>`coalesce(${user.name}, '')`,
          createdAt: projectTimeAuditSegments.createdAt,
        })
        .from(projectTimeAuditSegments)
        .leftJoin(user, eq(projectTimeAuditSegments.reviewerId, user.id))
        .where(eq(projectTimeAuditSegments.projectId, projectId))
        .orderBy(asc(projectTimeAuditSegments.startAt)),
    ]);

    const sampledSnapshotIds = sampleEvenly(
      snapshotIndex,
      MAX_STITCHED_FRAMES,
    ).map((row) => row.id);
    const snapshots =
      sampledSnapshotIds.length > 0
        ? await db
            .select({
              id: editorTimelapseSnapshots.id,
              sessionId: editorTimelapseSnapshots.sessionId,
              capturedAt: editorTimelapseSnapshots.capturedAt,
              stateData: editorTimelapseSnapshots.stateData,
            })
            .from(editorTimelapseSnapshots)
            .where(inArray(editorTimelapseSnapshots.id, sampledSnapshotIds))
            .orderBy(asc(editorTimelapseSnapshots.capturedAt))
        : [];
    const screenFrames = sampleEvenly(allScreenFrames, MAX_STITCHED_FRAMES);

    return NextResponse.json({
      sessions,
      snapshots,
      screenFrames,
      auditSegments,
      truncated:
        snapshotIndex.length > MAX_STITCHED_FRAMES ||
        allScreenFrames.length > MAX_STITCHED_FRAMES,
      totalSnapshots: snapshotIndex.length,
      totalScreenFrames: allScreenFrames.length,
    });
  }

  const sessionId = Number(sessionIdParam);
  if (!Number.isInteger(sessionId) || sessionId < 1)
    return NextResponse.json({ error: "Invalid session_id" }, { status: 400 });

  const [activitySession] = await db
    .select({
      startedAt: editorActivitySessions.startedAt,
      endedAt: editorActivitySessions.endedAt,
      lastActivityAt: editorActivitySessions.lastActivityAt,
      activeSeconds: editorActivitySessions.activeSeconds,
    })
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.id, sessionId),
        eq(editorActivitySessions.projectId, projectId),
      ),
    )
    .limit(1);

  if (!activitySession)
    return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const snapshots = await db
    .select({
      id: editorTimelapseSnapshots.id,
      capturedAt: editorTimelapseSnapshots.capturedAt,
      stateData: editorTimelapseSnapshots.stateData,
    })
    .from(editorTimelapseSnapshots)
    .where(
      until
        ? and(
            eq(editorTimelapseSnapshots.sessionId, sessionId),
            lte(editorTimelapseSnapshots.capturedAt, until),
          )
        : eq(editorTimelapseSnapshots.sessionId, sessionId),
    )
    .orderBy(asc(editorTimelapseSnapshots.capturedAt));

  return NextResponse.json({
    session: {
      startedAt: activitySession.startedAt,
      endedAt: activitySession.endedAt,
      lastActivityAt: activitySession.lastActivityAt,
      activeSeconds: activitySession.activeSeconds,
    },
    snapshots,
  });
}
