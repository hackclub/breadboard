"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  HiArrowUpTray,
  HiCheckCircle,
  HiClock,
  HiInformationCircle,
  HiPencilSquare,
  HiPhoto,
} from "react-icons/hi2";
import {
  connectHackatimeFromForm,
  submitExternalProjectFromForm,
} from "@/actions/projects";
import { createExternalScreenshotUpload } from "@/actions/uploads";
import { ScreenShareTracker } from "@/app/editor/_components/ScreenShareTracker";
import { LoadingInline } from "@/components/shared/loading-card";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/card";
import { Input, inputClass, Label } from "@/components/ui/input";
import {
  startActivityTracking,
  stopActivityTracking,
} from "@/lib/editor/activityTracker";
import type { ProjectFormState } from "@/types";

const initialState: ProjectFormState = { success: false };

type JournalEntry = { id: number; content: string; createdAt: string };

export type ExternalTrackingWorkspaceProps = {
  projectId: number;
  title: string;
  screenshotUrl: string;
  trackedSeconds: number;
  journals: JournalEntry[];
  hackatime: { username: string; projectName: string; seconds: number };
};

function formatHours(seconds: number) {
  const hours = seconds / 3600;
  return hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1);
}

export function ExternalTrackingWorkspace({
  projectId,
  title,
  screenshotUrl: initialScreenshot,
  trackedSeconds,
  journals: initialJournals,
  hackatime,
}: ExternalTrackingWorkspaceProps) {
  // Reuse the editor's tracking pipeline: heartbeats accrue session time and
  // ScreenShareTracker credits whole-screen work done outside Breadboard.
  useEffect(() => {
    void startActivityTracking(projectId, () => ({}));
    return () => stopActivityTracking();
  }, [projectId]);

  const totalSeconds = trackedSeconds + hackatime.seconds;

  return (
    <div className="space-y-6">
      <Surface className="flex flex-col gap-3 bg-[#f4f4f4] sm:flex-row sm:items-center sm:justify-between">
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
              {formatHours(hackatime.seconds)}h Hackatime
            </p>
          </div>
        </div>
        <ScreenShareTracker projectId={projectId} />
      </Surface>

      <JournalCard projectId={projectId} initialJournals={initialJournals} />

      <HackatimeCard projectId={projectId} hackatime={hackatime} />

      <SubmitCard projectId={projectId} initialScreenshot={initialScreenshot} />

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

function JournalCard({
  projectId,
  initialJournals,
}: {
  projectId: number;
  initialJournals: JournalEntry[];
}) {
  const [journals, setJournals] = useState(initialJournals);
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitJournal = async () => {
    const text = content.trim();
    if (text.length < 10) {
      setError("Journal entry is too short (10+ characters).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/projects/${projectId}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not save journal.");
      setJournals((current) => [
        {
          id: Date.now(),
          content: text,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save journal.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Surface className="grid gap-3 bg-white">
      <div className="flex items-center gap-2">
        <HiPencilSquare className="size-5 text-[#BD0F32]" />
        <h2 className="text-lg font-black text-black">Build journal</h2>
      </div>
      <p className="text-xs font-semibold text-black/55">
        Journal as you build, just like in the editor. You need to journal to
        keep tracking your time, and journaling is required before we approve
        your submission.
      </p>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        placeholder="What did you work on? What worked, what didn't?"
        className={inputClass("px-4 py-3")}
      />
      {error ? (
        <p className="text-xs font-bold text-[#BD0F32]">{error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button
          tone="primary"
          className="rounded-full px-5"
          disabled={pending}
          onClick={() => void submitJournal()}
        >
          {pending ? <LoadingInline label="Saving" /> : "Add entry"}
        </Button>
      </div>
      {journals.length > 0 ? (
        <ul className="grid gap-2">
          {journals.map((entry) => (
            <li
              key={entry.id}
              className="rounded-[10px] border border-black/15 bg-[#f4f4f4] p-3 text-sm text-black/75"
            >
              {entry.content}
            </li>
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

function HackatimeCard({
  projectId,
  hackatime,
}: {
  projectId: number;
  hackatime: { username: string; projectName: string; seconds: number };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    connectHackatimeFromForm,
    initialState,
  );

  // A successful pull is persisted server-side; refresh to show the new hours.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  const connected = hackatime.projectName.length > 0;

  return (
    <Surface className="grid gap-3 bg-white">
      <div className="flex items-center gap-2">
        <HiClock className="size-5 text-[#BD0F32]" />
        <h2 className="text-lg font-black text-black">Hackatime</h2>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-200 px-2 py-0.5 text-xs font-black text-green-900">
            <HiCheckCircle className="size-3.5" /> Linked
          </span>
        ) : null}
      </div>
      <p className="text-xs font-semibold text-black/55">
        Link your Hackatime project so your coding time counts. Lapse recordings
        sync into Hackatime too, so this covers both. We use your API key once to
        read the total and never store it.
      </p>
      {connected ? (
        <p className="rounded-[10px] border border-black/15 bg-[#f4f4f4] p-3 text-sm font-bold text-black/70">
          Linked to <span className="text-black">{hackatime.projectName}</span>{" "}
          ({hackatime.username}) · {formatHours(hackatime.seconds)}h
        </p>
      ) : null}
      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ht-username">Hackatime username</Label>
            <Input
              id="ht-username"
              name="username"
              defaultValue={hackatime.username}
              placeholder="orpheus"
              className="px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ht-project">Project name</Label>
            <Input
              id="ht-project"
              name="projectName"
              defaultValue={hackatime.projectName}
              placeholder="my-breadboard-build"
              className="px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ht-key">API key</Label>
            <Input
              id="ht-key"
              name="apiKey"
              type="password"
              placeholder="hackatime API key"
              className="px-3 py-2 text-sm"
            />
          </div>
        </div>
        {state.message ? (
          <p className="text-xs font-bold text-[#BD0F32]" aria-live="polite">
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="submit"
            tone="paper"
            className="rounded-full px-5"
            disabled={pending}
          >
            {pending ? (
              <LoadingInline label="Checking" />
            ) : connected ? (
              "Refresh hours"
            ) : (
              "Link Hackatime"
            )}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

function SubmitCard({
  projectId,
  initialScreenshot,
}: {
  projectId: number;
  initialScreenshot: string;
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
          <div className="mt-1 flex items-start gap-1.5 rounded-lg border border-[#BD0F32]/20 bg-[#fff5f7] p-2.5 text-xs text-black/70">
            <HiInformationCircle className="mt-0.5 size-3.5 shrink-0 text-[#BD0F32]" />
            <div>
              <p className="font-black">
                Your public repo must have a{" "}
                <span className="text-[#BD0F32]">README.md</span> and{" "}
                <span className="text-[#BD0F32]">journal.md</span>.
              </p>
              <p className="mt-0.5">
                Make sure everything on the{" "}
                <Link
                  href="/requirements"
                  target="_blank"
                  className="font-black text-[#BD0F32] underline"
                >
                  requirements page
                </Link>{" "}
                is in your repo: schematic, code, README, and bill of materials.
                We check these before accepting your submission.
              </p>
            </div>
          </div>
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
