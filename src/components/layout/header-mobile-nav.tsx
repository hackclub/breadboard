"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

type NavLink = { label: string; href: string };

export function HeaderMobileNav({
  links,
  authButton,
}: {
  links: NavLink[];
  authButton: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Lock body scroll while the panel covers the page.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="header-mobile-panel"
        onClick={() => setOpen((prev) => !prev)}
        className="flex size-11 items-center justify-center rounded border border-black bg-white shadow-[3px_3px_0_#000] transition active:translate-y-px"
      >
        <span className="relative block h-3.5 w-5" aria-hidden="true">
          <span
            className={`absolute left-0 block h-0.5 w-full bg-black transition-transform duration-200 ${
              open ? "top-1.5 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute top-1.5 left-0 block h-0.5 w-full bg-black transition-opacity duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 block h-0.5 w-full bg-black transition-transform duration-200 ${
              open ? "top-1.5 -rotate-45" : "top-3"
            }`}
          />
        </span>
      </button>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 top-20 z-40 cursor-default bg-black/30"
        />
      ) : null}

      <div
        id="header-mobile-panel"
        hidden={!open}
        className="fixed inset-x-0 top-20 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain border-y-2 border-black bg-[#FEFFFE] shadow-[0_10px_24px_rgba(25,26,35,0.2)]"
      >
        <nav className="flex flex-col px-6 py-3">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center border-b border-dashed border-black/15 text-base font-medium no-underline transition-colors ${
                  active ? "text-[#BD0F32]" : "text-black"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-3 px-6 pt-1 pb-6">
          <Link
            href="/platform/projects"
            onClick={() => setOpen(false)}
            className="flex min-h-12 items-center justify-center rounded border border-black bg-[#BD0F32] px-4 text-base font-semibold text-white no-underline shadow-[3px_3px_0_#000]"
          >
            Create a project
          </Link>
          {authButton}
        </div>
      </div>
    </div>
  );
}
