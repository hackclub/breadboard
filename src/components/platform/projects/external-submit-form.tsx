"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createExternalDraftFromForm } from "@/actions/projects";
import { BreadIcon } from "@/components/shared/bread-amount";
import { LoadingInline } from "@/components/shared/loading-card";
import { Button } from "@/components/ui/button";
import { inputClass, Label } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import type { ProjectFormState } from "@/types";

const initialState: ProjectFormState = { success: false };

export function ExternalSubmitForm() {
  const router = useRouter();
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
      {/* Build submissions always use the builder's own parts. */}
      <input type="hidden" name="kitType" value="own" />

      <div className="flex items-start gap-3 rounded-[14px] border border-black bg-[#fff5f7] p-4 shadow-[3px_3px_0_#000]">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-black bg-white">
          <BreadIcon size="sm" gold />
        </span>
        <div>
          <p className="text-sm font-black text-black">
            You&apos;ll earn gold bread for this build.
          </p>
          <p className="mt-0.5 text-xs font-semibold text-black/60">
            Build off-platform in KiCad, Eagle, Fritzing, or anything else.
            We&apos;ll track your time and journal as you build. When a reviewer
            approves your finished build, you earn gold bread, which gets you
            shop items for cheaper.
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
