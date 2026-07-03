"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Renders user-authored markdown. react-markdown does not render embedded HTML
// (no rehype-raw) and strips dangerous link protocols by default, so this is
// safe for untrusted content. GFM adds tables, strikethrough, and autolinks.
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words",
        "prose-a:text-[#bc0f32] prose-img:rounded-lg prose-img:border prose-img:border-black",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
