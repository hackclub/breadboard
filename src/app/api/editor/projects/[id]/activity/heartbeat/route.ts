import { NextResponse } from "next/server";
import { sendHeartbeat } from "@/lib/editor/actions";
import { enforceSameOrigin } from "@/lib/editor/security";

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

  const result = await sendHeartbeat(projectId);
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(result);
}
