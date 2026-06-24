"use client";

import Image from "next/image";
import { useState } from "react";
import { storageReadUrl } from "@/lib/storage/urls";
import type { PlatformProject } from "@/types";

type Project = PlatformProject;

const previewSizes = "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw";

function shouldOptimizeProjectImage(src: string) {
  if (src.startsWith("/api/uploads/")) return false;
  if (src.startsWith("/")) return true;

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

export function ProjectPreview({ project }: { project: Project }) {
  const [failed, setFailed] = useState(false);
  const screenshotUrl = storageReadUrl(project.screenshotUrl);
  const showExample = !screenshotUrl || failed;

  if (showExample) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white text-sm font-black tracking-[0.16em] text-black/35 uppercase">
        Add image here
      </div>
    );
  }

  return (
    <Image
      src={screenshotUrl}
      alt={`${project.title || "Project"} screenshot`}
      fill
      sizes={previewSizes}
      unoptimized={!shouldOptimizeProjectImage(screenshotUrl)}
      onError={() => setFailed(true)}
      className="object-cover transition duration-300 group-hover:scale-[1.03]"
    />
  );
}
