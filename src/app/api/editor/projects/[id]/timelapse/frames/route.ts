import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
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

  if (!isAdmin && project.userId !== sess.user.id) {
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
      .where(eq(editorActivitySessions.projectId, projectId))
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
      .where(inArray(editorTimelapseSnapshots.sessionId, sessionIds))
      .orderBy(desc(editorTimelapseSnapshots.capturedAt))
      .limit(MAX_STITCHED_FRAMES);
    const snapshots = newestSnapshots.toReversed();

    return NextResponse.json({
      sessions,
      snapshots,
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
    .where(eq(editorTimelapseSnapshots.sessionId, sessionId))
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
