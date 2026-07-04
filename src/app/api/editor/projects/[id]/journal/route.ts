import { NextResponse } from "next/server";
import {
  addProjectJournal,
  listProjectJournals,
  updateProjectJournal,
} from "@/lib/editor/actions";
import { enforceSameOrigin } from "@/lib/editor/security";

function parseProjectId(id: string): number | null {
  const projectId = Number(id);
  return Number.isInteger(projectId) ? projectId : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  const result = await listProjectJournals(projectId);
  if (!result)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  if (!(await enforceSameOrigin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  try {
    const result = await addProjectJournal(
      projectId,
      String(body?.content ?? ""),
    );
    if (!result)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  if (!(await enforceSameOrigin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  try {
    const result = await updateProjectJournal(
      projectId,
      Number(body?.journalId),
      String(body?.content ?? ""),
    );
    if (!result)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
