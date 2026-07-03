import { createHash, randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guards";
import { lapseAuthorizeUrl, lapseOAuthConfigured } from "@/lib/lapse";

function safeReturnTo(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/platform/projects";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/platform/projects", url.origin));
  }

  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (!lapseOAuthConfigured()) {
    return NextResponse.redirect(
      new URL(`${returnTo}?lapse=unconfigured`, url.origin),
    );
  }

  const verifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const redirectUri = new URL(
    "/api/lapse/auth/callback",
    url.origin,
  ).toString();

  const res = NextResponse.redirect(
    lapseAuthorizeUrl({ redirectUri, state, codeChallenge }),
  );
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("lapse_pkce_verifier", verifier, cookieOptions);
  res.cookies.set("lapse_oauth_state", state, cookieOptions);
  res.cookies.set("lapse_return_to", returnTo, cookieOptions);
  return res;
}
