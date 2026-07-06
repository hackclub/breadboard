import { and, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { VelxioNextEditor } from "@/components/velxio/VelxioEditorClient";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectSubmissions,
  projects,
} from "@/lib/db/schema";
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
  const editable = isOwner;

  const { version: versionParam } = await searchParams;
  const version = versionParam ? Number(versionParam) : undefined;
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    notFound();
  }
  const canPersist = version === undefined && isOwner && editable;
  const adminPreview = isAdmin && !isOwner;
  const readOnly = !canPersist && !adminPreview;
  const submissionRows =
    version !== undefined
      ? await db
          .select({ submissionNumber: projectSubmissions.submissionNumber })
          .from(projectSubmissions)
          .where(
            and(
              eq(projectSubmissions.projectId, projectId),
              eq(projectSubmissions.editorVersionNumber, version),
            ),
          )
          .limit(1)
      : [];
  const reviewLabel = submissionRows[0]
    ? `Shipped snapshot #${submissionRows[0].submissionNumber}`
    : undefined;

  const [tracked] = isOwner
    ? await db
        .select({
          total: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
        })
        .from(editorActivitySessions)
        .where(
          and(
            eq(editorActivitySessions.projectId, projectId),
            eq(editorActivitySessions.userId, session.user.id),
          ),
        )
    : [];
  const trackedSeconds = tracked?.total ?? 0;

  void audit("editor.access", "project", String(projectId));

  return (
    <>
      <EditorHeader
        backHref={backHref}
        backLabel={backLabel}
        projectTitle={project.title}
        projectId={project.id}
        projectStatus={project.status}
        initialPublishUrl={project.codeUrl || null}
        initialHowToUse={project.howToUse || null}
        initialBom={project.bom || null}
        version={version}
        readOnly={readOnly}
        reviewLabel={reviewLabel}
        trackedSeconds={trackedSeconds}
      />
      {/* min-h-0 is load-bearing: without it this flex child grows to its
          content height, pushing the editor's bottom panels (serial monitor,
          oscilloscope) below the viewport. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <VelxioNextEditor
          projectId={project.id}
          version={version}
          readOnly={readOnly}
        />
      </div>
    </>
  );
}
