"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireAdminSession, requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { createPresignedPutUrl } from "@/lib/storage/s3";
import {
  createUploadToken,
  normalizeUploadContentType,
} from "@/lib/storage/upload-token";

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

function signedUploadUrls(key: string, contentType: string) {
  const token = createUploadToken(key, contentType);
  return {
    uploadUrl: `/api/uploads/${key}?token=${encodeURIComponent(token)}`,
    publicUrl: `/api/uploads/${key}`,
  };
}

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

  const safeContentType = normalizeUploadContentType(contentType);
  const extension = imageContentTypes.get(safeContentType);
  if (!extension) throw new Error("Upload a PNG, JPEG, or WebP image.");

  const key = `project-screenshots/${session.user.id}/${id}/${randomUUID()}.${extension}`;
  return signedUploadUrls(key, safeContentType);
}

export async function createExternalScreenshotUpload(contentType: string) {
  const session = await requireSession();

  const safeContentType = normalizeUploadContentType(contentType);
  const extension = imageContentTypes.get(safeContentType);
  if (!extension) throw new Error("Upload a PNG, JPEG, or WebP image.");

  const key = `project-screenshots/${session.user.id}/external/${randomUUID()}.${extension}`;
  return signedUploadUrls(key, safeContentType);
}

export async function createProjectDemoVideoUpload(
  projectId: number,
  contentType: string,
) {
  const session = await requireSession();
  const id = Number(projectId);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid project");
  await assertProjectOwned(id, session.user.id);

  const safeContentType = normalizeUploadContentType(contentType);
  const extension = videoContentTypes.get(safeContentType);
  if (!extension) throw new Error("Upload an MP4, WebM, or MOV video.");
  const demoPath = `${id}/${randomUUID()}.${extension}`;

  const upload = await createPresignedPutUrl({
    key: `project-demo-videos/${demoPath}`,
    contentType: safeContentType,
  });
  return { ...upload, publicUrl: `/demo/${demoPath}` };
}

export async function createProductImageUpload(contentType: string) {
  const session = await requireAdminSession();
  const safeContentType = normalizeUploadContentType(contentType);
  const extension = imageContentTypes.get(safeContentType);
  if (!extension) throw new Error("Upload a PNG, JPEG, or WebP image.");

  const key = `product-images/${session.user.id}/${randomUUID()}.${extension}`;
  return signedUploadUrls(key, safeContentType);
}
