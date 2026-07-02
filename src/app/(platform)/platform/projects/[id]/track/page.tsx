import { and, desc, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ExternalTrackingWorkspace } from "@/components/platform/projects/external-tracking-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { offPlatformBuilds } from "@/flags";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { editorActivitySessions, projectJournals, projects } from "@/lib/db/schema";

export default async function ExternalTrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await offPlatformBuilds())) notFound();
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const session = await getSession();
  if (!session) redirect(`/platform/projects`);

  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      screenshotUrl: projects.screenshotUrl,
      hackatimeUsername: projects.hackatimeUsername,
      hackatimeProjectName: projects.hackatimeProjectName,
      hackatimeSeconds: projects.hackatimeSeconds,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!project) notFound();

  // Tracking only accrues on drafts. Once submitted, send them back to the
  // project list where they can follow the review status.
  if (project.status !== "draft") redirect(`/platform/projects`);

  const [tracked] = await db
    .select({
      total: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
    })
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.projectId, projectId),
        eq(editorActivitySessions.userId, session.user.id),
      ),
    );

  const journalRows = await db
    .select({
      id: projectJournals.id,
      content: projectJournals.content,
      createdAt: projectJournals.createdAt,
    })
    .from(projectJournals)
    .where(eq(projectJournals.projectId, projectId))
    .orderBy(desc(projectJournals.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Off-platform build"
        title={project.title}
        description="Track your time and journal as you build off-platform, then submit for review. We measure your hours the same way we do for in-editor projects, so there's nothing to self-report."
      />
      <ExternalTrackingWorkspace
        projectId={project.id}
        title={project.title}
        screenshotUrl={project.screenshotUrl}
        trackedSeconds={tracked?.total ?? 0}
        journals={journalRows.map((entry) => ({
          id: entry.id,
          content: entry.content,
          createdAt: entry.createdAt.toISOString(),
        }))}
        hackatime={{
          username: project.hackatimeUsername,
          projectName: project.hackatimeProjectName,
          seconds: project.hackatimeSeconds,
        }}
      />
    </div>
  );
}
