import { notFound } from "next/navigation";
import Link from "next/link";
import { LoginButton } from "@/components/shared/auth-buttons";
import { ExternalSubmitForm } from "@/components/platform/projects/external-submit-form";
import { Surface } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { offPlatformBuilds } from "@/flags";
import { getSession } from "@/lib/auth/guards";

export default async function SubmitExternalPage() {
  if (!(await offPlatformBuilds())) notFound();
  const session = await getSession();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Off-platform build"
        title="Start an external build"
        description="Building in KiCad, Eagle, Fritzing, or another tool? Start it here. We'll track your time and journal as you build, then you submit for review, the same way in-editor projects work."
      />

      {session ? (
        <Surface className="bg-[#f4f4f4]">
          <ExternalSubmitForm />
        </Surface>
      ) : (
        <Surface className="bg-[#f4f4f4]">
          <p className="mb-4 text-sm font-bold text-black/60">
            Sign in to submit an off-platform build.
          </p>
          <LoginButton callbackURL="/platform/submit-external" />
        </Surface>
      )}

      <p className="text-center text-xs font-semibold text-black/45">
        Building in the online editor instead?{" "}
        <Link
          href="/platform/projects"
          className="font-black text-[#BD0F32] underline"
        >
          Go to your projects
        </Link>
      </p>
    </div>
  );
}
