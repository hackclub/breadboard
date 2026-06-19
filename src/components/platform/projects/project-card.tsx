"use client";

import Link from "next/link";
import { useState } from "react";
import {
  canEditProjectCard,
  canShipProjectCard,
  projectStatusCopy,
  projectStatusLabel,
} from "./project-status";
import { EditProjectModal, ShipProjectModal } from "./project-modals";
import { ProjectPreview } from "./project-preview";
import type { PlatformProject } from "@/types";

type Project = PlatformProject;
type ProjectPatch = Partial<Project> & Pick<Project, "id">;

export function ProjectCard({
  project,
  onProjectChange,
}: {
  project: Project;
  onProjectChange: (patch: ProjectPatch) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const editable = canEditProjectCard(project.status);
  const shippable = canShipProjectCard(project.status);

  return (
    <article className="group overflow-hidden rounded-[16px] border border-black bg-white shadow-[4px_4px_0_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#BD0F32]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-black bg-[#f4f4f4]">
        <ProjectPreview project={project} />
      </div>

      <div className="flex min-h-72 flex-col p-4">
        <div className="flex items-start justify-between gap-3 text-xs font-bold text-black/45">
          <span>
            {projectStatusLabel(project.status)} -{" "}
            {project.kitType === "esp32" ? "ESP32" : "Arduino"}
          </span>
          <span>{project.hoursSpent}h</span>
        </div>

        <div className="mt-3 min-w-0">
          <h2 className="line-clamp-2 text-2xl font-black leading-tight text-black">
            {project.title || "Untitled project"}
          </h2>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-black/60">
            {project.description || "No description yet."}
          </p>
        </div>

        {project.reviewNote ? (
          <div className="mt-4 rounded-xl border border-black bg-[#fffaf1] p-3 text-sm text-black shadow-[2px_2px_0_#000]">
            <p className="font-black">Review note</p>
            <p className="mt-1 line-clamp-3 text-black/70">
              {project.reviewNote}
            </p>
          </div>
        ) : null}

        <p className="mt-4 text-sm font-bold text-black/55">
          {projectStatusCopy(project.status)}
        </p>

        <div className="mt-auto grid gap-2 pt-4">
          {editable ? (
            <Link
              href={`/editor/${project.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-black bg-black px-4 py-3 text-sm font-black text-white no-underline shadow-[3px_3px_0_#BD0F32] transition hover:bg-[#BD0F32] active:translate-y-0.5"
            >
              Open editor
            </Link>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-xl border border-black bg-white px-4 py-3 text-sm font-black transition hover:bg-black hover:text-white active:translate-y-0.5"
            >
              Edit details
            </button>
          ) : null}
          {shippable ? (
            <button
              type="button"
              onClick={() => setShipOpen(true)}
              className="rounded-xl border border-black bg-[#BD0F32] px-4 py-3 text-sm font-black text-white shadow-[3px_3px_0_#000] transition hover:bg-black active:translate-y-0.5"
            >
              {project.status === "needs_changes" ? "Ship again" : "Ship"}
            </button>
          ) : null}
        </div>
      </div>
      {editOpen ? (
        <EditProjectModal
          project={project}
          onSaved={onProjectChange}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      {shipOpen ? (
        <ShipProjectModal
          project={project}
          onShipped={onProjectChange}
          onClose={() => setShipOpen(false)}
        />
      ) : null}
    </article>
  );
}
