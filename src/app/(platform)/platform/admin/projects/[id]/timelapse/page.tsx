import { eq } from "drizzle-orm";
import Link from "next/link";
import { HiArrowLeft } from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projects, user } from "@/lib/db/schema";
import { TimelapseViewer } from "@/components/platform/timelapse-viewer";

export default async function AdminTimelapsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  const session = await getSession();
  if (!session) {
    return (
      <main className="max-w-4xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Timelapse</h1>
        <p className="mt-2 text-sm text-black/60">Log in to continue.</p>
        <div className="mt-5">
          <LoginButton
            callbackURL={`/platform/admin/projects/${projectId}/timelapse`}
          />
        </div>
      </main>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <main className="max-w-4xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Timelapse</h1>
        <p className="mt-2 text-sm text-black/60">Admin access required.</p>
      </main>
    );
  }

  const row = await db
    .select({ title: projects.title, userName: user.name })
    .from(projects)
    .innerJoin(user, eq(projects.userId, user.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  const project = row[0];
  if (!project) {
    return (
      <main className="max-w-4xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Not found</h1>
        <p className="mt-2 text-sm text-black/60">
          Project #{projectId} does not exist.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <TimelapseViewer
        projectId={projectId}
        projectTitle={`${project.title} · ${project.userName}`}
      />
    </main>
  );
}
