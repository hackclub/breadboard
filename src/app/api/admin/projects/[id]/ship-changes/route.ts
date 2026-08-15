import { NextResponse } from "next/server";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { shipChangesForProject } from "@/lib/projects/ship-changes";

// Admin-only, on-demand. Reads two full editor payloads (up to 5MB each) and,
// on the first view of a ship, talks to GitHub — too slow to sit in the review
// page's server render, so the card fetches it after paint.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId))
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const sess = await getSession();
  if (!sess)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdminSession(sess)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const changes = await shipChangesForProject(projectId);
  if (!changes)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(changes);
}
