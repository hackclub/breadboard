import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { VelxioNextEditor } from "@/components/velxio/VelxioEditorClient";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { EditorHeader } from "../_components/EditorHeader";
import { audit } from "@/lib/audit";

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
  const editable =
    project.status === "draft" || project.status === "needs_changes";

  const { version: versionParam } = await searchParams;
  const version = versionParam ? Number(versionParam) : undefined;
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    notFound();
  }
  if (version === undefined && !editable) {
    redirect("/platform/projects");
  }
  const readOnly = version !== undefined || !isOwner || !editable;

  void audit("editor.access", "project", String(projectId));

  return (
    <>
      <EditorHeader
        backHref={backHref}
        backLabel={backLabel}
        projectTitle={project.title}
        version={version}
        readOnly={readOnly}
      />
      <div className="flex-1 relative">
        <VelxioNextEditor
          projectId={project.id}
          version={version}
          readOnly={readOnly}
        />
      </div>
    </>
  );
}
