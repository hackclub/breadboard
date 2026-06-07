import { and, eq } from "drizzle-orm";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/connection";
import { projects } from "@/lib/db/schema";

export const EDITABLE_PROJECT_STATUSES = ["draft", "needs_changes"] as const;

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
  return EDITABLE_PROJECT_STATUSES.includes(
    project.status as (typeof EDITABLE_PROJECT_STATUSES)[number],
  );
}
