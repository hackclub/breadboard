import type { NextRequest } from "next/server";
import { proxyEditorBackend } from "@/lib/editor/backendProxy";

// POST /api/compile-rom/ compiles chip-program source (SDCC / 8080 / z80 asm)
// to ROM bytes, so it requires a session. Any GET probe carries no source and
// stays open.
export function POST(request: NextRequest) {
  // Backend mounts the compiler at POST "/" under the /api/compile-rom prefix,
  // so target the slashed path to avoid a body-dropping 307 redirect.
  return proxyEditorBackend(request, {
    requireSession: true,
    backendPath: "/api/compile-rom/",
  });
}

export function GET(request: NextRequest) {
  return proxyEditorBackend(request);
}
