import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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

function isUniqueViolation(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

async function storeGitHubPublishToken(input: {
  userId: string;
  githubUserId: number;
  accessToken: string;
  scope: string;
}) {
  const githubAccountId = String(input.githubUserId);
  const now = new Date();
  const [existing] = await db
    .select({ id: account.id, userId: account.userId })
    .from(account)
    .where(
      and(
        eq(account.providerId, GITHUB_PUBLISH_PROVIDER_ID),
        eq(account.accountId, githubAccountId),
      ),
    )
    .limit(1);

  if (existing && existing.userId !== input.userId) {
    return { linkedToAnotherUser: true } as const;
  }

  if (existing) {
    await db
      .update(account)
      .set({
        accessToken: input.accessToken,
        scope: input.scope,
        updatedAt: now,
      })
      .where(
        and(
          eq(account.id, existing.id),
          eq(account.userId, input.userId),
          eq(account.providerId, GITHUB_PUBLISH_PROVIDER_ID),
          eq(account.accountId, githubAccountId),
        ),
      );
    return { linkedToAnotherUser: false } as const;
  }

  try {
    await db.insert(account).values({
      id: `${GITHUB_PUBLISH_PROVIDER_ID}:${input.userId}:${githubAccountId}`,
      accountId: githubAccountId,
      providerId: GITHUB_PUBLISH_PROVIDER_ID,
      userId: input.userId,
      accessToken: input.accessToken,
      scope: input.scope,
      updatedAt: now,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return { linkedToAnotherUser: true } as const;
  }

  return { linkedToAnotherUser: false } as const;
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

  const stored = await storeGitHubPublishToken({
    userId: session.user.id,
    githubUserId: githubUser.id,
    accessToken: token.access_token,
    scope: token.scope ?? "",
  });

  if (stored.linkedToAnotherUser) {
    await audit("github.publish.connect_conflict", "user", session.user.id, {
      githubUser: githubUser.login,
      githubUserId: githubUser.id,
    });
    return redirectWith(request, returnTo, "account-linked");
  }

  await audit("github.publish.connect", "user", session.user.id, {
    githubUser: githubUser.login,
    githubUserId: githubUser.id,
    scope: token.scope ?? "",
  });

  return redirectWith(request, returnTo, "connected");
}
