import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { VelxioSnapshotViewer } from "@/components/velxio/VelxioSnapshotViewer";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import type { EditorSnapshotState } from "@/lib/editor/captureState";
import { toPublicProjectData } from "@/lib/editor/public-project";

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
    snapshot = toPublicProjectData(
      JSON.parse(project.editorData) as Record<string, unknown>,
    ) as unknown as EditorSnapshotState;
  } catch {
    notFound();
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#1e1e1e] text-white">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#3c3c3c] bg-[#252526] px-4 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 border border-[#BD0F32]/70 bg-[#BD0F32]/15 px-2 py-0.5 text-[10px] font-black tracking-[0.1em] text-[#ff9aad] uppercase">
                Shared demo
              </span>
              <h1 className="truncate text-sm font-bold text-[#f2f2f2] sm:text-base">
                {project.title}
              </h1>
            </div>
            {project.description ? (
              <p className="mt-1 truncate text-xs text-[#a8a8a8]">
                {project.description}
              </p>
            ) : null}
          </div>
          <span className="hidden shrink-0 text-xs text-[#a8a8a8] sm:inline">
            Edit and run freely. Changes aren't saved.
          </span>
        </header>
        <div className="min-h-0 flex-1">
          {/* executable: unlike the static GitHub Pages share, this page has
              the live backend behind it, so viewers can compile and run.
              sandbox: a full editable editor — viewers can change the
              schematic and code and re-run, but nothing persists (the snapshot
              viewer never wires autosave), so edits stay in their tab only. */}
          <VelxioSnapshotViewer
            snapshot={snapshot}
            interactive
            executable
            sandbox
          />
        </div>
      </div>
    </main>
  );
}
