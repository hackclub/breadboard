import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { OAuth2Tokens } from "better-auth";
import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

const hackClubClientId = process.env.HACKCLUB_CLIENT_ID ?? "";
const hackClubClientSecret = process.env.HACKCLUB_CLIENT_SECRET ?? "";
const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";

export const auth = betterAuth({
  appName: "Breadboard",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["hackclub", "github"],
    },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "hackclub",
          discoveryUrl:
            "https://auth.hackclub.com/.well-known/openid-configuration",
          clientId: hackClubClientId,
          clientSecret: hackClubClientSecret,
          scopes: [
            "openid",
            "profile",
            "email",
            "slack_id",
            "verification_status",
          ],
          pkce: true,
          async getUserInfo(tokens: OAuth2Tokens) {
            const res = await fetch(
              "https://auth.hackclub.com/oauth/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              },
            );
            const raw = (await res.json()) as Record<string, unknown>;
            if (typeof raw.slack_id === "string" && raw.slack_id) {
              await db
                .update(user)
                .set({ slackId: raw.slack_id as string })
                .where(eq(user.email, String(raw.email ?? "")));
            }
            return {
              id: String(raw.sub ?? raw.id ?? ""),
              name: String(raw.name ?? raw.nickname ?? ""),
              email: String(raw.email ?? ""),
              emailVerified: Boolean(raw.email_verified),
            };
          },
        },
        {
          providerId: "github",
          authorizationUrl: "https://github.com/login/oauth/authorize",
          tokenUrl: "https://github.com/login/oauth/access_token",
          userInfoUrl: "https://api.github.com/user",
          clientId: githubClientId,
          clientSecret: githubClientSecret,
          scopes: ["read:user", "user:email", "public_repo"],
          async getUserInfo(tokens: OAuth2Tokens) {
            const res = await fetch("https://api.github.com/user", {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            });
            const raw = (await res.json()) as Record<string, unknown>;
            const emailRes = await fetch("https://api.github.com/user/emails", {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            }).catch(() => null);
            const emails = emailRes?.ok
              ? ((await emailRes.json()) as Array<Record<string, unknown>>)
              : [];
            const primaryEmail = emails.find((email) => email.primary)?.email;
            return {
              id: String(raw.id ?? raw.login ?? ""),
              name: String(raw.name ?? raw.login ?? ""),
              email: String(primaryEmail ?? raw.email ?? ""),
              emailVerified: Boolean(primaryEmail ?? raw.email),
            };
          },
        },
      ],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
