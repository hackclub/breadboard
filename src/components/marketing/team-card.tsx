"use client";

import Image from "next/image";
import { type ReactNode, useState } from "react";

export type SocialPlatform =
  | "github"
  | "linkedin"
  | "twitter"
  | "website"
  | "email"
  | "slack"
  | "instagram"
  | "youtube";

export type TeamMember = {
  name: string;
  title: string;
  description?: ReactNode;
  /** Path to an image in /public, or an allowed remote URL. Falls back to initials. */
  avatar?: string;
  socials?: Partial<Record<SocialPlatform, string>>;
};

const socialMeta: Record<
  SocialPlatform,
  { label: string; icon: ReactNode; href: (v: string) => string }
> = {
  github: {
    label: "GitHub",
    href: (v) => v,
    icon: (
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    ),
  },
  linkedin: {
    label: "LinkedIn",
    href: (v) => v,
    icon: (
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    ),
  },
  twitter: {
    label: "X",
    href: (v) => v,
    icon: (
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.66l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64Z" />
    ),
  },
  website: {
    label: "Website",
    href: (v) => v,
    icon: (
      <path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm7.94 10h-3.02a15.6 15.6 0 0 0-.86-4.5A9.02 9.02 0 0 1 19.94 11ZM12 3.06c.78 1.02 1.68 3.06 1.89 5.94h-3.78c.21-2.88 1.11-4.92 1.89-5.94ZM3.06 13h3.02c.11 1.6.4 3.11.86 4.5A9.02 9.02 0 0 1 3.06 13Zm3.02-2H3.06a9.02 9.02 0 0 1 3.88-6.44c-.46 1.39-.75 2.9-.86 4.94Zm5.92 10.94c-.78-1.02-1.68-3.06-1.89-5.94h3.78c-.21 2.88-1.11 4.92-1.89 5.94ZM10.11 13h3.78c-.21 2.88-1.11 4.92-1.89 5.94-.78-1.02-1.68-3.06-1.89-5.94Zm7.81 4.5c.46-1.39.75-2.9.86-4.5h3.02a9.02 9.02 0 0 1-3.88 4.5ZM17.08 11c-.11-2.04-.4-3.55-.86-4.94A9.02 9.02 0 0 1 20.94 11h-3.86Z" />
    ),
  },
  email: {
    label: "Email",
    href: (v) => (v.startsWith("mailto:") ? v : `mailto:${v}`),
    icon: (
      <path d="M2.25 4.5A1.5 1.5 0 0 0 .75 6v12a1.5 1.5 0 0 0 1.5 1.5h19.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H2.25Zm.9 1.5h17.7L12 12.28 3.15 6ZM2.25 7.62l9.35 6.63a.75.75 0 0 0 .8 0l9.35-6.63V18H2.25V7.62Z" />
    ),
  },
  slack: {
    label: "Slack",
    href: (v) => v,
    icon: (
      <path d="M5.04 15.16a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 0 1 5.04 0v6.32a2.52 2.52 0 1 1-5.04 0v-6.32Zm2.52-10.12a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83Zm0 1.27a2.52 2.52 0 0 1 0 5.04H2.52a2.52 2.52 0 0 1 0-5.04h6.31ZM18.96 8.84a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.84Zm-1.27 0a2.52 2.52 0 0 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.32Zm-2.52 10.12a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.27a2.52 2.52 0 0 1 0-5.04h6.31a2.52 2.52 0 0 1 0 5.04h-6.31Z" />
    ),
  },
  instagram: {
    label: "Instagram",
    href: (v) => v,
    icon: (
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38C1.36 2.67.94 3.34.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.8.72 1.47 1.38 2.13.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.13-1.38 5.86 5.86 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.41-10.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z" />
    ),
  },
  youtube: {
    label: "YouTube",
    href: (v) => v,
    icon: (
      <path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2C0 8.08 0 12 0 12s0 3.92.5 5.8a3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.8ZM9.6 15.6V8.4l6.24 3.6-6.24 3.6Z" />
    ),
  },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function TeamCard({ member }: { member: TeamMember }) {
  const [expanded, setExpanded] = useState(false);
  const socials = member.socials
    ? (Object.entries(member.socials).filter(([, v]) => v) as [
        SocialPlatform,
        string,
      ][])
    : [];

  return (
    <article
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      className="flex flex-col rounded-[16px] border-[1.1px] border-black bg-white p-5 shadow-[4px_4px_0_#000] transition-transform duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000]"
    >
      <div className="flex items-center gap-4">
        {member.avatar ? (
          <Image
            src={member.avatar}
            alt={member.name}
            width={72}
            height={72}
            className="size-[72px] shrink-0 rounded-full border-[1.1px] border-black object-cover shadow-[2px_2px_0_#000]"
          />
        ) : (
          <div className="flex size-[72px] shrink-0 items-center justify-center rounded-full border-[1.1px] border-black bg-[#BD0F32] text-2xl font-black text-white shadow-[2px_2px_0_#000]">
            {initials(member.name)}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-black leading-tight text-black">
            {member.name}
          </h2>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#BD0F32]">
            {member.title}
          </p>
        </div>
      </div>

      {member.description ? (
        <div
          className={`overflow-hidden transition-all duration-700 ease-out ${
            expanded ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <p className="pt-4 text-sm leading-relaxed text-black/70">
            {member.description}
          </p>
        </div>
      ) : null}

      {socials.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 pt-4">
          {socials.map(([platform, value]) => {
            const meta = socialMeta[platform];
            return (
              <a
                key={platform}
                href={meta.href(value)}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={meta.label}
                title={meta.label}
                className="flex size-9 items-center justify-center rounded-[8px] border-[1.1px] border-black bg-[#f4f4f4] text-black shadow-[2px_2px_0_#000] transition-colors hover:bg-[#BD0F32] hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-[18px]"
                  aria-hidden="true"
                >
                  {meta.icon}
                </svg>
                <span className="sr-only">{meta.label}</span>
              </a>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
