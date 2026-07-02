"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { HiCpuChip } from "react-icons/hi2";
import { createExternalDraftFromForm } from "@/actions/projects";
import { LoadingInline } from "@/components/shared/loading-card";
import { Button } from "@/components/ui/button";
import { inputClass, Label } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProjectFormState } from "@/types";

const initialState: ProjectFormState = { success: false };

const KIT_OPTIONS = [
  {
    value: "arduino",
    label: "A - Arduino",
    alt: "Arduino kit",
    image: "/assets/arduino.png",
    blurb: "Arduino board, breadboard, sensors, and additional modules.",
  },
  {
    value: "esp32",
    label: "B - ESP32",
    alt: "ESP32 kit",
    image: "/assets/esp32.png",
    blurb: "ESP32 board, breadboard, sensors, and Wi-Fi/Bluetooth support.",
  },
  {
    value: "own",
    label: "My own parts",
    alt: "Own parts",
    image: null,
    blurb: "You already have everything. We won't ship you a kit.",
  },
] as const;

export function ExternalSubmitForm() {
  const router = useRouter();
  const [kitType, setKitType] = useState<"arduino" | "esp32" | "own">(
    "arduino",
  );
  const [state, formAction, pending] = useActionState(
    createExternalDraftFromForm,
    initialState,
  );

  useEffect(() => {
    if (!state.success || !state.project) return;
    router.push(`/platform/projects/${state.project.id}/track`);
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-5">
      <div className="flex items-start gap-3 rounded-[14px] border border-black bg-[#fff5f7] p-4 shadow-[3px_3px_0_#000]">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-black bg-[#BD0F32] text-lg">
          🍞
        </span>
        <div>
          <p className="text-sm font-black text-black">
            You&apos;ll earn Bread for this build.
          </p>
          <p className="mt-0.5 text-xs font-semibold text-black/60">
            Design off-platform in KiCad, Eagle, Fritzing, or anything else.
            We&apos;ll track your time and journal as you build, then a reviewer
            approves it, we ship the kit, and after your demo you earn Bread
            (our currency) to spend in the shop.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="external-title">Project title</Label>
        <Input
          id="external-title"
          name="title"
          required
          autoFocus
          placeholder="Pocket synth, plant monitor, LED game..."
          className="px-4 py-4 text-xl font-black"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="external-description">Short description</Label>
        <textarea
          id="external-description"
          name="description"
          rows={4}
          placeholder="One or two sentences about the project."
          className={inputClass("px-4 py-3")}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-black/45">
          Which kit are you using?
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {KIT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-4 rounded-[12px] border-2 p-4 transition",
                kitType === option.value
                  ? "border-[#BD0F32] bg-[#fff5f7]"
                  : "border-black bg-white hover:bg-zinc-50",
              )}
            >
              <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-black bg-white">
                {option.image ? (
                  <Image
                    src={option.image}
                    alt={option.alt}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <HiCpuChip className="size-8 text-[#BD0F32]" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="kitType"
                    value={option.value}
                    checked={kitType === option.value}
                    onChange={() => setKitType(option.value)}
                    className="mt-0.5 size-4 accent-[#BD0F32]"
                  />
                  <p className="text-sm font-black text-black">
                    {option.label}
                  </p>
                </div>
                <p className="mt-1 text-xs text-black/50">{option.blurb}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {state.message ? (
        <p className="text-sm font-bold text-[#BD0F32]" aria-live="polite">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          tone="paper"
          className="rounded-full"
          onClick={() => router.push("/platform/projects")}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          tone="primary"
          className="rounded-full px-6"
          disabled={pending}
        >
          {pending ? (
            <LoadingInline label="Creating" />
          ) : (
            "Start build & tracking"
          )}
        </Button>
      </div>
    </form>
  );
}
