"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { IconType } from "react-icons";
import {
  HiClipboardDocumentCheck,
  HiClock,
  HiCog6Tooth,
  HiCube,
  HiHome,
  HiShoppingBag,
  HiUsers,
} from "react-icons/hi2";
import { authClient } from "@/lib/auth/client";
import { slackPfpUrl } from "@/lib/utils/slack-pfp";
import { BreadAmount } from "@/components/shared/bread-amount";

type SidebarUser = {
  name?: string | null;
  email?: string | null;
  slackId?: string | null;
  breadBalance?: number | null;
};

type SidebarLink = {
  name: string;
  href: string;
  icon: IconType;
};

type SidebarSection = {
  name: string;
  links: SidebarLink[];
};

const mainNavigation: SidebarSection[] = [
  {
    name: "Main",
    links: [
      { name: "Home", href: "/platform", icon: HiHome },
      { name: "My Projects", href: "/platform/projects", icon: HiCube },
      {
        name: "Docs",
        href: "/get-started",
        icon: HiClipboardDocumentCheck,
      },
    ],
  },
  {
    name: "Rewards",
    links: [{ name: "Shop", href: "/platform/shop", icon: HiShoppingBag }],
  },
];

const adminNavigation: SidebarSection = {
  name: "Admin",
  links: [
    { name: "Dashboard", href: "/platform/admin", icon: HiCog6Tooth },
    { name: "Fulfillment", href: "/platform/admin/fulfillment", icon: HiCube },
    {
      name: "Review",
      href: "/platform/admin/review",
      icon: HiClipboardDocumentCheck,
    },
    { name: "Orders", href: "/platform/admin/orders", icon: HiShoppingBag },
    { name: "Products", href: "/platform/admin/products", icon: HiCube },
    { name: "Users", href: "/platform/admin/users", icon: HiUsers },
    { name: "Audit", href: "/platform/admin/audit", icon: HiClock },
  ],
};

function isActivePath(pathname: string, href: string) {
  if (href === "/platform" || href === "/platform/admin") {
    return pathname === href;
  }

  return (
    pathname === href ||
    (href !== "/platform" && pathname.startsWith(`${href}/`))
  );
}

export function PlatformSidebar({
  user,
  isAdmin,
}: {
  user: SidebarUser | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(false);
  const sections = isAdmin
    ? [...mainNavigation, adminNavigation]
    : mainNavigation;
  const userAvatarUrl = user ? slackPfpUrl(user.slackId) : null;

  async function signIn() {
    setAuthLoading(true);
    await authClient.signIn.oauth2({
      providerId: "hackclub",
      callbackURL: "/platform/shop",
    });
  }

  async function signOut() {
    setAuthLoading(true);
    try {
      await authClient.signOut();
      router.replace("/");
      router.refresh();
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[min(18rem,86vw)] flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:p-6">
        <Link
          href="/platform"
          prefetch={false}
          className="flex items-center gap-3 after:hidden"
        >
          <Image
            src="/assets/Breadboard_Logo_White.svg"
            alt="Breadboard"
            width={196}
            height={56}
            className="h-12 w-auto"
            priority
          />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {sections.map((section) => {
          return (
            <div key={section.name} className="mb-6">
              <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                {section.name}
              </p>
              <div className="space-y-1">
                {section.links.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      prefetch={false}
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-all ${
                        active
                          ? "bg-[#BD0F32] text-white"
                          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {user ? (
          <>
            <div className="mb-3 min-w-0 px-2">
              <div className="mb-2 size-10 overflow-hidden rounded-full border border-zinc-200">
                {userAvatarUrl ? (
                  <Image
                    src={userAvatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="grid size-full place-items-center bg-zinc-100 text-sm font-bold text-zinc-500">
                    {user.name?.slice(0, 1).toUpperCase() || "?"}
                  </div>
                )}
              </div>
              <p className="truncate text-sm font-medium text-zinc-950">
                {user.name ?? "Signed in"}
              </p>
              <BreadAmount amount={user.breadBalance ?? 0} size="sm" />
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={authLoading}
              className="min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-60"
            >
              {authLoading ? "Logging out..." : "Log out"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={signIn}
            disabled={authLoading}
            className="min-h-11 w-full rounded-xl bg-[#BD0F32] px-4 py-2.5 text-center text-sm font-medium text-white transition-all hover:bg-[#a30d2b] disabled:opacity-60"
          >
            {authLoading ? "Logging in..." : "Log in"}
          </button>
        )}
      </div>
    </aside>
  );
}
