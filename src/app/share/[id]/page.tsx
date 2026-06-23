import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { VelxioSnapshotViewer } from "@/components/velxio/VelxioSnapshotViewer";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import type { EditorSnapshotState } from "@/lib/editor/captureState";

export default async function ProjectSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const [project] = await db
    .select({
      title: projects.title,
      description: projects.description,
      editorData: projects.editorData,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project?.editorData) notFound();

  let snapshot: EditorSnapshotState;
  try {
    snapshot = JSON.parse(project.editorData) as EditorSnapshotState;
  } catch {
    notFound();
  }

  return (
    <main className="h-screen overflow-hidden bg-[#1e1e1e] text-white">
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-[#333] bg-[#111] px-4 py-3">
          <p className="text-xs font-black tracking-[0.2em] text-[#ff6b86] uppercase">
            Read Only Demo
          </p>
          <h1 className="mt-1 truncate text-lg font-black">{project.title}</h1>
          {project.description ? (
            <p className="mt-1 line-clamp-1 text-xs text-[#aaa]">
              {project.description}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1">
          <VelxioSnapshotViewer snapshot={snapshot} interactive shareMode />
        </div>
      </div>
    </main>
  );
}
