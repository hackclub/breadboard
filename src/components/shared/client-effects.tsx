"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const revealSelector =
  "section:not(.docs-page section), .faq-card, [data-reveal]";

function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/platform")) return;
    if (pathname.startsWith("/editor")) return;
    const cursor = cursorRef.current;
    const trail = trailRef.current;
    if (!cursor || !trail) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    const setCursorX = gsap.quickSetter(cursor, "x", "px");
    const setCursorY = gsap.quickSetter(cursor, "y", "px");
    const trailXTo = gsap.quickTo(trail, "x", {
      duration: 0.38,
      ease: "power3.out",
    });
    const trailYTo = gsap.quickTo(trail, "y", {
      duration: 0.38,
      ease: "power3.out",
    });

    gsap.set([cursor, trail], {
      x: mouseX,
      y: mouseY,
      xPercent: -50,
      yPercent: -50,
    });

    const handlePointerMove = (event: PointerEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      setCursorX(mouseX);
      setCursorY(mouseY);
      trailXTo(mouseX);
      trailYTo(mouseY);
    };

    const handlePointerDown = () => {
      gsap.to(cursor, {
        scale: 0.8,
        duration: 0.12,
        ease: "power2.out",
        overwrite: "auto",
      });
    };

    const handlePointerUp = () => {
      gsap.to(cursor, {
        scale: 1,
        duration: 0.16,
        ease: "back.out(1.8)",
        overwrite: "auto",
      });
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      trailXTo.tween.kill();
      trailYTo.tween.kill();
      gsap.killTweensOf([cursor, trail]);
    };
  }, [pathname]);

  if (pathname.startsWith("/platform") || pathname.startsWith("/editor")) {
    return null;
  }

  return (
    <>
      <div
        ref={cursorRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] hidden size-[14px] rounded-full bg-[#BD0F32]/85 shadow-[0_0_0_1px_rgba(255,255,255,0.7)] md:block"
      />
      <div
        ref={trailRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] hidden size-8 rounded-full border-[1.5px] border-[#BD0F32]/35 backdrop-blur-[2px] md:block"
      />
    </>
  );
}

function useButtonRipple() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/platform")) return;
    if (window.location.pathname.startsWith("/editor")) return;
    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest(
        'button, [role="button"]',
      ) as HTMLElement | null;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height) * 1.35;
      ripple.className =
        "pointer-events-none absolute rounded-full bg-white/45";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      ripple.style.transform = "translate(-50%, -50%) scale(0)";
      button.appendChild(ripple);

      gsap.to(ripple, {
        scale: 1,
        autoAlpha: 0,
        duration: 0.65,
        ease: "power3.out",
        onComplete: () => ripple.remove(),
      });
    };

    document.addEventListener("click", clickHandler);
    return () => document.removeEventListener("click", clickHandler);
  }, []);
}

function useScrollReveal() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/platform")) return;
    if (window.location.pathname.startsWith("/editor")) return;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(revealSelector),
    );
    gsap.set(targets, { autoAlpha: 0, y: 24 });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          gsap.to(target, {
            autoAlpha: 1,
            y: 0,
            duration: 0.65,
            ease: "power3.out",
            overwrite: "auto",
          });
          observer.unobserve(target);
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );

    for (const target of targets) observer.observe(target);

    return () => {
      observer.disconnect();
      gsap.killTweensOf(targets);
    };
  }, []);
}

export function ClientEffects() {
  useButtonRipple();
  useScrollReveal();

  return <CustomCursor />;
}
