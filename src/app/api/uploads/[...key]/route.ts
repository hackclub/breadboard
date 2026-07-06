import { type NextRequest, NextResponse } from "next/server";
import {
  createPresignedGetUrl,
  putStorageObject,
  storageKeyFromUrl,
} from "@/lib/storage/s3";
import {
  normalizeUploadContentType,
  verifyUploadToken,
} from "@/lib/storage/upload-token";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const rawKey = key.join("/");
  const resolvedKey = storageKeyFromUrl(`/api/uploads/${rawKey}`);
  if (!resolvedKey || resolvedKey.includes("..")) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
  }
  const signedUrl = await createPresignedGetUrl(resolvedKey);
  return NextResponse.redirect(signedUrl);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const rawKey = key.join("/");
  const resolvedKey = storageKeyFromUrl(`/api/uploads/${rawKey}`);
  if (!resolvedKey || resolvedKey.includes("..")) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
  }

  const contentType = normalizeUploadContentType(
    request.headers.get("content-type") ?? "",
  );
  const token = request.nextUrl.searchParams.get("token");
  if (!token || !verifyUploadToken(token, resolvedKey, contentType)) {
    return NextResponse.json(
      { error: "Invalid or expired upload token" },
      { status: 403 },
    );
  }

  const body = Buffer.from(await request.arrayBuffer());
  await putStorageObject({ key: resolvedKey, contentType, body });
  return new Response(null, { status: 204 });
}
