import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { HiArrowLeft } from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { LapseAuditViewer } from "@/components/platform/lapse-audit-viewer";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  projectTimeAuditSegments,
  projectTimelapses,
  projects,
  user,
} from "@/lib/db/schema";

export default async function AdminLapseAuditPage({
  params,
}: {
  params: Promise<{ id: string; timelapseId: string }>;
}) {
  const { id, timelapseId } = await params;
  const projectId = Number(id);
  const recordingId = Number(timelapseId);
  const session = await getSession();
  const backHref = `/platform/admin/projects/${projectId}/timelapse/recording/${recordingId}`;

  if (!session) {
    return (
      <main className="max-w-4xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Lapse audit</h1>
        <p className="mt-2 text-sm text-black/60">Log in to continue.</p>
        <div className="mt-5">
          <LoginButton callbackURL={backHref} />
        </div>
      </main>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <main className="max-w-4xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Lapse audit</h1>
        <p className="mt-2 text-sm text-black/60">Admin access required.</p>
      </main>
    );
  }

  const [recording] = await db
    .select({
      id: projectTimelapses.id,
      name: projectTimelapses.name,
      playbackUrl: projectTimelapses.playbackUrl,
      durationSeconds: projectTimelapses.durationSeconds,
      projectTitle: projects.title,
      userName: user.name,
    })
    .from(projectTimelapses)
    .innerJoin(projects, eq(projects.id, projectTimelapses.projectId))
    .innerJoin(user, eq(user.id, projects.userId))
    .where(
      and(
        eq(projectTimelapses.id, recordingId),
        eq(projectTimelapses.projectId, projectId),
      ),
    )
    .limit(1);

  if (!recording) {
    return (
      <main className="max-w-4xl space-y-4">
        <Link
          href={`/platform/admin/review/${projectId}`}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-black text-white no-underline hover:bg-[#BD0F32]"
        >
          <HiArrowLeft className="size-4" />
          Back to review
        </Link>
        <div className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
          <h1 className="text-3xl font-black text-black">Not found</h1>
          <p className="mt-2 text-sm text-black/60">
            No recording #{recordingId} on project #{projectId}.
          </p>
        </div>
      </main>
    );
  }

  const segmentRows = await db
    .select({
      id: projectTimeAuditSegments.id,
      startSeconds: projectTimeAuditSegments.startSeconds,
      endSeconds: projectTimeAuditSegments.endSeconds,
      kind: projectTimeAuditSegments.kind,
      deflatedPercent: projectTimeAuditSegments.deflatedPercent,
      reason: projectTimeAuditSegments.reason,
      deductedSeconds: projectTimeAuditSegments.deductedSeconds,
      reviewerName: user.name,
      createdAt: projectTimeAuditSegments.createdAt,
    })
    .from(projectTimeAuditSegments)
    .leftJoin(user, eq(projectTimeAuditSegments.reviewerId, user.id))
    .where(eq(projectTimeAuditSegments.timelapseId, recordingId))
    .orderBy(asc(projectTimeAuditSegments.startSeconds));

  const initialSegments = segmentRows.map((row) => ({
    id: row.id,
    timelapseId: recordingId,
    startSeconds: row.startSeconds ?? 0,
    endSeconds: row.endSeconds ?? 0,
    kind: row.kind,
    deflatedPercent: row.deflatedPercent,
    reason: row.reason,
    deductedSeconds: row.deductedSeconds,
    reviewerName: row.reviewerName ?? "",
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <main className="space-y-4">
      <LapseAuditViewer
        projectId={projectId}
        timelapseId={recordingId}
        projectTitle={`${recording.projectTitle} · ${recording.userName}`}
        recordingName={recording.name}
        playbackUrl={recording.playbackUrl}
        durationSeconds={recording.durationSeconds}
        initialSegments={initialSegments}
      />
    </main>
  );
}
