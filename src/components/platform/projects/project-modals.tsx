"use client";

import { useActionState, useEffect, useState } from "react";
import {
  HiArrowUpTray,
  HiClock,
  HiCodeBracket,
  HiInformationCircle,
  HiPhoto,
  HiWrenchScrewdriver,
} from "react-icons/hi2";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  createExternalDraftFromForm,
  createProjectFromForm,
  shipProjectFromForm,
  submitCustomProjectFromForm,
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

type KitChoice = "arduino" | "esp32";
// The terminal path the user has picked in the New Project modal:
//  - editor: on-platform design in the Breadboard editor (regular bread + kit)
//  - offplatform-design: design off-platform, tracked on its own page
//    (regular bread + kit)
//  - build: off-platform build, tracked on its own page (gold bread, no kit)
type ProjectPath = "editor" | "offplatform-design" | "build";

// Cards for the Edit Project modal's ship-type picker. Same three paths as
// the New Project modal; switchNote shows when the user picks a different
// path than the project currently has.
const SHIP_TYPE_OPTIONS: Array<{
  value: ProjectPath;
  title: string;
  blurb: string;
  switchNote: string;
}> = [
  {
    value: "editor",
    title: "Editor ship",
    blurb: "Design the schematic and code in the online editor.",
    switchNote:
      "Everything carries over: tracked time, journals, all of it. You'll design and track in the online editor again. Approved design work earns regular bread and ships a kit.",
  },
  {
    value: "offplatform-design",
    title: "Off-platform design",
    blurb:
      "Design with your own tools, tracked on this project's page. Earns bread and ships a kit.",
    switchNote:
      "Everything carries over: tracked time, journals, all of it. You'll design with your own tools and track on this project's page. Approved designs earn regular bread and ship a kit.",
  },
  {
    value: "build",
    title: "Build ship",
    blurb:
      "Build off-platform with your own parts. Earns gold bread, no kit ships.",
    switchNote:
      "Everything carries over: tracked time, journals, all of it. You'll build and track on this project's own page, and shipping needs the build submission requirements (photos of the finished circuit and a working demo video). Approved builds earn gold bread instead of bread, and no kit ships.",
  },
];

function KitOption({
  value,
  selected,
  onSelect,
  name,
}: {
  value: KitChoice;
  selected: boolean;
  onSelect: () => void;
  name: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-4 rounded-[12px] border-2 p-4 transition",
        selected
          ? "border-[#BD0F32] bg-[#fff5f7]"
          : "border-black bg-white hover:bg-zinc-50",
      )}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-[10px] border border-black bg-white">
        <Image
          src={value === "esp32" ? "/assets/esp32.png" : "/assets/arduino.png"}
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
            name={name}
            value={value}
            checked={selected}
            onChange={onSelect}
            className="mt-0.5 size-4 accent-[#BD0F32]"
          />
          <p className="text-sm font-black text-black">
            {value === "esp32" ? "B - ESP32" : "A - Arduino"}
          </p>
        </div>
        <p className="mt-1 text-xs text-black/50">
          {value === "esp32"
            ? "ESP32 board, breadboard, sensors, and Wi-Fi/Bluetooth support."
            : "Arduino board, breadboard, sensors, and additional modules."}
        </p>
      </div>
    </label>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-[12px] border-2 p-4 text-left transition",
        selected
          ? "border-[#BD0F32] bg-[#fff5f7]"
          : "border-black bg-white hover:bg-zinc-50",
      )}
    >
      <span className="mt-0.5 shrink-0 text-[#BD0F32]">{icon}</span>
      <span>
        <span className="block text-sm font-black text-black">{title}</span>
        <span className="mt-0.5 block text-xs text-black/55">
          {description}
        </span>
      </span>
    </button>
  );
}

export function NewProjectModal({
  onCreated,
  onClose,
  offPlatformEnabled = false,
}: {
  onCreated: (project: Project) => void;
  onClose: () => void;
  offPlatformEnabled?: boolean;
}) {
  const router = useRouter();
  // "design" vs "build". When off-platform is disabled there's only the
  // on-platform design flow, so lock the class to design and skip the choice.
  const [projectClass, setProjectClass] = useState<"design" | "build">(
    "design",
  );
  // Which kind of design: arduino/esp32 build in the editor, or off-platform.
  const [designTarget, setDesignTarget] = useState<
    "arduino" | "esp32" | "offplatform"
  >("arduino");

  const path: ProjectPath =
    projectClass === "build"
      ? "build"
      : designTarget === "offplatform"
        ? "offplatform-design"
        : "editor";
  const isExternal = path !== "editor";

  const [editorState, editorAction, editorPending] = useActionState(
    createProjectFromForm,
    initialProjectFormState,
  );
  const [externalState, externalAction, externalPending] = useActionState(
    createExternalDraftFromForm,
    initialProjectFormState,
  );

  const state = isExternal ? externalState : editorState;
  const pending = isExternal ? externalPending : editorPending;

  useEffect(() => {
    // Editor designs land back on the board; off-platform projects open their
    // tracking page so the user can start logging time right away.
    if (editorState.success && editorState.project && isProject(editorState.project)) {
      onCreated(editorState.project);
      onClose();
    } else if (externalState.success && externalState.project?.id) {
      router.push(`/platform/projects/${externalState.project.id}/track`);
    }
  }, [editorState, externalState, onCreated, onClose, router]);

  // For the editor path the kit is the chosen board; off-platform designs send
  // their own kit choice; builds ship no kit.
  const editorKit: KitChoice = designTarget === "esp32" ? "esp32" : "arduino";

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
          submitLabel={isExternal ? "Create & start tracking" : "Create project"}
          onClose={onClose}
        />
      }
    >
      <form
        id="new-project-form"
        action={isExternal ? externalAction : editorAction}
        className="grid gap-4"
      >
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

        {/* Hidden fields the actions read. Off-platform designs default to the
            Arduino kit and let the user change it on the tracking page. */}
        <input type="hidden" name="kitType" value={editorKit} />
        <input
          type="hidden"
          name="projectType"
          value={projectClass === "build" ? "build" : "design"}
        />

        {offPlatformEnabled ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-black/45">
              What are you doing?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                selected={projectClass === "design"}
                onSelect={() => setProjectClass("design")}
                icon={<HiCodeBracket className="size-4" />}
                title="Design"
                description="Design a project, earn a kit to build it (as well as bread)!"
              />
              <ChoiceCard
                selected={projectClass === "build"}
                onSelect={() => setProjectClass("build")}
                icon={<HiWrenchScrewdriver className="size-4" />}
                title="Build"
                description="Have your parts? Earn golden bread by shipping your project!"
              />
            </div>
          </fieldset>
        ) : null}

        {projectClass === "design" ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-black/45">
              {offPlatformEnabled
                ? "How do you want to design it?"
                : "Which kit are you using?"}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <KitOption
                value="arduino"
                name="designTargetKit"
                selected={designTarget === "arduino"}
                onSelect={() => setDesignTarget("arduino")}
              />
              <KitOption
                value="esp32"
                name="designTargetKit"
                selected={designTarget === "esp32"}
                onSelect={() => setDesignTarget("esp32")}
              />
            </div>
            {offPlatformEnabled ? (
              <ChoiceCard
                selected={designTarget === "offplatform"}
                onSelect={() => setDesignTarget("offplatform")}
                icon={<HiArrowUpTray className="size-4" />}
                title="Off-platform design"
                description="Design with KiCad, Eagle, or another tool and track it here. You'll pick which kit to build on the tracking page."
              />
            ) : null}
          </fieldset>
        ) : null}

        <ProjectActionMessage message={state.message} />
      </form>
    </Modal>
  );
}

export function EditProjectModal({
  project,
  onSaved,
  onClose,
  offPlatformEnabled = false,
}: ProjectActionModalProps & {
  onSaved: (patch: ProjectPatch) => void;
  offPlatformEnabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateProjectBasicsFromForm,
    initialProjectFormState,
  );
  const [screenshotUrl, setScreenshotUrl] = useState(project.screenshotUrl);
  // Ship type is the (projectType, submissionSource) pair, same three paths
  // as the New Project modal. submissionSource alone can't distinguish an
  // off-platform design from a build.
  const initialShipType: ProjectPath =
    project.projectType === "build"
      ? "build"
      : project.submissionSource === "manual"
        ? "offplatform-design"
        : "editor";
  const [shipType, setShipType] = useState<ProjectPath>(initialShipType);
  const canSwitchShipType = offPlatformEnabled && project.status === "draft";

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
        {canSwitchShipType ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-black/45">
              How are you building this?
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SHIP_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[12px] border-2 p-4 transition",
                    shipType === option.value
                      ? "border-[#BD0F32] bg-[#fff5f7]"
                      : "border-black bg-white hover:bg-zinc-50",
                  )}
                >
                  <input
                    type="radio"
                    name="shipType"
                    value={option.value}
                    checked={shipType === option.value}
                    onChange={() => setShipType(option.value)}
                    className="mt-0.5 size-4 shrink-0 accent-[#BD0F32]"
                  />
                  <div>
                    <p className="text-sm font-black text-black">
                      {option.title}
                    </p>
                    <p className="text-xs text-black/50">{option.blurb}</p>
                  </div>
                </label>
              ))}
            </div>
            {shipType !== initialShipType ? (
              <p className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-600">
                <HiInformationCircle className="size-3.5 shrink-0" />
                {
                  SHIP_TYPE_OPTIONS.find((o) => o.value === shipType)
                    ?.switchNote
                }
              </p>
            ) : null}
          </fieldset>
        ) : null}
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

type ShipMode = "editor" | "external";

export function ShipProjectModal({
  project,
  onShipped,
  onClose,
}: ProjectActionModalProps & {
  onShipped: (patch: ProjectPatch) => void;
}) {
  const hasTrackedTime = (project.trackedSeconds ?? 0) > 0;
  const hasJournals = (project.journalCount ?? 0) > 0;
  const hasEditorData = hasTrackedTime || hasJournals;
  // Default to how the project was set up (its submission source), not a
  // tracked-time heuristic — builds also accrue tracked time and journals, so
  // the heuristic mislabeled them.
  const [mode, setMode] = useState<ShipMode>(
    project.submissionSource === "manual" ? "external" : "editor",
  );

  const [editorState, editorAction, editorPending] = useActionState(
    shipProjectFromForm,
    initialProjectFormState,
  );

  const [externalState, externalAction, externalPending] = useActionState(
    submitCustomProjectFromForm,
    initialProjectFormState,
  );

  const [screenshotUrl, setScreenshotUrl] = useState(project.screenshotUrl);

  const isEditor = mode === "editor";
  const state = isEditor ? editorState : externalState;
  const pending = isEditor ? editorPending : externalPending;

  useEffect(() => {
    if (!state.success || !state.project) return;
    onShipped(state.project);
    onClose();
  }, [state, onShipped, onClose]);

  const formId = `ship-project-form-${project.id}`;

  const hasScreenshot = screenshotUrl.length > 0;

  // Editor mode checks
  const hasGitHubRepo = project.codeUrl.length > 0;
  const hasTitle = project.title.trim().length > 0;
  const hasDescription = project.description.trim().length > 0;
  const hasHowToUse =
    project.howToUse.trim().split(/\s+/).filter(Boolean).length >= 3;

  const editorBlocked =
    isEditor &&
    (!hasScreenshot ||
      !hasGitHubRepo ||
      !hasTitle ||
      !hasDescription ||
      !hasHowToUse);
  const editorAllGood =
    isEditor &&
    hasScreenshot &&
    hasGitHubRepo &&
    hasTitle &&
    hasDescription &&
    hasHowToUse;

  const externalBlocked = !isEditor && !hasScreenshot;

  const submitLabel = isEditor
    ? "Submit design for review"
    : "Submit for review";

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Submit design"
      title={project.title}
      maxWidth="2xl"
      footer={
        <ProjectModalFooter
          formId={
            isEditor && editorAllGood
              ? formId
              : !isEditor && !externalBlocked
                ? formId
                : undefined
          }
          pending={pending}
          pendingLabel="Submitting"
          submitLabel={submitLabel}
          onClose={onClose}
          disabled={isEditor ? editorBlocked : externalBlocked}
        />
      }
    >
      <div className="mb-4 grid gap-2">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-black/50">
          How did you make this project?
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[12px] border-2 p-4 transition",
              isEditor
                ? "border-[#BD0F32] bg-[#fff5f7]"
                : "border-black bg-white hover:bg-zinc-50",
            )}
          >
            <input
              type="radio"
              name="shipMode"
              value="editor"
              checked={isEditor}
              onChange={() => setMode("editor")}
              className="size-4 accent-[#BD0F32]"
            />
            <div>
              <p className="text-sm font-black text-black">Breadboard editor</p>
              <p className="text-xs text-black/50">
                I built the schematic and code in the online editor.
              </p>
            </div>
          </label>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[12px] border-2 p-4 transition",
              !isEditor
                ? "border-[#BD0F32] bg-[#fff5f7]"
                : "border-black bg-white hover:bg-zinc-50",
            )}
          >
            <input
              type="radio"
              name="shipMode"
              value="external"
              checked={!isEditor}
              onChange={() => setMode("external")}
              className="size-4 accent-[#BD0F32]"
            />
            <div>
              <p className="text-sm font-black text-black">External tool</p>
              <p className="text-xs text-black/50">
                KiCad, Eagle, Fritzing, EasyEDA, or anything else.
              </p>
            </div>
          </label>
        </div>
        {!isEditor && hasEditorData ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-600">
            <HiInformationCircle className="size-3.5 shrink-0" />
            You have tracked editor time. Switching to External tool will not
            count it.
          </p>
        ) : null}
      </div>

      {isEditor ? (
        <form id={formId} action={editorAction} className="grid gap-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input
            type="hidden"
            name="screenshotUrl"
            value={project.screenshotUrl}
          />
          {editorBlocked ? (
            <div className="grid gap-3 rounded-xl border border-[#BD0F32]/30 bg-[#fff5f7] p-4 text-sm font-bold text-black shadow-[2px_2px_0_#BD0F32]/15">
              <p className="flex items-center gap-2 text-[#BD0F32]">
                <HiInformationCircle className="size-4" />
                <span className="font-black">
                  Finish these before submitting. Or switch to External tool.
                </span>
              </p>
              <div className="mt-1 grid gap-2">
                <SubmitRequirement
                  done={hasTitle}
                  label="Project name is saved"
                />
                <SubmitRequirement
                  done={hasDescription}
                  label="Project description is saved"
                />
                <SubmitRequirement
                  done={hasGitHubRepo}
                  label="GitHub repo is published from the editor"
                />
                <SubmitRequirement
                  done={hasHowToUse}
                  label="How-to-use instructions are published"
                />
                <SubmitRequirement
                  done={hasScreenshot}
                  label="Screenshot is uploaded"
                />
                <SubmitRequirement
                  done
                  label="Hack Club Auth address is valid"
                />
                <SubmitRequirement
                  done={hasJournals}
                  label="Write at least one journal entry in the editor"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 rounded-xl border border-black bg-[#f4f4f4] p-4 text-sm font-bold text-black">
              <SubmitRequirement done label="Project name is saved" />
              <SubmitRequirement done label="Project description is saved" />
              <SubmitRequirement
                done
                label="How-to-use instructions are published"
              />
              <SubmitRequirement done label="Screenshot is uploaded" />
              <SubmitRequirement done label="GitHub repo is published" />
              <SubmitRequirement
                done
                label={`Demo share link: /share/${project.id}`}
              />
              <SubmitRequirement done label="Hack Club Auth address is valid" />
              <SubmitRequirement
                done={hasJournals}
                label="Write at least one journal entry in the editor"
              />
            </div>
          )}
          <ProjectActionMessage message={state.message} />
        </form>
      ) : (
        <form id={formId} action={externalAction} className="grid gap-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="screenshotUrl" value={screenshotUrl} />

          {!hasScreenshot ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#BD0F32]/30 bg-[#fff5f7] p-3 text-sm text-[#BD0F32] shadow-[2px_2px_0_#BD0F32]/15">
              <HiInformationCircle className="mt-0.5 size-4 shrink-0" />
              <span className="font-black">
                Upload a screenshot before submitting.
              </span>
            </div>
          ) : null}

          <FormField label="Git repository URL" id={`custom-git-${project.id}`}>
            <Input
              id={`custom-git-${project.id}`}
              name="gitUrl"
              required
              autoFocus
              placeholder="https://github.com/your-username/your-project"
              className="px-4 py-3 font-mono text-sm"
            />
            <p className="mt-1.5 text-xs font-bold text-black/40">
              Must be a public repo with your schematic, code, README, and bill
              of materials. We'll check everything manually.
            </p>
            <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-[#BD0F32]/20 bg-[#fff5f7] p-2.5 text-xs text-black/70">
              <HiInformationCircle className="mt-0.5 size-3.5 shrink-0 text-[#BD0F32]" />
              <div>
                <p className="font-black">
                  Your repo must have a{" "}
                  <span className="text-[#BD0F32]">README.md</span> and{" "}
                  <span className="text-[#BD0F32]">journal.md</span>.
                </p>
                <p className="mt-0.5">
                  Even with external tools, you need to journal your build
                  process. We check these files before accepting your
                  submission.
                </p>
              </div>
            </div>
          </FormField>

          <ScreenshotUploadField
            projectId={project.id}
            value={screenshotUrl}
            onChange={setScreenshotUrl}
          />

          <div className="grid gap-1.5">
            <label
              htmlFor={`custom-hours-${project.id}`}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-black/45"
            >
              <HiClock className="size-3.5" />
              Hours spent
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`custom-hours-${project.id}`}
                name="hoursSpent"
                type="number"
                min={0}
                max={999}
                defaultValue={0}
                required
                className="w-28 px-4 py-3 text-xl font-black"
              />
              <span className="text-sm font-black text-black/50">hours</span>
            </div>
            <div className="mt-1 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <HiInformationCircle className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <p className="font-black">
                  We verify all hours. Be honest with your time.
                </p>
                <p className="mt-0.5">
                  We recommend tracking with{" "}
                  <span className="font-black">Hackatime</span> or{" "}
                  <span className="font-black">Lapse</span>. Untracked hours may
                  be adjusted during review.
                </p>
              </div>
            </div>
          </div>

          <fieldset className="rounded-xl border border-black bg-white p-4 shadow-[2px_2px_0_#000]">
            <legend className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-black/45">
              Your info
            </legend>
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <FormField label="Email" id={`custom-email-${project.id}`}>
                  <Input
                    id={`custom-email-${project.id}`}
                    name="email"
                    type="email"
                    defaultValue={project.email}
                    required
                    placeholder="you@example.com"
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
                <FormField
                  label="Birthday"
                  id={`custom-birthday-${project.id}`}
                >
                  <Input
                    id={`custom-birthday-${project.id}`}
                    name="birthday"
                    defaultValue={project.birthday}
                    required
                    placeholder="YYYY-MM-DD"
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <FormField label="First name" id={`custom-first-${project.id}`}>
                  <Input
                    id={`custom-first-${project.id}`}
                    name="firstName"
                    defaultValue={project.firstName}
                    required
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
                <FormField label="Last name" id={`custom-last-${project.id}`}>
                  <Input
                    id={`custom-last-${project.id}`}
                    name="lastName"
                    defaultValue={project.lastName}
                    required
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
              </div>
              <hr className="border-black/10" />
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/35">
                Shipping address
              </p>
              <FormField label="Address" id={`custom-addr1-${project.id}`}>
                <Input
                  id={`custom-addr1-${project.id}`}
                  name="addressLine1"
                  defaultValue={project.addressLine1}
                  required
                  placeholder="123 Main St"
                  className="px-3 py-2 text-sm"
                />
              </FormField>
              <FormField
                label="Address line 2"
                id={`custom-addr2-${project.id}`}
              >
                <Input
                  id={`custom-addr2-${project.id}`}
                  name="addressLine2"
                  defaultValue={project.addressLine2}
                  placeholder="Apt 4B"
                  className="px-3 py-2 text-sm"
                />
              </FormField>
              <div className="grid gap-2 sm:grid-cols-2">
                <FormField label="City" id={`custom-city-${project.id}`}>
                  <Input
                    id={`custom-city-${project.id}`}
                    name="city"
                    defaultValue={project.city}
                    required
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
                <FormField
                  label="State / Province"
                  id={`custom-region-${project.id}`}
                >
                  <Input
                    id={`custom-region-${project.id}`}
                    name="region"
                    defaultValue={project.region}
                    required
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <FormField label="Country" id={`custom-country-${project.id}`}>
                  <Input
                    id={`custom-country-${project.id}`}
                    name="country"
                    defaultValue={project.country}
                    required
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
                <FormField
                  label="ZIP / Postal code"
                  id={`custom-zip-${project.id}`}
                >
                  <Input
                    id={`custom-zip-${project.id}`}
                    name="postalCode"
                    defaultValue={project.postalCode}
                    required
                    className="px-3 py-2 text-sm"
                  />
                </FormField>
              </div>
            </div>
          </fieldset>

          <div className="rounded-xl border border-black/15 bg-zinc-50 p-4 text-sm text-black/60 shadow-[2px_2px_0_#000]/5">
            <p className="font-black text-black">What happens next?</p>
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-xs font-semibold">
              <li>
                A reviewer checks your build: repo, photos of the finished
                circuit, and a demo video of it working.
              </li>
              <li>
                If approved, you earn gold bread for your hours. No kit ships —
                you already built it.
              </li>
            </ol>
            <p className="mt-3 flex items-center gap-1.5 font-black text-black">
              <HiCodeBracket className="size-3.5" />
              Reminder: Everything must be in a public git repo.
            </p>
          </div>

          <ProjectActionMessage message={state.message} />
        </form>
      )}
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
  formId: string | undefined;
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
        type={formId ? "submit" : "button"}
        form={formId || undefined}
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
