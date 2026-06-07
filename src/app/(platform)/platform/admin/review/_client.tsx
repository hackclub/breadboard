"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HiPhoto } from "react-icons/hi2";

type ReviewProject = {
  id: number;
  title: string;
  hoursSpent: number;
  screenshotUrl: string;
  status: string;
  shippedAt: Date | null;
  userEmail: string;
  versionCount: number;
};

const filters = ["all", "shipped", "needs_changes", "reviewed", "paid_out"];

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
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

function statusTone(status: string) {
  if (status === "shipped") return "bg-[#BD0F32] text-white";
  if (status === "needs_changes") return "bg-yellow-100 text-yellow-900";
  if (status === "paid_out" || status === "fulfilled")
    return "bg-green-100 text-green-900";
  return "bg-zinc-100 text-zinc-700";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function ReviewQueue({ projects }: { projects: ReviewProject[] }) {
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () => projects.filter((item) => filter === "all" || item.status === filter),
    [projects, filter],
  );

  return (
    <section className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black text-black">Submissions</h2>
        <div className="flex flex-wrap gap-2">
          {filters.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setFilter(name)}
              className={`rounded-full px-3 py-1.5 text-xs font-black uppercase ${
                filter === name
                  ? "bg-[#BD0F32] text-white"
                  : "bg-zinc-100 text-zinc-500 hover:text-black"
              }`}
            >
              {name.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((project) => {
          const screenshot = safeUrl(project.screenshotUrl);
          return (
            <Link
              key={project.id}
              href={`/platform/admin/review/${project.id}`}
              className="group overflow-hidden rounded-[14px] border border-zinc-200 bg-white no-underline transition hover:border-black hover:shadow-[3px_3px_0_#BD0F32]"
            >
              <div className="relative h-36 bg-zinc-50">
                {screenshot ? (
                  <Image
                    src={screenshot}
                    alt=""
                    fill
                    sizes="(min-width:768px) 33vw, 100vw"
                    className="object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-zinc-300">
                    <HiPhoto className="size-8" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusTone(project.status)}`}
                  >
                    {statusLabel(project.status)}
                  </span>
                  <span className="text-xs text-black/50">
                    {project.hoursSpent}h
                  </span>
                  {project.versionCount > 0 && (
                    <span className="text-xs text-black/30">
                      {project.versionCount}v
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-black text-black leading-snug">
                  {project.title}
                </p>
                <p className="mt-1 text-xs text-black/40">
                  {daysAgo(project.shippedAt)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-black/50">
          No projects match this filter.
        </p>
      ) : null}
    </section>
  );
}
