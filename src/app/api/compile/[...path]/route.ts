import type { NextRequest } from "next/server";
import { proxyEditorBackend } from "@/lib/editor/backendProxy";

// POST /api/compile/start submits sketch source to arduino-cli / ESP-IDF, so
// it requires a session. GET /api/compile/status/<job> only polls an existing
// job (created by a gated start) and stays open.
export function POST(request: NextRequest) {
  return proxyEditorBackend(request, { requireSession: true });
}

export function GET(request: NextRequest) {
  return proxyEditorBackend(request);
}
