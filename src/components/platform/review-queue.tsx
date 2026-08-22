"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HiPhoto } from "react-icons/hi2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DataPanel } from "@/components/ui/table";
import { storageReadUrl } from "@/lib/storage/urls";

type ReviewProject = {
  id: number;
  submissionId: number;
  submissionNumber: number;
  title: string;
  hoursSpent: number;
  screenshotUrl: string;
  status: string;
  submissionType: string;
  submissionSource?: string | null;
  breadOnly?: boolean;
  simulatorSketchy?: boolean;
  shippedAt: Date | null;
  userEmail: string;
  versionCount: number;
  kitType: string;
  // The maker has no ysws_eligible claim and no admin exemption. Their ships
  // are kept out of every other bucket, because approving one pays bread and
  // files the project in the Unified YSWS Database under an unverified
  // identity. Its own filter rather than a silent drop, so the backlog stays
  // visible to whoever has to chase the verification.
  yswsHold?: boolean;
};

// Pseudo-status buckets: not real submission statuses but cross-cuts of them.
// Sketchy is approved projects a reviewer flagged as simulator sketchy; hold is
// anything waiting on the maker's YSWS eligibility, at any status.
const SIMULATOR_SKETCHY_FILTER = "approved_simulator_sketchy";
const YSWS_HOLD_FILTER = "ysws_hold";

const filters = [
  "all",
  "pending_review",
  "needs_changes",
  "approved",
  SIMULATOR_SKETCHY_FILTER,
  "rejected",
  YSWS_HOLD_FILTER,
];

function filterLabel(name: string) {
  if (name === SIMULATOR_SKETCHY_FILTER) return "approved · simulator sketchy";
  if (name === YSWS_HOLD_FILTER) return "waiting on verification";
  return name.replace(/_/g, " ");
}

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

function daysAgo(date: Date | null) {
  if (!date) return "not shipped";
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function statusTone(status: string) {
  if (status === "pending_review") return "red";
  if (status === "needs_changes") return "yellow";
  if (status === "paid_out" || status === "fulfilled") return "green";
  return "muted";
}

function statusLabel(status: string) {
  if (status === "pending_review") return "in review";
  return status.replace(/_/g, " ");
}

export function ReviewQueue({ projects }: { projects: ReviewProject[] }) {
  const [tab, setTab] = useState<"design" | "demo">("design");
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () =>
      projects.filter((item) => {
        const inTab =
          tab === "design"
            ? item.submissionType !== "demo"
            : item.submissionType === "demo";
        if (!inTab) return false;
        // Held ships answer to their own filter and appear in no other one,
        // including "all".
        if (item.yswsHold) return filter === YSWS_HOLD_FILTER;
        if (filter === YSWS_HOLD_FILTER) return false;
        if (filter === "all") return true;
        // The sketchy bucket is a cross-cut of approved-or-later, flagged
        // projects, so it doesn't map to a single status value.
        if (filter === SIMULATOR_SKETCHY_FILTER) {
          return (
            Boolean(item.simulatorSketchy) &&
            (item.status === "approved" || item.status === "fulfilled")
          );
        }
        return item.status === filter;
      }),
    [projects, filter, tab],
  );
  // Tab counts and the hold chip's count are per tab, and the reviewable count
  // leaves out what's held so the header matches what the tab actually opens on.
  const inTab = (p: ReviewProject, which: "design" | "demo") =>
    which === "demo"
      ? p.submissionType === "demo"
      : p.submissionType !== "demo";
  const designCount = projects.filter(
    (p) => inTab(p, "design") && !p.yswsHold,
  ).length;
  const demoCount = projects.filter(
    (p) => inTab(p, "demo") && !p.yswsHold,
  ).length;
  const holdCount = projects.filter((p) => inTab(p, tab) && p.yswsHold).length;

  return (
    <DataPanel
      title="Submissions"
      description="Review design materials and final demo videos."
    >
      <div className="flex border-b border-black/10">
        <button
          type="button"
          onClick={() => setTab("design")}
          className={`px-5 py-3 text-sm font-black ${
            tab === "design"
              ? "border-b-2 border-[#BD0F32] text-black"
              : "text-black/40 hover:text-black"
          }`}
        >
          Design ({designCount})
        </button>
        <button
          type="button"
          onClick={() => setTab("demo")}
          className={`px-5 py-3 text-sm font-black ${
            tab === "demo"
              ? "border-b-2 border-[#BD0F32] text-black"
              : "text-black/40 hover:text-black"
          }`}
        >
          Demo ({demoCount})
        </button>
      </div>
      <div className="border-b border-black/10 p-4">
        <div className="flex flex-wrap gap-2">
          {filters.map((name) => (
            <Button
              key={name}
              onClick={() => setFilter(name)}
              tone={filter === name ? "primary" : "paper"}
              size="sm"
              className="rounded-full shadow-none"
            >
              {filterLabel(name)}
              {name === YSWS_HOLD_FILTER && holdCount > 0
                ? ` (${holdCount})`
                : ""}
            </Button>
          ))}
        </div>
        {filter === YSWS_HOLD_FILTER ? (
          <p className="mt-3 text-xs text-black/50">
            These makers shipped before Hack Club Auth marked them YSWS
            eligible, so they are held out of the other filters and cannot be
            approved or paid yet. They clear on their own once verification goes
            through, or an admin can mark someone YSWS exempt from their user
            page.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((project) => {
          const screenshot = safeUrl(project.screenshotUrl);
          return (
            <Link
              key={`${project.id}-${project.submissionId}-${project.submissionType}`}
              href={
                project.submissionType === "demo"
                  ? `/platform/admin/review/demo/${project.id}`
                  : `/platform/admin/review/${project.id}`
              }
              className="group overflow-hidden rounded-[14px] border border-zinc-200 bg-white no-underline transition hover:border-black hover:shadow-[3px_3px_0_#BD0F32]"
            >
              <div className="relative h-36 bg-zinc-50">
                {screenshot ? (
                  <Image
                    src={screenshot}
                    alt=""
                    fill
                    sizes="(min-width:768px) 33vw, 100vw"
                    unoptimized={screenshot.startsWith("/api/uploads/")}
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
                  <Badge
                    tone={statusTone(project.status)}
                    className="shrink-0 text-[10px]"
                  >
                    {statusLabel(project.status)} #{project.submissionNumber}
                  </Badge>
                  {project.breadOnly ? (
                    <Badge tone="yellow" className="shrink-0 text-[10px]">
                      bread only
                    </Badge>
                  ) : null}
                  {project.simulatorSketchy ? (
                    <Badge tone="orange" className="shrink-0 text-[10px]">
                      sim sketchy
                    </Badge>
                  ) : null}
                  {project.yswsHold ? (
                    <Badge tone="orange" className="shrink-0 text-[10px]">
                      not YSWS eligible
                    </Badge>
                  ) : null}
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
                <p className="mt-0.5 text-xs font-semibold text-black/40">
                  {project.submissionType === "demo" ? "Demo" : "Design"}
                  {project.submissionSource === "manual"
                    ? " · External tool"
                    : ""}
                  {" · "}
                  {project.kitType === "esp32"
                    ? "ESP32"
                    : project.kitType === "own"
                      ? "Own parts"
                      : "Arduino"}
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
        <div className="p-4 pt-0">
          <EmptyState
            title="No matching submissions"
            description={
              filter === YSWS_HOLD_FILTER
                ? "Nothing is waiting on YSWS verification."
                : "Try a different review filter."
            }
          />
        </div>
      ) : null}
    </DataPanel>
  );
}
