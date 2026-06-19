"use server";

import { randomUUID } from "node:crypto";
import { requireSession } from "@/lib/auth/guards";
import { createPresignedPutUrl } from "@/lib/storage/s3";

const imageContentTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export async function createProjectScreenshotUpload(
  projectId: number,
  contentType: string,
) {
  const session = await requireSession();
  const id = Number(projectId);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid project");

  const extension = imageContentTypes.get(contentType);
  if (!extension) throw new Error("Upload a PNG, JPEG, or WebP image.");

  return createPresignedPutUrl({
    key: `project-screenshots/${session.user.id}/${id}/${randomUUID()}.${extension}`,
    contentType,
  });
}
