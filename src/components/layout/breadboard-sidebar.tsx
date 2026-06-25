"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type DocLink = {
  label: string;
  href: string;
  sub?: boolean;
};

const topLevelItems: DocLink[] = [
  { label: "Start here!", href: "/get-started" },
  { label: "FAQ", href: "/faq" },
];

const guideItems: DocLink[] = [
  { label: "Breadboard Basics", href: "/guides", sub: true },
  { label: "LED Workshop", href: "/workshop", sub: true },
  { label: "Firmware Guide", href: "/guides/firmware", sub: true },
];

const requirementsItem: DocLink = {
  label: "Requirements",
  href: "/requirements",
};

const projectResourceItems: DocLink[] = [
  {
    label: "What is a shipped project",
    href: "/project-resources/what-is-a-shipped-project",
    sub: true,
  },
  {
    label: "Good Journaling",
    href: "/project-resources/good-journaling",
    sub: true,
  },
];

const breadboardHoles = [
  { id: "h0", color: "r" },
  { id: "h1", color: "" },
  { id: "h2", color: "b" },
  { id: "h3", color: "" },
  { id: "h4", color: "g" },
  { id: "h5", color: "" },
  { id: "h6", color: "r" },
  { id: "h7", color: "y" },
  { id: "h8", color: "" },
  { id: "h9", color: "b" },
  { id: "h10", color: "" },
  { id: "h11", color: "g" },
  { id: "h12", color: "" },
  { id: "h13", color: "r" },
  { id: "h14", color: "" },
  { id: "h15", color: "y" },
  { id: "h16", color: "" },
  { id: "h17", color: "b" },
];

const linkUnderline =
  "relative no-underline after:absolute after:left-0 after:bottom-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:bg-[#BD0F32] after:transition-transform after:duration-200 after:content-[''] hover:after:scale-x-100";

export function BreadboardSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="fixed top-[92px] left-3 z-46 rounded border-[1.1px] border-[#111] bg-[#f4f4f4] px-3 py-2 text-[14px] text-[#111] shadow-[3px_3px_0_#000] md:hidden"
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="docs-sidebar"
      >
        {open ? "Close" : "Menu"}
      </button>

      <aside
        id="docs-sidebar"
        className={`fixed left-0 z-45 flex w-[210px] flex-col border-r-2 border-[#111] bg-white/96 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-[105%]"
        } md:translate-x-0`}
        style={{
          top: 0,
          bottom: 0,
          paddingTop: "var(--sidebar-top, 96px)",
        }}
      >
        <button
          className="mx-3 my-2.5 inline-flex items-center justify-center border-[1.1px] border-[#111] bg-[#f4f4f4] px-2.5 py-1.5 text-[13px] text-[#111] shadow-[2px_2px_0_#000] md:hidden"
          type="button"
          onClick={() => setOpen(false)}
        >
          Close
        </button>

        <div className="mx-0 mb-2 h-0.5 bg-[repeating-linear-gradient(90deg,#BD0F32_0px,#BD0F32_6px,transparent_6px,transparent_10px)]" />

        {topLevelItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3.5 py-1.5 text-lg transition-colors hover:bg-[#BD0F32]/8 ${linkUnderline} ${
                active
                  ? "bg-[#BD0F32] text-white after:scale-x-100"
                  : "text-[#111]"
              }`}
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center">
                <span
                  className={`flex size-4 items-center justify-center border-[1.5px] bg-[#f0f0f0] ${active ? "border-white" : "border-[#111]"}`}
                >
                  <span
                    className={`size-2 rounded-full ${active ? "bg-white" : "bg-[#BD0F32]"}`}
                  />
                </span>
              </span>
              {item.label}
            </Link>
          );
        })}

        <div className="mx-3.5 mt-2.5 mb-0 border-t border-dashed border-[#bbb] pt-2 pb-1 text-[13.5px] tracking-[0.12em] uppercase text-[#999]">
          Guides
        </div>

        {guideItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 py-1.5 pl-8 pr-3.5 text-[16.5px] transition-colors hover:bg-[#BD0F32]/6 ${linkUnderline} ${
                active
                  ? "bg-[#BD0F32] text-white after:scale-x-100"
                  : "text-[#555]"
              }`}
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center">
                <span
                  className={`flex size-4 items-center justify-center border-[1.5px] bg-[#f0f0f0] ${active ? "border-white" : "border-[#111]"}`}
                >
                  <span
                    className={`size-2 rounded-full ${active ? "bg-white" : "bg-[#ccc]"}`}
                  />
                </span>
              </span>
              {item.label}
            </Link>
          );
        })}

        <Link
          href={requirementsItem.href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-2.5 px-3.5 py-1.5 text-lg transition-colors hover:bg-[#BD0F32]/8 ${linkUnderline} ${
            pathname === requirementsItem.href
              ? "bg-[#BD0F32] text-white after:scale-x-100"
              : "text-[#111]"
          }`}
        >
          <span className="flex size-[18px] shrink-0 items-center justify-center">
            <span
              className={`flex size-4 items-center justify-center border-[1.5px] bg-[#f0f0f0] ${pathname === requirementsItem.href ? "border-white" : "border-[#111]"}`}
            >
              <span
                className={`size-2 rounded-full ${pathname === requirementsItem.href ? "bg-white" : "bg-[#BD0F32]"}`}
              />
            </span>
          </span>
          {requirementsItem.label}
        </Link>

        <div className="mx-3.5 mt-2.5 mb-0 border-t border-dashed border-[#bbb] pt-2 pb-1 text-[13.5px] tracking-[0.12em] uppercase text-[#999]">
          Project resources
        </div>

        {projectResourceItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 py-1.5 pl-8 pr-3.5 text-[16.5px] transition-colors hover:bg-[#BD0F32]/6 ${linkUnderline} ${
                active
                  ? "bg-[#BD0F32] text-white after:scale-x-100"
                  : "text-[#555]"
              }`}
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center">
                <span
                  className={`flex size-4 items-center justify-center border-[1.5px] bg-[#f0f0f0] ${active ? "border-white" : "border-[#111]"}`}
                >
                  <span
                    className={`size-2 rounded-full ${active ? "bg-white" : "bg-[#ccc]"}`}
                  />
                </span>
              </span>
              {item.label}
            </Link>
          );
        })}

        <div className="mt-auto flex gap-1.25 flex-wrap border-t border-dashed border-[#ccc] px-3.5 py-2.5">
          {breadboardHoles.map((hole) => (
            <span
              key={hole.id}
              className={`size-1.5 rounded-full border ${
                hole.color === "r"
                  ? "border-[#BD0F32] bg-[#BD0F32]"
                  : hole.color === "g"
                    ? "border-[#22c55e] bg-[#22c55e]"
                    : hole.color === "b"
                      ? "border-[#3b82f6] bg-[#3b82f6]"
                      : hole.color === "y"
                        ? "border-[#eab308] bg-[#eab308]"
                        : "border-[#999] bg-white"
              }`}
            />
          ))}
        </div>
      </aside>
    </>
  );
}
