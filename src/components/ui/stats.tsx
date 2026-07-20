import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatTone = "paper" | "cream" | "green" | "blue" | "red" | "yellow";

const toneClass: Record<StatTone, string> = {
  paper: "bg-white text-black",
  cream: "bg-[#fffaf1] text-black",
  green: "bg-green-50 text-green-900",
  blue: "bg-blue-50 text-blue-900",
  red: "bg-[#BD0F32] text-white",
  yellow: "bg-amber-50 text-amber-900",
};

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-3">{children}</div>;
}

export function StatCard({
  label,
  value,
  tone = "paper",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-black p-6 text-center shadow-[4px_4px_0_#000]",
        toneClass[tone],
        className,
      )}
    >
      <p className="text-3xl font-black leading-none">{value}</p>
      <p className="mt-2 text-sm font-black opacity-65">{label}</p>
    </div>
  );
}
