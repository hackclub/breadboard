"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HiExclamationTriangle } from "react-icons/hi2";
import { cn } from "@/lib/utils";

// The "are you sure?" step shown right before a submission goes out. The ship
// forms already verify the mechanical requirements (screenshot, repo, journal),
// but reviewers reject projects over the quality bar on /requirements, which
// nothing on the platform surfaces at submit time. This checklist makes the
// user attest to each of those before the submit button unlocks.

type CheckItem = {
  id: string;
  title: string;
  detail: string;
};

// Wording mirrors the requirements page (/requirements) so the final check
// reads as the same bar, not a paraphrase of it. Update both together.
const DESIGN_CHECKS: CheckItem[] = [
  {
    id: "cool-input",
    title: "Cool input",
    detail:
      "Give people a real way to interact with your project. A single push button is not allowed, and one input on its own isn't enough. You must combine several ways for people to control your project: a keypad, a joystick, a rotary encoder, an RFID reader, an IR remote, and the like.",
  },
  {
    id: "cool-output",
    title: "Cool output",
    detail:
      "One blinking LED is the floor and won't pass on its own. Combine outputs like a screen, an addressable LED matrix, a motor, a servo, or a stepper. Make it move, display, or react in a way that's fun to watch!",
  },
  {
    id: "cool-sensors",
    title: "Cool sensors",
    detail:
      "Your project should sense multiple aspects from the real world and react to it. Things like motion, distance, weight, orientation, sound, light, temperature are examples of things that can be sensed.",
  },
  {
    id: "real-purpose",
    title: "A real purpose",
    detail:
      "There should be a clear reason your project exists, and you should be able to say in one sentence why it needs a microcontroller at all.",
  },
  {
    id: "makes-decision",
    title: "It makes a decision",
    detail:
      "Your code has to actually think. Reacting to one reading isn't enough, like turning on a light just because it got dark. A real decision weighs more than one thing: it looks at several inputs, remembers what happened before, or acts differently over time.",
  },
  {
    id: "unique-firmware",
    title: "Unique firmware",
    detail:
      "The code has to be yours, and it has to do real work. A copied example sketch or tutorial clone doesn't count. Real work means at least one of: a state machine, a control loop, cleaning up sensor readings, non-blocking timing, or speaking a protocol over I2C, SPI, or serial.",
  },
  {
    id: "no-ai-coding",
    title: "No AI-assisted coding",
    detail: "Write your own code.",
  },
  {
    id: "readme",
    title: "Your README",
    detail:
      "Someone landing on your repo should understand what your project is, what it does, and why it exists without opening a single file: what it is, how you use it, and why you made it, plus photos, a clear wiring diagram or schematic, and a BOM listing the parts you used and how many of each.",
  },
];

const BUILD_CHECKS: CheckItem[] = [
  {
    id: "photos",
    title: "Photos of the finished circuit",
    detail: "Photos of the finished breadboard circuit, fully assembled.",
  },
  {
    id: "demo-video",
    title: "A demo video",
    detail: "A demo video showing it actually working.",
  },
  {
    id: "complete-repo",
    title: "A complete public repo",
    detail:
      "README.md, journal.md, your schematic, firmware source, and a BOM listing your parts and quantities.",
  },
];

export function SubmitFinalCheck({
  kind,
  onAllConfirmedChange,
}: {
  kind: "design" | "build";
  onAllConfirmedChange: (allConfirmed: boolean) => void;
}) {
  const items = kind === "build" ? BUILD_CHECKS : DESIGN_CHECKS;
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const allConfirmed = items.every((item) => checked.has(item.id));

  useEffect(() => {
    onAllConfirmedChange(allConfirmed);
  }, [allConfirmed, onAllConfirmedChange]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2.5 rounded-xl border-2 border-[#BD0F32] bg-[#fff5f7] p-4 shadow-[3px_3px_0_#BD0F32]">
        <HiExclamationTriangle className="mt-0.5 size-5 shrink-0 text-[#BD0F32]" />
        <div>
          <p className="text-sm font-black text-black">
            Hold up. Are you sure?
          </p>
          <p className="mt-1 text-xs font-semibold text-black/65">
            Reviewers check every {kind} against the{" "}
            <Link
              href="/requirements"
              target="_blank"
              className="font-black text-[#BD0F32] underline"
            >
              requirements
            </Link>
            . 95% of rejections are fixable in under 5 minutes, so save
            yourself the round trip: tick each box only if it's honestly true
            for your project.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        {items.map((item) => {
          const isChecked = checked.has(item.id);
          return (
            <label
              key={item.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[12px] border-2 p-3 transition",
                isChecked
                  ? "border-[#BD0F32] bg-[#fff5f7]"
                  : "border-black bg-white hover:bg-zinc-50",
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(item.id)}
                className="mt-0.5 size-4 shrink-0 accent-[#BD0F32]"
              />
              <span>
                <span className="block text-sm font-black text-black">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-black/55">
                  {item.detail}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-bold text-red-800">
        Submitting stolen or AI-generated work can result in a permanent ban
        from this program and other Hack Club programs. Don't do it.
      </p>
    </div>
  );
}
