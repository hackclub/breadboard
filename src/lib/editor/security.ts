import { headers } from "next/headers";

const MAX_EDITOR_REQUEST_BYTES = 5_250_000;
const MAX_SNAPSHOT_REQUEST_BYTES = 300_000;

export async function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = (await headers()).get("host");
  if (!origin || !host) return false;

  try {
    const parsed = new URL(origin);
    return parsed.host === host && ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function hasAllowedContentLength(
  request: Request,
  maxBytes = MAX_EDITOR_REQUEST_BYTES,
) {
  const raw = request.headers.get("content-length");
  if (!raw) return true;
  const bytes = Number(raw);
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= maxBytes;
}

export function hasAllowedSnapshotContentLength(request: Request) {
  return hasAllowedContentLength(request, MAX_SNAPSHOT_REQUEST_BYTES);
}
