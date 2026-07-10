"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  HiArrowTopRightOnSquare,
  HiCheck,
  HiCheckCircle,
  HiClock,
  HiClipboard,
  HiCodeBracket,
  HiExclamationTriangle,
  HiFilm,
  HiInformationCircle,
  HiPencilSquare,
  HiPhoto,
  HiPlay,
  HiWrenchScrewdriver,
  HiXCircle,
} from "react-icons/hi2";
import { FaGithub, FaSlack } from "react-icons/fa6";
import {
  approveProject,
  rejectProject,
  requestChanges,
} from "@/actions/admin/review";
import { BreadAmount, BreadIcon } from "@/components/shared/bread-amount";
import { Markdown } from "@/components/shared/markdown";
import { isBuildShip } from "@/lib/projects/project-type";
import { storageReadUrl } from "@/lib/storage/urls";

type ReviewProject = {
  id: number;
  submissionId: number;
  submissionNumber: number;
  editorVersionNumber: number | null;
  title: string;
  email: string;
  playableUrl: string;
  demoVideoUrl: string;
  codeUrl: string;
  screenshotUrl: string;
  description: string;
  howToUse: string;
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  birthday: string;
  hoursSpent: number;
  overrideHoursSpent: number | null;
  overrideHoursSpentJustification: string;
  status: string;
  projectStatus: string;
  reviewNote: string;
  breadAmount: number;
  shippedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  userName: string;
  userEmail: string;
  userSlackId: string | null;
  userId: string;
  kitType: string;
  submissionSource: string | null;
  projectType: string;
};

type Journal = {
  id: number;
  content: string;
  activeSecondsCovered: number;
  createdAt: Date;
};

type Timelapse = {
  id: number;
  name: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  recordedAt: string | null;
};

type TrackingSummary = {
  trackedSeconds: number;
  recordingSeconds: number;
  measuredSeconds: number;
  journaledSeconds: number;
  sessionCount: number;
  lastTrackedAt: string | null;
  lastScreenEvidenceAt: string | null;
};

type SubmissionHistoryEntry = {
  id: number;
  submissionNumber: number;
  editorVersionNumber: number | null;
  hoursSpent: number;
  approvedHours: number | null;
  status: string;
  userComment: string;
  submittedAt: string | null;
  reviewedAt: string | null;
};

function formatTimelapseDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${remainder}s`;
  }
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

function formatExactDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${remainder}s`;
  return `${minutes}m ${remainder}s`;
}

function formatEvidenceTime(value: string | null) {
  if (!value) return "None saved";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

const verdictOptions = [
  { value: "approve", icon: HiCheckCircle, label: "Approve" },
  { value: "changes", icon: HiExclamationTriangle, label: "Changes needed" },
  { value: "reject", icon: HiXCircle, label: "Reject" },
] as const;

function safeUrl(value: string) {
  const storageUrl = storageReadUrl(value);
  if (storageUrl.startsWith("/")) return storageUrl;
  try {
    const url = new URL(storageUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function shouldOptimizeProjectImage(src: string) {
  if (src.startsWith("/api/uploads/")) return false;
  try {
    const { hostname, protocol } = new URL(src);
    return (
      protocol === "https:" &&
      (hostname === "cdn.hackclub.com" || hostname === "assets.hackclub.com")
    );
  } catch {
    return false;
  }
}

function daysAgo(date: Date | null) {
  if (!date) return "not shipped";
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function ReviewScreenshotPreview({
  screenshot,
  title,
}: {
  screenshot: string | null;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const showExample = !screenshot || failed;

  if (showExample) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white text-[10px] font-black tracking-[0.16em] text-black/35 uppercase">
        Add image here
      </div>
    );
  }

  return (
    <Image
      src={screenshot}
      alt={`${title || "Project"} screenshot`}
      fill
      sizes="208px"
      unoptimized={!shouldOptimizeProjectImage(screenshot)}
      onError={() => setFailed(true)}
      className="object-cover"
    />
  );
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function EvidenceButton({
  href,
  label,
  icon: Icon,
}: {
  href: string | null;
  label: string;
  icon: typeof HiCodeBracket;
}) {
  if (!href) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-black text-zinc-400">
        <Icon className="size-3.5" />
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-black text-white no-underline hover:bg-[#BD0F32]"
    >
      <Icon className="size-3.5" />
      {label}
      <HiArrowTopRightOnSquare className="size-3 opacity-60" />
    </a>
  );
}

// Slack encodes mentions differently depending on who sends the message, so we
// offer both. A bot posting via the API (and a human pasting into the composer)
// needs the ID token `<@U123>` — Slack resolves it to a mention pill. The ID is
// used rather than the name because display names can collide or change. The
// plain `@name` copy is a text fallback for when a literal mention isn't wanted
// or won't resolve (exports, other tools); it is not a real mention.
function CopyButton({
  value,
  label,
  title,
}: {
  value: string;
  label: string;
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          alert("Could not copy to clipboard.");
        }
      }}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-black text-white hover:bg-[#BD0F32]"
    >
      {copied ? (
        <HiCheck className="size-3.5" />
      ) : (
        <HiClipboard className="size-3.5" />
      )}
      {copied ? "Copied!" : label}
    </button>
  );
}

function CopyPingButtons({
  slackId,
  name,
}: {
  slackId: string | null;
  name: string;
}) {
  if (!slackId) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-black text-zinc-400">
        <HiClipboard className="size-3.5" />
        Copy ping
      </span>
    );
  }

  const idMention = `<@${slackId}>`;
  const plainName = name.trim() ? `@${name.trim()}` : `@${slackId}`;

  return (
    <>
      <CopyButton
        value={idMention}
        label="Copy ping"
        title={`Copies ${idMention} — a bot posting via the API renders this as a mention, and pasting it into the Slack composer also converts it to a mention pill.`}
      />
      <CopyButton
        value={plainName}
        label="Copy @name"
        title={`Copies ${plainName} — plain text for readable references. Not a real mention; won't auto-resolve when pasted.`}
      />
    </>
  );
}

export function ReviewWorkspace({
  project: initial,
  journals,
  timelapses,
  submissionHistory,
  tracking,
  breadPerHour,
}: {
  project: ReviewProject;
  journals: Journal[];
  timelapses: Timelapse[];
  submissionHistory: SubmissionHistoryEntry[];
  tracking: TrackingSummary;
  breadPerHour: number;
}) {
  const [verdict, setVerdict] = useState<"approve" | "changes" | "reject">(
    "approve",
  );
  const [approvedHours, setApprovedHours] = useState(
    initial.overrideHoursSpent ?? initial.hoursSpent,
  );
  const [userComment, setUserComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();
  const isManual = initial.submissionSource === "manual";
  // Currency follows projectType, not submissionSource: an off-platform
  // *design* (manual source, design type) earns regular bread and ships a
  // kit, exactly like an editor design. Only build ships earn gold.
  const isBuild = isBuildShip(initial);
  const screenshot = safeUrl(initial.screenshotUrl);
  const playable = safeUrl(initial.playableUrl);
  const demoVideo = safeUrl(initial.demoVideoUrl);
  const code = safeUrl(initial.codeUrl);
  const slackProfile = initial.userSlackId
    ? `https://hackclub.enterprise.slack.com/team/${initial.userSlackId}`
    : null;
  const approvedBread =
    Math.max(0, Math.floor(approvedHours || 0)) * breadPerHour;

  const statusTone =
    initial.status === "pending_review"
      ? "bg-[#BD0F32] text-white"
      : initial.status === "needs_changes"
        ? "bg-yellow-100 text-yellow-900"
        : initial.status === "paid_out" || initial.status === "fulfilled"
          ? "bg-green-100 text-green-900"
          : "bg-zinc-100 text-zinc-700";

  // The decision applies on the first call; a dropped connection or deployment
  // swap can make the browser replay it. Latch `submitted` so the buttons lock
  // after the first success, and refresh either way so the workspace reflects
  // the committed state instead of leaving stale actions clickable. The actions
  // are idempotent server-side, so a replayed identical decision resolves here
  // as success, not an error.
  function run(action: () => Promise<void>) {
    setErrorMsg(null);
    startTransition(async () => {
      try {
        await action();
        setSubmitted(true);
        router.refresh();
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : "Failed");
        router.refresh();
      }
    });
  }

  const locked = submitted || initial.status !== "pending_review";

  return (
    <article className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-[16px] border border-black bg-white shadow-[4px_4px_0_#000]">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusTone}`}
              >
                {statusLabel(initial.status)}
              </span>
              {initial.submissionSource === "manual" ? (
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 uppercase">
                  <HiWrenchScrewdriver className="size-3.5" />
                  External tool
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-black px-3 py-1.5 text-xs font-black text-white uppercase">
                {initial.kitType === "esp32"
                  ? "Kit B · ESP32"
                  : initial.kitType === "own"
                    ? "Own parts"
                    : "Kit A · Arduino"}
              </span>
            </div>
            <h2 className="mt-2 text-4xl font-black leading-tight text-black">
              {initial.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-black/50">
              <span>{initial.userName}</span>
              <span className="text-black/25">{initial.userEmail}</span>
              {initial.country ? (
                <span className="font-bold text-black/55">
                  Country: {initial.country}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <EvidenceButton
                href={slackProfile}
                label="Slack profile"
                icon={FaSlack}
              />
              <CopyPingButtons
                slackId={initial.userSlackId}
                name={initial.userName}
              />
              <EvidenceButton href={code} label="GitHub" icon={FaGithub} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <EvidenceButton
                href={playable}
                label="Playable demo"
                icon={HiPlay}
              />
              <EvidenceButton
                href={demoVideo}
                label="Demo video"
                icon={HiPlay}
              />
              <EvidenceButton href={code} label="Code" icon={HiCodeBracket} />
              <EvidenceButton
                href={screenshot}
                label="Screenshot"
                icon={HiPhoto}
              />
              <EvidenceButton
                href={`/platform/admin/projects/${initial.id}/timelapse?until=${encodeURIComponent(
                  initial.shippedAt?.toISOString() ?? "",
                )}`}
                label="Timelapse"
                icon={HiFilm}
              />
              {!isManual ? (
                <>
                  <EvidenceButton
                    href={
                      initial.editorVersionNumber
                        ? `/editor/${initial.id}?version=${initial.editorVersionNumber}`
                        : `/editor/${initial.id}`
                    }
                    label="Editor"
                    icon={HiPencilSquare}
                  />
                  <EvidenceButton
                    href={`/platform/admin/projects/${initial.id}/versions`}
                    label="Versions"
                    icon={HiClock}
                  />
                </>
              ) : null}
            </div>
          </div>
          <div className="relative hidden h-28 w-52 shrink-0 overflow-hidden rounded-[12px] border border-black bg-white lg:block">
            <ReviewScreenshotPreview
              screenshot={screenshot}
              title={initial.title}
            />
          </div>
        </div>

        {isManual ? (
          <div className="border-t border-black/10 p-5">
            <h3 className="text-lg font-black text-black">
              Submission details
            </h3>
            <p className="mt-1 text-xs font-semibold text-black/40">
              Submitted via an external tool. Repository and project details are
              user-provided; tracked time and screen evidence are shown in the
              time evidence card.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailRow label="Git repository" value={code} link />
              <DetailRow
                label="Hours measured"
                value={`${initial.hoursSpent}h`}
              />
              <DetailRow label="Email" value={initial.email} />
              <DetailRow label="Birthday" value={initial.birthday} />
              <DetailRow
                label="Name"
                value={`${initial.firstName} ${initial.lastName}`.trim()}
              />
              <DetailRow label="Country" value={initial.country} />
              <DetailRow label="Address" value={initial.addressLine1} />
              <DetailRow label="Address line 2" value={initial.addressLine2} />
              <DetailRow label="City" value={initial.city} />
              <DetailRow label="State / Province" value={initial.region} />
              <DetailRow label="ZIP / Postal code" value={initial.postalCode} />
            </div>
            {initial.description ? (
              <div className="mt-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-black/40">
                  Description
                </p>
                <p className="mt-1.5 rounded-xl border border-black bg-[#fffaf1] p-4 text-sm font-semibold leading-relaxed text-black/75 shadow-[2px_2px_0_#000]">
                  {initial.description}
                </p>
              </div>
            ) : null}
            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-black/40">
                Screenshot
              </p>
              <div className="relative mt-1.5 aspect-[4/3] w-full max-w-lg overflow-hidden rounded-xl border border-black bg-zinc-100 shadow-[2px_2px_0_#000]">
                <ReviewScreenshotPreview
                  screenshot={screenshot}
                  title={initial.title}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-black/10 p-5">
            <h3 className="text-lg font-black text-black">How to use</h3>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-black bg-[#fffaf1] p-4 text-sm font-semibold leading-relaxed text-black/75 shadow-[2px_2px_0_#000]">
              {initial.howToUse || "No instructions provided."}
            </p>
          </div>
        )}

        <div className="p-5">
          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {verdictOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVerdict(value)}
                  className={`flex items-center justify-center gap-2 rounded-xl border border-black py-3 text-sm font-black ${
                    verdict === value
                      ? "bg-[#BD0F32] text-white"
                      : "bg-white text-black hover:bg-zinc-50"
                  }`}
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              ))}
            </div>

            {verdict === "approve" ? (
              <div className="grid gap-4">
                <label className="grid gap-1.5">
                  <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                    Approved hours
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={approvedHours}
                    onChange={(e) => setApprovedHours(Number(e.target.value))}
                    className="rounded-xl border border-black bg-white px-4 py-3 text-xl font-black"
                  />
                  <span className="text-sm font-black text-[#BD0F32]">
                    Awards <BreadAmount amount={approvedBread} gold={isBuild} />{" "}
                    {isBuild ? "gold bread " : ""}({approvedHours || 0}h ×{" "}
                    {breadPerHour})
                  </span>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                    Comment to user
                  </span>
                  <textarea
                    value={userComment}
                    onChange={(e) => setUserComment(e.target.value)}
                    rows={3}
                    className="rounded-xl border border-black bg-white px-4 py-3 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || locked}
                  onClick={() =>
                    run(() =>
                      approveProject(
                        initial.id,
                        approvedHours,
                        "",
                        userComment,
                        [],
                        initial.projectStatus === "demo_review"
                          ? "demo"
                          : "materials",
                      ),
                    )
                  }
                  className="rounded-xl bg-[#BD0F32] py-4 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                >
                  {initial.projectStatus === "demo_review" ? (
                    <span className="inline-flex items-center gap-0.5">
                      Approve demo ·{" "}
                      <BreadAmount amount={approvedBread} size="sm" />
                    </span>
                  ) : (
                    "Approve materials · send kit"
                  )}
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                    {verdict === "reject"
                      ? "Rejection reason"
                      : "What needs to be changed"}
                  </span>
                  <textarea
                    value={userComment}
                    onChange={(e) => setUserComment(e.target.value)}
                    rows={8}
                    className="rounded-xl border border-black bg-white px-4 py-3 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || locked}
                  onClick={() =>
                    run(() => {
                      const phase =
                        initial.projectStatus === "demo_review"
                          ? "demo"
                          : "materials";
                      return verdict === "reject"
                        ? rejectProject(initial.id, userComment, [], phase)
                        : requestChanges(initial.id, userComment, [], phase);
                    })
                  }
                  className="rounded-xl border border-black bg-white py-3.5 text-sm font-black text-black hover:bg-black hover:text-white disabled:opacity-50"
                >
                  {verdict === "reject"
                    ? "Reject permanently"
                    : "Request changes"}
                </button>
              </div>
            )}
            {submitted && !errorMsg ? (
              <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-black text-green-800">
                Review submitted.
              </p>
            ) : null}
            {errorMsg ? (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-800">
                {errorMsg}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-[16px] border border-black bg-black p-4 shadow-[4px_4px_0_#BD0F32]">
          <p className="text-xs font-black tracking-[0.14em] text-white/50 uppercase">
            Submitted
          </p>
          <p className="mt-2 text-2xl font-black text-white">
            {daysAgo(initial.shippedAt)}
          </p>
          <div className="mt-3 space-y-2 text-sm text-white/65">
            <div className="flex justify-between">
              <span>Country</span>
              <span className="font-black text-white">
                {initial.country || "Unknown"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>
                Hours
                {initial.submissionSource === "manual"
                  ? " measured"
                  : " tracked"}
              </span>
              <span className="font-black text-white">
                {initial.hoursSpent}h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="inline-flex items-center gap-1">
                <BreadIcon />
                Award
              </span>
              <span className="font-black text-white">
                <BreadAmount amount={approvedBread} />
              </span>
            </div>
            {initial.overrideHoursSpent ? (
              <div className="flex justify-between">
                <span>Approved</span>
                <span className="font-black text-[#BD0F32]">
                  {initial.overrideHoursSpent}h
                </span>
              </div>
            ) : null}
            {initial.breadAmount > 0 ? (
              <div className="flex justify-between">
                <span>Credited</span>
                <span className="font-black text-[#BD0F32]">
                  <BreadAmount amount={initial.breadAmount} />
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-center gap-2 text-sm font-black text-black">
            <HiClock className="size-5 text-[#BD0F32]" />
            Time evidence
          </div>
          <p className="mt-1 text-xs font-semibold text-black/50">
            Server-calculated activity and separately attached recordings.
          </p>
          <p className="mt-1 text-xs font-semibold text-black/40">
            These are the sources used for the submitted measured-time total.
          </p>
          <div className="mt-3 space-y-2 text-sm text-black/70">
            <div className="flex justify-between gap-3">
              <span>Active in Breadboard</span>
              <span className="font-black text-black">
                {formatExactDuration(tracking.trackedSeconds)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Lapse recording time</span>
              <span className="font-black text-black">
                {formatExactDuration(tracking.recordingSeconds)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Measured total</span>
              <span className="font-black text-[#BD0F32]">
                {formatExactDuration(tracking.measuredSeconds)}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-t border-black/10 pt-2 text-xs">
              <span>Activity sessions</span>
              <span className="font-black text-black">
                {tracking.sessionCount}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-xs">
              <span>Journals cover</span>
              <span className="font-black text-black">
                {formatExactDuration(tracking.journaledSeconds)}
              </span>
            </div>
            <div className="border-t border-black/10 pt-2 text-xs">
              <p className="font-black text-black/45">Last heartbeat</p>
              <p className="mt-0.5 font-semibold text-black">
                {formatEvidenceTime(tracking.lastTrackedAt)}
              </p>
            </div>
            <div className="text-xs">
              <p className="font-black text-black/45">Latest screen proof</p>
              <p className="mt-0.5 font-semibold text-black">
                {formatEvidenceTime(tracking.lastScreenEvidenceAt)}
              </p>
            </div>
          </div>
        </section>

        {initial.submissionSource === "manual" ? (
          <section className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 shadow-[2px_2px_0_#000]/10">
            <div className="flex items-start gap-2">
              <HiInformationCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div>
                <h3 className="text-sm font-black text-amber-800">
                  Manual submission
                </h3>
                <p className="mt-1.5 text-xs font-semibold text-amber-700/80">
                  This project was submitted with an external tool (KiCad,
                  Eagle, etc.). Verify the git repo, schematic, README, and
                  server-tracked screen evidence before approving.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <h3 className="text-sm font-black text-black">Journals</h3>
          <div className="mt-2 max-h-80 space-y-2 overflow-auto pr-1">
            {journals.map((journal) => (
              <div
                key={journal.id}
                className="rounded-lg border border-black/8 bg-zinc-50 p-2.5 text-xs text-black/65"
              >
                <p className="font-black text-black/45">
                  {new Date(journal.createdAt).toLocaleString()} ·{" "}
                  {formatExactDuration(journal.activeSecondsCovered)}
                </p>
                <Markdown className="mt-1">{journal.content}</Markdown>
              </div>
            ))}
            {journals.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/10 bg-zinc-50 p-2.5 text-xs text-black/35">
                No journals submitted.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-center gap-2 text-sm font-black text-black">
            <HiFilm className="size-5 text-[#BD0F32]" />
            Attached recordings ({timelapses.length})
          </div>
          {timelapses.length > 0 ? (
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {timelapses.map((entry) => (
                <li
                  key={entry.id}
                  className="overflow-hidden rounded-lg border border-black/10 bg-zinc-50"
                >
                  <a
                    href={entry.playbackUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    {entry.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.thumbnailUrl}
                        alt={entry.name || "Timelapse"}
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="grid aspect-video w-full place-items-center bg-black/80 text-white">
                        <HiFilm className="size-8" />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 p-2.5 text-xs">
                      <span className="truncate font-black text-black">
                        {entry.name || "Untitled timelapse"}
                      </span>
                      <span className="shrink-0 font-bold text-black/50">
                        {entry.durationSeconds > 0
                          ? formatTimelapseDuration(entry.durationSeconds)
                          : "video"}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-lg border border-dashed border-black/10 bg-zinc-50 p-2.5 text-xs text-black/35">
              No attached recordings for this project.
            </p>
          )}
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-center gap-2 text-sm font-black text-black">
            <HiClock className="size-5 text-[#BD0F32]" />
            Currency
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-black/40">
            Award{isBuild ? " (gold bread — build ship)" : ""}
          </p>
          <p className="text-3xl font-black text-black">
            <BreadAmount amount={approvedBread} size="lg" gold={isBuild} />
          </p>
          <p className="mt-1 text-sm text-black/55">
            {approvedHours || 0}h × {breadPerHour}
          </p>
          <div className="mt-3 space-y-1.5 border-t border-black/10 pt-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-black/40">
              Default
            </p>
            <p className="text-base font-black text-black/60">
              {initial.hoursSpent}h × {breadPerHour} ={" "}
              <BreadAmount
                amount={initial.hoursSpent * breadPerHour}
                gold={isBuild}
              />
            </p>
            <p className="text-[10px] font-bold text-black/35">
              {isManual
                ? "Measured hours. This value will be the default for demo review."
                : "Server-tracked hours. This value will be the default for demo review."}
            </p>
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-black text-black">
              Submission history
            </h3>
            <span className="text-xs font-bold text-black/45">
              {submissionHistory.length} prior
            </span>
          </div>
          {submissionHistory.length ? (
            <div className="mt-2 overflow-x-auto border-y border-black/10">
              <table className="w-full min-w-[280px] text-left text-xs">
                <thead className="border-b border-black/10 text-[10px] font-black tracking-[0.1em] text-black/40 uppercase">
                  <tr>
                    <th className="px-1 py-2">Attempt</th>
                    <th className="px-1 py-2">Time</th>
                    <th className="px-1 py-2">Outcome</th>
                    <th className="px-1 py-2 text-right">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionHistory.map((entry) => {
                    const submittedAt = entry.submittedAt
                      ? new Date(entry.submittedAt).toLocaleDateString()
                      : "Unknown";
                    const reviewedAt = entry.reviewedAt
                      ? new Date(entry.reviewedAt).toLocaleDateString()
                      : "Not reviewed";
                    const editorHref =
                      entry.editorVersionNumber === null
                        ? null
                        : `/editor/${initial.id}?version=${entry.editorVersionNumber}`;
                    const timelapseHref = entry.submittedAt
                      ? `/platform/admin/projects/${initial.id}/timelapse?until=${encodeURIComponent(entry.submittedAt)}`
                      : null;

                    return (
                      <tr
                        key={entry.id}
                        className="border-t border-black/8 align-top text-black/65"
                      >
                        <td className="px-1 py-2.5 font-black text-black">
                          #{entry.submissionNumber}
                          <span className="mt-0.5 block text-[10px] font-semibold text-black/40">
                            {submittedAt}
                          </span>
                        </td>
                        <td className="px-1 py-2.5 font-bold text-black">
                          {entry.hoursSpent}h
                          {entry.approvedHours !== null &&
                          entry.approvedHours !== entry.hoursSpent ? (
                            <span className="mt-0.5 block text-[10px] font-semibold text-black/40">
                              {entry.approvedHours}h approved
                            </span>
                          ) : null}
                        </td>
                        <td className="px-1 py-2.5">
                          <span className="font-black text-black">
                            {statusLabel(entry.status)}
                          </span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-black/40">
                            {reviewedAt}
                          </span>
                          {entry.userComment ? (
                            <p className="mt-1 leading-snug text-black/60">
                              {entry.userComment}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-1 py-2.5">
                          <div className="flex justify-end gap-1">
                            {editorHref ? (
                              <a
                                href={editorHref}
                                target="_blank"
                                rel="noreferrer"
                                title={`Open frozen editor version ${entry.editorVersionNumber}`}
                                aria-label={`Open frozen editor version ${entry.editorVersionNumber}`}
                                className="grid size-7 place-items-center rounded-md text-black/55 hover:bg-black hover:text-white"
                              >
                                <HiCodeBracket className="size-4" />
                              </a>
                            ) : null}
                            {timelapseHref ? (
                              <a
                                href={timelapseHref}
                                target="_blank"
                                rel="noreferrer"
                                title="Open timelapse through this submission"
                                aria-label="Open timelapse through this submission"
                                className="grid size-7 place-items-center rounded-md text-black/55 hover:bg-black hover:text-white"
                              >
                                <HiFilm className="size-4" />
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-xs text-black/45">
              This is the first submission.
            </p>
          )}
        </section>
      </aside>
    </article>
  );
}

function DetailRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string | null;
  link?: boolean;
}) {
  const display = (value ?? "").trim();
  if (!display) {
    return (
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-black/30">
          {label}
        </p>
        <p className="text-sm font-semibold text-black/25">—</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-black/40">
        {label}
      </p>
      {link ? (
        <a
          href={display.startsWith("http") ? display : `https://${display}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-bold text-[#BD0F32] underline break-all"
        >
          {display}
          <HiArrowTopRightOnSquare className="size-3 shrink-0" />
        </a>
      ) : (
        <p className="text-sm font-bold text-black break-all">{display}</p>
      )}
    </div>
  );
}
