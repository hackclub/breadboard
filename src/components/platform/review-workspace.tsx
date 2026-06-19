"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  HiArrowTopRightOnSquare,
  HiCheckCircle,
  HiClock,
  HiCodeBracket,
  HiDocumentText,
  HiExclamationTriangle,
  HiFilm,
  HiPencilSquare,
  HiPhoto,
  HiPlay,
  HiTrash,
  HiXCircle,
} from "react-icons/hi2";
import {
  addProjectNote,
  addUserNote,
  deleteNote,
  editNote,
} from "@/actions/admin/notes";
import {
  approveProject,
  rejectProject,
  requestChanges,
} from "@/actions/admin/review";

type ReviewProject = {
  id: number;
  title: string;
  email: string;
  playableUrl: string;
  codeUrl: string;
  screenshotUrl: string;
  description: string;
  firstName: string;
  lastName: string;
  hoursSpent: number;
  overrideHoursSpent: number | null;
  overrideHoursSpentJustification: string;
  status: string;
  reviewNote: string;
  breadAmount: number;
  shippedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  userName: string;
  userEmail: string;
  userId: string;
  kitType: string;
};

type Note = {
  id: number;
  projectId: number | null;
  targetUserId: string | null;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

const checklistItems = [
  "README exists",
  "Playable URL works without building from source",
  "Code is public",
  "Code is original",
  "Incremental progress is shown",
  "Screenshot accurately shows the project",
];

const verdictOptions = [
  { value: "approve", icon: HiCheckCircle, label: "Approve" },
  { value: "changes", icon: HiExclamationTriangle, label: "Changes needed" },
  { value: "reject", icon: HiXCircle, label: "Reject" },
] as const;

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function shouldOptimizeProjectImage(src: string) {
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

function readmeUrl(codeUrl: string) {
  const url = safeUrl(codeUrl);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parsed.hostname.includes("github.com") || parts.length < 2)
      return null;
    return `https://github.com/${parts[0]}/${parts[1]}#readme`;
  } catch {
    return null;
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

function timeAgo(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
      <>
        <Image
          src="/assets/design.png"
          alt="Example project preview"
          fill
          sizes="208px"
          className="object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
        <p className="absolute right-2 bottom-2 rounded-full border border-black bg-white px-2 py-0.5 text-[10px] font-black text-black shadow-[1px_1px_0_#000]">
          Example image
        </p>
      </>
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

function SideNote({
  note,
  currentUserId,
  onEdit,
  onDelete,
}: {
  note: Note;
  currentUserId: string;
  onEdit: (id: number, content: string) => void;
  onDelete: (id: number) => void;
}) {
  const isMine = note.authorId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content);
  const [, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-black/8 bg-zinc-50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 text-[11px] text-black/40">
          <span className="font-black text-black/55">{note.authorName}</span>
          <span>{timeAgo(note.createdAt)}</span>
        </div>
        {isMine ? (
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => {
                if (editing) {
                  startTransition(() => onEdit(note.id, text));
                  setEditing(false);
                } else setEditing(true);
              }}
              className="rounded px-1.5 py-0.5 text-[11px] font-black text-zinc-400 hover:bg-white hover:text-black"
            >
              {editing ? "Save" : "Edit"}
            </button>
            <button
              type="button"
              onClick={() => (confirm("Delete?") ? onDelete(note.id) : null)}
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-red-50 hover:text-red-600"
            >
              <HiTrash className="size-3" />
            </button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full rounded border border-black px-2 py-1 text-xs"
        />
      ) : (
        <p className="text-xs leading-snug text-black/60 whitespace-pre-wrap">
          {note.content}
        </p>
      )}
    </div>
  );
}

export function ReviewWorkspace({
  project: initial,
  projectNotes: initialProjectNotes,
  userNotes: initialUserNotes,
  currentUserId,
  targetUserId,
  breadPerHour,
}: {
  project: ReviewProject;
  projectNotes: Note[];
  userNotes: Note[];
  currentUserId: string;
  targetUserId: string;
  breadPerHour: number;
}) {
  const [tab, setTab] = useState<"verdict" | "readme">("verdict");
  const [verdict, setVerdict] = useState<"approve" | "changes" | "reject">(
    "approve",
  );
  const [approvedHours, setApprovedHours] = useState(
    initial.overrideHoursSpent ?? initial.hoursSpent,
  );
  const [internalJustification, setInternalJustification] = useState(
    initial.overrideHoursSpentJustification,
  );
  const [userComment, setUserComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [projectNotes, setProjectNotes] = useState(initialProjectNotes);
  const [userNotesState, setUserNotesState] = useState(initialUserNotes);
  const [newProjectNote, setNewProjectNote] = useState("");
  const [newUserNote, setNewUserNote] = useState("");
  const screenshot = safeUrl(initial.screenshotUrl);
  const playable = safeUrl(initial.playableUrl);
  const code = safeUrl(initial.codeUrl);
  const readme = readmeUrl(initial.codeUrl);
  const approvedBread =
    Math.max(0, Math.floor(approvedHours || 0)) * breadPerHour;

  const statusTone =
    initial.status === "shipped"
      ? "bg-[#BD0F32] text-white"
      : initial.status === "needs_changes"
        ? "bg-yellow-100 text-yellow-900"
        : initial.status === "paid_out" || initial.status === "fulfilled"
          ? "bg-green-100 text-green-900"
          : "bg-zinc-100 text-zinc-700";

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed");
      }
    });
  }

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
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-black px-3 py-1.5 text-xs font-black text-white uppercase">
                {initial.kitType === "esp32"
                  ? "Kit B · ESP32"
                  : "Kit A · Arduino"}
              </span>
            </div>
            <h2 className="mt-2 text-4xl font-black leading-tight text-black">
              {initial.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-black/50">
              <span>{initial.userName}</span>
              <span className="text-black/25">{initial.userEmail}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <EvidenceButton href={playable} label="Demo" icon={HiPlay} />
              <EvidenceButton href={code} label="Code" icon={HiCodeBracket} />
              <EvidenceButton
                href={readme}
                label="README"
                icon={HiDocumentText}
              />
              <EvidenceButton
                href={screenshot}
                label="Screenshot"
                icon={HiPhoto}
              />
              <EvidenceButton
                href={`/editor/${initial.id}`}
                label="Editor"
                icon={HiPencilSquare}
              />
              <EvidenceButton
                href={`/platform/admin/projects/${initial.id}/versions`}
                label="Versions"
                icon={HiClock}
              />
              <EvidenceButton
                href={`/platform/admin/projects/${initial.id}/timelapse`}
                label="Timelapse"
                icon={HiFilm}
              />
            </div>
          </div>
          <div className="relative hidden h-28 w-52 shrink-0 overflow-hidden rounded-[12px] border border-black bg-white lg:block">
            <ReviewScreenshotPreview
              screenshot={screenshot}
              title={initial.title}
            />
          </div>
        </div>

        <div className="flex border-b border-black/10 px-4 pt-3">
          {(["verdict", "readme"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              className={`rounded-t-xl px-5 py-2.5 text-sm font-black capitalize ${
                tab === name
                  ? "bg-black text-white"
                  : "text-zinc-400 hover:bg-zinc-100 hover:text-black"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "verdict" ? (
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
                      Awards {approvedBread} bread ({approvedHours || 0}h ×{" "}
                      {breadPerHour})
                    </span>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                      Ship justification · internal only
                    </span>
                    <textarea
                      value={internalJustification}
                      onChange={(e) => setInternalJustification(e.target.value)}
                      rows={12}
                      placeholder="Explain scope, deliverables, evidence reviewed, commit history, hour adjustments, README context, and project quality. Be thorough for >8hr projects."
                      className="rounded-xl border border-black bg-white px-4 py-3 text-sm leading-relaxed"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                      Comment to user · optional, visible to them
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
                    disabled={pending || initial.status !== "shipped"}
                    onClick={() =>
                      run(() =>
                        approveProject(
                          initial.id,
                          approvedHours,
                          internalJustification,
                          userComment,
                        ),
                      )
                    }
                    className="rounded-xl bg-[#BD0F32] py-4 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                  >
                    Submit approval · {approvedBread} bread
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
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        verdict === "reject"
                          ? rejectProject(initial.id, userComment)
                          : requestChanges(initial.id, userComment),
                      )
                    }
                    className="rounded-xl border border-black bg-white py-3.5 text-sm font-black text-black hover:bg-black hover:text-white disabled:opacity-50"
                  >
                    {verdict === "reject"
                      ? "Reject permanently"
                      : "Request changes"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-black/10 bg-zinc-50 p-5">
              <div className="flex items-center gap-2">
                <HiDocumentText className="size-5 text-[#BD0F32]" />
                <h3 className="text-lg font-black text-black">README</h3>
              </div>
              <p className="mt-2 text-sm text-black/55">
                Open the GitHub README to verify scope, commit history, and
                claimed hours.
              </p>
              {readme ? (
                <a
                  href={readme}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-black text-white no-underline hover:bg-[#BD0F32]"
                >
                  Open README
                  <HiArrowTopRightOnSquare className="size-4 opacity-60" />
                </a>
              ) : (
                <p className="mt-4 text-sm font-black text-[#BD0F32]">
                  No GitHub URL found.
                </p>
              )}
            </div>
          )}
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
              <span>Hours claimed</span>
              <span className="font-black text-white">
                {initial.hoursSpent}h
              </span>
            </div>
            <div className="flex justify-between">
              <span>Bread possible</span>
              <span className="font-black text-white">
                {initial.hoursSpent * breadPerHour}
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
                  {initial.breadAmount} bread
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-center gap-2 text-sm font-black text-black">
            <HiClock className="size-5 text-[#BD0F32]" />
            Currency
          </div>
          <p className="mt-3 text-3xl font-black text-black">
            {approvedBread} bread
          </p>
          <p className="mt-1 text-sm text-black/45">
            {approvedHours || 0}h × {breadPerHour}
          </p>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <h3 className="text-sm font-black text-black">Checklist</h3>
          <div className="mt-2 space-y-1.5">
            {checklistItems.map((item) => (
              <label
                key={item}
                className="flex items-start gap-2 rounded-lg bg-zinc-50 p-2.5 text-xs font-bold text-black/65"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-black"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <h3 className="text-sm font-black text-black">Review history</h3>
          <div className="mt-2 space-y-1.5 text-xs text-black/50">
            <p>Created · {new Date(initial.createdAt).toLocaleDateString()}</p>
            <p>
              Shipped ·{" "}
              {initial.shippedAt
                ? new Date(initial.shippedAt).toLocaleDateString()
                : "N/A"}
            </p>
            <p>Updated · {new Date(initial.updatedAt).toLocaleDateString()}</p>
            <p>Claimed · {initial.hoursSpent}h</p>
            {initial.reviewNote ? (
              <div className="mt-2 rounded-lg border border-black/8 bg-[#fffaf1] p-2.5 text-black/65">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-black/35">
                  Last user-facing note
                </p>
                <p className="mt-1 text-xs leading-snug">
                  {initial.reviewNote}
                </p>
              </div>
            ) : null}
            {initial.overrideHoursSpentJustification ? (
              <div className="mt-2 rounded-lg border border-black/8 bg-zinc-50 p-2.5 text-black/65">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-black/35">
                  Hour justification
                </p>
                <p className="mt-1 text-xs leading-snug">
                  {initial.overrideHoursSpentJustification}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-black">Project notes</h3>
            <span className="text-xs text-black/35">{projectNotes.length}</span>
          </div>
          <div className="mt-2 space-y-2">
            {projectNotes.slice(0, 5).map((note) => (
              <SideNote
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                onEdit={(id, content) =>
                  startTransition(() => editNote(id, content))
                }
                onDelete={(id) =>
                  startTransition(async () => {
                    await deleteNote(id);
                    setProjectNotes((prev) => prev.filter((n) => n.id !== id));
                  })
                }
              />
            ))}
            {projectNotes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/10 bg-zinc-50 p-2.5 text-xs text-black/35">
                None yet.
              </p>
            ) : null}
          </div>
          <div className="mt-2 grid gap-1.5">
            <textarea
              value={newProjectNote}
              onChange={(e) => setNewProjectNote(e.target.value)}
              rows={2}
              placeholder="Project note..."
              className="rounded-lg border border-black bg-white px-2.5 py-2 text-xs"
            />
            <button
              type="button"
              disabled={!newProjectNote.trim()}
              onClick={() =>
                run(async () => {
                  await addProjectNote(initial.id, newProjectNote);
                  setNewProjectNote("");
                })
              }
              className="rounded-lg bg-black py-1.5 text-xs font-black text-white hover:bg-[#BD0F32] disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-black">User notes</h3>
            <span className="text-xs text-black/35">
              {userNotesState.length}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {userNotesState.slice(0, 5).map((note) => (
              <SideNote
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                onEdit={(id, content) =>
                  startTransition(() => editNote(id, content))
                }
                onDelete={(id) =>
                  startTransition(async () => {
                    await deleteNote(id);
                    setUserNotesState((prev) =>
                      prev.filter((n) => n.id !== id),
                    );
                  })
                }
              />
            ))}
            {userNotesState.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/10 bg-zinc-50 p-2.5 text-xs text-black/35">
                None yet.
              </p>
            ) : null}
          </div>
          <div className="mt-2 grid gap-1.5">
            <textarea
              value={newUserNote}
              onChange={(e) => setNewUserNote(e.target.value)}
              rows={2}
              placeholder={`Note about ${initial.userName}...`}
              className="rounded-lg border border-black bg-white px-2.5 py-2 text-xs"
            />
            <button
              type="button"
              disabled={!newUserNote.trim()}
              onClick={() =>
                run(async () => {
                  await addUserNote(targetUserId, newUserNote);
                  setNewUserNote("");
                })
              }
              className="rounded-lg bg-black py-1.5 text-xs font-black text-white hover:bg-[#BD0F32] disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </section>
      </aside>
    </article>
  );
}
