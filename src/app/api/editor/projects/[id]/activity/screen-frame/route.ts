import { NextResponse } from "next/server";
import { storeScreenEvidenceFrame } from "@/lib/editor/actions";
import { enforceSameOrigin } from "@/lib/editor/security";

const MAX_BODY_BYTES = 10_000_000;
const MAX_BATCH_FRAMES = 20;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  if (!(await enforceSameOrigin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Frame too large" }, { status: 413 });
  }

  const rawBody = await request.text().catch(() => "");
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Frame too large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = body as { frames?: unknown[] } | null;
  const frames = Array.isArray(payload?.frames) ? payload.frames : [payload];
  const results = [];
  for (const rawFrame of frames.slice(0, MAX_BATCH_FRAMES)) {
    const frame = rawFrame as Record<string, unknown> | null;
    const sessionId = Number(frame?.sessionId);
    results.push(
      await storeScreenEvidenceFrame(projectId, sessionId, {
        capturedAt:
          typeof frame?.capturedAt === "string" ? frame.capturedAt : "",
        imageData: typeof frame?.imageData === "string" ? frame.imageData : "",
        pixelChanged: Boolean(frame?.pixelChanged),
        diffScore: Number(frame?.diffScore ?? 0),
        screenWidth: Number(frame?.screenWidth ?? 0),
        screenHeight: Number(frame?.screenHeight ?? 0),
        paused: Boolean(frame?.paused),
      }),
    );
  }

  const result = {
    stored: results.some((item) => item.stored),
    storedCount: results.filter((item) => item.stored).length,
  };

  return NextResponse.json(result);
}
