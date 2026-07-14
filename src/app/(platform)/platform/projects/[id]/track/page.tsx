import { and, desc, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ExternalTrackingWorkspace } from "@/components/platform/projects/external-tracking-workspace";
import { PageHeader } from "@/components/ui/page-header";
import { offPlatformBuilds } from "@/flags";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectJournals,
  projects,
  projectTimelapses,
  user,
} from "@/lib/db/schema";
import { lapseOAuthConfigured, lapseProgramKeyConfigured } from "@/lib/lapse";
import { isBuildShip } from "@/lib/projects/project-type";
import { isUpdateShipStatus } from "@/components/platform/projects/project-status";
import { resolveLapseUserId } from "@/lib/lapse-identity";

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
      projectType: projects.projectType,
      kitType: projects.kitType,
    })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    )
    .limit(1);

  if (!project) notFound();

  // Tracking accrues on drafts and on already-approved projects gathering new
  // hours for an update ship. While a ship is under review, send them back to
  // the project list where they can follow the status.
  if (project.status !== "draft" && !isUpdateShipStatus(project.status))
    redirect(`/platform/projects`);

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

  const [account] = await db
    .select({
      token: user.lapseAccessToken,
      lapseUserId: user.lapseUserId,
      lapseHandle: user.lapseHandle,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  // Auto-match the Lapse account by email once (persisted), so timelapses
  // appear with zero clicks when the emails line up.
  let lapseLinked = Boolean(account?.token) || Boolean(account?.lapseUserId);
  if (!lapseLinked && lapseProgramKeyConfigured()) {
    lapseLinked = Boolean(
      await resolveLapseUserId({
        id: session.user.id,
        email: session.user.email,
      }),
    );
  }

  const timelapseRows = await db
    .select({
      id: projectTimelapses.id,
      journalEntryId: projectTimelapses.journalEntryId,
      name: projectTimelapses.name,
      playbackUrl: projectTimelapses.playbackUrl,
      thumbnailUrl: projectTimelapses.thumbnailUrl,
      durationSeconds: projectTimelapses.durationSeconds,
    })
    .from(projectTimelapses)
    .where(eq(projectTimelapses.projectId, projectId));

  const timelapsesByJournal = new Map<number, typeof timelapseRows>();
  for (const row of timelapseRows) {
    if (row.journalEntryId === null) continue;
    const list = timelapsesByJournal.get(row.journalEntryId) ?? [];
    list.push(row);
    timelapsesByJournal.set(row.journalEntryId, list);
  }
  // Time contributed by attached recordings (Lapse durations; YouTube is 0
  // until a duration is fetched).
  const recordingSeconds = timelapseRows.reduce(
    (total, row) => total + (row.durationSeconds ?? 0),
    0,
  );

  const isBuild = isBuildShip(project);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isBuild ? "Build ship" : "Off-platform design"}
        title={project.title}
        description={
          isBuild
            ? "Track your time and journal as you build off-platform, then submit for review. We measure your hours the same way we do for in-editor projects, so there's nothing to self-report. Approved builds earn gold bread, and no kit ships since you already built it."
            : "Track your time and journal as you design off-platform, then submit for review. Approved designs earn bread, and we ship you a kit to build it!"
        }
      />
      {!isBuild ? (
        <div className="rounded-xl border border-black bg-[#fff5f7] p-4 text-sm font-semibold text-black shadow-[2px_2px_0_#000]">
          A simulation of your project. You have to somehow simulate the
          project, which means showing your firmware actually working on a
          simulation, not just the circuit, similar to a Wokwi simulation or the
          simulation on site!
        </div>
      ) : null}
      <ExternalTrackingWorkspace
        projectId={project.id}
        title={project.title}
        screenshotUrl={project.screenshotUrl}
        projectType={isBuild ? "build" : "design"}
        kitType={project.kitType === "esp32" ? "esp32" : "arduino"}
        trackedSeconds={tracked?.total ?? 0}
        recordingSeconds={recordingSeconds}
        journals={journalRows.map((entry) => ({
          id: entry.id,
          content: entry.content,
          createdAt: entry.createdAt.toISOString(),
          timelapses: (timelapsesByJournal.get(entry.id) ?? []).map((tl) => ({
            id: tl.id,
            name: tl.name,
            playbackUrl: tl.playbackUrl,
            thumbnailUrl: tl.thumbnailUrl,
            durationSeconds: tl.durationSeconds,
          })),
        }))}
        lapse={{
          oauthConfigured: lapseOAuthConfigured(),
          programEnabled: lapseProgramKeyConfigured(),
          connected: Boolean(account?.token),
          linked: lapseLinked,
          handle: account?.lapseHandle ?? "",
        }}
      />
    </div>
  );
}
