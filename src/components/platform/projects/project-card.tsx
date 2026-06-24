"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { HiLockClosed } from "react-icons/hi2";
import {
  archiveProjectFromForm,
  confirmKitReceivedFromForm,
  submitDemoFromForm,
} from "@/actions/projects";
import { createProjectDemoVideoUpload } from "@/actions/uploads";
import { storageReadUrl } from "@/lib/storage/urls";
import {
  canEditProjectCard,
  canShipProjectCard,
  isAfterKitApproved,
  projectFlowSteps,
  projectStatusCopy,
  projectStatusLabel,
  projectStepMeta,
} from "./project-status";
import { EditProjectModal, ShipProjectModal } from "./project-modals";
import { ProjectPreview } from "./project-preview";
import { Badge } from "@/components/ui/badge";
import { buttonClass, Button } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
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
  const shareUrl = `/share/${project.id}`;
  const [demoVideoUrl, setDemoVideoUrl] = useState("");
  const [demoUploading, setDemoUploading] = useState(false);
  const [demoPublishing, setDemoPublishing] = useState(false);
  const [demoMessage, setDemoMessage] = useState("");
  const [demoState, demoAction, demoPending] = useActionState(
    submitDemoFromForm,
    { success: false },
  );
  const editable = canEditProjectCard(project.status);
  const shippable = canShipProjectCard(project.status);
  const stepMeta = projectStepMeta(project.status);
  const statusTone =
    project.status === "materials_review" ||
    project.status === "demo_review" ||
    project.status === "needs_changes"
      ? ("red" as const)
      : project.status === "done" || project.status === "kit_sent"
        ? ("green" as const)
        : project.status === "kit_fulfillment"
          ? ("green" as const)
          : ("muted" as const);

  useEffect(() => {
    if (demoState.success && demoState.project)
      onProjectChange(demoState.project);
  }, [demoState, onProjectChange]);

  async function uploadDemoVideo(file: File | null) {
    if (!file) return;
    setDemoUploading(true);
    setDemoMessage("Uploading demo video...");
    try {
      const { uploadUrl, publicUrl } = await createProjectDemoVideoUpload(
        project.id,
        file.type,
      );
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed. Try again.");
      setDemoVideoUrl(publicUrl);
      setDemoUploading(false);
      setDemoPublishing(true);
      setDemoMessage("Updating GitHub README...");
      const publishResponse = await fetch(
        `/api/projects/${project.id}/github/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: publicUrl }),
        },
      );
      if (publishResponse.status === 409) {
        setDemoPublishing(false);
        setDemoMessage(
          "Demo uploaded. Connect GitHub from the editor to add it to your README automatically.",
        );
        return;
      }
      if (!publishResponse.ok) {
        const result = (await publishResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        setDemoPublishing(false);
        throw new Error(result?.error ?? "GitHub README update failed.");
      }
      setDemoPublishing(false);
      setDemoMessage("Demo uploaded and added to your GitHub README.");
    } catch (error) {
      setDemoPublishing(false);
      setDemoMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setDemoUploading(false);
    }
  }

  return (
    <Card className="group transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#BD0F32]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-black bg-[#f4f4f4]">
        <ProjectPreview project={project} />
      </div>

      <CardSection className="flex min-h-72 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone}>
              {projectStatusLabel(project.status)}
            </Badge>
            <Badge tone="ink">
              {project.kitType === "esp32" ? "ESP32" : "Arduino"}
            </Badge>
          </div>
          <span className="rounded-full border border-black bg-[#f4f4f4] px-2.5 py-1 text-xs font-black text-black shadow-[1px_1px_0_#000]">
            {project.hoursSpent}h
          </span>
        </div>

        <div className="mt-3 flex items-center gap-1">
          {projectFlowSteps.map((label, index) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className={`size-2 rounded-full ${
                  index + 1 === stepMeta.step
                    ? "bg-[#BD0F32]"
                    : index + 1 < stepMeta.step
                      ? "bg-black"
                      : "bg-black/15"
                }`}
                title={label}
              />
              {index < projectFlowSteps.length - 1 && (
                <div
                  className={`h-[2px] w-2 ${
                    index + 1 < stepMeta.step ? "bg-black" : "bg-black/15"
                  }`}
                />
              )}
            </div>
          ))}
          <span className="ml-2 text-[10px] font-black text-black/40">
            Step {stepMeta.step} of {projectFlowSteps.length}
          </span>
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
              className={buttonClass({ tone: "ink" })}
            >
              {isAfterKitApproved(project.status)
                ? "Continue editing"
                : "Open editor"}
            </Link>
          ) : null}
          {isAfterKitApproved(project.status) && editable ? (
            <p className="text-center text-[11px] font-bold text-black/45">
              Editing stays open. Extra editor time is not tracked after kit
              approval.
            </p>
          ) : null}
          {editable ? (
            <Button tone="paper" onClick={() => setEditOpen(true)}>
              Edit details
            </Button>
          ) : null}
          {editable ? (
            <form action={archiveProjectFromForm}>
              <input type="hidden" name="projectId" value={project.id} />
              <button
                type="submit"
                className="text-[11px] font-semibold text-black/30 underline transition hover:text-red-600"
                onClick={(e) => {
                  if (
                    !confirm(
                      "Archive this project? It will be hidden from active views but still exists internally. Reviews and submissions will stop.",
                    )
                  )
                    e.preventDefault();
                }}
              >
                Archive project
              </button>
            </form>
          ) : null}
          {shippable ? (
            <Button tone="primary" onClick={() => setShipOpen(true)}>
              {project.status === "needs_changes"
                ? "Submit again"
                : "Submit design"}
            </Button>
          ) : project.status === "kit_sent" ? (
            <form action={confirmKitReceivedFromForm}>
              <input type="hidden" name="projectId" value={project.id} />
              <Button type="submit" tone="primary">
                Confirm package received
              </Button>
            </form>
          ) : project.status === "building" ? (
            <form action={demoAction} className="grid gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="codeUrl" value={project.codeUrl} />
              <input type="hidden" name="demoVideoUrl" value={demoVideoUrl} />
              <input type="hidden" name="playableUrl" value={shareUrl} />
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-black bg-white px-3 py-2 text-sm font-black text-black shadow-[2px_2px_0_#000] no-underline"
              >
                Open read-only simulation demo
              </a>
              <div className="rounded-xl border border-black bg-[#fffaf1] p-3 text-xs font-bold text-black/65 shadow-[2px_2px_0_#000]">
                Upload your demo video here. Breadboard will add the public demo
                link to your GitHub README automatically.
              </div>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={demoUploading || demoPending}
                onChange={(event) =>
                  void uploadDemoVideo(event.target.files?.[0] ?? null)
                }
                className="rounded border border-black px-3 py-2 text-sm"
              />
              {demoVideoUrl ? (
                <video
                  src={storageReadUrl(demoVideoUrl)}
                  controls
                  className="h-32 rounded border border-black bg-black"
                >
                  <track kind="captions" />
                </video>
              ) : null}
              {demoVideoUrl ? (
                <p className="break-all rounded border border-black bg-white p-2 text-xs font-bold text-black/60">
                  Public demo video: {demoVideoUrl}
                </p>
              ) : null}
              {demoMessage ? (
                <p className="text-xs font-bold text-black/55">{demoMessage}</p>
              ) : null}
              <Button
                type="submit"
                tone="primary"
                disabled={
                  demoPending ||
                  demoUploading ||
                  demoPublishing ||
                  !demoVideoUrl
                }
              >
                {demoPending
                  ? "Submitting..."
                  : demoPublishing
                    ? "Loading..."
                    : demoUploading
                      ? "Uploading..."
                      : "Submit final demo"}
              </Button>
              {demoState.message ? (
                <p className="text-xs font-bold text-[#BD0F32]">
                  {demoState.message}
                </p>
              ) : null}
            </form>
          ) : (
            <Button tone="paper" disabled className="gap-2">
              <HiLockClosed className="size-4" />
              {project.status === "materials_review" ||
              project.status === "demo_review" ||
              project.status === "shipped"
                ? "Under review"
                : project.status === "done"
                  ? "Done"
                  : "Locked"}
            </Button>
          )}
        </div>
      </CardSection>
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
    </Card>
  );
}
