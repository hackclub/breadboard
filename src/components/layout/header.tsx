import Image from "next/image";
import Link from "next/link";
import { LoginButton, LogoutButton } from "@/components/shared/auth-buttons";
import { linkUnderlineClass } from "@/components/shared/styles";
import { launched } from "@/flags";
import { getSession } from "@/lib/auth/guards";

const navLinks = [
  { label: "Get Started", href: "/get-started" },
  { label: "Gallery", href: "/gallery" },
  { label: "Guides", href: "/guides" },
  { label: "FAQ", href: "/faq" },
  { label: "Platform", href: "/platform" },
];

export async function Header({ isSticky = false }: { isSticky?: boolean }) {
  const [session, isLaunched] = await Promise.all([getSession(), launched()]);
  const visibleNavLinks = isLaunched
    ? navLinks
    : navLinks.filter((link) => link.href !== "/platform");

  return (
    <header
      className={`${isSticky ? "sticky" : "fixed"} top-0 left-0 z-50 w-screen bg-[#FEFFFE]`}
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="flex min-h-20 items-center md:min-h-24">
          <Link href="/" className="py-3 after:hidden">
            <Image
              src="/assets/Breadboard_Logo_White.svg"
              alt="Breadboard"
              width={196}
              height={56}
              className="h-12 w-auto md:h-14"
              priority
            />
          </Link>
          <nav className="flex flex-1 items-center justify-center gap-4 px-4 sm:gap-6 sm:px-6 md:gap-8">
            {visibleNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`${linkUnderlineClass} text-sm font-medium text-black transition-colors hover:text-[#BD0F32] sm:text-base`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {isLaunched ? session ? <LogoutButton /> : <LoginButton /> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
