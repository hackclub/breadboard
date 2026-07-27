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
        // Code blocks and tables in user content are routinely wider than a
        // phone; scroll them instead of widening the page.
        "prose-pre:max-w-full prose-pre:overflow-x-auto",
        "prose-table:block prose-table:w-max prose-table:max-w-full prose-table:overflow-x-auto",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
