"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ClipboardEvent,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  HiArrowUpTray,
  HiCheckCircle,
  HiClock,
  HiCpuChip,
  HiFilm,
  HiInformationCircle,
  HiPencilSquare,
  HiPhoto,
  HiPlayCircle,
  HiXMark,
} from "react-icons/hi2";
import {
  addExternalJournalFromForm,
  type AvailableTimelapse,
  connectLapseHandleFromForm,
  listAvailableTimelapses,
  removeJournalRecording,
  setOffPlatformDesignKit,
  submitExternalProjectFromForm,
  updateExternalJournalFromForm,
} from "@/actions/projects";
import { createExternalScreenshotUpload } from "@/actions/uploads";
import { ScreenShareTracker } from "@/app/editor/_components/ScreenShareTracker";
import { BreadIcon } from "@/components/shared/bread-amount";
import { isBuildShip, type ProjectType } from "@/lib/projects/project-type";
import { LoadingInline } from "@/components/shared/loading-card";
import { Markdown } from "@/components/shared/markdown";
import { Button, buttonClass } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { Input, inputClass, Label } from "@/components/ui/input";
import {
  BREAD_PER_HOUR,
  estimateBreadFromSeconds,
  GOLD_BREAD_PER_HOUR,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  parseYouTubeVideoId,
  parseYouTubeVideoIds,
  youtubeThumbnail,
  youtubeWatchUrl,
} from "@/lib/youtube";
import type { ProjectFormState } from "@/types";

const initialState: ProjectFormState = { success: false };

type AttachedTimelapse = {
  id: number;
  name: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
};

type JournalEntry = {
  id: number;
  content: string;
  createdAt: string;
  timelapses: AttachedTimelapse[];
};

type LapseState = {
  oauthConfigured: boolean;
  // Program key present: we can read the user's timelapses by their Hack Club
  // email with no connect step.
  programEnabled: boolean;
  connected: boolean;
  // A Lapse account is resolved (OAuth token, email auto-match, or handle).
  linked: boolean;
  handle: string;
};

export type ExternalTrackingWorkspaceProps = {
  projectId: number;
  title: string;
  screenshotUrl: string;
  trackedSeconds: number;
  // Time from attached recordings (Lapse timelapse durations).
  recordingSeconds: number;
  journals: JournalEntry[];
  lapse: LapseState;
  // "build" earns gold bread with no kit; "design" earns regular bread and
  // ships a kit after review (see lib/projects/project-type.ts).
  projectType: ProjectType;
  // The kit that ships for a design (chosen here, on the tracking page).
  kitType: "arduino" | "esp32";
};

function formatHours(seconds: number) {
  const hours = seconds / 3600;
  return hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1);
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

export function ExternalTrackingWorkspace({
  projectId,
  title,
  screenshotUrl: initialScreenshot,
  trackedSeconds,
  recordingSeconds,
  journals: initialJournals,
  lapse,
  projectType,
  kitType,
}: ExternalTrackingWorkspaceProps) {
  // Activity tracking is owned by ScreenShareTracker (managesActivityTracking):
  // nothing accrues until the user sets up tracking, and it never auto-pauses
  // on inactivity once started.
  const totalSeconds = trackedSeconds + recordingSeconds;
  const isBuild = isBuildShip(projectType);

  return (
    <div className="space-y-6">
      <Surface className="flex flex-col gap-3 bg-[#f4f4f4] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-black bg-[#BD0F32] text-white shadow-[2px_2px_0_#000]">
              <HiClock className="size-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
                Measured time
              </p>
              <p className="text-2xl font-black text-black">
                {formatHours(totalSeconds)}h
              </p>
              <p className="text-xs font-semibold text-black/50">
                {formatHours(trackedSeconds)}h screen-tracked ·{" "}
                {formatHours(recordingSeconds)}h from recordings
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-black bg-white shadow-[2px_2px_0_#000]">
              <BreadIcon size="sm" gold={isBuild} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
                {isBuild ? "Estimated gold bread" : "Estimated bread"}
              </p>
              <p className="text-2xl font-black text-black">
                ~{estimateBreadFromSeconds(totalSeconds)}
              </p>
              <p className="text-xs font-semibold text-black/50">
                Estimate only · {isBuild ? GOLD_BREAD_PER_HOUR : BREAD_PER_HOUR}{" "}
                {isBuild ? "gold bread" : "bread"} per approved hour, paid out
                after review
              </p>
            </div>
          </div>
        </div>
      </Surface>

      {!isBuild ? <KitCard projectId={projectId} initialKit={kitType} /> : null}

      <LapseCard projectId={projectId} lapse={lapse} />

      <JournalCard
        projectId={projectId}
        journals={initialJournals}
        lapseEnabled={lapse.connected || (lapse.programEnabled && lapse.linked)}
      />

      <SubmitCard
        projectId={projectId}
        initialScreenshot={initialScreenshot}
        isBuild={isBuild}
      />

      <p className="text-center text-xs font-semibold text-black/45">
        Working on {title}.{" "}
        <Link
          href="/platform/projects"
          className="font-black text-[#BD0F32] underline"
        >
          Back to your projects
        </Link>
      </p>
    </div>
  );
}

const KIT_META = {
  arduino: {
    label: "A - Arduino",
    image: "/assets/arduino.png",
    blurb: "Arduino board, breadboard, sensors, and additional modules.",
  },
  esp32: {
    label: "B - ESP32",
    image: "/assets/esp32.png",
    blurb: "ESP32 board, breadboard, sensors, and Wi-Fi/Bluetooth support.",
  },
} as const;

// Kit picker for off-platform designs. A kit still ships for these, so the
// builder chooses it here (and can change it right up until they submit).
function KitCard({
  projectId,
  initialKit,
}: {
  projectId: number;
  initialKit: "arduino" | "esp32";
}) {
  const [kit, setKit] = useState<"arduino" | "esp32">(initialKit);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const choose = (next: "arduino" | "esp32") => {
    if (next === kit || pending) return;
    const previous = kit;
    setKit(next);
    setError(null);
    startTransition(async () => {
      try {
        await setOffPlatformDesignKit(projectId, next);
      } catch (e) {
        setKit(previous);
        setError(
          e instanceof Error ? e.message : "Couldn't save your kit choice.",
        );
      }
    });
  };

  return (
    <Surface className="grid gap-3 bg-white">
      <div className="flex items-center gap-2">
        <HiCpuChip className="size-5 text-[#BD0F32]" />
        <h2 className="text-lg font-black text-black">
          Which kit should ship?
        </h2>
      </div>
      <p className="text-xs font-semibold text-black/55">
        We&apos;ll send you this kit to build your design once it&apos;s
        approved. You can change it any time before you submit.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["arduino", "esp32"] as const).map((value) => {
          const meta = KIT_META[value];
          return (
            <button
              type="button"
              key={value}
              onClick={() => choose(value)}
              disabled={pending}
              className={cn(
                "flex items-start gap-4 rounded-[12px] border-2 p-4 text-left transition disabled:opacity-70",
                kit === value
                  ? "border-[#BD0F32] bg-[#fff5f7]"
                  : "border-black bg-white hover:bg-zinc-50",
              )}
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-[10px] border border-black bg-white">
                <Image
                  src={meta.image}
                  alt={meta.label}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <div>
                <p className="text-sm font-black text-black">{meta.label}</p>
                <p className="mt-1 text-xs text-black/50">{meta.blurb}</p>
              </div>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-xs font-bold text-[#BD0F32]">{error}</p>
      ) : null}
    </Surface>
  );
}

type RecordingMethod = "onplatform" | "lapse" | "youtube";
const METHOD_STORAGE_KEY = "breadboard:track-method";
const RECORDING_METHODS = [
  {
    value: "onplatform" as const,
    label: "On-platform recording",
    icon: HiClock,
  },
  { value: "lapse" as const, label: "Lapse", icon: HiFilm },
  { value: "youtube" as const, label: "YouTube", icon: HiPlayCircle },
];

// Live preview list for whatever YouTube links are currently typed into a
// journal form's link field. Each valid link renders through MediaPreview,
// which handles the YouTube embed path.
function YouTubePreviewList({ urls }: { urls: string }) {
  const ids = parseYouTubeVideoIds(urls);
  if (!urls.trim()) return null;
  if (!ids.length) {
    return (
      <p className="text-xs font-semibold text-amber-700">
        That doesn&apos;t look like a valid YouTube link yet.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ids.map((id) => (
        <MediaPreview
          key={id}
          name={id}
          playbackUrl={youtubeWatchUrl(id)}
          thumbnailUrl={youtubeThumbnail(id)}
          durationSeconds={0}
        />
      ))}
    </div>
  );
}

// Thumbnail that expands into an inline player for an attached recording. A
// YouTube playback URL embeds via its player; anything else (Lapse) plays in a
// native video element.
function MediaPreview({
  name,
  playbackUrl,
  thumbnailUrl,
  durationSeconds,
}: {
  name: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
}) {
  const [open, setOpen] = useState(false);
  const youTubeId = playbackUrl ? parseYouTubeVideoId(playbackUrl) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-black/15 bg-white">
      {open ? (
        <div className="relative aspect-video w-full bg-black">
          {youTubeId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youTubeId}`}
              title={name || "Recording"}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            // biome-ignore lint/a11y/useMediaCaption: user recordings have no caption track
            <video
              src={playbackUrl}
              poster={thumbnailUrl || undefined}
              controls
              className="absolute inset-0 h-full w-full"
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block w-full"
          aria-label={`Play ${name || "recording"}`}
          disabled={!playbackUrl}
        >
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt=""
              className="aspect-video w-full object-cover"
            />
          ) : (
            <span className="grid aspect-video w-full place-items-center bg-black/80 text-white">
              <HiFilm className="size-8" />
            </span>
          )}
          {playbackUrl ? (
            <span className="absolute inset-0 grid place-items-center bg-black/10">
              <span className="grid size-12 place-items-center rounded-full bg-black/70 text-white">
                <HiPlayCircle className="size-8" />
              </span>
            </span>
          ) : null}
        </button>
      )}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
        <span className="min-w-0 truncate font-black text-black">
          {name || "Recording"}
          {durationSeconds > 0 ? ` · ${formatDuration(durationSeconds)}` : ""}
        </span>
        {playbackUrl ? (
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="font-black text-[#BD0F32]"
            >
              {open ? "Collapse" : "View"}
            </button>
            <a
              href={playbackUrl}
              target="_blank"
              rel="noreferrer"
              className="font-black text-black/50 hover:text-black"
            >
              Open ↗
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// One selectable Lapse timelapse in a journal form, with an inline viewer so
// the builder can watch it before attaching.
function AvailableLapseOption({ tl }: { tl: AvailableTimelapse }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-black/10 bg-white p-2 has-[:checked]:border-[#BD0F32] has-[:checked]:bg-[#fff5f7]">
      <div className="flex items-center gap-2 text-xs">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="timelapseIds"
            value={tl.id}
            className="size-4 accent-[#BD0F32]"
          />
          {tl.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tl.thumbnailUrl}
              alt=""
              className="h-9 w-16 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="grid h-9 w-16 shrink-0 place-items-center rounded bg-black/80 text-white">
              <HiFilm className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-black text-black">
              {tl.name || "Untitled"}
            </span>
            <span className="text-black/50">
              {formatDuration(tl.durationSeconds)}
            </span>
          </span>
        </label>
        {tl.playbackUrl ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="shrink-0 rounded-full border border-black/15 px-2 py-1 font-black text-[#BD0F32] hover:bg-[#fff5f7]"
          >
            {open ? "Hide" : "View"}
          </button>
        ) : null}
      </div>
      {open && tl.playbackUrl ? (
        <div className="mt-2 overflow-hidden rounded bg-black">
          {/* biome-ignore lint/a11y/useMediaCaption: user recordings have no caption track */}
          <video
            src={tl.playbackUrl}
            poster={tl.thumbnailUrl || undefined}
            controls
            className="aspect-video w-full"
          />
        </div>
      ) : null}
    </div>
  );
}

function JournalCard({
  projectId,
  journals,
  lapseEnabled,
}: {
  projectId: number;
  journals: JournalEntry[];
  lapseEnabled: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [available, setAvailable] = useState<AvailableTimelapse[]>([]);
  const [content, setContent] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [method, setMethod] = useState<RecordingMethod>("onplatform");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    addExternalJournalFromForm,
    initialState,
  );

  // Remember the last recording method between visits.
  useEffect(() => {
    const saved = localStorage.getItem(METHOD_STORAGE_KEY);
    if (saved === "onplatform" || saved === "lapse" || saved === "youtube") {
      setMethod(saved);
    }
  }, []);
  const chooseMethod = (next: RecordingMethod) => {
    setMethod(next);
    try {
      localStorage.setItem(METHOD_STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  };

  const refreshAvailable = useCallback(() => {
    if (!lapseEnabled) {
      setAvailable([]);
      return;
    }
    listAvailableTimelapses(projectId)
      .then(setAvailable)
      .catch(() => setAvailable([]));
  }, [projectId, lapseEnabled]);

  useEffect(() => {
    refreshAvailable();
  }, [refreshAvailable]);

  useEffect(() => {
    if (!state.success) return;
    setContent("");
    setYoutubeInput("");
    setTab("write");
    formRef.current?.reset();
    refreshAvailable();
    router.refresh();
  }, [state.success, refreshAvailable, router]);

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((current) => current + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setContent(
      (current) => current.slice(0, start) + text + current.slice(end),
    );
    requestAnimationFrame(() => {
      const pos = start + text.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const uploadImage = async (file: File) => {
    setImageUploading(true);
    setImageError(null);
    try {
      const { uploadUrl, publicUrl } = await createExternalScreenshotUpload(
        file.type,
      );
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Image upload failed. Try again.");
      insertAtCursor(`\n![image](${publicUrl})\n`);
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Image upload failed.",
      );
    } finally {
      setImageUploading(false);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!images.length) return;
    event.preventDefault();
    for (const file of images) void uploadImage(file);
  };

  return (
    <Surface className="grid gap-3 bg-white">
      <div className="flex items-center gap-2">
        <HiPencilSquare className="size-5 text-[#BD0F32]" />
        <h2 className="text-lg font-black text-black">Build journal</h2>
      </div>
      <p className="text-xs font-semibold text-black/55">
        Journal as you build, just like in the editor. Write in Markdown and
        paste screenshots straight in. Every entry needs one recording, pick the
        source below.
      </p>

      <form ref={formRef} action={formAction} className="grid gap-3">
        <input type="hidden" name="projectId" value={projectId} />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab("write")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-black transition",
              tab === "write"
                ? "bg-black text-white"
                : "bg-zinc-100 text-black/50 hover:bg-zinc-200",
            )}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-black transition",
              tab === "preview"
                ? "bg-black text-white"
                : "bg-zinc-100 text-black/50 hover:bg-zinc-200",
            )}
          >
            Preview
          </button>
          <span className="ml-auto text-[11px] font-semibold text-black/35">
            Markdown · paste images
          </span>
        </div>

        <div className={tab === "write" ? "grid gap-2" : "hidden"}>
          <textarea
            ref={textareaRef}
            name="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onPaste={handlePaste}
            rows={5}
            placeholder="What did you work on? Markdown works. Paste a screenshot to upload it."
            className={inputClass("px-4 py-3 font-mono text-sm")}
          />
          <div className="flex items-center gap-3 text-xs font-bold">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-black/55 hover:text-black">
              <HiPhoto className="size-4" />
              Add image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file);
                  event.target.value = "";
                }}
              />
            </label>
            {imageUploading ? (
              <span className="text-black/40">Uploading image…</span>
            ) : null}
            {imageError ? (
              <span className="text-[#BD0F32]">{imageError}</span>
            ) : null}
          </div>
        </div>

        {tab === "preview" ? (
          <div className="min-h-24 rounded-[10px] border border-black/15 bg-[#f4f4f4] p-3">
            {content.trim() ? (
              <Markdown>{content}</Markdown>
            ) : (
              <p className="text-xs font-semibold text-black/40">
                Nothing to preview yet.
              </p>
            )}
          </div>
        ) : null}

        <fieldset className="grid gap-3 rounded-[10px] border border-black/15 bg-[#f4f4f4] p-3">
          <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-[#BD0F32]">
            Recording
          </legend>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RECORDING_METHODS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseMethod(option.value)}
                aria-pressed={method === option.value}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 text-xs font-black transition",
                  method === option.value
                    ? "border-[#BD0F32] bg-[#fff5f7] text-black"
                    : "border-black/15 bg-white text-black/55 hover:bg-zinc-50",
                )}
              >
                <option.icon className="size-4 shrink-0" />
                {option.label}
              </button>
            ))}
          </div>

          {/* Kept mounted regardless of the selected method so switching away
              never tears down an active screen-share session; only hidden. */}
          <div
            className={
              method === "onplatform"
                ? "flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white p-2.5"
                : "hidden"
            }
          >
            <ScreenShareTracker
              projectId={projectId}
              promptOnMount={false}
              managesActivityTracking
            />
          </div>

          {method === "youtube" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="jc-youtube">YouTube link</Label>
              <Input
                id="jc-youtube"
                name="youtubeUrls"
                value={youtubeInput}
                onChange={(event) => setYoutubeInput(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="px-3 py-2 text-sm"
              />
              <YouTubePreviewList urls={youtubeInput} />
            </div>
          ) : null}

          {method === "lapse" ? (
            lapseEnabled ? (
              available.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {available.map((entry) => (
                    <AvailableLapseOption key={entry.id} tl={entry} />
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-black/40">
                  No unattached Lapse timelapses yet. Record in Lapse to add
                  one.
                </p>
              )
            ) : (
              <p className="text-xs font-semibold text-black/40">
                Link your Lapse account in the Lapse card above to attach
                timelapses.
              </p>
            )
          ) : null}
        </fieldset>

        {state.message ? (
          <p className="text-xs font-bold text-[#BD0F32]" aria-live="polite">
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            tone="primary"
            className="rounded-full px-5"
            disabled={pending}
          >
            {pending ? <LoadingInline label="Saving" /> : "Add entry"}
          </Button>
        </div>
      </form>

      {journals.length > 0 ? (
        <ul className="grid gap-2">
          {journals.map((entry) => (
            <ExistingJournalEntry
              key={entry.id}
              projectId={projectId}
              entry={entry}
              available={available}
              lapseEnabled={lapseEnabled}
              onChanged={refreshAvailable}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs font-semibold text-black/40">
          No journal entries yet.
        </p>
      )}
    </Surface>
  );
}

// A saved journal entry. Reads as Markdown + its recordings; expands into an
// editor for the text and its attached videos (remove existing, add more).
function ExistingJournalEntry({
  projectId,
  entry,
  available,
  lapseEnabled,
  onChanged,
}: {
  projectId: number;
  entry: JournalEntry;
  available: AvailableTimelapse[];
  lapseEnabled: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(entry.content);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [, startRemove] = useTransition();
  const [state, formAction, pending] = useActionState(
    updateExternalJournalFromForm,
    initialState,
  );

  // Keep the draft in sync if the entry changes underneath us (e.g. after a
  // refresh), but only while we're not actively editing.
  useEffect(() => {
    if (!editing) setContent(entry.content);
  }, [entry.content, editing]);

  useEffect(() => {
    if (state.success) {
      setEditing(false);
      setYoutubeInput("");
      onChanged();
      router.refresh();
    }
  }, [state.success, onChanged, router]);

  const removeVideo = (timelapseId: number) => {
    setRemovingId(timelapseId);
    startRemove(async () => {
      try {
        await removeJournalRecording(timelapseId);
        onChanged();
        router.refresh();
      } finally {
        setRemovingId(null);
      }
    });
  };

  if (!editing) {
    return (
      <li className="grid gap-2 rounded-[10px] border border-black/15 bg-[#f4f4f4] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Markdown>{entry.content}</Markdown>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/15 bg-white px-2.5 py-1 text-xs font-black text-black/60 transition hover:bg-black hover:text-white"
          >
            <HiPencilSquare className="size-3.5" />
            Edit
          </button>
        </div>
        {entry.timelapses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {entry.timelapses.map((tl) => (
              <a
                key={tl.id}
                href={tl.playbackUrl || undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-black bg-white px-2.5 py-1 text-xs font-black text-black shadow-[1px_1px_0_#000] hover:bg-black hover:text-white"
              >
                <HiFilm className="size-3.5" />
                {tl.name || "Recording"}
                {tl.durationSeconds > 0
                  ? ` · ${formatDuration(tl.durationSeconds)}`
                  : ""}
              </a>
            ))}
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li className="grid gap-3 rounded-[10px] border-2 border-[#BD0F32]/40 bg-white p-3">
      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="journalId" value={entry.id} />
        <textarea
          name="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
          className={inputClass("px-4 py-3 font-mono text-sm")}
        />

        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
            Attached recordings
          </p>
          {entry.timelapses.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {entry.timelapses.map((tl) => (
                <div key={tl.id} className="relative">
                  <MediaPreview
                    name={tl.name}
                    playbackUrl={tl.playbackUrl}
                    thumbnailUrl={tl.thumbnailUrl}
                    durationSeconds={tl.durationSeconds}
                  />
                  <button
                    type="button"
                    onClick={() => removeVideo(tl.id)}
                    disabled={removingId === tl.id}
                    aria-label="Remove recording"
                    className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border border-black bg-white text-black/60 shadow-[1px_1px_0_#000] transition hover:bg-[#BD0F32] hover:text-white disabled:opacity-50"
                  >
                    <HiXMark className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-black/40">
              No recordings on this entry.
            </p>
          )}
        </div>

        <div className="grid gap-2 rounded-[10px] border border-black/15 bg-[#f4f4f4] p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-black/45">
            Add a recording
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-yt-${entry.id}`}>YouTube link</Label>
            <Input
              id={`edit-yt-${entry.id}`}
              name="youtubeUrls"
              value={youtubeInput}
              onChange={(event) => setYoutubeInput(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="px-3 py-2 text-sm"
            />
            <YouTubePreviewList urls={youtubeInput} />
          </div>
          {lapseEnabled && available.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {available.map((tl) => (
                <AvailableLapseOption key={tl.id} tl={tl} />
              ))}
            </div>
          ) : null}
        </div>

        {state.message ? (
          <p className="text-xs font-bold text-[#BD0F32]" aria-live="polite">
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            tone="paper"
            className="rounded-full px-4"
            onClick={() => {
              setEditing(false);
              setContent(entry.content);
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            className="rounded-full px-5"
            disabled={pending}
          >
            {pending ? <LoadingInline label="Saving" /> : "Save changes"}
          </Button>
        </div>
      </form>
    </li>
  );
}

function LapseCard({
  projectId,
  lapse,
}: {
  projectId: number;
  lapse: LapseState;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lapseStatus = searchParams.get("lapse");
  const connectHref = `/api/lapse/auth/start?returnTo=${encodeURIComponent(
    `/platform/projects/${projectId}/track`,
  )}`;
  const [state, formAction, pending] = useActionState(
    connectLapseHandleFromForm,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <Surface className="grid gap-3 bg-white">
      <div className="flex items-center gap-2">
        <HiFilm className="size-5 text-[#BD0F32]" />
        <h2 className="text-lg font-black text-black">Lapse</h2>
        {lapse.connected || lapse.linked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-200 px-2 py-0.5 text-xs font-black text-green-900">
            <HiCheckCircle className="size-3.5" />
            {lapse.handle ? `Linked · @${lapse.handle}` : "Linked"}
          </span>
        ) : null}
      </div>
      <p className="text-xs font-semibold text-black/55">
        Record your build with Lapse, then attach each timelapse to a journal
        entry below so reviewers can watch your whole build. Prefer YouTube? You
        can attach YouTube links on any journal entry without connecting Lapse.
      </p>

      {lapseStatus === "error" ? (
        <p className="text-xs font-bold text-[#BD0F32]">
          Lapse connection failed. Try connecting again.
        </p>
      ) : null}

      {lapse.connected || lapse.linked ? (
        lapse.oauthConfigured && lapse.connected ? (
          <a
            href={connectHref}
            className="text-xs font-bold text-black/45 underline"
          >
            Reconnect Lapse
          </a>
        ) : null
      ) : lapse.programEnabled ? (
        <div className="grid gap-2 rounded-lg border border-black/15 bg-zinc-50 p-3">
          <p className="flex items-start gap-1.5 text-xs font-semibold text-black/55">
            <HiInformationCircle className="mt-0.5 size-3.5 shrink-0 text-black/40" />
            Enter your Lapse handle to link it. We verify the Lapse account is
            signed in with your Slack account, so only your own timelapses can
            be attached.
          </p>
          <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <Input
              name="handle"
              required
              placeholder="your-lapse-handle"
              className="h-9 flex-1 px-3 py-1.5 text-sm"
            />
            <Button
              type="submit"
              tone="ink"
              size="sm"
              className="rounded-full px-4"
              disabled={pending}
            >
              {pending ? <LoadingInline label="Linking" /> : "Link"}
            </Button>
          </form>
          {state.message ? (
            <p className="text-xs font-bold text-[#BD0F32]" aria-live="polite">
              {state.message}
            </p>
          ) : null}
        </div>
      ) : lapse.oauthConfigured ? (
        <div>
          <a href={connectHref} className={buttonClass({ tone: "ink" })}>
            Connect Lapse
          </a>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 rounded-lg border border-black/15 bg-zinc-50 p-2.5 text-xs font-semibold text-black/55">
          <HiInformationCircle className="mt-0.5 size-3.5 shrink-0 text-black/40" />
          Lapse connect isn&apos;t enabled here yet, but you can still attach
          YouTube videos to your journal entries below.
        </p>
      )}
    </Surface>
  );
}

function SubmitCard({
  projectId,
  initialScreenshot,
  isBuild,
}: {
  projectId: number;
  initialScreenshot: string;
  isBuild: boolean;
}) {
  const router = useRouter();
  const [screenshotUrl, setScreenshotUrl] = useState(initialScreenshot);
  const [state, formAction, pending] = useActionState(
    submitExternalProjectFromForm,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.push("/platform/projects");
  }, [state.success, router]);

  const hasScreenshot = screenshotUrl.length > 0;

  return (
    <Surface className="grid gap-4 bg-white">
      <div className="flex items-center gap-2">
        <HiArrowUpTray className="size-5 text-[#BD0F32]" />
        <h2 className="text-lg font-black text-black">Submit for review</h2>
      </div>
      <div className="rounded-xl border border-black bg-[#fffaf1] p-4 text-sm text-black shadow-[2px_2px_0_#000]">
        {isBuild ? (
          <p className="flex items-center gap-1.5 font-black">
            <BreadIcon size="sm" gold={isBuild} />
            Build ships earn gold bread
          </p>
        ) : null}
        <p className="mt-1 text-xs font-semibold text-black/60">
          {isBuild
            ? "We don't ship you a kit for a build ship. When a reviewer approves your build, you earn gold bread for your approved hours, which gets you shop items for cheaper."
            : "When a reviewer approves your design, you earn regular bread for your approved hours and we ship you a kit to build it."}
        </p>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-black/45">
          Your {isBuild ? "build" : "design"} submission must include
        </p>
        <ul className="mt-1.5 grid gap-1 text-xs font-semibold text-black/70">
          {isBuild ? (
            <>
              <li>
                Photos of the finished breadboard circuit, fully assembled
              </li>
              <li>A demo video showing it actually working</li>
              <li>
                A public repo with README.md, journal.md, your schematic,
                firmware source, and a BOM listing your parts and quantities (it
                can be in the README)
              </li>
            </>
          ) : (
            <>
              <li>A screenshot or render of your finished schematic</li>
              <li className="font-black text-black">
                A simulation of your project. You have to somehow simulate the
                project, which means showing your firmware actually working on a
                simulation, not just the circuit, similar to a Wokwi simulation
                or the simulation on site!
              </li>
              <li>
                A public repo with README.md, journal.md, your schematic,
                firmware source, and a BOM listing your parts and quantities (it
                can be in the README)
              </li>
              <li>
                You&apos;ll build it and submit a demo video once your kit
                arrives
              </li>
            </>
          )}
        </ul>
        <div className="mt-3 rounded-lg border border-[#BD0F32]/20 bg-[#fff5f7] p-3 text-xs font-semibold text-black/70">
          <p className="font-black text-black">Read the requirements first</p>
          <p className="mt-0.5">
            The full checklist
            {isBuild ? "" : ", including how to simulate your project,"} is on
            the{" "}
            <Link
              href="/requirements"
              target="_blank"
              className="font-black text-[#BD0F32] underline"
            >
              requirements page
            </Link>
            . Make sure everything there is in your repo, including the
            schematic, code, README, and bill of materials. We check these
            before accepting your submission.
          </p>
        </div>
      </div>
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="screenshotUrl" value={screenshotUrl} />

        <div className="grid gap-2">
          <Label htmlFor="external-git">Git repository URL</Label>
          <Input
            id="external-git"
            name="gitUrl"
            required
            placeholder="https://github.com/your-username/your-project"
            className="px-4 py-3 font-mono text-sm"
          />
        </div>

        <ExternalScreenshotField
          value={screenshotUrl}
          onChange={setScreenshotUrl}
        />

        {state.message ? (
          <p className="text-sm font-bold text-[#BD0F32]" aria-live="polite">
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            tone="primary"
            className="rounded-full px-6"
            disabled={pending || !hasScreenshot}
          >
            {pending ? (
              <LoadingInline label="Submitting" />
            ) : (
              "Submit for review"
            )}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

function ExternalScreenshotField({
  value,
  onChange,
}: {
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
      const { uploadUrl, publicUrl } = await createExternalScreenshotUpload(
        file.type,
      );
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed. Try again.");
      onChange(publicUrl);
      setMessage("Screenshot uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-[14px] border border-black bg-[#f4f4f4] p-4 shadow-[2px_2px_0_#000]">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-black bg-white text-[#BD0F32] shadow-[2px_2px_0_#000]">
          <HiPhoto className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-black">
            {value ? "Screenshot saved" : "Project screenshot"}
          </p>
          <p className="mt-1 text-xs font-semibold text-black/55">
            {value ? "Upload a new one to replace it." : "Required to submit."}
          </p>
        </div>
      </div>
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
