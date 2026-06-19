import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { canWriteEditorProject, getEditorProject } from "@/lib/editor/access";
import { validateEditorPayload } from "@/lib/editor/payload";
import {
  enforceSameOrigin,
  hasAllowedContentLength,
} from "@/lib/editor/security";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  if (!(await enforceSameOrigin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasAllowedContentLength(request)) {
    return NextResponse.json(
      { error: "Editor data too large" },
      { status: 413 },
    );
  }

  const { session, project } = await getEditorProject(projectId);
  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canWriteEditorProject(project, session)) {
    return NextResponse.json({ error: "Project is locked" }, { status: 423 });
  }

  const body = await request.json().catch(() => null);
  const editorData = body?.editorData;
  const validationError = validateEditorPayload(editorData);
  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: validationError.includes("large") ? 413 : 400 },
    );
  }
  const serialized = JSON.stringify(editorData);
  if (serialized === project.editorData) {
    return NextResponse.json({
      savedAt: project.editorLastSavedAt?.toISOString() ?? null,
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

  return NextResponse.json({ savedAt: now.toISOString(), unchanged: false });
}
