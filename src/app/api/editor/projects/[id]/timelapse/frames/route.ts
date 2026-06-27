import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  editorScreenEvidenceFrames,
  editorTimelapseSnapshots,
  projects,
} from "@/lib/db/schema";

const MAX_STITCHED_FRAMES = 600;

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
    const newestSnapshots = await db
      .select({
        id: editorTimelapseSnapshots.id,
        sessionId: editorTimelapseSnapshots.sessionId,
        capturedAt: editorTimelapseSnapshots.capturedAt,
        stateData: editorTimelapseSnapshots.stateData,
      })
      .from(editorTimelapseSnapshots)
      .where(
        until
          ? and(
              inArray(editorTimelapseSnapshots.sessionId, sessionIds),
              lte(editorTimelapseSnapshots.capturedAt, until),
            )
          : inArray(editorTimelapseSnapshots.sessionId, sessionIds),
      )
      .orderBy(desc(editorTimelapseSnapshots.capturedAt))
      .limit(MAX_STITCHED_FRAMES);
    const snapshots = newestSnapshots.toReversed();
    const newestScreenFrames = await db
      .select({
        id: editorScreenEvidenceFrames.id,
        sessionId: editorScreenEvidenceFrames.sessionId,
        capturedAt: editorScreenEvidenceFrames.capturedAt,
        imageUrl: sql<string>`case when ${editorScreenEvidenceFrames.imageKey} = '' then '' else '/api/editor/projects/' || ${projectId} || '/timelapse/screen-frame/' || ${editorScreenEvidenceFrames.id} end`,
        pixelChanged: editorScreenEvidenceFrames.pixelChanged,
        diffScore: editorScreenEvidenceFrames.diffScore,
        paused: editorScreenEvidenceFrames.paused,
      })
      .from(editorScreenEvidenceFrames)
      .where(
        until
          ? and(
              inArray(editorScreenEvidenceFrames.sessionId, sessionIds),
              lte(editorScreenEvidenceFrames.capturedAt, until),
            )
          : inArray(editorScreenEvidenceFrames.sessionId, sessionIds),
      )
      .orderBy(desc(editorScreenEvidenceFrames.capturedAt))
      .limit(MAX_STITCHED_FRAMES);
    const screenFrames = newestScreenFrames.toReversed();

    return NextResponse.json({
      sessions,
      snapshots,
      screenFrames,
      truncated: newestSnapshots.length === MAX_STITCHED_FRAMES,
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
