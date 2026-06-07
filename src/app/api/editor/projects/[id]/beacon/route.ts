import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { canEditEditorProject, getEditorProject } from "@/lib/editor/access";
import { db } from "@/lib/db/connection";
import { projects } from "@/lib/db/schema";

const MAX_EDITOR_BYTES = 5_000_000;

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const { project } = await getEditorProject(projectId);
  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditEditorProject(project)) {
    return NextResponse.json({ error: "Project is locked" }, { status: 423 });
  }

  const body = await request.json().catch(() => null);
  const editorData = body?.editorData;
  if (!isSafeEditorPayload(editorData)) {
    return NextResponse.json({ error: "Invalid editor data" }, { status: 400 });
  }
  const serialized = JSON.stringify(editorData);
  if (serialized.length > MAX_EDITOR_BYTES) {
    return NextResponse.json(
      { error: "Editor data too large" },
      { status: 413 },
    );
  }

  const now = new Date();
  await db
    .update(projects)
    .set({ editorData: serialized, editorLastSavedAt: now, updatedAt: now })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ savedAt: now.toISOString() });
}
