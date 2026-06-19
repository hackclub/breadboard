import { asc, eq, inArray, sql } from "drizzle-orm";
import { LoginButton } from "@/components/shared/auth-buttons";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projectEditorVersions, projects, user } from "@/lib/db/schema";
import { ReviewQueue } from "@/components/platform/review-queue";

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

  const queue = await db
    .select({
      id: projects.id,
      title: projects.title,
      hoursSpent: projects.hoursSpent,
      screenshotUrl: projects.screenshotUrl,
      status: projects.status,
      shippedAt: projects.shippedAt,
      userEmail: user.email,
      kitType: projects.kitType,
      versionCount: db.$count(
        projectEditorVersions,
        eq(projectEditorVersions.projectId, projects.id),
      ),
    })
    .from(projects)
    .innerJoin(user, eq(projects.userId, user.id))
    .where(
      inArray(projects.status, [
        "shipped",
        "needs_changes",
        "reviewed",
        "paid_out",
        "fulfilled",
      ]),
    )
    .orderBy(asc(projects.shippedAt));

  return (
    <main className="space-y-5">
      <section className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <p className="text-xs font-black tracking-[0.18em] text-[#BD0F32] uppercase">
          Admin
        </p>
        <h1 className="mt-2 text-4xl font-black text-black">Project review</h1>
      </section>
      <ReviewQueue projects={queue} />
    </main>
  );
}
