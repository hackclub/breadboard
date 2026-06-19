import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { HiArrowLeft, HiArrowTopRightOnSquare } from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { Badge } from "@/components/ui/badge";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projectEditorVersions, projects, user } from "@/lib/db/schema";

function reasonLabel(reason: string): string {
  switch (reason) {
    case "autosave":
      return "Autosave";
    case "manual":
      return "Manual save";
    case "before-unload":
      return "Before unload";
    default:
      return reason;
  }
}

function reasonColor(reason: string): string {
  switch (reason) {
    case "autosave":
      return "bg-blue-100 text-blue-900";
    case "manual":
      return "bg-green-100 text-green-900";
    case "before-unload":
      return "bg-yellow-100 text-yellow-900";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

export default async function AdminProjectVersionsPage({
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
        <h1 className="text-3xl font-black text-black">Versions</h1>
        <p className="mt-2 text-sm text-black/60">Log in to continue.</p>
        <div className="mt-5">
          <LoginButton
            callbackURL={`/platform/admin/projects/${projectId}/versions`}
          />
        </div>
      </main>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <main className="max-w-4xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Versions</h1>
        <p className="mt-2 text-sm text-black/60">Admin access required.</p>
      </main>
    );
  }

  const [projectRow, versionRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        editorLastSavedAt: projects.editorLastSavedAt,
        userName: user.name,
      })
      .from(projects)
      .innerJoin(user, eq(projects.userId, user.id))
      .where(eq(projects.id, projectId))
      .limit(1),
    db
      .select({
        id: projectEditorVersions.id,
        versionNumber: projectEditorVersions.versionNumber,
        reason: projectEditorVersions.reason,
        createdAt: projectEditorVersions.createdAt,
      })
      .from(projectEditorVersions)
      .where(eq(projectEditorVersions.projectId, projectId))
      .orderBy(desc(projectEditorVersions.versionNumber)),
  ]);

  const project = projectRow[0];

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
      <Link
        href={`/platform/admin/review/${projectId}`}
        className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-black text-white no-underline hover:bg-[#BD0F32]"
      >
        <HiArrowLeft className="size-4" />
        Back to review
      </Link>

      <div className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.18em] text-[#BD0F32] uppercase">
              Editor versions
            </p>
            <h1 className="mt-2 text-3xl font-black text-black">
              {project.title}
            </h1>
            <p className="mt-1 text-sm text-black/50">
              by {project.userName} · {versionRows.length} version
              {versionRows.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href={`/editor/${projectId}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#BD0F32] px-4 py-2.5 text-sm font-black text-white no-underline hover:bg-black"
          >
            Open current
            <HiArrowTopRightOnSquare className="size-3.5" />
          </Link>
        </div>
      </div>

      {versionRows.length === 0 ? (
        <div className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
          <p className="text-sm text-black/50">
            No saved versions yet. Versions are created when the project is
            saved in the editor.
          </p>
        </div>
      ) : (
        <div className="rounded-[16px] border border-black bg-white shadow-[4px_4px_0_#000]">
          <div className="divide-y divide-zinc-100">
            {versionRows.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-black tabular-nums">
                    v{v.versionNumber}
                  </span>
                  <Badge className={reasonColor(v.reason)}>
                    {reasonLabel(v.reason)}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-black/40 tabular-nums">
                    {v.createdAt.toLocaleString()}
                  </span>
                  <Link
                    href={`/editor/${projectId}?version=${v.versionNumber}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-black text-black no-underline hover:bg-black hover:text-white"
                  >
                    View
                    <HiArrowTopRightOnSquare className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
