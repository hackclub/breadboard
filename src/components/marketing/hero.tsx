"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { subscribe } from "@/actions/email";
import { BreadboardCanvas } from "@/components/shared/breadboard-canvas";
import { authClient } from "@/lib/auth/client";
import type { SignupState } from "@/types";

function ModelPreview() {
  const sectionRef = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"idle" | "preparing" | "ready" | "error">(
    "idle",
  );
  const loadModel = useCallback(() => {
    if (phase === "preparing" || phase === "ready") return;
    setPhase("preparing");
    import("@google/model-viewer")
      .then(() => setPhase("ready"))
      .catch(() => setPhase("error"));
  }, [phase]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadModel();
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [loadModel]);

  return (
    <section ref={sectionRef} className="mx-auto max-w-[1440px] px-6 pb-16">
      <div className="rounded-[12px] border-[1.1px] border-black bg-[#f4f4f4] p-4 shadow-[4px_4px_0_#000]">
        {phase === "ready" ? (
          <model-viewer
            src="/assets/breadboard.glb"
            alt="830 tie breadboard 3D model"
            loading="lazy"
            camera-controls
            auto-rotate
            auto-rotate-delay="900"
            rotation-per-second="28deg"
            touch-action="pan-y"
            environment-image="neutral"
            exposure="1"
            shadow-intensity="1"
            style={{
              width: "100%",
              height: 460,
              background: "#e6e6e6",
              border: "1.1px solid #000",
            }}
          />
        ) : (
          <div className="flex h-[460px] flex-col items-center justify-center gap-4 border-[1.1px] border-black bg-[#e6e6e6] px-6 text-center text-base text-black/80">
            <output className="block w-full max-w-90" aria-live="polite">
              <div className="mb-2 h-2 w-full overflow-hidden rounded border border-black/30 bg-white/70">
                <div
                  className="h-full bg-[#BD0F32] transition-all duration-300"
                  style={{
                    width:
                      phase === "idle"
                        ? "0%"
                        : phase === "preparing"
                          ? "35%"
                          : "100%",
                  }}
                />
              </div>
              <p className="font-medium text-black">
                {phase === "error"
                  ? "3D load failed"
                  : phase === "preparing"
                    ? "Preparing 3D viewer..."
                    : "Loading 3D model..."}
              </p>
            </output>
            {phase === "error" ? (
              <button
                type="button"
                className="h-11 rounded border border-black bg-black px-4 text-sm text-white transition-colors hover:bg-white hover:text-black"
                onClick={loadModel}
              >
                Retry 3D Preview
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    subscribe,
    {},
  );
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.existingUser) return;

    let cancelled = false;
    setLoginError(null);
    authClient.signIn
      .oauth2({ providerId: "hackclub", callbackURL: "/platform" })
      .catch(() => {
        if (!cancelled) {
          setLoginError("Login is unavailable right now. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.existingUser]);

  return (
    <div className="w-full max-w-120 rounded-md border border-black bg-[#BD0F32] p-5 shadow-[4px_4px_0_#000] lg:justify-self-center">
      <p className="mb-3 text-[20px] leading-none text-white">
        Learn how &amp; get free stickers!
      </p>
      <div className="relative">
        <form
          action={formAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="orpheus@hackclub.com"
            defaultValue={state.success ? "" : state.email}
            className="h-16 flex-1 border border-black bg-[#d5d5d5] px-4 text-[18px] text-black placeholder:text-black/75"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-16 min-w-32 border border-black bg-black px-6 text-[20px] leading-none text-white transition-colors hover:bg-white hover:text-black disabled:opacity-70"
          >
            Get Started
          </button>
        </form>
        <Image
          src="/favicon-sticker-cropped.png"
          alt="Breadboard sticker"
          width={280}
          height={280}
          className="pointer-events-auto absolute right-[-10rem] bottom-[-16rem] z-20 h-auto w-[min(36vw,280px)] rotate-[-25deg] drop-shadow-[0_18px_16px_rgba(0,0,0,0.44)] transition-transform hover:-translate-y-2.5 hover:scale-103 max-sm:right-[-.5rem] max-sm:bottom-[-6.5rem] max-sm:w-[min(46vw,170px)]"
        />
      </div>
      {state.message || loginError ? (
        <p
          className={`mt-3 text-sm ${state.success ? "text-white" : "text-[#ffe0e0]"}`}
        >
          {loginError ?? state.message}
        </p>
      ) : null}
    </div>
  );
}

const actionButtons = [
  { label: "Get started", href: "/get-started", id: "start" },
  { label: "Gallery", href: "/gallery", id: "gallery" },
  { label: "Workshop", href: "/workshop", id: "workshop" },
];

function PushButton({
  label,
  href,
  id,
}: {
  label: string;
  href: string;
  id: string;
}) {
  const router = useRouter();

  const handleClick = () => {
    try {
      const click = new Audio("/minecraft-click.mp3");
      click.volume = 0.5;
      void click.play().catch(() => {});
    } catch {
      // Ignore audio playback failures.
    }
    router.push(href);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-black">
      <button
        type="button"
        className="group cursor-pointer border-0 bg-transparent p-0"
        aria-label={`${label} red pushbutton`}
        onClick={handleClick}
      >
        <svg
          viewBox="0 0 80 80"
          xmlns="http://www.w3.org/2000/svg"
          width="80"
          height="80"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`gr-red-up-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#ffffff" offset="0" />
              <stop stopColor="#E24B4A" offset="0.3" />
              <stop stopColor="#E24B4A" offset="0.5" />
              <stop stopColor="#000000" offset="1" />
            </linearGradient>
            <linearGradient id={`gr-red-dn-${id}`} x1="1" y1="1" x2="0" y2="0">
              <stop stopColor="#ffffff" offset="0" />
              <stop stopColor="#E24B4A" offset="0.3" />
              <stop stopColor="#E24B4A" offset="0.5" />
              <stop stopColor="#000000" offset="1" />
            </linearGradient>
          </defs>
          <rect
            x="2"
            y="18"
            width="10"
            height="6"
            rx="2"
            fill="#d0cfc4"
            opacity="0.8"
          />
          <rect
            x="2"
            y="56"
            width="10"
            height="6"
            rx="2"
            fill="#d0cfc4"
            opacity="0.8"
          />
          <rect
            x="68"
            y="18"
            width="10"
            height="6"
            rx="2"
            fill="#d0cfc4"
            opacity="0.8"
          />
          <rect
            x="68"
            y="56"
            width="10"
            height="6"
            rx="2"
            fill="#d0cfc4"
            opacity="0.8"
          />
          <rect x="10" y="10" width="60" height="60" rx="3" fill="#383838" />
          <rect x="14" y="14" width="52" height="52" rx="2" fill="#e8e8e8" />
          <circle cx="20" cy="20" r="2.5" fill="#1a1a1a" />
          <circle cx="60" cy="20" r="2.5" fill="#1a1a1a" />
          <circle cx="60" cy="60" r="2.5" fill="#1a1a1a" />
          <circle cx="20" cy="60" r="2.5" fill="#1a1a1a" />
          <circle
            className="group-active:hidden"
            cx="40"
            cy="40"
            r="19"
            fill={`url(#gr-red-up-${id})`}
          />
          <circle
            className="hidden group-active:block"
            cx="40"
            cy="40"
            r="19"
            fill={`url(#gr-red-dn-${id})`}
          />
          <circle
            cx="40"
            cy="40"
            r="14"
            fill="#E24B4A"
            stroke="#2f2f2f"
            strokeOpacity="0.4"
            strokeWidth="0.5"
          />
        </svg>
      </button>
      <span className="text-xl font-normal">{label}</span>
    </div>
  );
}

export function Hero() {
  const [interacted, setInteracted] = useState(false);
  return (
    <>
      <section className="mx-auto max-w-[1440px] px-6 pt-24 md:pt-28">
        <div className="mx-auto w-full max-w-7xl">
          <div onPointerDown={() => setInteracted(true)}>
            <BreadboardCanvas />
          </div>
          <div
            className={`mt-4 flex items-center justify-center gap-3 transition-opacity duration-500 ${interacted ? "pointer-events-none opacity-0" : "opacity-100"}`}
          >
            <span className="animate-pulse text-sm font-semibold tracking-widest text-[#BD0F32] uppercase">
              Try it
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#BD0F32"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            <span className="text-sm text-black/50">
              click a hole, then click another to place a wire
            </span>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1440px] px-6 py-16">
        <div className="flex flex-col gap-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10">
          <div className="w-full max-w-2xl lg:justify-self-center lg:text-left">
            <h1 className="text-5xl leading-tight font-bold text-black lg:text-6xl">
              Design. Iterate. Build.
            </h1>
          </div>
          <SignupForm />
        </div>
        <div className="mt-10 max-w-3xl">
          <p className="text-xl leading-relaxed text-black">
            Design a complete breadboard project.
          </p>
          <p className="mt-1 text-xl leading-relaxed text-black">
            We send you the kit to build it.
          </p>
        </div>
      </section>
      <div className="grid w-full grid-cols-3 gap-0">
        {actionButtons.map((btn) => (
          <PushButton key={btn.id} {...btn} />
        ))}
      </div>
      <ModelPreview />
    </>
  );
}
