import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError } from "better-auth/api";
import type { OAuth2Tokens } from "better-auth";
import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { isUnder19 } from "@/lib/auth/hackclub";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";
import { syncUserToLoops } from "@/lib/loops/sync";

const hackClubClientId = process.env.HACKCLUB_CLIENT_ID?.trim() ?? "";
const hackClubClientSecret = process.env.HACKCLUB_CLIENT_SECRET?.trim() ?? "";

export const auth = betterAuth({
  appName: "Breadboard",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["hackclub"],
    },
  },
  databaseHooks: {
    user: {
      create: {
        // A fresh account starts in the "signed up, not started" stage. This
        // never throws, so it can't block signup.
        after: async (createdUser) => {
          await syncUserToLoops(createdUser.id);
        },
      },
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
            "address",
            "phone",
            "birthdate",
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
            if (!res.ok) {
              throw new APIError("UNAUTHORIZED", {
                message: "Could not verify your Hack Club account.",
              });
            }
            const raw = (await res.json()) as Record<string, unknown>;
            const email = String(raw.email ?? "");
            const eligible = raw.ysws_eligible === true;
            // Not-yet-eligible teens (identity verification still pending)
            // may sign in and submit; their kits carry a hold note on the
            // fulfillment pages until the eligible claim shows up. Admins can
            // also exempt a specific account from the admin users page.
            if (
              !eligible &&
              !isUnder19(
                typeof raw.birthdate === "string" ? raw.birthdate : "",
              )
            ) {
              const [existing] = email
                ? await db
                    .select({ yswsExempt: user.yswsExempt })
                    .from(user)
                    .where(eq(user.email, email))
                    .limit(1)
                : [];
              if (!existing?.yswsExempt) {
                throw new APIError("FORBIDDEN", {
                  message:
                    "You must be YSWS eligible (or under 19) to use Breadboard.",
                });
              }
            }
            if (email) {
              await db
                .update(user)
                .set({
                  yswsEligible: eligible,
                  ...(typeof raw.slack_id === "string" && raw.slack_id
                    ? { slackId: raw.slack_id }
                    : {}),
                })
                .where(eq(user.email, email));
            }
            return {
              id: String(raw.sub ?? raw.id ?? ""),
              name: String(raw.name ?? raw.nickname ?? ""),
              email: String(raw.email ?? ""),
              emailVerified: Boolean(raw.email_verified),
            };
          },
        },
      ],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
