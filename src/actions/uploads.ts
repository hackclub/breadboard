"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { createPresignedPutUrl } from "@/lib/storage/s3";

const imageContentTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

const videoContentTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
]);

async function assertProjectOwned(projectId: number, userId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) throw new Error("Project not found");
}

export async function createProjectScreenshotUpload(
  projectId: number,
  contentType: string,
) {
  const session = await requireSession();
  const id = Number(projectId);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid project");
  await assertProjectOwned(id, session.user.id);

  const extension = imageContentTypes.get(contentType);
  if (!extension) throw new Error("Upload a PNG, JPEG, or WebP image.");

  return createPresignedPutUrl({
    key: `project-screenshots/${session.user.id}/${id}/${randomUUID()}.${extension}`,
    contentType,
  });
}

export async function createProjectDemoVideoUpload(
  projectId: number,
  contentType: string,
) {
  const session = await requireSession();
  const id = Number(projectId);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid project");
  await assertProjectOwned(id, session.user.id);

  const extension = videoContentTypes.get(contentType);
  if (!extension) throw new Error("Upload an MP4, WebM, or MOV video.");
  const demoPath = `${id}/${randomUUID()}.${extension}`;

  const upload = await createPresignedPutUrl({
    key: `project-demo-videos/${demoPath}`,
    contentType,
  });
  return { ...upload, publicUrl: `/demo/${demoPath}` };
}
