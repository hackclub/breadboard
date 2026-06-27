import { NextResponse } from "next/server";
import { getStorageObject } from "@/lib/storage/s3";

const validDemoKey = /^\d+\/[a-f0-9-]+\.(mp4|webm|mov)$/;

const demoContentTypes = new Map([
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
]);

function contentTypeForDemoPath(demoPath: string) {
  return demoContentTypes.get(demoPath.split(".").pop() ?? "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const demoPath = key.join("/");
  if (!validDemoKey.test(demoPath)) {
    return NextResponse.json({ error: "Invalid demo path" }, { status: 400 });
  }

  try {
    const object = await getStorageObject(`project-demo-videos/${demoPath}`);
    const body = object.Body?.transformToWebStream();
    if (!body) return new Response(null, { status: 404 });
    const contentType = contentTypeForDemoPath(demoPath);
    if (!contentType) {
      return new Response(null, { status: 404 });
    }

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
