import type { ReactNode } from "react";
import { BreadboardSidebar } from "@/components/layout/breadboard-sidebar";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { pageGridClass } from "@/components/shared/styles";

export const metadata = {
  title: { template: "%s | Breadboard", default: "Breadboard" },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${pageGridClass} min-h-screen`}>
      <Header isSticky />
      <BreadboardSidebar />
      <main className="min-h-screen px-6 pt-8 pb-16 md:pt-5.5 md:pr-8 md:pb-16 md:pl-[234px]">
        {children}
      </main>
      <Footer />
    </div>
  );
}
