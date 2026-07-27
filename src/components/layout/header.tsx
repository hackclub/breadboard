import Image from "next/image";
import Link from "next/link";
import { HeaderMobileNav } from "@/components/layout/header-mobile-nav";
import { LoginButton, LogoutButton } from "@/components/shared/auth-buttons";
import { Countdown } from "@/components/shared/countdown";
import { linkUnderlineClass } from "@/components/shared/styles";
import { launched } from "@/flags";
import { getSession } from "@/lib/auth/guards";

const navLinks = [
  { label: "Get Started", href: "/get-started" },
  { label: "Gallery", href: "/gallery" },
  { label: "Guides", href: "/workshop" },
  { label: "FAQ", href: "/faq" },
  { label: "Platform", href: "/platform" },
];

export async function Header({
  isSticky = false,
  showCountdown = true,
}: {
  isSticky?: boolean;
  showCountdown?: boolean;
}) {
  const [session, isLaunched] = await Promise.all([getSession(), launched()]);
  const visibleNavLinks = isLaunched
    ? navLinks
    : navLinks.filter((link) => link.href !== "/platform");

  return (
    <header
      className={`${isSticky ? "sticky" : "fixed"} top-0 left-0 z-50 w-full bg-[#FEFFFE]`}
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="flex min-h-20 items-center gap-3 md:min-h-24">
          <Link href="/" className="shrink-0 py-3 after:hidden">
            <Image
              src="/assets/Breadboard_Logo_White.svg"
              alt="Breadboard"
              width={196}
              height={56}
              className="h-10 w-auto sm:h-12 md:h-14"
              priority
            />
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-4 px-4 sm:gap-6 sm:px-6 lg:flex lg:gap-8">
            {visibleNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`${linkUnderlineClass} whitespace-nowrap text-sm font-medium text-black transition-colors hover:text-[#BD0F32] sm:text-base`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 lg:ml-0">
            {showCountdown ? <Countdown className="hidden xl:flex" /> : null}
            <Link
              href="/platform/projects"
              className="hidden rounded border border-black bg-[#BD0F32] px-4 py-2 text-sm font-semibold text-white no-underline shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5 hover:bg-black lg:block"
            >
              Create a project
            </Link>
            <div className="hidden lg:block">
              {isLaunched ? session ? <LogoutButton /> : <LoginButton /> : null}
            </div>
            <HeaderMobileNav
              links={visibleNavLinks}
              authButton={
                isLaunched ? session ? <LogoutButton /> : <LoginButton /> : null
              }
            />
          </div>
        </div>
      </div>
    </header>
  );
}
