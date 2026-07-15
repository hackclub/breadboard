import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guards";

const BACKEND_URL = process.env.EDITOR_BACKEND_URL ?? "http://127.0.0.1:8001";

// Shown to signed-out visitors who try to compile edited code on a shared
// project. Kept in `detail` so the frontend compile client (which reads
// `data.detail`) surfaces it verbatim in the compile console.
const SIGN_IN_TO_COMPILE =
  "Sign in to compile edited code. You can still open, edit, and run the shared project — it just runs the version the author already built.";

/**
 * Proxy an editor-backend request through Next, optionally requiring a
 * logged-in session first.
 *
 * The compile endpoints (/api/compile/start, /api/compile-chip,
 * /api/compile-rom) hand attacker-controlled C/C++/asm to a real toolchain and
 * return the resulting binary. That's a build-server abuse and file-read
 * exfiltration surface (e.g. `.incbin "/proc/self/environ"` embeds host files
 * into the returned image), so source submission requires an account. Status
 * polls and availability checks (GET) carry no source and stay open, so an
 * anonymous /share visitor can still run the author's shipped hex.
 *
 * These paths were previously same-origin rewrites in next.config.ts with no
 * auth; this handler replaces those rewrites and preserves the request path
 * verbatim, so authenticated behaviour is unchanged.
 */
export async function proxyEditorBackend(
  request: NextRequest,
  {
    requireSession = false,
    backendPath,
  }: { requireSession?: boolean; backendPath?: string } = {},
): Promise<Response> {
  if (requireSession) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { detail: SIGN_IN_TO_COMPILE },
        { status: 401 },
      );
    }
  }

  // Forward the incoming path by default. `backendPath` overrides it where the
  // backend is picky about trailing slashes: FastAPI mounts compile-chip /
  // compile-rom at "/", so it 307-redirects the slash-less form — and undici
  // can't replay a buffered request body across a redirect (it detaches the
  // ArrayBuffer), which would crash the POST. Hitting the exact slashed path
  // sidesteps the redirect entirely.
  const { search } = request.nextUrl;
  const target = `${BACKEND_URL}${backendPath ?? request.nextUrl.pathname}${search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      // No redirect is expected — `backendPath` targets the exact path the
      // backend serves. "follow" is only a safety net for a body-less GET;
      // a POST body can't be replayed across a redirect (undici detaches the
      // buffer), which is precisely why we avoid the redirect above.
      redirect: "follow",
    });
  } catch {
    return NextResponse.json(
      { detail: "No response from the build backend. Is it running?" },
      { status: 502 },
    );
  }

  const respHeaders = new Headers();
  const respContentType = upstream.headers.get("content-type");
  if (respContentType) respHeaders.set("content-type", respContentType);

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: respHeaders,
  });
}
