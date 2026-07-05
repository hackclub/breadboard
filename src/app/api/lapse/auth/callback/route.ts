import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";
import { exchangeCodeForToken } from "@/lib/lapse";

function safeReturnTo(value: string | undefined) {
  if (value?.startsWith("/") && !value.startsWith("//")) return value;
  return "/platform/projects";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(request.cookies.get("lapse_return_to")?.value);

  const finish = (status: string) => {
    const res = NextResponse.redirect(
      new URL(`${returnTo}?lapse=${status}`, url.origin),
    );
    res.cookies.delete("lapse_pkce_verifier");
    res.cookies.delete("lapse_oauth_state");
    res.cookies.delete("lapse_return_to");
    return res;
  };

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/platform/projects", url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("lapse_oauth_state")?.value;
  const verifier = request.cookies.get("lapse_pkce_verifier")?.value;

  if (!code || !state || !cookieState || state !== cookieState || !verifier) {
    return finish("error");
  }

  try {
    const redirectUri = new URL(
      "/api/lapse/auth/callback",
      url.origin,
    ).toString();
    const token = await exchangeCodeForToken({
      code,
      redirectUri,
      codeVerifier: verifier,
    });
    await db
      .update(user)
      .set({
        lapseAccessToken: token.accessToken,
        lapseRefreshToken: token.refreshToken,
        lapseTokenExpiresAt: token.expiresAt,
        lapseConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.user.id));
  } catch {
    return finish("error");
  }

  return finish("connected");
}
