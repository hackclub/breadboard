import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "ink" | "red" | "yellow" | "orange" | "green" | "muted";

const toneClass: Record<BadgeTone, string> = {
  ink: "border-black bg-black text-white",
  red: "border-black bg-[#BD0F32] text-white",
  yellow: "border-yellow-900/20 bg-yellow-100 text-yellow-950",
  orange: "border-orange-900/20 bg-orange-100 text-orange-950",
  green: "border-green-900/20 bg-green-100 text-green-950",
  muted: "border-black/10 bg-zinc-100 text-zinc-700",
};

export function Badge({
  children,
  tone = "muted",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em]",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
