"use client";

import { useActionState, useEffect, useState } from "react";
import { HiPhoto, HiArrowUpTray } from "react-icons/hi2";
import {
  createProjectFromForm,
  shipProjectFromForm,
  updateProjectBasicsFromForm,
} from "@/actions/projects";
import { createProjectScreenshotUpload } from "@/actions/uploads";
import { LoadingInline } from "@/components/shared/loading-card";
import { Modal } from "@/components/shared/modal";
import type { PlatformProject, ProjectFormState } from "@/types";

type Project = PlatformProject;
type ProjectPatch = Partial<Project> & Pick<Project, "id">;

const initialProjectFormState: ProjectFormState = { success: false };

const shipFields = [
  ["email", "Email"],
  ["playableUrl", "Playable URL"],
  ["codeUrl", "Code URL"],
  ["firstName", "First Name"],
  ["lastName", "Last Name"],
  ["birthday", "Birthday"],
  ["addressLine1", "Address line 1"],
  ["addressLine2", "Address line 2"],
  ["city", "City"],
  ["region", "State / Province"],
  ["country", "Country"],
  ["postalCode", "ZIP / Postal Code"],
] as const;

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
        <label className="flex flex-col gap-2">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
            Project title
          </span>
          <input
            name="title"
            required
            autoFocus
            placeholder="Pocket synth, plant monitor, LED game..."
            className="rounded-[12px] border border-black bg-[#f4f4f4] px-4 py-4 text-xl font-black outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
            Short description
          </span>
          <textarea
            name="description"
            rows={5}
            placeholder="One or two sentences about the project."
            className="rounded-[12px] border border-black bg-[#f4f4f4] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
          />
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-xs font-black uppercase tracking-[0.14em] text-black/45 mb-1">
            Which kit are you using?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["arduino", "esp32"] as const).map((value) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-[12px] border-2 p-4 transition ${
                  kitType === value
                    ? "border-[#BD0F32] bg-[#fff5f7]"
                    : "border-black bg-white hover:bg-zinc-50"
                }`}
              >
                <input
                  type="radio"
                  name="kitType"
                  value={value}
                  checked={kitType === value}
                  onChange={() => setKitType(value)}
                  className="mt-0.5 size-4 accent-[#BD0F32]"
                />
                <div>
                  <p className="text-sm font-black text-black">
                    {value === "esp32"
                      ? "B - Advanced (ESP32)"
                      : "A - Beginner (Arduino)"}
                  </p>
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
        <label className="flex flex-col gap-2">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
            Project title
          </span>
          <input
            name="title"
            defaultValue={project.title}
            required
            autoFocus
            className="rounded-[12px] border border-black bg-[#f4f4f4] px-4 py-4 text-xl font-black outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
            Description
          </span>
          <textarea
            name="description"
            defaultValue={project.description}
            rows={6}
            className="rounded-[12px] border border-black bg-[#f4f4f4] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
          />
        </label>
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

  if (!hasScreenshot) {
    return (
      <Modal
        open
        onClose={onClose}
        eyebrow="Ship project"
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
            the project card and upload a screenshot before you can ship.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-full border border-black bg-white px-8 py-3 text-sm font-black shadow-[3px_3px_0_#000] hover:bg-black hover:text-white"
          >
            Got it
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Ship project"
      title={project.title}
      maxWidth="2xl"
      footer={
        <ProjectModalFooter
          formId={formId}
          pending={pending}
          pendingLabel="Shipping"
          submitLabel="Submit for review"
          onClose={onClose}
        />
      }
    >
      <p className="mb-4 text-sm font-semibold text-black/60">
        Submit the project, source, screenshot, and shipping details for review.
      </p>
      <form
        id={formId}
        action={formAction}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        <input type="hidden" name="projectId" value={project.id} />
        <input
          type="hidden"
          name="screenshotUrl"
          value={project.screenshotUrl}
        />
        {shipFields.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-black/45">
              {label}
            </span>
            <input
              name={key}
              defaultValue={String(project[key])}
              required={key !== "addressLine2"}
              type={
                key === "email" ? "email" : key === "birthday" ? "date" : "text"
              }
              className="rounded-[10px] border border-black bg-[#f4f4f4] px-3 py-2 text-sm"
            />
          </label>
        ))}
        <ProjectActionMessage
          message={state.message}
          className="md:col-span-2 xl:col-span-3"
        />
      </form>
    </Modal>
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
      <button
        type="button"
        onClick={onClose}
        className="rounded-full border border-black bg-white px-5 py-3 text-sm font-black shadow-[3px_3px_0_#000] hover:bg-black hover:text-white"
      >
        Cancel
      </button>
      <button
        type="submit"
        form={formId}
        disabled={pending || disabled}
        className="rounded-full border border-black bg-[#BD0F32] px-6 py-3 text-sm font-black text-white shadow-[3px_3px_0_#000] hover:bg-black disabled:opacity-50"
      >
        {pending ? <LoadingInline label={pendingLabel} /> : submitLabel}
      </button>
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
