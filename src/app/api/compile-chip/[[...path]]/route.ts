import type { NextRequest } from "next/server";
import { proxyEditorBackend } from "@/lib/editor/backendProxy";

// POST /api/compile-chip/ compiles custom-chip C source to WASM (wasi-sdk), so
// it requires a session. GET /api/compile-chip/status is an availability probe
// with no source and stays open.
export function POST(request: NextRequest) {
  // Backend mounts the compiler at POST "/" under the /api/compile-chip prefix,
  // so target the slashed path to avoid a body-dropping 307 redirect.
  return proxyEditorBackend(request, {
    requireSession: true,
    backendPath: "/api/compile-chip/",
  });
}

export function GET(request: NextRequest) {
  return proxyEditorBackend(request);
}
