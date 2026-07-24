import { and, asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { HiArrowLeft } from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import {
  BREAD_PER_HOUR,
  GOLD_BREAD_PER_HOUR,
  roundHours,
} from "@/lib/constants";
import { isBuildShip } from "@/lib/projects/project-type";
import { db } from "@/lib/db/db";
import {
  projectSubmissions,
  editorActivitySessions,
  editorScreenEvidenceFrames,
  projectJournals,
  projects,
  projectTimeAuditSegments,
  projectTimelapses,
  user,
} from "@/lib/db/schema";
import { ReviewWorkspace } from "@/components/platform/review-workspace";
import {
  nextPendingReviewProjectId,
  parseSkipParam,
} from "@/lib/admin/next-review";
import { unifiedJustificationForSubmission } from "@/lib/ysws/unified";

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default async function AdminReviewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ skip?: string }>;
}) {
  const { id } = await params;
  const { skip } = await searchParams;
  const projectId = Number(id);
  // Projects the reviewer chose to skip this session, carried in the URL so
  // auto-advance and the skip button keep passing over them.
  const skipIds = parseSkipParam(skip);
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
      // A fresh submission has no internalNote yet; fall back to the
      // justification written at the previous approval so re-reviews and
      // update ships start from what was already established.
      overrideHoursSpentJustification: sql<string>`case when ${projectSubmissions.internalNote} <> '' then ${projectSubmissions.internalNote} else ${projects.overrideHoursSpentJustification} end`,
      status: projectSubmissions.status,
      projectStatus: projects.status,
      reviewNote: projectSubmissions.userComment,
      reviewerCommentDraft: projectSubmissions.reviewerCommentDraft,
      breadAmount: projectSubmissions.breadAmount,
      submissionType: projectSubmissions.type,
      submissionSource: projectSubmissions.submissionSource,
      breadOnly: projectSubmissions.breadOnly,
      simulatorSketchy: projects.simulatorSketchy,
      projectType: projects.projectType,
      shippedAt: projectSubmissions.submittedAt,
      updatedAt: projectSubmissions.updatedAt,
      createdAt: projects.createdAt,
      kitType: projects.kitType,
      // Whether a kit has ever been ordered for this project. Set once, on the
      // first design approval, and used to stop an update ship from shipping a
      // second kit while still letting the reviewer send a first one to a
      // project that never got one (e.g. a prior bread-only ship).
      kitOrderId: projects.kitOrderId,
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
    sessionRows,
    screenEvidenceRows,
    submissionHistoryRows,
    auditSegmentRows,
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
    // Session rows (not a pre-aggregate) so this ship's window can be summed in
    // memory alongside the whole-project total, without a second round trip.
    db
      .select({
        startedAt: editorActivitySessions.startedAt,
        lastActivityAt: editorActivitySessions.lastActivityAt,
        activeSeconds: editorActivitySessions.activeSeconds,
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
    // Segment rows with the parent recording's date, so both the whole-project
    // and per-ship deduction totals can be computed in memory. Editor (tape)
    // segments window by their work time (startAt); Lapse segments window by
    // the recording they belong to (recordedAt).
    db
      .select({
        kind: projectTimeAuditSegments.kind,
        deductedSeconds: projectTimeAuditSegments.deductedSeconds,
        startAt: projectTimeAuditSegments.startAt,
        timelapseId: projectTimeAuditSegments.timelapseId,
        recordedAt: projectTimelapses.recordedAt,
      })
      .from(projectTimeAuditSegments)
      .leftJoin(
        projectTimelapses,
        eq(projectTimeAuditSegments.timelapseId, projectTimelapses.id),
      )
      .where(eq(projectTimeAuditSegments.projectId, projectId)),
  ]);
  const timelapses = timelapseRows.map((entry) => ({
    id: entry.id,
    name: entry.name,
    playbackUrl: entry.playbackUrl,
    thumbnailUrl: entry.thumbnailUrl,
    durationSeconds: entry.durationSeconds,
    recordedAt: toIso(entry.recordedAt),
  }));
  // The full Unified DB record for this ship: the manual override when one is
  // saved, otherwise the template composed live from review data.
  const unifiedRecord = await unifiedJustificationForSubmission(
    project.submissionId,
  );

  // Where to send the reviewer after they decide this one, so the queue flows
  // card to card without a detour back to the gallery. Skip past the current
  // project and anything deferred this session, and carry the skip set forward
  // so those stay skipped. This is a fallback; the workspace re-resolves the
  // target at decision time in case the queue shifted.
  const nextProjectId = await nextPendingReviewProjectId("materials", [
    projectId,
    ...skipIds,
  ]);
  const skipQuery = skipIds.length ? `?skip=${skipIds.join(",")}` : "";
  const nextHref = nextProjectId
    ? `/platform/admin/review/${nextProjectId}${skipQuery}`
    : "/platform/admin/review";

  const screenEvidence = screenEvidenceRows[0];

  // --- Per-ship time window ---
  // This ship's work spans from the previous approved ship's submission (which
  // closed its editor sessions, making it a clean accounting boundary) up to
  // this ship's submission. Time and audit deductions outside that window
  // belong to another ship, so counting them here would submit the same hours
  // twice (Unified DB rule). Everything is computed for both scopes: the per-
  // ship window (the default, what pays out) and the whole project (a view the
  // reviewer can toggle to). A first ship has no lower bound.
  const windowEndMs = project.shippedAt
    ? new Date(project.shippedAt).getTime()
    : Number.POSITIVE_INFINITY;
  const windowStartMs = submissionHistoryRows
    .filter(
      (entry) =>
        entry.id !== project.submissionId &&
        entry.submissionNumber < project.submissionNumber &&
        (entry.status === "approved" || entry.status === "fulfilled"),
    )
    .reduce(
      (max, entry) =>
        Math.max(
          max,
          entry.submittedAt ? new Date(entry.submittedAt).getTime() : 0,
        ),
      0,
    );
  const inWindow = (value: Date | string | null | undefined) => {
    if (!value) return false;
    const t = new Date(value).getTime();
    return t >= windowStartMs && t <= windowEndMs;
  };
  const latestOf = (
    rows: { date: Date | string | null }[],
  ): Date | string | null =>
    rows.reduce<Date | string | null>((latest, row) => {
      if (!row.date) return latest;
      if (!latest) return row.date;
      return new Date(row.date).getTime() > new Date(latest).getTime()
        ? row.date
        : latest;
    }, null);

  const shipSessions = sessionRows.filter((s) => inWindow(s.startedAt));
  const allTracked = sessionRows.reduce((sum, s) => sum + s.activeSeconds, 0);
  const shipTracked = shipSessions.reduce((sum, s) => sum + s.activeSeconds, 0);
  const allRecordingSeconds = timelapseRows.reduce(
    (sum, t) => sum + t.durationSeconds,
    0,
  );
  const shipRecordingSeconds = timelapseRows
    .filter((t) => inWindow(t.recordedAt))
    .reduce((sum, t) => sum + t.durationSeconds, 0);
  const allJournaled = journals.reduce(
    (sum, j) => sum + (j.activeSecondsCovered ?? 0),
    0,
  );
  const shipJournaled = journals
    .filter((j) => inWindow(j.createdAt))
    .reduce((sum, j) => sum + (j.activeSecondsCovered ?? 0), 0);

  const segInWindow = (seg: (typeof auditSegmentRows)[number]) =>
    seg.timelapseId == null ? inWindow(seg.startAt) : inWindow(seg.recordedAt);
  const auditAgg = (rows: typeof auditSegmentRows) => ({
    segmentCount: rows.length,
    removedSeconds: rows
      .filter((r) => r.kind === "removed")
      .reduce((sum, r) => sum + r.deductedSeconds, 0),
    deflatedSeconds: rows
      .filter((r) => r.kind === "deflated")
      .reduce((sum, r) => sum + r.deductedSeconds, 0),
  });

  const allMeasuredSeconds = allTracked + allRecordingSeconds;
  const shipMeasuredSeconds = shipTracked + shipRecordingSeconds;

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

  // The default approved hours is this ship's measured total, kept to 0.1h.
  // Windowing already excludes what earlier ships counted, so there's no floor
  // to subtract. Falls back to the stored value for manual / off-platform
  // submissions that carry no tracked time.
  const hoursSpent =
    shipMeasuredSeconds > 0
      ? roundHours(shipMeasuredSeconds / 3600)
      : project.hoursSpent;

  // The "latest screen proof" marker stays whole-project in both scopes; it's a
  // light evidence signal, not part of the paid measured total.
  const lastScreenEvidenceIso = toIso(screenEvidence?.lastScreenEvidenceAt);
  const trackingThisShip = {
    trackedSeconds: shipTracked,
    sessionCount: shipSessions.length,
    lastTrackedAt: toIso(
      latestOf(shipSessions.map((s) => ({ date: s.lastActivityAt }))),
    ),
    lastScreenEvidenceAt: lastScreenEvidenceIso,
    recordingSeconds: shipRecordingSeconds,
    measuredSeconds: shipMeasuredSeconds,
    journaledSeconds: shipJournaled,
  };
  const trackingAllTime = {
    trackedSeconds: allTracked,
    sessionCount: sessionRows.length,
    lastTrackedAt: toIso(
      latestOf(sessionRows.map((s) => ({ date: s.lastActivityAt }))),
    ),
    lastScreenEvidenceAt: lastScreenEvidenceIso,
    recordingSeconds: allRecordingSeconds,
    measuredSeconds: allMeasuredSeconds,
    journaledSeconds: allJournaled,
  };
  const windowStartIso =
    windowStartMs > 0 ? new Date(windowStartMs).toISOString() : null;

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
        project={{ ...project, hoursSpent }}
        nextHref={nextHref}
        skipIds={skipIds}
        unifiedRecord={unifiedRecord}
        journals={journals}
        timelapses={timelapses}
        submissionHistory={submissionHistory}
        tracking={trackingThisShip}
        trackingAllTime={trackingAllTime}
        windowStartIso={windowStartIso}
        timeAudit={auditAgg(auditSegmentRows.filter(segInWindow))}
        timeAuditAllTime={auditAgg(auditSegmentRows)}
        breadPerHour={
          isBuildShip(project) ? GOLD_BREAD_PER_HOUR : BREAD_PER_HOUR
        }
      />
    </main>
  );
}
