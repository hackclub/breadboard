"use client";

import { useState } from "react";
import { ProjectCard } from "./projects/project-card";
import { NewProjectModal } from "./projects/project-modals";
import type { PlatformProject } from "@/types";

type Project = PlatformProject;
type ProjectPatch = Partial<Project> & Pick<Project, "id">;

export function ProjectsBoard({ projects }: { projects: Project[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [items, setItems] = useState(projects);

  const addProject = (project: Project) => {
    setItems((current) => [project, ...current]);
  };

  const updateProject = (projectId: number, patch: ProjectPatch) => {
    setItems((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, ...patch } : project,
      ),
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex w-full items-center justify-center rounded-xl border border-black bg-[#BD0F32] px-5 py-3 text-sm font-black text-white shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5 hover:bg-black active:translate-y-0 sm:w-auto"
        >
          New project
        </button>
      </div>
      {createOpen ? (
        <NewProjectModal
          onCreated={addProject}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onProjectChange={(patch) => updateProject(project.id, patch)}
          />
        ))}
        {items.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-black bg-[#f4f4f4] p-8 shadow-[4px_4px_0_#000]">
            <p className="text-2xl font-black text-black">No projects yet</p>
            <p className="mt-2 max-w-md text-sm text-black/55">
              Start a project when you have something to build.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
