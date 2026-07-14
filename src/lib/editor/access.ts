import { and, eq } from "drizzle-orm";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { TRACKING_BLOCKED_PROJECT_STATUSES } from "@/lib/projects/tracking-status";

export { TRACKING_BLOCKED_PROJECT_STATUSES };

export async function getEditorProject(projectId: number) {
  const session = await getSession();
  if (!session) return { session: null, project: null, isAdmin: false };

  const isAdmin = await isAdminSession(session);
  const rows = await db
    .select()
    .from(projects)
    .where(
      isAdmin
        ? eq(projects.id, projectId)
        : and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    )
    .limit(1);

  return { session, project: rows[0] ?? null, isAdmin };
}

export function canEditEditorProject(project: { status: string }) {
  return Boolean(project.status);
}

export function canWriteEditorProject(
  project: { status: string; userId: string },
  session: { user: { id: string } } | null,
) {
  return (
    !!session &&
    project.userId === session.user.id &&
    canEditEditorProject(project)
  );
}

export function canTrackEditorProject(
  project: { status: string; userId: string },
  session: { user: { id: string } } | null,
) {
  return (
    canWriteEditorProject(project, session) &&
    !TRACKING_BLOCKED_PROJECT_STATUSES.has(project.status)
  );
}
