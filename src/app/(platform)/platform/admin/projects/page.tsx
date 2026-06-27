import { desc, eq, sql } from "drizzle-orm";
import { LoginButton } from "@/components/shared/auth-buttons";
import { AdminProjectsTable } from "@/components/platform/admin-projects-table";
import { AccessCard } from "@/components/ui/access-card";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectEditorVersions,
  projectTimeEntries,
  projects,
  user,
} from "@/lib/db/schema";

export default async function AdminProjectsPage() {
  const session = await getSession();
  if (!session) {
    return (
      <AccessCard
        eyebrow="Projects"
        title="Projects"
        message="Log in to inspect projects."
      >
        <LoginButton callbackURL="/platform/admin/projects" />
      </AccessCard>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <AccessCard
        eyebrow="Projects"
        title="Projects"
        message="Admin access is required."
      />
    );
  }

  const trackedSeconds = sql<number>`coalesce(sum(${projectTimeEntries.activeSeconds}) filter (where ${projectTimeEntries.counted} = true), 0)::int`;

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      lifecycleState: projects.lifecycleState,
      kitType: projects.kitType,
      hoursSpent: projects.hoursSpent,
      trackedSeconds,
      breadAmount: projects.breadAmount,
      country: projects.country,
      editorLastSavedAt: projects.editorLastSavedAt,
      createdAt: projects.createdAt,
      ownerName: user.name,
      ownerEmail: user.email,
      ownerSlackId: user.slackId,
      versionCount: db.$count(
        projectEditorVersions,
        eq(projectEditorVersions.projectId, projects.id),
      ),
      activitySessionCount: db.$count(
        editorActivitySessions,
        eq(editorActivitySessions.projectId, projects.id),
      ),
    })
    .from(projects)
    .innerJoin(user, eq(projects.userId, user.id))
    .leftJoin(projectTimeEntries, eq(projectTimeEntries.projectId, projects.id))
    .groupBy(
      projects.id,
      projects.title,
      projects.status,
      projects.lifecycleState,
      projects.kitType,
      projects.hoursSpent,
      projects.breadAmount,
      projects.country,
      projects.editorLastSavedAt,
      projects.createdAt,
      user.name,
      user.email,
      user.slackId,
    )
    .orderBy(desc(trackedSeconds))
    .limit(1000);

  return (
    <main className="max-w-7xl">
      <AdminProjectsTable
        projects={rows.map((row) => ({
          ...row,
          editorLastSavedAt: row.editorLastSavedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          trackedSeconds: row.trackedSeconds,
        }))}
      />
    </main>
  );
}
