import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guards";
import {
  createGitHubOAuthState,
  githubOAuthConfig,
  GITHUB_PUBLISH_RETURN_COOKIE,
  GITHUB_PUBLISH_STATE_COOKIE,
  safeReturnTo,
} from "@/lib/github/oauth";

function publicBaseUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    request.url
  );
}

export async function GET(request: Request) {
  const baseUrl = publicBaseUrl(request);
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const { clientId } = githubOAuthConfig();
  const returnTo = safeReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );
  if (!clientId) {
    return NextResponse.redirect(
      new URL(`${returnTo}?github=missing-config`, baseUrl),
    );
  }

  const state = createGitHubOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(GITHUB_PUBLISH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  cookieStore.set(GITHUB_PUBLISH_RETURN_COOKIE, returnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  const callbackUrl = new URL("/api/github/publish/callback", baseUrl);
  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", clientId);
  githubUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  githubUrl.searchParams.set("scope", "read:user user:email public_repo");
  githubUrl.searchParams.set("state", state);

  return NextResponse.redirect(githubUrl);
}
