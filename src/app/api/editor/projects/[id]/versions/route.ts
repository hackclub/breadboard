import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getEditorProject } from "@/lib/editor/access";
import { db } from "@/lib/db/connection";
import { projectEditorVersions } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const { project } = await getEditorProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const versions = await db
    .select({
      id: projectEditorVersions.id,
      versionNumber: projectEditorVersions.versionNumber,
      reason: projectEditorVersions.reason,
      createdAt: projectEditorVersions.createdAt,
    })
    .from(projectEditorVersions)
    .where(eq(projectEditorVersions.projectId, projectId))
    .orderBy(desc(projectEditorVersions.versionNumber));

  return NextResponse.json({ versions });
}
