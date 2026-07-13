import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { getStorageObject, storageKeyFromUrl } from "@/lib/storage/s3";

// Stable per-project screenshot URL, made for the published GitHub README:
// the image there keeps tracking whatever screenshot the project currently
// has, with no re-publish needed. Short max-age so GitHub's image proxy
// (camo) re-fetches within minutes of a new upload instead of pinning the
// old render.
const CACHE_CONTROL = "public, max-age=300";

function notFound() {
  return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const [project] = await db
    .select({ screenshotUrl: projects.screenshotUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.screenshotUrl.trim()) return notFound();

  const key = storageKeyFromUrl(project.screenshotUrl.trim());
  if (!key || key.includes("..")) {
    // Screenshot hosted somewhere other than our storage: hand the viewer on.
    try {
      const url = new URL(project.screenshotUrl.trim());
      if (url.protocol !== "https:") return notFound();
      return NextResponse.redirect(url, {
        headers: { "Cache-Control": CACHE_CONTROL },
      });
    } catch {
      return notFound();
    }
  }

  try {
    const object = await getStorageObject(key);
    const body = await object.Body?.transformToByteArray();
    if (!body) return notFound();
    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": object.ContentType ?? "image/png",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch {
    return notFound();
  }
}
