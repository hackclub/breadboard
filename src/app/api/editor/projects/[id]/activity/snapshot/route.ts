import { NextResponse } from "next/server";
import { storeSnapshot } from "@/lib/editor/actions";
import {
  enforceSameOrigin,
  hasAllowedSnapshotContentLength,
} from "@/lib/editor/security";

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
  if (!hasAllowedSnapshotContentLength(request)) {
    return NextResponse.json({ error: "Snapshot too large" }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  const sessionId = Number(body?.sessionId);
  const stateData = typeof body?.stateData === "string" ? body.stateData : "";

  const result = await storeSnapshot(projectId, sessionId, stateData);
  return NextResponse.json(result);
}
