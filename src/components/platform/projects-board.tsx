"use client";

import { useState } from "react";
import { ProjectCard } from "./projects/project-card";
import { NewProjectModal } from "./projects/project-modals";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { PlatformProject } from "@/types";

type Project = PlatformProject;
type ProjectPatch = Partial<Project> & Pick<Project, "id">;

export function ProjectsBoard({
  projects,
  offPlatformEnabled = false,
}: {
  projects: Project[];
  offPlatformEnabled?: boolean;
}) {
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="projects"
        title="Your projects"
        action={
          <Button
            tone="primary"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => setCreateOpen(true)}
          >
            New project
          </Button>
        }
      />
      {createOpen ? (
        <NewProjectModal
          onCreated={addProject}
          onClose={() => setCreateOpen(false)}
          offPlatformEnabled={offPlatformEnabled}
        />
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onProjectChange={(patch) => updateProject(project.id, patch)}
            offPlatformEnabled={offPlatformEnabled}
          />
        ))}
        {items.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Start a project when you have something to build. Your editor, saves, review notes, versions, and timelapse will all attach to it."
            action={
              <Button tone="ink" onClick={() => setCreateOpen(true)}>
                Create your first project
              </Button>
            }
          />
        ) : null}
      </section>
    </div>
  );
}
