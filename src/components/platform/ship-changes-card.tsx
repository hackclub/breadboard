"use client";

import { useEffect, useState } from "react";
import {
  HiArrowTopRightOnSquare,
  HiChevronDown,
  HiChevronRight,
  HiExclamationTriangle,
  HiSparkles,
} from "react-icons/hi2";
import { FaGithub } from "react-icons/fa6";
import type { RepoDiffFile } from "@/lib/github/repo-diff";
import type { ShipChanges } from "@/lib/projects/ship-changes";

// Admin-only review card: what the maker changed between the last ship and
// this one. Two halves — the editor payload frozen at each ship (parts, wires,
// firmware) and a GitHub compare of the linked repo, the latter ported from
// Hack Club's fallout (app/frontend/components/admin/RepoDiffCard.tsx).

const STATUS_STYLE: Record<string, { sign: string; className: string }> = {
  added: { sign: "+", className: "text-emerald-700" },
  modified: { sign: "~", className: "text-amber-700" },
  changed: { sign: "~", className: "text-amber-700" },
  reconfigured: { sign: "~", className: "text-amber-700" },
  rerouted: { sign: "~", className: "text-amber-700" },
  removed: { sign: "−", className: "text-[#BD0F32]" },
  renamed: { sign: "→", className: "text-blue-700" },
};

function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? { sign: "?", className: "text-black/40" };
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function sha256Hex(input: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// --- rendering actual code ---------------------------------------------------

function patchLineClass(line: string) {
  if (line.startsWith("@@")) return "text-blue-700 bg-blue-50";
  if (line.startsWith("+")) return "text-emerald-800 bg-emerald-50";
  if (line.startsWith("-")) return "text-[#BD0F32] bg-red-50";
  return "text-black/55";
}

/** GitHub's unified diff, rendered as-is with the usual colouring. */
function PatchView({
  patch,
  truncated,
}: {
  patch: string;
  truncated?: boolean;
}) {
  return (
    <div className="mt-1 overflow-x-auto rounded-[8px] border border-black/10 bg-white">
      <pre className="min-w-full text-[10px] leading-[1.5]">
        {patch.split("\n").map((line, index) => (
          <div
            // Patch lines repeat freely, so position is the only stable key.
            key={`${index}-${line.slice(0, 24)}`}
            className={`whitespace-pre px-2 ${patchLineClass(line)}`}
          >
            {line || " "}
          </div>
        ))}
      </pre>
      {truncated ? (
        <p className="border-t border-black/10 px-2 py-1 text-[10px] font-bold text-black/40">
          Diff truncated. Open it on GitHub for the rest.
        </p>
      ) : null}
    </div>
  );
}

/** One changed file in the repo, expandable to the code that changed in it. */
function RepoFileRow({ file, href }: { file: RepoDiffFile; href: string }) {
  const [open, setOpen] = useState(false);
  const style = statusStyle(file.status);

  return (
    <div className="border-t border-black/8 first:border-t-0">
      <div className="flex items-center gap-1.5 py-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={!file.patch}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default"
        >
          {file.patch ? (
            open ? (
              <HiChevronDown className="size-3 shrink-0 text-black/40" />
            ) : (
              <HiChevronRight className="size-3 shrink-0 text-black/40" />
            )
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <span
            className={`w-3 shrink-0 text-center font-black ${style.className}`}
          >
            {style.sign}
          </span>
          <span
            className={`truncate font-semibold ${
              file.status === "removed"
                ? "text-black/40 line-through"
                : "text-black/75"
            }`}
            title={file.filename}
          >
            {file.filename}
          </span>
        </button>
        <span className="shrink-0 font-black tabular-nums">
          {(file.additions ?? 0) > 0 ? (
            <span className="text-emerald-700">+{file.additions}</span>
          ) : null}{" "}
          {(file.deletions ?? 0) > 0 ? (
            <span className="text-[#BD0F32]">−{file.deletions}</span>
          ) : null}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-black/35 hover:text-[#BD0F32]"
          title="Open this file's diff on GitHub"
        >
          <HiArrowTopRightOnSquare className="size-3" />
        </a>
      </div>
      {open && file.patch ? (
        <PatchView patch={file.patch} truncated={file.patchTruncated} />
      ) : null}
    </div>
  );
}

function RepoDiff({
  repo,
  repoUrl,
}: {
  repo: NonNullable<ShipChanges["repo"]>;
  repoUrl: string;
}) {
  const [open, setOpen] = useState(false);
  // GitHub anchors each file's diff in the compare view as
  // `diff-<sha256(path)>`, so a click can land on the right hunk.
  const [anchors, setAnchors] = useState<Record<string, string>>({});
  const files = repo.files;

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      files.map(
        async (file) =>
          [file.filename, `diff-${await sha256Hex(file.filename)}`] as const,
      ),
    ).then((pairs) => {
      if (!cancelled) setAnchors(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [files]);

  const base = repoUrl.replace(/\/+$/, "").replace(/\/tree\/[^/]+$/, "");
  const compareUrl = `${base}/compare/${repo.baseSha}...${repo.headSha}`;
  const hrefFor = (path: string) =>
    anchors[path] ? `${compareUrl}#${anchors[path]}` : compareUrl;
  const nothing = repo.commits === 0 && files.length === 0;

  return (
    <div className="mt-3 border-t border-black/10 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black tracking-[0.1em] text-black/40 uppercase">
          Repo
        </p>
        <a
          href={compareUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-black px-2 py-0.5 text-[10px] font-black text-white hover:bg-[#BD0F32]"
        >
          <FaGithub className="size-3" />
          GitHub diff
        </a>
      </div>

      {nothing ? (
        <p className="mt-1.5 text-xs font-semibold text-black/50">
          No commits landed in the repo between the two ships.
        </p>
      ) : (
        <>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-black/60">
            <span className="text-black">
              {repo.commits} commit{repo.commits === 1 ? "" : "s"}
            </span>
            <span>
              {repo.added > 0 ? (
                <span className="text-emerald-700">+{repo.added} </span>
              ) : null}
              {repo.modified > 0 ? (
                <span className="text-amber-700">~{repo.modified} </span>
              ) : null}
              {repo.removed > 0 ? (
                <span className="text-[#BD0F32]">−{repo.removed} </span>
              ) : null}
              {repo.renamed > 0 ? (
                <span className="text-blue-700">→{repo.renamed}</span>
              ) : null}
            </span>
            {repo.addedLines !== undefined ? (
              <span className="tabular-nums">
                <span className="text-emerald-700">+{repo.addedLines}</span>{" "}
                <span className="text-[#BD0F32]">
                  −{repo.removedLines ?? 0}
                </span>{" "}
                <span className="text-black/40">lines</span>
              </span>
            ) : null}
            {repo.basis === "date" ? (
              <span
                className="text-black/35 italic"
                title="The commit the last ship was submitted at wasn't recorded, or was force-pushed away. Diffed from that ship's submission time instead, so the boundary is approximate."
              >
                (approx)
              </span>
            ) : null}
          </p>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mt-1.5 flex w-full items-center justify-between gap-2 text-xs font-black text-black"
          >
            <span>
              {files.length} changed file{files.length === 1 ? "" : "s"} —
              expand one to read the code
            </span>
            {open ? (
              <HiChevronDown className="size-4" />
            ) : (
              <HiChevronRight className="size-4" />
            )}
          </button>
          {open ? (
            <div className="mt-1.5 max-h-96 overflow-auto rounded-[10px] bg-black/[0.03] px-2 py-1 text-[11px]">
              {files.map((file) => (
                <RepoFileRow
                  key={file.filename}
                  file={file}
                  href={hrefFor(file.filename)}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// --- editor half ------------------------------------------------------------

function ChangeRow({
  status,
  label,
  detail,
}: {
  status: string;
  label: string;
  detail?: string;
}) {
  const style = statusStyle(status);
  return (
    <li className="flex items-baseline gap-1.5">
      <span
        className={`w-3 shrink-0 text-center font-black ${style.className}`}
      >
        {style.sign}
      </span>
      <span className="min-w-0">
        <span className="font-bold text-black/80">{label}</span>
        {detail ? <span className="text-black/45"> — {detail}</span> : null}
      </span>
    </li>
  );
}

/** One changed firmware file, expandable to the lines the maker wrote. */
function EditorFileRow({
  file,
}: {
  file: NonNullable<ShipChanges["editor"]>["files"][number];
}) {
  const [open, setOpen] = useState(false);
  const style = statusStyle(file.status);
  const lines = file.lines ?? [];

  return (
    <div className="border-t border-black/8 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={!lines.length}
        className="flex w-full items-center gap-1.5 py-1 text-left disabled:cursor-default"
      >
        {lines.length ? (
          open ? (
            <HiChevronDown className="size-3 shrink-0 text-black/40" />
          ) : (
            <HiChevronRight className="size-3 shrink-0 text-black/40" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span
          className={`w-3 shrink-0 text-center font-black ${style.className}`}
        >
          {style.sign}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-black/75">
          {file.path}
        </span>
        <span className="shrink-0 font-black tabular-nums">
          <span className="text-emerald-700">+{file.addedLines}</span>{" "}
          <span className="text-[#BD0F32]">−{file.removedLines}</span>
        </span>
      </button>
      {open && lines.length ? (
        <div className="mt-1 overflow-x-auto rounded-[8px] border border-black/10 bg-white">
          <pre className="min-w-full text-[10px] leading-[1.5]">
            {lines.map((line, index) => (
              <div
                // Identical lines recur, so position is the only stable key.
                key={`${index}-${line.text.slice(0, 24)}`}
                className={`whitespace-pre px-2 ${
                  line.kind === "add"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-[#BD0F32]"
                }`}
              >
                {line.kind === "add" ? "+" : "−"} {line.text || " "}
              </div>
            ))}
          </pre>
          {file.linesTruncated ? (
            <p className="border-t border-black/10 px-2 py-1 text-[10px] font-bold text-black/40">
              Trimmed. Open the frozen editor version for the whole file.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EditorDiff({
  editor,
}: {
  editor: NonNullable<ShipChanges["editor"]>;
}) {
  const [openFiles, setOpenFiles] = useState(false);
  // Components and boards are what a reviewer pictures when they ask "what did
  // they add"; wiring is a separate question, so it gets its own list.
  const components = [
    ...editor.boards.added.map((kind, index) => ({
      key: `board-add-${kind}-${index}`,
      status: "added",
      label: `Board: ${kind}`,
      detail: "",
    })),
    ...editor.boards.removed.map((kind, index) => ({
      key: `board-rm-${kind}-${index}`,
      status: "removed",
      label: `Board: ${kind}`,
      detail: "",
    })),
    ...editor.parts.map((part) => ({
      key: `part-${part.id}`,
      status: part.status,
      label: part.label,
      detail: part.detail,
    })),
  ];
  const wires = editor.wires.map((wire) => ({
    key: `wire-${wire.id}`,
    status: wire.status,
    label: `${wire.from} → ${wire.to}`,
    detail: "",
  }));

  return (
    <div className="mt-3">
      <p className="text-[10px] font-black tracking-[0.1em] text-black/40 uppercase">
        Editor
      </p>
      <p className="mt-1 text-xs font-semibold text-black/70">
        {editor.summary}
      </p>

      {components.length ? (
        <div className="mt-2">
          <p className="text-[10px] font-black tracking-[0.08em] text-black/35 uppercase">
            Components
          </p>
          <ul className="mt-1 max-h-56 space-y-1 overflow-auto rounded-[10px] bg-black/[0.03] p-2 text-[11px]">
            {components.map((row) => (
              <ChangeRow
                key={row.key}
                status={row.status}
                label={row.label}
                detail={row.detail}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {wires.length ? (
        <div className="mt-2">
          <p className="text-[10px] font-black tracking-[0.08em] text-black/35 uppercase">
            Wiring
          </p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-auto rounded-[10px] bg-black/[0.03] p-2 text-[11px]">
            {wires.map((row) => (
              <ChangeRow key={row.key} status={row.status} label={row.label} />
            ))}
          </ul>
        </div>
      ) : null}

      {editor.movedParts > 0 ? (
        <p className="mt-1.5 text-[11px] font-semibold text-black/35">
          {editor.movedParts} part{editor.movedParts === 1 ? "" : "s"} only
          moved on the canvas.
        </p>
      ) : null}

      {editor.files.length ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpenFiles((value) => !value)}
            className="flex w-full items-center justify-between gap-2 text-xs font-black text-black"
          >
            <span>
              {editor.files.length} firmware file
              {editor.files.length === 1 ? "" : "s"} (+{editor.addedLines}/−
              {editor.removedLines})
            </span>
            {openFiles ? (
              <HiChevronDown className="size-4" />
            ) : (
              <HiChevronRight className="size-4" />
            )}
          </button>
          {openFiles ? (
            <div className="mt-1.5 max-h-96 overflow-auto rounded-[10px] bg-black/[0.03] px-2 py-1 text-[11px]">
              {editor.files.map((file) => (
                <EditorFileRow key={file.path} file={file} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// --- repo failure -----------------------------------------------------------

// A broken credential takes out every repo diff at once, and a blank space
// where the diff should be reads as "they changed nothing in the repo". So the
// two operator-fixable causes get named, with the fix, rather than a shrug.
const FAILURE_COPY: Record<
  NonNullable<ShipChanges["repoError"]>,
  { title: string; detail: string; loud: boolean }
> = {
  auth: {
    title: "GitHub rejected our credential",
    detail:
      "GITHUB_READ_TOKEN (or GH_PROXY_API_KEY) is missing, expired, or revoked. " +
      "Every repo diff is failing until it's replaced — this is not a claim that nothing changed.",
    loud: true,
  },
  rate_limit: {
    title: "GitHub rate limit exhausted",
    detail:
      "Repo diffs are paused until the quota resets. Without a credential the app " +
      "only gets 60 requests an hour; set GITHUB_READ_TOKEN or GH_PROXY_API_KEY to raise it.",
    loud: true,
  },
  unreachable: {
    title: "Couldn't reach GitHub",
    detail: "Transient — this retries the next time the page is opened.",
    loud: false,
  },
};

function RepoFailure({
  failure,
  repoUrl,
}: {
  failure: NonNullable<ShipChanges["repoError"]>;
  repoUrl: string;
}) {
  const copy = FAILURE_COPY[failure];
  return (
    <div
      className={`mt-3 rounded-[10px] border p-2.5 ${
        copy.loud
          ? "border-[#BD0F32] bg-red-50"
          : "border-black/10 bg-black/[0.03]"
      }`}
    >
      <div className="flex items-start gap-2">
        <HiExclamationTriangle
          className={`mt-0.5 size-4 shrink-0 ${
            copy.loud ? "text-[#BD0F32]" : "text-black/40"
          }`}
        />
        <div className="min-w-0">
          <p
            className={`text-xs font-black ${
              copy.loud ? "text-[#BD0F32]" : "text-black/60"
            }`}
          >
            {copy.title}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-black/60">
            {copy.detail}
          </p>
          {repoUrl ? (
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-black text-[#BD0F32] underline"
            >
              Check the repo by hand
              <HiArrowTopRightOnSquare className="size-3" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// --- card -------------------------------------------------------------------

export function ShipChangesCard({ projectId }: { projectId: number }) {
  const [changes, setChanges] = useState<ShipChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/projects/${projectId}/ship-changes`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            (await res.json().catch(() => null))?.error ??
              `Request failed (${res.status})`,
          );
        }
        return res.json() as Promise<ShipChanges>;
      })
      .then((data) => {
        if (!cancelled) setChanges(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // A first ship has nothing to compare against, and the rest of the workspace
  // already covers it. Take up no room.
  if (!loading && !error && changes && !changes.previous) return null;

  const since = formatDate(changes?.previous?.submittedAt ?? null);

  return (
    <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-black">
          <HiSparkles className="size-5 text-[#BD0F32]" />
          Changes this ship
        </div>
        {changes?.previous ? (
          <span className="rounded-full border border-black/15 bg-black/[0.04] px-2 py-0.5 text-[11px] font-black text-black/55">
            #{changes.previous.submissionNumber} → #{changes.submissionNumber}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs font-semibold text-black/50">
        What the maker changed since the last ship
        {since ? ` (${since})` : ""}.
      </p>

      {loading ? (
        <p className="mt-3 text-sm font-semibold text-black/40">
          Comparing ships…
        </p>
      ) : error ? (
        <p className="mt-3 text-sm font-semibold text-[#BD0F32]">{error}</p>
      ) : changes ? (
        <>
          {changes.editor ? (
            <EditorDiff editor={changes.editor} />
          ) : (
            <p className="mt-3 text-xs font-semibold text-black/40">
              No frozen editor snapshot on both ships, so the circuit can't be
              compared. Off-platform submissions land here.
            </p>
          )}

          {changes.repo ? (
            <RepoDiff repo={changes.repo} repoUrl={changes.repoUrl} />
          ) : changes.repoError ? (
            <RepoFailure
              failure={changes.repoError}
              repoUrl={changes.repoUrl}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
