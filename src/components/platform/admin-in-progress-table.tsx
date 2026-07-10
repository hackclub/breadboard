"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HiClock, HiFilm, HiPlayCircle } from "react-icons/hi2";
import { projectStatusLabel } from "@/components/platform/projects/project-status";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  DataPanel,
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableScroll,
} from "@/components/ui/table";
import type { ProjectType } from "@/lib/projects/project-type";
import { slackPfpUrl } from "@/lib/utils/slack-pfp";

export interface InProgressProject {
  id: number;
  title: string;
  status: string;
  projectType: ProjectType;
  submissionSource: string;
  trackedSeconds: number;
  lastRecordingAt: string | null;
  lastYoutubeAt: string | null;
  lastLapseAt: string | null;
  lastScreenEvidenceAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string;
  ownerSlackId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Deterministic UTC label used before the client has mounted, so server and
// client render the same thing (relative times would mismatch by seconds).
function utcLabel(iso: string | null) {
  if (!iso) return "—";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function relativeTime(iso: string | null, now: number) {
  if (!iso) return "never";
  const diff = now - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  return `${wk}w ago`;
}

function staleTone(iso: string | null, now: number) {
  if (!iso) return "text-black/35";
  const diff = now - new Date(iso).getTime();
  if (diff > 7 * DAY_MS) return "text-[#BD0F32]";
  if (diff > 2 * DAY_MS) return "text-amber-600";
  return "text-emerald-700";
}

function formatHours(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function TimeCell({
  iso,
  now,
  tone = false,
}: {
  iso: string | null;
  now: number;
  tone?: boolean;
}) {
  const text = now ? relativeTime(iso, now) : utcLabel(iso);
  const className = tone && now ? staleTone(iso, now) : "text-black/70";
  return (
    <span
      className={`text-xs font-black ${className}`}
      title={iso ?? undefined}
      suppressHydrationWarning
    >
      {text}
    </span>
  );
}

function ScreenProofCell({
  project,
  now,
}: {
  project: InProgressProject;
  now: number;
}) {
  if (project.submissionSource !== "manual") {
    return <span className="text-xs font-semibold text-black/35">—</span>;
  }
  if (!project.lastScreenEvidenceAt) {
    return <span className="text-xs font-black text-[#BD0F32]">No proof</span>;
  }
  const evidenceAt = new Date(project.lastScreenEvidenceAt).getTime();
  const recordingAt = project.lastRecordingAt
    ? new Date(project.lastRecordingAt).getTime()
    : 0;
  const hasGap = recordingAt - evidenceAt > 6 * 60 * 1000;
  if (hasGap) {
    return (
      <span
        className="text-xs font-black text-[#BD0F32]"
        title="Tracked activity is more than six minutes newer than the latest saved screen proof."
      >
        Evidence gap
      </span>
    );
  }
  return <TimeCell iso={project.lastScreenEvidenceAt} now={now} tone />;
}

export function AdminInProgressTable({
  projects,
}: {
  projects: InProgressProject[];
}) {
  const [query, setQuery] = useState("");
  // 0 until mounted so SSR and first client render match; then it drives
  // relative times and refreshes them on an interval.
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) =>
      [project.title, project.ownerName ?? "", project.ownerEmail]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [projects, query]);

  const activeCount = useMemo(
    () =>
      now
        ? projects.filter(
            (project) =>
              project.lastActivityAt &&
              now - new Date(project.lastActivityAt).getTime() < DAY_MS,
          ).length
        : 0,
    [projects, now],
  );

  return (
    <DataPanel
      title="In progress"
      description={`${projects.length} active projects${
        now ? ` · ${activeCount} active in the last 24h` : ""
      }. Sorted by most recent recording, YouTube, or Lapse activity.`}
      action={
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search project or owner…"
          className="w-full px-3 py-2 text-sm sm:w-64"
        />
      }
    >
      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No projects"
            description="No in-progress projects match your search."
          />
        </div>
      ) : (
        <TableScroll>
          <DataTable>
            <TableHead>
              <TableRow className="bg-black hover:bg-black">
                <TableHeaderCell className="text-white">
                  Project
                </TableHeaderCell>
                <TableHeaderCell className="text-white">Owner</TableHeaderCell>
                <TableHeaderCell className="text-white">Status</TableHeaderCell>
                <TableHeaderCell className="text-white">
                  Last active
                </TableHeaderCell>
                <TableHeaderCell className="text-white">
                  <span className="inline-flex items-center gap-1">
                    <HiClock className="size-3.5" /> On-site
                  </span>
                </TableHeaderCell>
                <TableHeaderCell className="text-white">
                  Screen proof
                </TableHeaderCell>
                <TableHeaderCell className="text-white">
                  <span className="inline-flex items-center gap-1">
                    <HiPlayCircle className="size-3.5" /> YouTube
                  </span>
                </TableHeaderCell>
                <TableHeaderCell className="text-white">
                  <span className="inline-flex items-center gap-1">
                    <HiFilm className="size-3.5" /> Lapse
                  </span>
                </TableHeaderCell>
                <TableHeaderCell className="text-right text-white">
                  Tracked
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/platform/admin/projects/${project.id}/timelapse`}
                      className="font-black text-black hover:text-[#BD0F32] hover:underline"
                    >
                      {project.title || "Untitled"}
                    </Link>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-black/40">
                      {project.projectType === "build" ? "Build" : "Design"} ·{" "}
                      {project.submissionSource === "manual"
                        ? "Off-platform"
                        : "Editor"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const avatar = slackPfpUrl(project.ownerSlackId);
                        return avatar ? (
                          <Image
                            src={avatar}
                            alt=""
                            width={24}
                            height={24}
                            className="size-6 shrink-0 rounded-full border border-black object-cover"
                            unoptimized
                          />
                        ) : null;
                      })()}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-black">
                          {project.ownerName || "Unknown"}
                        </p>
                        <p className="truncate text-[11px] font-semibold text-black/45">
                          {project.ownerEmail}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-block rounded-full border border-black/15 bg-[#f4f4f4] px-2 py-0.5 text-[11px] font-black text-black/70">
                      {projectStatusLabel(project.status)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TimeCell iso={project.lastActivityAt} now={now} tone />
                  </TableCell>
                  <TableCell>
                    <TimeCell iso={project.lastRecordingAt} now={now} />
                  </TableCell>
                  <TableCell>
                    <ScreenProofCell project={project} now={now} />
                  </TableCell>
                  <TableCell>
                    <TimeCell iso={project.lastYoutubeAt} now={now} />
                  </TableCell>
                  <TableCell>
                    <TimeCell iso={project.lastLapseAt} now={now} />
                  </TableCell>
                  <TableCell className="text-right font-black text-black">
                    {formatHours(project.trackedSeconds)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </TableScroll>
      )}
    </DataPanel>
  );
}
