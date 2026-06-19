import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { editorActivitySessions, projects } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId))
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminSession(session);
  const rows = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = rows[0];
  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isAdmin && project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = await db
    .select({
      id: editorActivitySessions.id,
      startedAt: editorActivitySessions.startedAt,
      endedAt: editorActivitySessions.endedAt,
      activeSeconds: editorActivitySessions.activeSeconds,
      lastActivityAt: editorActivitySessions.lastActivityAt,
    })
    .from(editorActivitySessions)
    .where(eq(editorActivitySessions.projectId, projectId))
    .orderBy(desc(editorActivitySessions.startedAt));

  return NextResponse.json({ sessions });
}
