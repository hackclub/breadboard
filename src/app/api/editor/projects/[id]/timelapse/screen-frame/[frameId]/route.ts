import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { editorScreenEvidenceFrames, projects } from "@/lib/db/schema";
import { createPresignedGetUrl } from "@/lib/storage/s3";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; frameId: string }> },
) {
  const { id, frameId } = await params;
  const projectId = Number(id);
  const evidenceFrameId = Number(frameId);
  if (!Number.isInteger(projectId) || !Number.isInteger(evidenceFrameId)) {
    return NextResponse.json({ error: "Invalid frame" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({
      userId: projects.userId,
      imageKey: editorScreenEvidenceFrames.imageKey,
    })
    .from(editorScreenEvidenceFrames)
    .innerJoin(projects, eq(editorScreenEvidenceFrames.projectId, projects.id))
    .where(
      and(
        eq(editorScreenEvidenceFrames.id, evidenceFrameId),
        eq(editorScreenEvidenceFrames.projectId, projectId),
      ),
    )
    .limit(1);

  if (!row || !row.imageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = await isAdminSession(session);
  if (!isAdmin && row.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.redirect(await createPresignedGetUrl(row.imageKey));
}
