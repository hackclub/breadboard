import { and, desc, eq, max, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { canEditEditorProject, getEditorProject } from "@/lib/editor/access";
import { db } from "@/lib/db/connection";
import { projectEditorVersions, projects } from "@/lib/db/schema";

const MAX_EDITOR_BYTES = 5_000_000;
const VERSION_INTERVAL_MS = 10 * 60 * 1000;
const MAX_VERSIONS_PER_PROJECT = 100;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isSafeEditorPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    data.format === "velxio-project" &&
    typeof data.version === "number" &&
    Array.isArray(data.boards) &&
    typeof data.fileGroups === "object" &&
    Array.isArray(data.components) &&
    Array.isArray(data.wires)
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) return error("Invalid project id", 400);

  const { project } = await getEditorProject(projectId);
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
      editable: canEditEditorProject(project),
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

  const { project } = await getEditorProject(projectId);
  if (!project) return error("Not found", 404);
  if (!canEditEditorProject(project)) return error("Project is locked", 423);

  const body = await request.json().catch(() => null);
  const editorData = body?.editorData;
  if (!isSafeEditorPayload(editorData))
    return error("Invalid editor data", 400);

  const serialized = JSON.stringify(editorData);
  if (serialized.length > MAX_EDITOR_BYTES)
    return error("Editor data too large", 413);

  const now = new Date();
  await db
    .update(projects)
    .set({ editorData: serialized, editorLastSavedAt: now, updatedAt: now })
    .where(eq(projects.id, projectId));

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

  return NextResponse.json({ savedAt: now.toISOString(), versionNumber });
}
