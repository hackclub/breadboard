"use client";

import { useActionState, useEffect, useState } from "react";
import { HiPhoto, HiArrowUpTray } from "react-icons/hi2";
import Image from "next/image";
import {
  createProjectFromForm,
  shipProjectFromForm,
  updateProjectBasicsFromForm,
} from "@/actions/projects";
import { createProjectScreenshotUpload } from "@/actions/uploads";
import { LoadingInline } from "@/components/shared/loading-card";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Input, inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PlatformProject, ProjectFormState } from "@/types";

type Project = PlatformProject;
type ProjectPatch = Partial<Project> & Pick<Project, "id">;

const initialProjectFormState: ProjectFormState = { success: false };

type ProjectActionModalProps = {
  project: Project;
  onClose: () => void;
};

export function NewProjectModal({
  onCreated,
  onClose,
}: {
  onCreated: (project: Project) => void;
  onClose: () => void;
}) {
  const [kitType, setKitType] = useState<"arduino" | "esp32">("arduino");
  const [state, formAction, pending] = useActionState(
    createProjectFromForm,
    initialProjectFormState,
  );

  useEffect(() => {
    if (!state.success || !state.project || !isProject(state.project)) return;
    onCreated(state.project);
    onClose();
  }, [state, onCreated, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="New project"
      title="What are you making?"
      tone="red"
      maxWidth="lg"
      footer={
        <ProjectModalFooter
          formId="new-project-form"
          pending={pending}
          pendingLabel="Creating"
          submitLabel="Create project"
          onClose={onClose}
        />
      }
    >
      <form id="new-project-form" action={formAction} className="grid gap-4">
        <FormField label="Project title" id="new-project-title">
          <Input
            id="new-project-title"
            name="title"
            required
            autoFocus
            placeholder="Pocket synth, plant monitor, LED game..."
            className="px-4 py-4 text-xl font-black"
          />
        </FormField>
        <FormField label="Short description" id="new-project-description">
          <textarea
            id="new-project-description"
            name="description"
            rows={5}
            placeholder="One or two sentences about the project."
            className={inputClass("px-4 py-3")}
          />
        </FormField>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-black/45">
            Which kit are you using?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["arduino", "esp32"] as const).map((value) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-4 rounded-[12px] border-2 p-4 transition",
                  kitType === value
                    ? "border-[#BD0F32] bg-[#fff5f7]"
                    : "border-black bg-white hover:bg-zinc-50",
                )}
              >
                <div className="relative size-16 shrink-0 overflow-hidden rounded-[10px] border border-black bg-white">
                  <Image
                    src={
                      value === "esp32"
                        ? "/assets/esp32.png"
                        : "/assets/arduino.png"
                    }
                    alt={value === "esp32" ? "ESP32 kit" : "Arduino kit"}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="kitType"
                      value={value}
                      checked={kitType === value}
                      onChange={() => setKitType(value)}
                      className="mt-0.5 size-4 accent-[#BD0F32]"
                    />
                    <p className="text-sm font-black text-black">
                      {value === "esp32"
                        ? "B - Advanced (ESP32)"
                        : "A - Beginner (Arduino)"}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-black/50">
                    {value === "esp32"
                      ? "ESP32 board, breadboard, more sensors, Wi-Fi support."
                      : "Arduino board, breadboard, basic components."}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </fieldset>
        <ProjectActionMessage message={state.message} />
      </form>
    </Modal>
  );
}

export function EditProjectModal({
  project,
  onSaved,
  onClose,
}: ProjectActionModalProps & {
  onSaved: (patch: ProjectPatch) => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateProjectBasicsFromForm,
    initialProjectFormState,
  );
  const [screenshotUrl, setScreenshotUrl] = useState(project.screenshotUrl);

  useEffect(() => {
    if (!state.success || !state.project) return;
    onSaved(state.project);
    onClose();
  }, [state, onSaved, onClose]);
  const formId = `edit-project-form-${project.id}`;

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Edit project"
      title="Project info"
      maxWidth="lg"
      footer={
        <ProjectModalFooter
          formId={formId}
          pending={pending}
          pendingLabel="Saving"
          submitLabel="Save changes"
          onClose={onClose}
        />
      }
    >
      <form id={formId} action={formAction} className="grid gap-4">
        <input type="hidden" name="projectId" value={project.id} />
        <FormField label="Project title" id={`project-title-${project.id}`}>
          <Input
            id={`project-title-${project.id}`}
            name="title"
            defaultValue={project.title}
            required
            autoFocus
            className="px-4 py-4 text-xl font-black"
          />
        </FormField>
        <FormField label="Description" id={`project-description-${project.id}`}>
          <textarea
            id={`project-description-${project.id}`}
            name="description"
            defaultValue={project.description}
            rows={6}
            className={inputClass("px-4 py-3")}
          />
        </FormField>
        <ScreenshotUploadField
          projectId={project.id}
          value={screenshotUrl}
          onChange={setScreenshotUrl}
        />
        <ProjectActionMessage message={state.message} />
      </form>
    </Modal>
  );
}

function ScreenshotUploadField({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const uploadScreenshot = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);

    try {
      const { uploadUrl, publicUrl } = await createProjectScreenshotUpload(
        projectId,
        file.type,
      );

      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) throw new Error("Upload failed. Try again.");
      onChange(publicUrl);
      setMessage("Screenshot uploaded. Save changes to keep it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-[14px] border border-black bg-[#f4f4f4] p-4 shadow-[2px_2px_0_#000]">
      <input type="hidden" name="screenshotUrl" value={value} />

      {value ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full border border-black bg-[#BD0F32] text-white shadow-[2px_2px_0_#000]">
              <HiPhoto className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-black">
                Screenshot saved
              </p>
              <p className="text-xs font-semibold text-black/50">
                Upload a new one to replace it.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full border border-black bg-white text-[#BD0F32] shadow-[2px_2px_0_#000]">
            <HiPhoto className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-black">Project screenshot</p>
            <p className="mt-1 text-xs font-semibold text-black/55">
              Required before you can ship.
            </p>
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-black bg-white px-4 py-3 text-sm font-black text-black shadow-[2px_2px_0_#000] transition hover:bg-black hover:text-white">
        <HiArrowUpTray className="size-5" />
        {uploading
          ? "Uploading..."
          : value
            ? "Replace screenshot"
            : "Upload screenshot"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) =>
            void uploadScreenshot(event.target.files?.[0] ?? null)
          }
          className="sr-only"
        />
      </label>

      {message ? (
        <p className="text-xs font-bold text-black/60" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function ShipProjectModal({
  project,
  onShipped,
  onClose,
}: ProjectActionModalProps & {
  onShipped: (patch: ProjectPatch) => void;
}) {
  const [state, formAction, pending] = useActionState(
    shipProjectFromForm,
    initialProjectFormState,
  );

  useEffect(() => {
    if (!state.success || !state.project) return;
    onShipped(state.project);
    onClose();
  }, [state, onShipped, onClose]);
  const formId = `ship-project-form-${project.id}`;
  const hasScreenshot = project.screenshotUrl.length > 0;
  const hasGitHubRepo = project.codeUrl.length > 0;
  const hasTitle = project.title.trim().length > 0;
  const hasDescription = project.description.trim().length > 0;
  const hasJournal = (project.journalCount ?? 0) > 0;

  if (!hasScreenshot) {
    return (
      <Modal
        open
        onClose={onClose}
        eyebrow="Submit design"
        title={project.title}
        maxWidth="lg"
        tone="red"
      >
        <div className="text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full border-2 border-black bg-white shadow-[4px_4px_0_#BD0F32]">
            <HiPhoto className="size-9 text-[#BD0F32]" />
          </div>
          <h2 className="mt-4 text-4xl font-black text-black">No screenshot</h2>
          <p className="mt-2 max-w-sm mx-auto text-sm font-semibold text-black/55">
            Open <span className="font-black text-black">Edit details</span> on
            the project card and upload a screenshot before you can submit.
          </p>
          <Button
            tone="paper"
            className="mt-6 rounded-full px-8"
            onClick={onClose}
          >
            Got it
          </Button>
        </div>
      </Modal>
    );
  }

  if (!hasGitHubRepo || !hasTitle || !hasDescription) {
    return (
      <Modal
        open
        onClose={onClose}
        eyebrow="Submit design"
        title={project.title}
        maxWidth="lg"
        tone="red"
      >
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-black/60">
            Finish these before submitting your design for review.
          </p>
          <SubmitRequirement done={hasTitle} label="Project name is saved" />
          <SubmitRequirement
            done={hasDescription}
            label="Project description is saved"
          />
          <SubmitRequirement
            done={hasGitHubRepo}
            label="GitHub repo is published from the editor"
          />
          <SubmitRequirement
            done
            label={`Demo share link will be /share/${project.id}`}
          />
          <SubmitRequirement done label="Hack Club Auth address is valid" />
          <Button
            tone="paper"
            className="justify-self-center rounded-full px-8"
            onClick={onClose}
          >
            Got it
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Submit design"
      title={project.title}
      maxWidth="2xl"
      footer={
        <ProjectModalFooter
          formId={formId}
          pending={pending}
          pendingLabel="Submitting"
          submitLabel="Submit design for review"
          onClose={onClose}
        />
      }
    >
      <form id={formId} action={formAction} className="grid gap-4">
        <input type="hidden" name="projectId" value={project.id} />
        <input
          type="hidden"
          name="screenshotUrl"
          value={project.screenshotUrl}
        />
        <div className="grid gap-3 rounded-xl border border-black bg-[#f4f4f4] p-4 text-sm font-bold text-black">
          <SubmitRequirement done label="Project name is saved" />
          <SubmitRequirement done label="Project description is saved" />
          <SubmitRequirement done label="Screenshot is uploaded" />
          <SubmitRequirement done label="GitHub repo is published" />
          <SubmitRequirement
            done
            label={`Demo share link: /share/${project.id}`}
          />
          <SubmitRequirement done label="Hack Club Auth address is valid" />
          <SubmitRequirement
            done={hasJournal}
            label="Write at least one journal entry in the editor"
          />
        </div>
        <ProjectActionMessage message={state.message} />
      </form>
    </Modal>
  );
}

function SubmitRequirement({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-black text-black">
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full border border-black text-[10px]",
          done ? "bg-green-200" : "bg-white text-black/40",
        )}
      >
        {done ? "✓" : ""}
      </span>
      {label}
    </div>
  );
}

function ProjectModalFooter({
  formId,
  pending,
  pendingLabel,
  submitLabel,
  onClose,
  disabled = false,
}: {
  formId: string;
  pending: boolean;
  pendingLabel: string;
  submitLabel: string;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button tone="paper" className="rounded-full" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={formId}
        disabled={pending || disabled}
        tone="primary"
        className="rounded-full px-6"
      >
        {pending ? <LoadingInline label={pendingLabel} /> : submitLabel}
      </Button>
    </div>
  );
}

function FormField({
  label,
  id,
  children,
  className,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        className="text-xs font-black uppercase tracking-[0.14em] text-black/45"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ProjectActionMessage({
  message,
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  if (!message) return null;

  return (
    <p
      className={`${className} text-sm font-bold text-[#BD0F32]`}
      aria-live="polite"
    >
      {message}
    </p>
  );
}

function isProject(project: ProjectPatch): project is Project {
  return (
    typeof project.title === "string" &&
    typeof project.email === "string" &&
    typeof project.description === "string" &&
    typeof project.status === "string" &&
    typeof project.kitType === "string"
  );
}
