import { and, asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { HiArrowLeft } from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { BREAD_PER_HOUR, GOLD_BREAD_PER_HOUR } from "@/lib/constants";
import { isBuildShip } from "@/lib/projects/project-type";
import { db } from "@/lib/db/db";
import {
  projectSubmissions,
  editorActivitySessions,
  editorScreenEvidenceFrames,
  projectJournals,
  projects,
  projectTimelapses,
  user,
} from "@/lib/db/schema";
import { ReviewWorkspace } from "@/components/platform/review-workspace";

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default async function AdminReviewProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  const session = await getSession();

  if (!session) {
    return (
      <main className="max-w-3xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Review</h1>
        <p className="mt-2 text-sm text-black/60">Log in to continue.</p>
        <div className="mt-5">
          <LoginButton callbackURL={`/platform/admin/review/${projectId}`} />
        </div>
      </main>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <main className="max-w-3xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Review</h1>
        <p className="mt-2 text-sm text-black/60">Admin access required.</p>
      </main>
    );
  }

  const row = await db
    .select({
      id: projects.id,
      submissionId: projectSubmissions.id,
      submissionNumber: projectSubmissions.submissionNumber,
      editorVersionNumber: projectSubmissions.editorVersionNumber,
      title: projects.title,
      email: projectSubmissions.email,
      playableUrl: projectSubmissions.playableUrl,
      demoVideoUrl: projectSubmissions.demoVideoUrl,
      codeUrl: projectSubmissions.codeUrl,
      screenshotUrl: projectSubmissions.screenshotUrl,
      description: projects.description,
      howToUse: projects.howToUse,
      firstName: projectSubmissions.firstName,
      lastName: projectSubmissions.lastName,
      addressLine1: projectSubmissions.addressLine1,
      addressLine2: projectSubmissions.addressLine2,
      city: projectSubmissions.city,
      region: projectSubmissions.region,
      country: projectSubmissions.country,
      postalCode: projectSubmissions.postalCode,
      birthday: projectSubmissions.birthday,
      hoursSpent: projectSubmissions.hoursSpent,
      overrideHoursSpent: projectSubmissions.approvedHours,
      overrideHoursSpentJustification: projectSubmissions.internalNote,
      status: projectSubmissions.status,
      projectStatus: projects.status,
      reviewNote: projectSubmissions.userComment,
      breadAmount: projectSubmissions.breadAmount,
      submissionType: projectSubmissions.type,
      submissionSource: projectSubmissions.submissionSource,
      breadOnly: projectSubmissions.breadOnly,
      projectType: projects.projectType,
      shippedAt: projectSubmissions.submittedAt,
      updatedAt: projectSubmissions.updatedAt,
      createdAt: projects.createdAt,
      kitType: projects.kitType,
      userName: user.name,
      userEmail: user.email,
      userSlackId: user.slackId,
      userId: projects.userId,
    })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projectSubmissions.projectId, projects.id))
    .innerJoin(user, eq(projects.userId, user.id))
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, "materials"),
      ),
    )
    .orderBy(desc(projectSubmissions.submittedAt))
    .limit(1);

  const project = row[0];
  if (!project) {
    return (
      <main className="max-w-3xl space-y-4">
        <Link
          href="/platform/admin/review"
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-black text-white no-underline hover:bg-[#BD0F32]"
        >
          <HiArrowLeft className="size-4" />
          Back to gallery
        </Link>
        <div className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
          <h1 className="text-3xl font-black text-black">Not found</h1>
          <p className="mt-2 text-sm text-black/60">
            Project #{projectId} does not exist.
          </p>
        </div>
      </main>
    );
  }

  const [
    journals,
    timelapseRows,
    activityRows,
    screenEvidenceRows,
    journalTimeRows,
    submissionHistoryRows,
  ] = await Promise.all([
    db
      .select()
      .from(projectJournals)
      .where(eq(projectJournals.projectId, projectId))
      .orderBy(asc(projectJournals.createdAt)),
    db
      .select({
        id: projectTimelapses.id,
        name: projectTimelapses.name,
        playbackUrl: projectTimelapses.playbackUrl,
        thumbnailUrl: projectTimelapses.thumbnailUrl,
        durationSeconds: projectTimelapses.durationSeconds,
        recordedAt: projectTimelapses.recordedAt,
      })
      .from(projectTimelapses)
      .where(eq(projectTimelapses.projectId, projectId))
      .orderBy(desc(projectTimelapses.recordedAt)),
    db
      .select({
        trackedSeconds: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
        sessionCount: sql<number>`count(${editorActivitySessions.id})::int`,
        lastTrackedAt: sql<Date | null>`max(${editorActivitySessions.lastActivityAt})`,
      })
      .from(editorActivitySessions)
      .where(eq(editorActivitySessions.projectId, projectId)),
    db
      .select({
        lastScreenEvidenceAt: sql<Date | null>`max(${editorScreenEvidenceFrames.receivedAt}) filter (where ${editorScreenEvidenceFrames.imageKey} <> '' and ${editorScreenEvidenceFrames.pixelChanged} = true)`,
      })
      .from(editorScreenEvidenceFrames)
      .where(eq(editorScreenEvidenceFrames.projectId, projectId)),
    db
      .select({
        journaledSeconds: sql<number>`coalesce(sum(${projectJournals.activeSecondsCovered}), 0)::int`,
      })
      .from(projectJournals)
      .where(eq(projectJournals.projectId, projectId)),
    db
      .select({
        id: projectSubmissions.id,
        submissionNumber: projectSubmissions.submissionNumber,
        editorVersionNumber: projectSubmissions.editorVersionNumber,
        hoursSpent: projectSubmissions.hoursSpent,
        trackedSeconds: projectSubmissions.trackedSeconds,
        approvedHours: projectSubmissions.approvedHours,
        status: projectSubmissions.status,
        userComment: projectSubmissions.userComment,
        submittedAt: projectSubmissions.submittedAt,
        reviewedAt: projectSubmissions.reviewedAt,
      })
      .from(projectSubmissions)
      .where(
        and(
          eq(projectSubmissions.projectId, projectId),
          eq(projectSubmissions.type, "materials"),
        ),
      )
      .orderBy(desc(projectSubmissions.submissionNumber)),
  ]);
  const timelapses = timelapseRows.map((entry) => ({
    id: entry.id,
    name: entry.name,
    playbackUrl: entry.playbackUrl,
    thumbnailUrl: entry.thumbnailUrl,
    durationSeconds: entry.durationSeconds,
    recordedAt: toIso(entry.recordedAt),
  }));
  const activity = activityRows[0];
  const screenEvidence = screenEvidenceRows[0];
  const recordingSeconds = timelapseRows.reduce(
    (total, entry) => total + entry.durationSeconds,
    0,
  );
  const journalTime = journalTimeRows[0];
  const submissionHistory = submissionHistoryRows
    .filter((entry) => entry.id !== project.submissionId)
    .map((entry) => ({
      id: entry.id,
      submissionNumber: entry.submissionNumber,
      editorVersionNumber: entry.editorVersionNumber,
      hoursSpent: entry.hoursSpent,
      trackedSeconds: entry.trackedSeconds,
      approvedHours: entry.approvedHours,
      status: entry.status,
      userComment: entry.userComment,
      submittedAt: toIso(entry.submittedAt),
      reviewedAt: toIso(entry.reviewedAt),
    }));

  return (
    <main className="space-y-4">
      <Link
        href="/platform/admin/review"
        className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-black text-white no-underline hover:bg-[#BD0F32]"
      >
        <HiArrowLeft className="size-4" />
        Back to gallery
      </Link>
      <ReviewWorkspace
        project={project}
        journals={journals}
        timelapses={timelapses}
        submissionHistory={submissionHistory}
        tracking={{
          trackedSeconds: activity?.trackedSeconds ?? 0,
          sessionCount: activity?.sessionCount ?? 0,
          lastTrackedAt: toIso(activity?.lastTrackedAt),
          lastScreenEvidenceAt: toIso(screenEvidence?.lastScreenEvidenceAt),
          recordingSeconds,
          measuredSeconds: (activity?.trackedSeconds ?? 0) + recordingSeconds,
          journaledSeconds: journalTime?.journaledSeconds ?? 0,
        }}
        breadPerHour={
          isBuildShip(project) ? GOLD_BREAD_PER_HOUR : BREAD_PER_HOUR
        }
      />
    </main>
  );
}
