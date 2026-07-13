"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingInline } from "@/components/shared/loading-card";
import { authClient } from "@/lib/auth/client";

export function LoginButton({
  callbackURL = "/platform",
}: {
  callbackURL?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    try {
      setError(null);
      setLoading(true);
      // better-auth's client resolves with { error } instead of throwing on a
      // failed request, so on success this call redirects away and we never
      // return here. If it does return, an error must have occurred and we have
      // to clear the loading state ourselves, otherwise the button spins forever.
      const { error: signInError } = await authClient.signIn.oauth2({
        providerId: "hackclub",
        callbackURL,
      });
      if (signInError) {
        setLoading(false);
        setError(
          signInError.message ??
            "Could not start sign-in. Check that the database is reachable and Hack Club Auth credentials are configured.",
        );
      }
    } catch {
      setLoading(false);
      setError(
        "Hack Club Auth credentials are not configured. Set HACKCLUB_CLIENT_ID and HACKCLUB_CLIENT_SECRET in .env.local.",
      );
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="rounded border border-black bg-[#BD0F32] px-4 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5 hover:bg-black"
      >
        {loading ? (
          <LoadingInline label="Logging in" />
        ) : (
          "Log in with Hack Club"
        )}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const signOut = async () => {
    setLoading(true);
    try {
      await authClient.signOut();
      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      className="rounded border border-black bg-white px-4 py-2 text-sm font-semibold text-black shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5 hover:bg-black hover:text-white"
    >
      {loading ? <LoadingInline label="Logging out" /> : "Log out"}
    </button>
  );
}
