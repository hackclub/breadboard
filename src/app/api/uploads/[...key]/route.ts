import { NextResponse } from "next/server";
import { createPresignedGetUrl, storageKeyFromUrl } from "@/lib/storage/s3";

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
