import { asc, eq, inArray } from "drizzle-orm";
import { LoginButton } from "@/components/shared/auth-buttons";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { refreshYswsEligible, yswsReviewHold } from "@/lib/auth/hackclub";
import { db } from "@/lib/db/db";
import {
  projectEditorVersions,
  projectSubmissions,
  projects,
  user,
} from "@/lib/db/schema";
import { ReviewQueue } from "@/components/platform/review-queue";
import { ReviewQueueChart } from "@/components/platform/review-queue-chart";
import { loadReviewQueueStats } from "@/lib/admin/review-queue-stats";

// How many held makers this page re-checks against Hack Club Auth per load.
// Each one is an HTTP round trip and reviewers reload the queue constantly, so
// the rest keep their cached flag and get picked up on a later load.
const ELIGIBILITY_REFRESH_LIMIT = 10;

// Never let a flaky userinfo call take the whole queue down; the cached flag is
// the fallback and the approval gate re-checks anyway.
async function refreshedEligibility(userId: string) {
  try {
    return (await refreshYswsEligible(userId)).eligible;
  } catch {
    return null;
  }
}

export default async function AdminReviewPage() {
  const session = await getSession();
  if (!session) {
    return (
      <main className="max-w-3xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Review</h1>
        <p className="mt-2 text-sm text-black/60">Log in to continue.</p>
        <div className="mt-5">
          <LoginButton callbackURL="/platform/admin/review" />
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

  const submissionRows = await db
    .select({
      id: projects.id,
      submissionId: projectSubmissions.id,
      submissionNumber: projectSubmissions.submissionNumber,
      title: projects.title,
      hoursSpent: projectSubmissions.hoursSpent,
      screenshotUrl: projectSubmissions.screenshotUrl,
      status: projectSubmissions.status,
      submissionType: projectSubmissions.type,
      submissionSource: projectSubmissions.submissionSource,
      breadOnly: projectSubmissions.breadOnly,
      simulatorSketchy: projects.simulatorSketchy,
      shippedAt: projectSubmissions.submittedAt,
      userEmail: user.email,
      userId: user.id,
      yswsEligible: user.yswsEligible,
      yswsExempt: user.yswsExempt,
      kitType: projects.kitType,
      versionCount: db.$count(
        projectEditorVersions,
        eq(projectEditorVersions.projectId, projects.id),
      ),
    })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projectSubmissions.projectId, projects.id))
    .innerJoin(user, eq(projects.userId, user.id))
    .where(
      inArray(projectSubmissions.status, [
        "pending_review",
        "needs_changes",
        "approved",
        "fulfilled",
        "rejected",
      ]),
    )
    .orderBy(asc(projectSubmissions.submittedAt));

  // A resubmission is a new immutable submission row. Keep prior decisions in
  // history, but show reviewers only the newest row for each project/phase so
  // an old "needs changes" card cannot be mistaken for the current review.
  const latestSubmissions = new Map<string, (typeof submissionRows)[number]>();
  for (const submission of submissionRows) {
    latestSubmissions.set(
      `${submission.id}:${submission.submissionType}`,
      submission,
    );
  }
  const latest = [...latestSubmissions.values()].toSorted(
    (left, right) =>
      new Date(left.shippedAt ?? 0).getTime() -
      new Date(right.shippedAt ?? 0).getTime(),
  );

  // Makers who aren't YSWS eligible can still ship; their work just doesn't
  // reach a reviewer until Hack Club Auth says they're eligible (or an admin
  // exempts them). The cached flag only moves when the maker signs in or
  // submits, so a teen who verified in the meantime would stay held with
  // nothing to nudge it, hence the re-check for the ones actually waiting on a
  // decision.
  const heldUserIds = [
    ...new Set(
      latest
        .filter((row) => row.status === "pending_review" && yswsReviewHold(row))
        .map((row) => row.userId),
    ),
  ].slice(0, ELIGIBILITY_REFRESH_LIMIT);
  const refreshed = new Map(
    await Promise.all(
      heldUserIds.map(
        async (id) => [id, await refreshedEligibility(id)] as const,
      ),
    ),
  );

  const queue = latest.map((row) => ({
    ...row,
    yswsHold: yswsReviewHold({
      yswsEligible: refreshed.get(row.userId) ?? row.yswsEligible,
      yswsExempt: row.yswsExempt,
    }),
  }));

  const reviewQueueStats = await loadReviewQueueStats();

  return (
    <main className="space-y-5">
      <section className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <p className="text-xs font-black tracking-[0.18em] text-[#BD0F32] uppercase">
          Admin
        </p>
        <h1 className="mt-2 text-4xl font-black text-black">Project review</h1>
      </section>
      <ReviewQueueChart stats={reviewQueueStats} />
      <ReviewQueue projects={queue} />
    </main>
  );
}
