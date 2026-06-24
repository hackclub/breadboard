import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Share_Tech_Mono } from "next/font/google";
import { ClientEffects } from "@/components/shared/client-effects";
import "./globals.css";

const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech-mono",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Breadboard",
  description:
    "Design a complete breadboard project. We send you the kit to build it.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${shareTechMono.variable} antialiased`}>
      <body>
        <ClientEffects />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
