import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { HiArrowLeft } from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { BREAD_PER_HOUR } from "@/lib/constants";
import { db } from "@/lib/db/db";
import {
  projectSubmissions,
  projectJournals,
  projects,
  user,
} from "@/lib/db/schema";
import { ReviewWorkspace } from "@/components/platform/review-workspace";

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
      shippedAt: projectSubmissions.submittedAt,
      updatedAt: projectSubmissions.updatedAt,
      createdAt: projects.createdAt,
      kitType: projects.kitType,
      userName: user.name,
      userEmail: user.email,
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

  const journals = await db
    .select()
    .from(projectJournals)
    .where(eq(projectJournals.projectId, projectId))
    .orderBy(asc(projectJournals.createdAt));

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
        breadPerHour={BREAD_PER_HOUR}
      />
    </main>
  );
}
