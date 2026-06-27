"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import { slackPfpUrl } from "@/lib/utils/slack-pfp";

export interface AdminProjectRow {
  id: number;
  title: string;
  status: string;
  lifecycleState: string;
  kitType: string;
  hoursSpent: number;
  trackedSeconds: number;
  breadAmount: number;
  country: string;
  editorLastSavedAt: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string;
  ownerSlackId: string | null;
  versionCount: number;
  activitySessionCount: number;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

function formatHours(value: number) {
  const minutes = Math.round(value * 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatTrackedSeconds(value: number) {
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function OwnerCell({ project }: { project: AdminProjectRow }) {
  const avatar = slackPfpUrl(project.ownerSlackId);
  const initial = (project.ownerName || project.ownerEmail || "?")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="size-8 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
        {avatar ? (
          <Image
            src={avatar}
            alt=""
            width={32}
            height={32}
            className="size-full object-cover"
            unoptimized
          />
        ) : (
          <div className="grid size-full place-items-center text-[11px] font-bold text-zinc-500">
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-black">
          {project.ownerName || "Unknown"}
        </p>
        <p className="truncate text-xs text-black/55">{project.ownerEmail}</p>
      </div>
    </div>
  );
}

export function AdminProjectsTable({
  projects,
}: {
  projects: AdminProjectRow[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => {
      const text = [
        project.id,
        project.title,
        project.status,
        project.lifecycleState,
        project.kitType,
        project.ownerName,
        project.ownerEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    });
  }, [projects, search]);

  return (
    <DataPanel title="Projects">
      <div className="border-b border-black/15 p-3">
        <label
          className="block text-sm font-bold text-black"
          htmlFor="admin-project-search"
        >
          Search projects
        </label>
        <Input
          id="admin-project-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, owner, email, status, or ID"
          className="mt-1.5 w-full"
        />
        <p className="mt-1.5 text-sm text-black/55">
          {filtered.length} of {projects.length} projects shown.
        </p>
      </div>

      <TableScroll className="max-h-[72vh]">
        {filtered.length > 0 ? (
          <DataTable>
            <TableHead className="sticky top-0 z-10">
              <tr>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>State</TableHeaderCell>
                <TableHeaderCell>Saved</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <div className="min-w-48">
                      <p className="font-semibold text-black">
                        {project.title}
                      </p>
                      <p className="mt-0.5 text-xs text-black/50">
                        #{project.id} · {project.kitType} · submitted{" "}
                        {formatHours(project.hoursSpent)} · current{" "}
                        {formatTrackedSeconds(project.trackedSeconds)} ·{" "}
                        {project.country || "Unknown country"} ·{" "}
                        {project.breadAmount} bread
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <OwnerCell project={project} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap capitalize py-2">
                    {label(project.status)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap capitalize py-2">
                    {label(project.lifecycleState)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-black/60">
                    {formatDate(project.editorLastSavedAt)}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-nowrap items-center gap-1">
                      <Link
                        href={`/editor/${project.id}`}
                        className="inline-flex items-center gap-1 rounded border border-black/20 px-2 py-0.5 text-[11px] font-bold leading-none text-black no-underline hover:bg-black hover:text-white"
                      >
                        Editor
                      </Link>
                      <Link
                        href={`/platform/admin/projects/${project.id}/versions`}
                        className="inline-flex items-center gap-1 rounded border border-black/20 px-2 py-0.5 text-[11px] font-bold leading-none text-black no-underline hover:bg-black hover:text-white"
                      >
                        <span>Versions</span>
                        <span className="text-[10px] font-black text-black/60">
                          {project.versionCount}
                        </span>
                      </Link>
                      <Link
                        href={`/platform/admin/projects/${project.id}/timelapse`}
                        className="inline-flex items-center gap-1 rounded border border-black/20 px-2 py-0.5 text-[11px] font-bold leading-none text-black no-underline hover:bg-black hover:text-white"
                      >
                        <span>Timelapse</span>
                        <span className="text-[10px] font-black text-black/60">
                          {project.activitySessionCount}
                        </span>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        ) : (
          <div className="p-4">
            <EmptyState
              title="No matching projects"
              description="Adjust the search terms to find a different project, owner, email, or status."
            />
          </div>
        )}
      </TableScroll>
    </DataPanel>
  );
}
