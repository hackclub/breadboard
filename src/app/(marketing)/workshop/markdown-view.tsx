"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders the tutorial markdown bare (no wrapper) so it inherits the
// surrounding ProseCard's `prose` styling. GFM adds tables and autolinks.
// No rehype-raw, so any embedded HTML is escaped rather than executed.
export function MarkdownView({ source }: { source: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>;
}
