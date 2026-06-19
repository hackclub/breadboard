import { and, desc, eq, max, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { canWriteEditorProject, getEditorProject } from "@/lib/editor/access";
import { validateEditorPayload } from "@/lib/editor/payload";
import {
  enforceSameOrigin,
  hasAllowedContentLength,
} from "@/lib/editor/security";
import { db } from "@/lib/db/db";
import { projectEditorVersions, projects } from "@/lib/db/schema";

const VERSION_INTERVAL_MS = 10 * 60 * 1000;
const MAX_VERSIONS_PER_PROJECT = 100;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) return error("Invalid project id", 400);

  const { session, project } = await getEditorProject(projectId);
  if (!project) return error("Not found", 404);

  const url = new URL(request.url);
  const versionParam = url.searchParams.get("version");
  let editorData = project.editorData;
  let version: number | null = null;

  if (versionParam) {
    const versionNumber = Number(versionParam);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      return error("Invalid version", 400);
    }
    const rows = await db
      .select({ editorData: projectEditorVersions.editorData })
      .from(projectEditorVersions)
      .where(
        and(
          eq(projectEditorVersions.projectId, projectId),
          eq(projectEditorVersions.versionNumber, versionNumber),
        ),
      )
      .limit(1);
    if (!rows[0]) return error("Version not found", 404);
    editorData = rows[0].editorData;
    version = versionNumber;
  }

  return NextResponse.json({
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      editable: canWriteEditorProject(project, session),
      lastSavedAt: project.editorLastSavedAt,
    },
    version,
    editorData: editorData ? JSON.parse(editorData) : null,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) return error("Invalid project id", 400);
  if (!(await enforceSameOrigin(request))) return error("Forbidden", 403);
  if (!hasAllowedContentLength(request))
    return error("Editor data too large", 413);

  const { session, project } = await getEditorProject(projectId);
  if (!project) return error("Not found", 404);
  if (!canWriteEditorProject(project, session))
    return error("Project is locked", 423);

  const body = await request.json().catch(() => null);
  const editorData = body?.editorData;
  const validationError = validateEditorPayload(editorData);
  if (validationError) {
    return error(
      validationError,
      validationError.includes("large") ? 413 : 400,
    );
  }

  const serialized = JSON.stringify(editorData);
  if (serialized === project.editorData) {
    return NextResponse.json({
      savedAt: project.editorLastSavedAt?.toISOString() ?? null,
      versionNumber: null,
      unchanged: true,
    });
  }

  const now = new Date();
  await db
    .update(projects)
    .set({ editorData: serialized, editorLastSavedAt: now, updatedAt: now })
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    );

  const reason = typeof body?.reason === "string" ? body.reason : "autosave";
  const lastVersion = await db
    .select({ createdAt: projectEditorVersions.createdAt })
    .from(projectEditorVersions)
    .where(eq(projectEditorVersions.projectId, projectId))
    .orderBy(desc(projectEditorVersions.versionNumber))
    .limit(1);
  const shouldVersion =
    !lastVersion[0] ||
    reason === "manual" ||
    reason === "before-unload" ||
    now.getTime() - lastVersion[0].createdAt.getTime() >= VERSION_INTERVAL_MS;

  let versionNumber: number | null = null;
  if (shouldVersion) {
    const [current] = await db
      .select({ versionNumber: max(projectEditorVersions.versionNumber) })
      .from(projectEditorVersions)
      .where(eq(projectEditorVersions.projectId, projectId));
    versionNumber = (current.versionNumber ?? 0) + 1;
    await db.insert(projectEditorVersions).values({
      projectId,
      userId: project.userId,
      versionNumber,
      editorData: serialized,
      reason,
    });

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectEditorVersions)
      .where(eq(projectEditorVersions.projectId, projectId));
    const overflow = (countRow?.count ?? 0) - MAX_VERSIONS_PER_PROJECT;
    if (overflow > 0) {
      await db.execute(sql`
        delete from ${projectEditorVersions}
        where id in (
          select id from ${projectEditorVersions}
          where project_id = ${projectId}
          order by version_number asc
          limit ${overflow}
        )
      `);
    }
  }

  return NextResponse.json({
    savedAt: now.toISOString(),
    versionNumber,
    unchanged: false,
  });
}
