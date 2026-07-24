"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
  HiScissors,
  HiWrenchScrewdriver,
  HiXCircle,
} from "react-icons/hi2";
import { FaGithub, FaSlack } from "react-icons/fa6";
import {
  approveProject,
  clearReviewCommentDraft,
  nextPendingReviewHref,
  rejectProject,
  requestChanges,
  saveReviewCommentDraft,
  saveUnifiedTemplateOverride,
  setProjectShipType,
  setProjectSimulatorSketchy,
  updateUnifiedJustification,
} from "@/actions/admin/review";
import { CodeAuthenticityCard } from "@/components/platform/code-authenticity-card";
import { BreadAmount, BreadIcon } from "@/components/shared/bread-amount";
import { Markdown } from "@/components/shared/markdown";
import { breadForHours, roundHours } from "@/lib/constants";
import { isBuildShip } from "@/lib/projects/project-type";
import { storageReadUrl } from "@/lib/storage/urls";
import {
  type UnifiedJustificationParts,
  composeUnifiedJustification,
} from "@/lib/ysws/justificationTemplate";

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
  reviewerCommentDraft: string;
  breadAmount: number;
  shippedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  userName: string;
  userEmail: string;
  userSlackId: string | null;
  userId: string;
  kitType: string;
  kitOrderId: number | null;
  submissionSource: string | null;
  breadOnly: boolean;
  simulatorSketchy: boolean;
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

// Aggregate of the reviewer time-audit segments marked on the timelapse
// (removed or deflated ranges, fallout-style).
type TimeAuditSummary = {
  segmentCount: number;
  removedSeconds: number;
  deflatedSeconds: number;
};

type SubmissionHistoryEntry = {
  id: number;
  submissionNumber: number;
  editorVersionNumber: number | null;
  hoursSpent: number;
  trackedSeconds: number;
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
  nextHref,
  skipIds,
  unifiedRecord,
  journals,
  timelapses,
  submissionHistory,
  tracking,
  trackingAllTime,
  windowStartIso,
  timeAudit,
  timeAuditAllTime,
  breadPerHour,
}: {
  project: ReviewProject;
  nextHref: string;
  skipIds: number[];
  unifiedRecord: {
    text: string;
    overridden: boolean;
    parts: UnifiedJustificationParts | null;
  } | null;
  journals: Journal[];
  timelapses: Timelapse[];
  submissionHistory: SubmissionHistoryEntry[];
  // tracking / timeAudit are this ship's window (what pays out). The *AllTime
  // pair is the whole project, shown when the reviewer toggles the scope.
  tracking: TrackingSummary;
  trackingAllTime: TrackingSummary;
  // Start of this ship's window (previous approved ship's submission), passed
  // through to the timelapse so its audit tool opens scoped to this ship. Null
  // on a first ship.
  windowStartIso: string | null;
  timeAudit?: TimeAuditSummary;
  timeAuditAllTime?: TimeAuditSummary;
  breadPerHour: number;
}) {
  // Payout always follows THIS ship's window: the audited total (the per-ship
  // measured minus the reviewer's deductions) is the default approved hours
  // whenever any segment exists, so marking a deduction actually lowers the
  // payout and the Unified DB hours instead of silently sending the raw
  // measured time. initial.hoursSpent is already this ship's measured total.
  // Time from earlier ships is windowed out upstream, so the same hours can't
  // be counted twice.
  const auditDeductedSeconds =
    (timeAudit?.removedSeconds ?? 0) + (timeAudit?.deflatedSeconds ?? 0);
  const hasTimeAudit = (timeAudit?.segmentCount ?? 0) > 0;
  const auditedHours = roundHours(
    Math.max(0, initial.hoursSpent - auditDeductedSeconds / 3600),
  );

  // The Time evidence card can show this ship's window (the default, what pays
  // out) or the whole project, toggled by the reviewer. Only the display
  // switches; the approved-hours default above stays pinned to this ship.
  const [timeScope, setTimeScope] = useState<"ship" | "all">("ship");
  const trackingView = timeScope === "all" ? trackingAllTime : tracking;
  const auditView = timeScope === "all" ? timeAuditAllTime : timeAudit;
  const viewAuditDeducted =
    (auditView?.removedSeconds ?? 0) + (auditView?.deflatedSeconds ?? 0);
  const viewAuditedSeconds = Math.max(
    0,
    trackingView.measuredSeconds - viewAuditDeducted,
  );
  const viewHasAudit = (auditView?.segmentCount ?? 0) > 0;

  const [verdict, setVerdict] = useState<"approve" | "changes" | "reject">(
    "approve",
  );
  const [approvedHours, setApprovedHours] = useState(
    initial.overrideHoursSpent ??
      (hasTimeAudit ? auditedHours : initial.hoursSpent),
  );
  // Starts on when the maker declared the ship bread-only, so the reviewer
  // sees that choice pre-selected and can undo it (turning it back into a
  // normal kit-shipping design approval).
  const [acceptBreadOnly, setAcceptBreadOnly] = useState(initial.breadOnly);
  // Reviewer-only hours justification. It's stored as the submission's
  // internalNote and pushed to the Unified YSWS DB as "Optional - Override
  // Hours Spent Justification" when the approval pays out. Prefilled from the
  // materials review so the demo review starts from what was already written.
  const [unifiedJustification, setUnifiedJustification] = useState(
    initial.overrideHoursSpentJustification,
  );
  // Seed from the server-side draft so a half-written comment survives a
  // reload or a return days later on any device. Only a still-pending
  // submission carries a live draft; a decided one shows a blank box.
  const [userComment, setUserComment] = useState(
    initial.status === "pending_review" ? initial.reviewerCommentDraft : "",
  );
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [typePending, startTypeTransition] = useTransition();
  const [typeError, setTypeError] = useState<string | null>(null);
  const [justificationPending, startJustificationTransition] = useTransition();
  const [justificationSaved, setJustificationSaved] = useState(false);
  const [justificationError, setJustificationError] = useState<string | null>(
    null,
  );
  const [templateText, setTemplateText] = useState(unifiedRecord?.text ?? "");
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templatePending, startTemplateTransition] = useTransition();
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  // Reviewer flag for the "approved · simulator sketchy" review-queue bucket.
  // Persists on its own the moment it's toggled, decoupled from the approve
  // decision, so flagging changes nothing about the payout or review flow.
  const [simulatorSketchy, setSimulatorSketchy] = useState(
    initial.simulatorSketchy,
  );
  const [sketchyPending, startSketchyTransition] = useTransition();
  const [sketchyError, setSketchyError] = useState<string | null>(null);

  // Live preview: recompose the template from the current form inputs so
  // changing the approved hours or the justification updates the record box
  // instantly, before anything commits. Overrides show their frozen text.
  const generatedTemplate =
    unifiedRecord && !unifiedRecord.overridden && unifiedRecord.parts
      ? composeUnifiedJustification(
          unifiedRecord.parts,
          approvedHours,
          unifiedJustification,
        )
      : (unifiedRecord?.text ?? "");

  // Follow the live template unless the reviewer has unsaved edits in the box.
  useEffect(() => {
    if (!templateDirty) setTemplateText(generatedTemplate);
  }, [generatedTemplate, templateDirty]);

  // The hours justification only reaches the server on approve/save, so
  // navigating away (which unmounts this client component) used to discard any
  // unsaved typing. Keep a per-submission localStorage draft so the text
  // survives an unmount and rehydrates when the reviewer comes back.
  const justificationDraftKey = `bb-review-justification-${initial.submissionId}`;
  // Rehydrate once per submission on mount; the value dep is intentionally
  // omitted so later edits don't re-trigger the restore.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rehydrate on mount only, not on every edit
  useEffect(() => {
    try {
      const draft = window.localStorage.getItem(justificationDraftKey);
      if (draft !== null && draft !== unifiedJustification) {
        setUnifiedJustification(draft);
      }
    } catch {}
  }, [justificationDraftKey]);
  function clearJustificationDraft() {
    try {
      window.localStorage.removeItem(justificationDraftKey);
    } catch {}
  }

  // The maker-facing comment only reaches the server when a decision is
  // submitted, so autosave it as a draft in between: debounced while typing and
  // flushed on blur. It persists server-side (saveReviewCommentDraft), so a
  // half-written message survives a reload or a return days later on any
  // device. Only pending submissions carry a draft; once a decision lands the
  // draft is cleared (see run) and the box is blank. Best-effort: a failed
  // autosave is swallowed so it never interrupts typing.
  const commentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function saveCommentDraft(value: string) {
    if (initial.status !== "pending_review") return;
    void saveReviewCommentDraft(initial.submissionId, value).catch(() => {});
  }
  function queueCommentDraftSave(value: string) {
    if (initial.status !== "pending_review") return;
    if (commentSaveTimer.current) clearTimeout(commentSaveTimer.current);
    commentSaveTimer.current = setTimeout(() => saveCommentDraft(value), 700);
  }
  function flushCommentDraftSave(value: string) {
    if (commentSaveTimer.current) {
      clearTimeout(commentSaveTimer.current);
      commentSaveTimer.current = null;
    }
    saveCommentDraft(value);
  }
  // Drop a still-pending debounce on unmount so it can't fire after the
  // component is gone; blur already flushes the common navigate-away case.
  useEffect(() => {
    const timer = commentSaveTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const router = useRouter();
  const isManual = initial.submissionSource === "manual";
  // Currency follows projectType, not submissionSource: an off-platform
  // *design* (manual source, design type) earns regular bread and ships a
  // kit, exactly like an editor design. Only build ships earn gold.
  const isBuild = isBuildShip(initial);
  const screenshot = safeUrl(initial.screenshotUrl);
  // Live playable: the interactive sim rendered on the server from editorData,
  // available from the materials stage on. Derived from the project id rather
  // than the submission's playableUrl (only written on demo submission).
  // External-tool submissions have no editorData (would 404 on /share), so use
  // their provided URL.
  const playable = isManual
    ? safeUrl(initial.playableUrl)
    : `/share/${initial.id}`;
  // Durable static share page (GitHub Pages), written on demo submission. Shown
  // alongside the live link for on-platform projects; null (greyed) until set.
  const staticPlayable = isManual ? null : safeUrl(initial.playableUrl);
  const demoVideo = safeUrl(initial.demoVideoUrl);
  const code = safeUrl(initial.codeUrl);
  const slackProfile = initial.userSlackId
    ? `https://hackclub.enterprise.slack.com/team/${initial.userSlackId}`
    : null;
  const approvedBread = breadForHours(approvedHours || 0, breadPerHour);

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
        // The comment is now frozen onto the submission, so drop its draft
        // (best-effort; the page won't re-seed a decided submission anyway).
        void clearReviewCommentDraft(initial.submissionId).catch(() => {});
        // Advance to the next still-pending card in the design lane, resolved
        // now rather than at page load: on a busy queue the target picked when
        // this page opened may already be decided, and we must never drop the
        // reviewer onto a locked review. Skip past anything deferred this
        // session and carry the skip set forward. Falls back to the page-load
        // target, then the gallery, if the lookup fails.
        const href = await nextPendingReviewHref(
          "materials",
          [initial.id, ...skipIds],
          skipIds,
        ).catch(() => nextHref);
        router.push(href);
      } catch (error) {
        setErrorMsg(error instanceof Error ? error.message : "Failed");
        router.refresh();
      }
    });
  }

  // Defer this card without deciding it: add it to the skip set and jump to the
  // next still-pending card in the lane, carrying the skip set in the URL so
  // skipped cards don't resurface this session. Falls back to the gallery.
  function skipReview() {
    setErrorMsg(null);
    const carry = [initial.id, ...skipIds];
    startTransition(async () => {
      const href = await nextPendingReviewHref("materials", carry, carry).catch(
        () => "/platform/admin/review",
      );
      router.push(href);
    });
  }

  const locked = submitted || initial.status !== "pending_review";
  // A decision (approve / changes / reject) already landed on this submission,
  // so it's no longer awaiting a first look.
  const reviewed = initial.status !== "pending_review";

  // Ship type decides the payout currency and whether a kit ships, so once the
  // project is paid out the server refuses the change; hide the button then.
  const typeLocked = ["done", "paid_out", "fulfilled", "approved"].includes(
    initial.projectStatus,
  );

  // A prior approved ship means this submission is an update: approving pays
  // bread for the new hours immediately.
  const isUpdateShip = submissionHistory.some(
    (entry) => entry.status === "approved" || entry.status === "fulfilled",
  );

  // Kit state for the update panel. A project has had its kit once kitOrderId
  // is set; own-parts builders never get one. A project with no kit yet (e.g. a
  // prior bread-only ship) can be sent its first kit from this update, which
  // the reviewer opts into. shipKitWithUpdate only reaches the server for
  // update ships, and the server ignores it unless a kit is genuinely due.
  const usesOwnParts = initial.kitType === "own";
  const hasKit = initial.kitOrderId != null;
  const canOfferKit = isUpdateShip && !hasKit && !usesOwnParts;
  const [shipKitWithUpdate, setShipKitWithUpdate] = useState(false);

  // Approvals that pay out (demo, build, bread-only, update) push the ship to
  // the Unified YSWS DB, whose spot-checks require an hours justification. The
  // kit materials approval doesn't pay yet, so there it's optional and carries
  // forward as the demo review's starting point.
  const paysOut =
    initial.projectStatus === "demo_review" ||
    isBuild ||
    isUpdateShip ||
    acceptBreadOnly;
  const missingJustification = paysOut && !unifiedJustification.trim();

  // After the decision the review is locked, but the justification and the
  // approved hours stay editable: corrections save directly (bread moves by
  // the hours difference) and refresh the ship's Unified DB row if it was
  // already pushed.
  function saveJustification() {
    setJustificationError(null);
    startJustificationTransition(async () => {
      try {
        await updateUnifiedJustification(
          initial.submissionId,
          unifiedJustification,
          approvedHours,
        );
        setJustificationSaved(true);
        clearJustificationDraft();
        router.refresh();
      } catch (error) {
        setJustificationError(
          error instanceof Error ? error.message : "Could not save",
        );
      }
    });
  }

  // Saving freezes the exact text as this ship's Unified DB record; clearing
  // goes back to the live-composed template. Both refresh the Airtable row
  // when the ship already paid out.
  function submitTemplate(text: string, statusMessage: string) {
    setTemplateError(null);
    setTemplateStatus(null);
    startTemplateTransition(async () => {
      try {
        await saveUnifiedTemplateOverride(initial.submissionId, text);
        setTemplateDirty(false);
        setTemplateStatus(statusMessage);
        router.refresh();
      } catch (error) {
        setTemplateError(
          error instanceof Error ? error.message : "Could not save",
        );
      }
    });
  }

  function toggleSimulatorSketchy() {
    const next = !simulatorSketchy;
    setSketchyError(null);
    setSimulatorSketchy(next);
    startSketchyTransition(async () => {
      try {
        await setProjectSimulatorSketchy(initial.id, next);
        router.refresh();
      } catch (error) {
        setSimulatorSketchy(!next);
        setSketchyError(
          error instanceof Error ? error.message : "Could not save",
        );
      }
    });
  }

  function changeShipType(next: "build" | "design") {
    setTypeError(null);
    startTypeTransition(async () => {
      try {
        await setProjectShipType(initial.id, next);
        router.refresh();
      } catch (error) {
        setTypeError(
          error instanceof Error ? error.message : "Could not change type",
        );
      }
    });
  }

  return (
    <article className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-[16px] border border-black bg-white shadow-[4px_4px_0_#000]">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {reviewed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-black px-3 py-1.5 text-xs font-black text-white uppercase">
                  <HiCheck className="size-3.5" />
                  Reviewed
                </span>
              ) : null}
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
              {initial.breadOnly ? (
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800 uppercase">
                  <BreadIcon size="sm" />
                  Bread only
                </span>
              ) : null}
              {isUpdateShip ? (
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-violet-400 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-800 uppercase">
                  Update ship #{initial.submissionNumber}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-black px-3 py-1.5 text-xs font-black text-white uppercase">
                {initial.kitType === "esp32"
                  ? "Kit B · ESP32"
                  : initial.kitType === "own"
                    ? "Own parts"
                    : "Kit A · Arduino"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border-2 py-1 pl-3 text-xs font-black uppercase ${
                  isBuild
                    ? "border-yellow-500 bg-yellow-50 pr-1 text-yellow-800"
                    : "border-sky-400 bg-sky-50 pr-1 text-sky-800"
                }`}
              >
                {isBuild ? "Build ship · gold" : "Design ship · kit"}
                {!typeLocked ? (
                  <button
                    type="button"
                    disabled={typePending}
                    onClick={() => changeShipType(isBuild ? "design" : "build")}
                    title={
                      isBuild
                        ? "Reclassify as a design ship: regular bread, ships a kit"
                        : "Reclassify as a build ship: gold bread, no kit"
                    }
                    className="rounded-full bg-black px-2 py-0.5 text-[10px] font-black text-white uppercase hover:bg-[#BD0F32] disabled:opacity-50"
                  >
                    {typePending
                      ? "Saving…"
                      : isBuild
                        ? "Make design"
                        : "Make build"}
                  </button>
                ) : null}
              </span>
            </div>
            {typeError ? (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-800">
                {typeError}
              </p>
            ) : null}
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
                href={staticPlayable}
                label="Static demo"
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
                )}${
                  windowStartIso
                    ? `&since=${encodeURIComponent(windowStartIso)}`
                    : ""
                }`}
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
                {isUpdateShip ? (
                  <div className="rounded-xl border-2 border-violet-400 bg-violet-50 p-3">
                    <p className="text-sm font-black text-violet-900">
                      Update to an approved project
                    </p>
                    <p className="mt-1 text-xs font-semibold text-violet-800/80">
                      The hours below are new since the last approved ship.
                      Approving pays the bread immediately.
                    </p>
                    {hasKit ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 py-1.5 text-xs font-black text-violet-900">
                        <HiCheckCircle className="size-4" />A kit was already
                        sent for this project. No second kit will ship.
                      </p>
                    ) : usesOwnParts ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 py-1.5 text-xs font-black text-violet-900">
                        Own-parts build. No kit ships.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {canOfferKit ? (
                  <button
                    type="button"
                    aria-pressed={shipKitWithUpdate}
                    onClick={() => setShipKitWithUpdate((value) => !value)}
                    className={`rounded-xl border px-4 py-3 text-left ${
                      shipKitWithUpdate
                        ? "border-emerald-500 bg-emerald-100"
                        : "border-black bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-black ${
                        shipKitWithUpdate ? "text-emerald-900" : "text-black"
                      }`}
                    >
                      <HiWrenchScrewdriver className="size-4" />
                      {shipKitWithUpdate
                        ? "Shipping a kit with this approval"
                        : "Ship a kit with this approval"}
                    </span>
                    <span
                      className={`mt-1 block text-xs font-semibold ${
                        shipKitWithUpdate
                          ? "text-emerald-800/80"
                          : "text-black/50"
                      }`}
                    >
                      This project never got a kit (an earlier ship was bread
                      only). Turning this on sends the{" "}
                      {initial.kitType === "esp32" ? "Kit B · ESP32" : "Kit A"}{" "}
                      to fulfillment now. A project only ever gets one kit.
                    </span>
                  </button>
                ) : null}
                <label className="grid gap-1.5">
                  <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                    Approved hours
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={approvedHours}
                    onChange={(e) => setApprovedHours(Number(e.target.value))}
                    className="rounded-xl border border-black bg-white px-4 py-3 text-xl font-black"
                  />
                  <span className="text-sm font-black text-[#BD0F32]">
                    Awards <BreadAmount amount={approvedBread} gold={isBuild} />{" "}
                    {isBuild ? "gold bread " : ""}({approvedHours || 0}h ×{" "}
                    {breadPerHour})
                  </span>
                  {hasTimeAudit && approvedHours !== auditedHours ? (
                    <button
                      type="button"
                      onClick={() => setApprovedHours(auditedHours)}
                      className="justify-self-start rounded-lg border border-black bg-emerald-100 px-3 py-1.5 text-xs font-black text-black hover:bg-emerald-200"
                    >
                      Use audited total: {auditedHours}h (measured −{" "}
                      {formatExactDuration(auditDeductedSeconds)} audit
                      deductions)
                    </button>
                  ) : null}
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                    Hours justification · Unified YSWS DB
                  </span>
                  <textarea
                    value={unifiedJustification}
                    onChange={(e) => {
                      const value = e.target.value;
                      setUnifiedJustification(value);
                      setJustificationSaved(false);
                      try {
                        window.localStorage.setItem(
                          justificationDraftKey,
                          value,
                        );
                      } catch {}
                    }}
                    rows={4}
                    placeholder="Commit count vs hours, submitter experience (with evidence), specific technical features, and why the approved hours fit — or what you deflated and why. Never shown to the maker."
                    className="rounded-xl border border-black bg-white px-4 py-3 text-sm leading-relaxed"
                  />
                  <span
                    className={`text-[11px] font-bold ${
                      missingJustification ? "text-[#BD0F32]" : "text-black/40"
                    }`}
                  >
                    {paysOut
                      ? "Required — this approval pays out. Your text is wrapped in the unified justification template (tracked time, recordings, journals, dates, deflation are added automatically) and submitted to the Unified YSWS DB."
                      : "Optional for the kit approval; it prefills the demo review and joins the unified justification template when the demo pays out."}
                  </span>
                </label>
                {locked ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        justificationPending || !unifiedJustification.trim()
                      }
                      onClick={saveJustification}
                      className="rounded-xl border border-black bg-white px-4 py-2.5 text-xs font-black text-black hover:bg-black hover:text-white disabled:opacity-50"
                    >
                      {justificationPending
                        ? "Saving…"
                        : justificationSaved
                          ? "Saved ✓"
                          : "Save hours & justification"}
                    </button>
                    <span className="text-[11px] font-bold text-black/40">
                      The review is decided, but the approved hours and the
                      justification stay editable; saving adjusts the
                      maker&apos;s bread by the hours difference and updates the
                      Unified DB record if this ship was already submitted.
                    </span>
                    {justificationError ? (
                      <span className="text-[11px] font-black text-red-700">
                        {justificationError}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <label className="grid gap-1.5">
                  <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                    Comment to user
                  </span>
                  <textarea
                    value={userComment}
                    onChange={(e) => {
                      const value = e.target.value;
                      setUserComment(value);
                      queueCommentDraftSave(value);
                    }}
                    onBlur={(e) => flushCommentDraftSave(e.target.value)}
                    rows={3}
                    className="rounded-xl border border-black bg-white px-4 py-3 text-sm"
                  />
                </label>
                {!isBuild && !isUpdateShip ? (
                  <button
                    type="button"
                    aria-pressed={acceptBreadOnly}
                    onClick={() => setAcceptBreadOnly((value) => !value)}
                    className={`rounded-xl border px-4 py-3 text-left ${
                      acceptBreadOnly
                        ? "border-amber-500 bg-amber-100"
                        : "border-black bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-black ${
                        acceptBreadOnly ? "text-amber-900" : "text-black"
                      }`}
                    >
                      <BreadIcon size="sm" />
                      {acceptBreadOnly
                        ? "Accepting for bread only"
                        : "Accept for bread only"}
                    </span>
                    <span
                      className={`mt-1 block text-xs font-semibold ${
                        acceptBreadOnly ? "text-amber-800/80" : "text-black/50"
                      }`}
                    >
                      {initial.breadOnly
                        ? "The maker declared this ship bread only. Approving pays full bread and sends no kit. Turn this off to approve it as a normal design and ship a kit instead."
                        : "Approve a project that misses the cool-project complexity bar. The maker still earns full bread and the ship gets marked bread only."}
                    </span>
                  </button>
                ) : null}
                <div className="grid gap-1.5">
                  <button
                    type="button"
                    aria-pressed={simulatorSketchy}
                    disabled={sketchyPending}
                    onClick={toggleSimulatorSketchy}
                    className={`rounded-xl border px-4 py-3 text-left disabled:opacity-60 ${
                      simulatorSketchy
                        ? "border-orange-500 bg-orange-100"
                        : "border-black bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-black ${
                        simulatorSketchy ? "text-orange-900" : "text-black"
                      }`}
                    >
                      <HiExclamationTriangle className="size-4" />
                      {simulatorSketchy
                        ? "In “approved · simulator sketchy”"
                        : "Send to “approved · simulator sketchy”"}
                    </span>
                    <span
                      className={`mt-1 block text-xs font-semibold ${
                        simulatorSketchy
                          ? "text-orange-800/80"
                          : "text-black/50"
                      }`}
                    >
                      {simulatorSketchy
                        ? "This project shows under the sketchy bucket in the review queue. Click to remove it."
                        : "Flag an approved project whose simulator output looked questionable. Groups it in the review queue; nothing else changes."}
                    </span>
                  </button>
                  {sketchyError ? (
                    <span className="text-[11px] font-black text-red-700">
                      {sketchyError}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={pending || locked || missingJustification}
                  title={
                    missingJustification
                      ? "Write the hours justification first — the Unified YSWS DB requires it."
                      : undefined
                  }
                  onClick={() =>
                    run(async () => {
                      await approveProject(
                        initial.id,
                        approvedHours,
                        unifiedJustification,
                        userComment,
                        [],
                        initial.projectStatus === "demo_review"
                          ? "demo"
                          : "materials",
                        acceptBreadOnly,
                        canOfferKit && shipKitWithUpdate,
                      );
                      clearJustificationDraft();
                    })
                  }
                  className="rounded-xl bg-[#BD0F32] py-4 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                >
                  {initial.projectStatus === "demo_review" ? (
                    <span className="inline-flex items-center gap-0.5">
                      Approve demo ·{" "}
                      <BreadAmount amount={approvedBread} size="sm" />
                    </span>
                  ) : isBuild || isUpdateShip || acceptBreadOnly ? (
                    <span className="inline-flex items-center gap-0.5">
                      {isUpdateShip ? "Approve update ·" : "Approve ·"}{" "}
                      <BreadAmount
                        amount={approvedBread}
                        gold={isBuild}
                        size="sm"
                      />
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
                    onChange={(e) => {
                      const value = e.target.value;
                      setUserComment(value);
                      queueCommentDraftSave(value);
                    }}
                    onBlur={(e) => flushCommentDraftSave(e.target.value)}
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
            {!locked ? (
              <div className="mt-4 border-t border-black/10 pt-4">
                <button
                  type="button"
                  disabled={pending}
                  onClick={skipReview}
                  className="w-full rounded-xl border border-dashed border-black/40 bg-white py-3 text-sm font-black text-black/60 hover:border-black hover:text-black disabled:opacity-50"
                >
                  Skip for now →
                </button>
                <p className="mt-1.5 text-center text-xs font-semibold text-black/40">
                  Leaves this one pending and jumps to the next unreviewed card.
                  It won&apos;t come back around this session.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {unifiedRecord ? (
          <div className="border-t border-black/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-black text-black">
                Unified YSWS record
              </h3>
              <span
                className={`inline-flex items-center rounded-full border-2 px-3 py-1 text-xs font-black uppercase ${
                  unifiedRecord.overridden
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-emerald-400 bg-emerald-50 text-emerald-800"
                }`}
              >
                {unifiedRecord.overridden
                  ? "Custom override"
                  : "Generated from review data"}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-black/45">
              The exact justification submitted with this ship to the Unified
              YSWS DB. It updates live as you change the approved hours and
              justification above, plus the tracked time, recordings, journals,
              and dates from the database; edit and save to freeze a custom
              version for this project instead.
            </p>
            <textarea
              value={templateText}
              onChange={(e) => {
                setTemplateText(e.target.value);
                setTemplateDirty(true);
                setTemplateStatus(null);
              }}
              rows={16}
              className="mt-3 w-full rounded-xl border border-black bg-[#fffaf1] px-4 py-3 font-mono text-xs leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={templatePending || !templateText.trim()}
                onClick={() =>
                  submitTemplate(templateText, "Custom template saved.")
                }
                className="rounded-xl bg-black px-4 py-2.5 text-xs font-black text-white hover:bg-[#BD0F32] disabled:opacity-50"
              >
                {templatePending ? "Saving…" : "Save as custom template"}
              </button>
              {unifiedRecord.overridden ? (
                <button
                  type="button"
                  disabled={templatePending}
                  onClick={() =>
                    submitTemplate("", "Back to the generated template.")
                  }
                  className="rounded-xl border border-black bg-white px-4 py-2.5 text-xs font-black text-black hover:bg-black hover:text-white disabled:opacity-50"
                >
                  Use generated template
                </button>
              ) : null}
              {templateDirty ? (
                <button
                  type="button"
                  disabled={templatePending}
                  onClick={() => {
                    setTemplateText(generatedTemplate);
                    setTemplateDirty(false);
                    setTemplateStatus(null);
                    setTemplateError(null);
                  }}
                  className="rounded-xl border border-black bg-white px-4 py-2.5 text-xs font-black text-black hover:bg-black hover:text-white disabled:opacity-50"
                >
                  Discard edits
                </button>
              ) : null}
              {templateStatus ? (
                <span className="text-[11px] font-black text-green-700">
                  {templateStatus}
                </span>
              ) : null}
              {templateError ? (
                <span className="text-[11px] font-black text-red-700">
                  {templateError}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-black text-black">
              <HiClock className="size-5 text-[#BD0F32]" />
              Time evidence
            </div>
            <fieldset className="flex rounded-lg border border-black bg-zinc-100 p-0.5">
              <legend className="sr-only">Time scope</legend>
              {(
                [
                  ["ship", "This ship"],
                  ["all", "All time"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTimeScope(value)}
                  aria-pressed={timeScope === value}
                  className={`rounded-md px-2 py-1 text-[11px] font-black transition ${
                    timeScope === value
                      ? "bg-black text-white"
                      : "text-black/50 hover:text-black"
                  }`}
                >
                  {label}
                </button>
              ))}
            </fieldset>
          </div>
          <p className="mt-1 text-xs font-semibold text-black/50">
            {timeScope === "all"
              ? "The whole project, every ship combined."
              : "Only this ship's new time. This is what pays out; the same hours are never counted on two ships."}
          </p>
          <p className="mt-1 text-xs font-semibold text-black/40">
            This ship {formatExactDuration(tracking.measuredSeconds)} · whole
            project {formatExactDuration(trackingAllTime.measuredSeconds)}
          </p>
          <div className="mt-3 space-y-2 text-sm text-black/70">
            <div className="flex justify-between gap-3">
              <span>Active in Breadboard</span>
              <span className="font-black text-black">
                {formatExactDuration(trackingView.trackedSeconds)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Lapse recording time</span>
              <span className="font-black text-black">
                {formatExactDuration(trackingView.recordingSeconds)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>
                Measured total{timeScope === "all" ? " (whole project)" : ""}
              </span>
              <span className="font-black text-[#BD0F32]">
                {formatExactDuration(trackingView.measuredSeconds)}
              </span>
            </div>
            {viewHasAudit && auditView ? (
              <>
                {auditView.removedSeconds > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>Time audit · removed</span>
                    <span className="font-black text-red-600">
                      −{formatExactDuration(auditView.removedSeconds)}
                    </span>
                  </div>
                ) : null}
                {auditView.deflatedSeconds > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>Time audit · deflated</span>
                    <span className="font-black text-amber-600">
                      −{formatExactDuration(auditView.deflatedSeconds)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <span>
                    Audited total ({auditView.segmentCount} segment
                    {auditView.segmentCount === 1 ? "" : "s"})
                  </span>
                  <span className="font-black text-emerald-700">
                    {formatExactDuration(viewAuditedSeconds)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between gap-3 text-xs">
                <span>Time audit</span>
                <span className="font-semibold text-black/40">
                  {timeScope === "all"
                    ? "None yet across the project"
                    : "None yet — mark segments in the timelapse"}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-black/10 pt-2 text-xs">
              <span>Activity sessions</span>
              <span className="font-black text-black">
                {trackingView.sessionCount}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-xs">
              <span>Journals cover</span>
              <span className="font-black text-black">
                {formatExactDuration(trackingView.journaledSeconds)}
              </span>
            </div>
            <div className="border-t border-black/10 pt-2 text-xs">
              <p className="font-black text-black/45">Last heartbeat</p>
              <p className="mt-0.5 font-semibold text-black">
                {formatEvidenceTime(trackingView.lastTrackedAt)}
              </p>
            </div>
            <div className="text-xs">
              <p className="font-black text-black/45">Latest screen proof</p>
              <p className="mt-0.5 font-semibold text-black">
                {formatEvidenceTime(trackingView.lastScreenEvidenceAt)}
              </p>
            </div>
          </div>
        </section>

        <CodeAuthenticityCard projectId={initial.id} />

        {initial.breadOnly ? (
          <section className="rounded-[16px] border border-amber-400 bg-amber-100 p-4 shadow-[2px_2px_0_#000]/10">
            <div className="flex items-start gap-2">
              <HiExclamationTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <div>
                <h3 className="text-sm font-black text-amber-900">
                  Shipping for bread only
                </h3>
                <p className="mt-1.5 text-xs font-semibold text-amber-800/80">
                  This ship is only for bread, either declared by the maker at
                  submit time or accepted that way by a reviewer. The
                  cool-project quality bar (inputs, outputs, sensors, purpose,
                  decision-making, unique firmware) is waived. Review the hours
                  and honesty requirements as usual.
                </p>
              </div>
            </div>
          </section>
        ) : null}

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
                  {entry.durationSeconds > 0 ? (
                    <Link
                      href={`/platform/admin/projects/${initial.id}/timelapse/recording/${entry.id}`}
                      className="flex items-center justify-center gap-1.5 border-t border-black/10 bg-white px-2.5 py-2 text-xs font-black text-black/70 no-underline transition hover:bg-[#BD0F32] hover:text-white"
                    >
                      <HiScissors className="size-4" />
                      Audit time
                    </Link>
                  ) : null}
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
                amount={breadForHours(initial.hoursSpent, breadPerHour)}
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
                          {entry.trackedSeconds > 0
                            ? formatExactDuration(entry.trackedSeconds)
                            : `${entry.hoursSpent}h`}
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
