import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  elevated?: boolean;
};

export function Card({
  children,
  className,
  elevated = true,
  ...props
}: CardProps) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-[18px] border border-black bg-white",
        elevated && "shadow-[4px_4px_0_#000]",
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}

export function CardSection({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}

export function Surface({
  children,
  className,
  elevated = true,
  padded = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  elevated?: boolean;
  // `cn` is a plain join, so a caller's padding class can't reliably beat a
  // hardcoded one. Opt out here when you need to set your own.
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-black bg-white",
        padded && "p-6",
        elevated && "shadow-[4px_4px_0_#000]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ProseCard({ children }: { children: ReactNode }) {
  return (
    <Surface
      padded={false}
      className={cn(
        "prose prose-neutral max-w-none bg-[#f4f4f4] p-5 sm:p-8",
        "prose-a:text-[#bc0f32] prose-img:border-[1.1px] prose-img:border-black prose-img:bg-white prose-img:shadow-[3px_3px_0_#000]",
        // Long URLs are used as link text and inline code throughout the guides,
        // so let them wrap instead of pushing the page wider than the screen.
        "break-words prose-a:break-words prose-code:break-words",
        "prose-pre:overflow-x-auto prose-pre:max-w-full",
        // Tables are wider than a phone; scroll them horizontally on their own
        // rather than stretching the whole layout.
        "prose-table:block prose-table:w-max prose-table:max-w-full prose-table:overflow-x-auto",
      )}
    >
      {children}
    </Surface>
  );
}
