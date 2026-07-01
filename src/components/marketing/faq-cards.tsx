"use client";

import { gsap } from "gsap";
import type { PointerEvent } from "react";

const cards = [
  {
    title: "What Is Breadboard",
    content:
      "Breadboard is a YSWS (You Ship, We Ship) program run by high schoolers, where you build a real breadboard project and get a component kit shipped to you for free! It's organized by Hack Club, a 501(c)(3) nonprofit that supports a global community of high school makers.",
    tone: "paper",
  },
  {
    title: "Do I need prior experience?",
    content:
      "Not at all! Breadboard is built for makers of all skill levels. If you've never touched a breadboard before, our getting started doc and tutorials will walk you through everything you need to know.",
    tone: "red",
  },
  {
    title: "Can I submit multiple projects?",
    content:
      "Yes! After your first kit, you'll get access to the shop where you can submit more projects and redeem additional components and kits.",
    tone: "red",
  },
  {
    title: "Eligibility",
    content:
      "Any teenager aged 13-18 anywhere in the world can participate in Breadboard!",
    tone: "paper",
  },
];

export function FAQCards() {
  const handleCardMove = (event: PointerEvent<HTMLDivElement>) => {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    const rx = (0.5 - py) * 8;
    const ry = (px - 0.5) * 10;

    card.style.setProperty("--mx", `${x}px`);
    card.style.setProperty("--my", `${y}px`);
    card.style.setProperty("--rx", `${rx}deg`);
    card.style.setProperty("--ry", `${ry}deg`);
    gsap.to(card, {
      rotationX: rx,
      rotationY: ry,
      y: -10,
      transformPerspective: 1000,
      transformOrigin: "50% 50%",
      duration: 0.32,
      ease: "power3.out",
      overwrite: "auto",
    });
  };

  const resetCard = (event: PointerEvent<HTMLDivElement>) => {
    const card = event.currentTarget;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--mx", "50%");
    card.style.setProperty("--my", "50%");
    gsap.to(card, {
      rotationX: 0,
      rotationY: 0,
      y: 0,
      duration: 0.42,
      ease: "power3.out",
      overwrite: "auto",
    });
  };

  return (
    <section className="mx-auto max-w-[1440px] px-6 py-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {cards.map((card, i) => (
          <div
            key={card.title}
            onPointerMove={handleCardMove}
            onPointerLeave={resetCard}
            className={`faq-card group relative overflow-hidden rounded-[45px] border-2 border-[#191A23] bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,.25),transparent_40%),linear-gradient(130deg,rgba(255,255,255,.18),rgba(255,255,255,.02))] p-10 text-center shadow-[4px_4px_0_#191A23] [--mx:50%] [--my:50%] [backdrop-filter:blur(4px)] [transform-style:preserve-3d] transition-shadow duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] after:pointer-events-none after:absolute after:inset-px after:rounded-[42px] after:border after:border-white/35 hover:shadow-[12px_16px_30px_rgba(25,26,35,.22),0_22px_45px_rgba(25,26,35,.2)] ${card.tone === "red" ? "bg-[#BD0F32] text-white" : "bg-[#F3F3F3] text-black before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_140px_at_var(--mx)_var(--my),rgba(255,255,255,0.38),transparent_70%)] before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100"}`}
            style={{
              animationDelay: `${i * 120}ms`,
            }}
          >
            <h3 className="relative z-1 mb-6 text-[30px] font-black tracking-[.02em] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] [transform:translateY(0)_translateZ(24px)] group-hover:[transform:translateY(-2px)_translateZ(28px)]">
              {card.title}
            </h3>
            <p className="relative z-1 text-lg leading-normal opacity-95 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] [transform:translateY(0)_translateZ(16px)] group-hover:[transform:translateY(-1px)_translateZ(20px)]">
              {card.content}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
