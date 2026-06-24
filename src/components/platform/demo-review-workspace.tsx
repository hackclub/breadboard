"use client";

import { useState, useTransition } from "react";
import {
  HiCheckCircle,
  HiExclamationTriangle,
  HiPencilSquare,
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
import { BreadAmount, BreadIcon } from "@/components/shared/bread-amount";
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

const verdictOptions = [
  { value: "approve", icon: HiCheckCircle, label: "Approve" },
  { value: "changes", icon: HiExclamationTriangle, label: "Changes needed" },
  { value: "reject", icon: HiXCircle, label: "Reject" },
] as const;

const demoChecklistItems = [
  "Demo video plays correctly",
  "Project visibly works end to end",
  "Built with the shipped kit",
];

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

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
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

export function DemoReviewWorkspace({
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

  const demoVideo = safeUrl(initial.demoVideoUrl);
  const designApprovedHours = initial.overrideHoursSpent ?? initial.hoursSpent;
  const approvedBread =
    Math.max(0, Math.floor(approvedHours || 0)) * breadPerHour;
  const designBread = designApprovedHours * breadPerHour;
  const pctChange =
    designApprovedHours > 0
      ? Math.round(
          ((approvedHours - designApprovedHours) / designApprovedHours) * 100,
        )
      : 0;

  const statusTone =
    initial.status === "pending_review"
      ? "bg-[#BD0F32] text-white"
      : initial.status === "needs_changes"
        ? "bg-yellow-100 text-yellow-900"
        : "bg-green-100 text-green-900";

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
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusTone}`}
            >
              Demo {statusLabel(initial.status)}
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
        </div>

        <div className="border-t border-black/10 p-5">
          <h3 className="text-lg font-black text-black">How to use</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-black bg-[#fffaf1] p-4 text-sm font-semibold leading-relaxed text-black/75 shadow-[2px_2px_0_#000]">
            {initial.howToUse || "No instructions provided."}
          </p>
        </div>

        {demoVideo ? (
          <div className="border-t border-black/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <HiPlay className="size-5 text-[#BD0F32]" />
              <h3 className="text-lg font-black text-black">Demo video</h3>
            </div>
            <video
              src={demoVideo}
              controls
              className="w-full max-h-[480px] rounded-xl border border-black bg-black"
            >
              <track kind="captions" />
            </video>
          </div>
        ) : (
          <div className="border-t border-black/10 p-5">
            <p className="text-sm font-black text-[#BD0F32]">
              No demo video URL found.
            </p>
          </div>
        )}

        <div className="border-t border-black/10 p-5 space-y-5">
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
                  Awards <BreadAmount amount={approvedBread} /> (
                  {approvedHours || 0}h × {breadPerHour})
                </span>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                  Review justification · internal only
                </span>
                <textarea
                  value={internalJustification}
                  onChange={(e) => setInternalJustification(e.target.value)}
                  rows={5}
                  placeholder="Explain why the demo passes."
                  className="rounded-xl border border-black bg-white px-4 py-3 text-sm leading-relaxed"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-black tracking-[0.14em] text-black/40 uppercase">
                  Comment to user · optional
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
                disabled={pending || initial.status !== "pending_review"}
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
                <span className="inline-flex items-center gap-0.5">
                  Approve demo ·{" "}
                  <BreadAmount amount={approvedBread} size="sm" />
                </span>
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
      </section>

      <aside className="space-y-4">
        <section className="rounded-[16px] border border-black bg-black p-4 shadow-[4px_4px_0_#BD0F32]">
          <p className="text-xs font-black tracking-[0.14em] text-white/50 uppercase">
            Demo submitted
          </p>
          <p className="mt-2 text-2xl font-black text-white">
            {new Date(
              initial.shippedAt ?? initial.createdAt,
            ).toLocaleDateString()}
          </p>
          <div className="mt-3 space-y-2 text-sm text-white/65">
            <div className="flex justify-between">
              <span>Design review hours</span>
              <span className="font-black text-white line-through text-white/50">
                {designApprovedHours}h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="inline-flex items-center gap-1">
                <BreadIcon />
                Demo award
              </span>
              <span className="font-black text-white">
                <BreadAmount amount={approvedBread} />
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="flex items-center gap-2 text-sm font-black text-black">
            <HiCheckCircle className="size-5 text-[#BD0F32]" />
            Currency
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-black/40">
            Demo award
          </p>
          <p className="text-3xl font-black text-black">
            <BreadAmount amount={approvedBread} size="lg" />
          </p>
          <p className="mt-1 text-sm text-black/55">
            {approvedHours || 0}h × {breadPerHour}
          </p>
          {designApprovedHours > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-black/10 pt-3">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-black/40">
                Design review baseline
              </p>
              <p className="text-base font-black text-black/60 line-through">
                {designApprovedHours}h × {breadPerHour} ={" "}
                <BreadAmount amount={designBread} />
              </p>
              {pctChange !== 0 && (
                <p
                  className={`text-xs font-black ${
                    pctChange > 0 ? "text-green-700" : "text-[#BD0F32]"
                  }`}
                >
                  {pctChange > 0 ? "+" : ""}
                  {pctChange}% vs design review
                </p>
              )}
              <p className="text-[10px] font-bold text-black/35">
                Hours were decided during design review. Adjust above if needed.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <h3 className="text-sm font-black text-black">Demo checklist</h3>
          <div className="mt-2 space-y-1.5">
            {demoChecklistItems.map((item) => (
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
          </div>
          <div className="mt-2 grid gap-1.5">
            <textarea
              value={newUserNote}
              onChange={(e) => setNewUserNote(e.target.value)}
              rows={2}
              placeholder="User note..."
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
