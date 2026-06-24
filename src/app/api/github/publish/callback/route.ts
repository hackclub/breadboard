import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/db";
import { account } from "@/lib/db/schema";
import {
  GITHUB_PUBLISH_PROVIDER_ID,
  GITHUB_PUBLISH_RETURN_COOKIE,
  GITHUB_PUBLISH_STATE_COOKIE,
  githubOAuthConfig,
  safeReturnTo,
} from "@/lib/github/oauth";

type GitHubTokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id: number;
  login: string;
};

function redirectWith(request: Request, returnTo: string, github: string) {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("github", github);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GITHUB_PUBLISH_STATE_COOKIE)?.value;
  const returnTo = safeReturnTo(
    cookieStore.get(GITHUB_PUBLISH_RETURN_COOKIE)?.value ?? null,
  );
  cookieStore.delete(GITHUB_PUBLISH_STATE_COOKIE);
  cookieStore.delete(GITHUB_PUBLISH_RETURN_COOKIE);

  if (!code || !state || state !== expectedState) {
    return redirectWith(request, returnTo, "invalid-state");
  }

  const { clientId, clientSecret } = githubOAuthConfig();
  if (!clientId || !clientSecret) {
    return redirectWith(request, returnTo, "missing-config");
  }

  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: new URL(
          "/api/github/publish/callback",
          request.url,
        ).toString(),
      }),
    },
  );
  const token = (await tokenResponse.json()) as GitHubTokenResponse;
  if (!token.access_token || token.error) {
    return redirectWith(request, returnTo, "token-error");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userResponse.ok) return redirectWith(request, returnTo, "user-error");
  const githubUser = (await userResponse.json()) as GitHubUserResponse;

  await db
    .insert(account)
    .values({
      id: `${GITHUB_PUBLISH_PROVIDER_ID}:${session.user.id}:${githubUser.id}`,
      accountId: String(githubUser.id),
      providerId: GITHUB_PUBLISH_PROVIDER_ID,
      userId: session.user.id,
      accessToken: token.access_token,
      scope: token.scope ?? "",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [account.providerId, account.accountId],
      set: {
        userId: session.user.id,
        accessToken: token.access_token,
        scope: token.scope ?? "",
        updatedAt: new Date(),
      },
    });

  await audit("github.publish.connect", "user", session.user.id, {
    githubUser: githubUser.login,
    githubUserId: githubUser.id,
    scope: token.scope ?? "",
  });

  return redirectWith(request, returnTo, "connected");
}
