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

// Matches experimental.proxyClientMaxBodySize in next.config.ts. proxy.ts
// buffers the body up to that cap and silently drops the rest, so we reject
// anything at or over it with a clear error instead of storing a truncated
// (corrupt) object.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File is too large. Uploads must be 25MB or less." },
      { status: 413 },
    );
  }

  const body = Buffer.from(await request.arrayBuffer());
  // proxy.ts truncates bodies over the cap without erroring; if what we read is
  // short of what the client declared, the object would be corrupt. Reject it.
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > 0 &&
    body.byteLength < declaredLength
  ) {
    return NextResponse.json(
      { error: "Upload was truncated. Try a smaller file." },
      { status: 413 },
    );
  }

  await putStorageObject({ key: resolvedKey, contentType, body });
  return new Response(null, { status: 204 });
}
