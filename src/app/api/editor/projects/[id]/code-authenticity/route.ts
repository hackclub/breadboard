import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { analyzeCodeAuthenticity } from "@/lib/editor/codeAuthenticity";
import {
  editorActivitySessions,
  editorTimelapseSnapshots,
  projectEditorVersions,
  projects,
} from "@/lib/db/schema";

// Admin-only, on-demand. The report reads the full editor history (version
// payloads up to 5MB each plus timelapse snapshots), so it's computed here on
// request rather than eagerly in the review page's server render.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId))
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const sess = await getSession();
  if (!sess)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(sess)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!projectRows[0])
    return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  });

  return NextResponse.json(report);
}
