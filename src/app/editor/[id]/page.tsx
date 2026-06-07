import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { VelxioNextEditor } from "@/components/velxio/VelxioEditorClient";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/connection";
import { projects } from "@/lib/db/schema";
import { EditorHeader } from "../_components/EditorHeader";

export default async function ProjectEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/platform/projects");
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const isAdmin = await isAdminSession(session);
  const rows = await db
    .select()
    .from(projects)
    .where(
      isAdmin
        ? eq(projects.id, projectId)
        : and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    )
    .limit(1);
  const project = rows[0];
  if (!project) notFound();

  const isOwner = project.userId === session.user.id;
  const backHref =
    isAdmin && !isOwner
      ? `/platform/admin/review/${projectId}`
      : "/platform/projects";
  const backLabel = isAdmin && !isOwner ? "Review" : "Projects";

  const { version: versionParam } = await searchParams;
  const version = versionParam ? Number(versionParam) : undefined;
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    notFound();
  }
  if (
    version === undefined &&
    project.status !== "draft" &&
    project.status !== "needs_changes"
  ) {
    redirect("/platform/projects");
  }

  return (
    <>
      <EditorHeader
        backHref={backHref}
        backLabel={backLabel}
        projectTitle={project.title}
        version={version}
      />
      <div className="flex-1">
        <VelxioNextEditor projectId={project.id} version={version} />
      </div>
    </>
  );
}
