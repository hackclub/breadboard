/**
 * Standalone share-player entry.
 *
 * This is the entry for the self-contained "Layer A" bundle that is published
 * once to a durable canonical host (a GitHub repo served via GitHub Pages /
 * jsDelivr) and reused by every project's static share page. It mounts the
 * exact same read-only viewer the /share route uses, but with zero dependency
 * on the Breadboard Next server or Postgres.
 *
 * The per-project "Layer B" HTML stub (committed into the builder's own repo)
 * sets, before this module loads:
 *   window.__VELXIO_ASSET_BASE__  — absolute URL of this bundle's assets, so
 *                                    wasm/metadata/art resolve to the canonical
 *                                    host (see src/lib/velxio/utils/assetBase.ts)
 *   window.__VELXIO_SNAPSHOT__     — the project snapshot object (inline), OR
 *   window.__VELXIO_SNAPSHOT_URL__ — a URL to fetch the snapshot JSON from.
 * When neither snapshot global is set it falls back to ./snapshot.json next to
 * the page.
 */

import { createRoot } from "react-dom/client";
import { VelxioSnapshotViewer } from "@/components/velxio/VelxioSnapshotViewer";

type Globals = {
  __VELXIO_SNAPSHOT__?: unknown;
  __VELXIO_SNAPSHOT_URL__?: string;
};

async function loadSnapshot(): Promise<unknown> {
  const g = window as unknown as Globals;
  if (g.__VELXIO_SNAPSHOT__) return g.__VELXIO_SNAPSHOT__;
  const url = g.__VELXIO_SNAPSHOT_URL__ ?? "./snapshot.json";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load snapshot (${res.status})`);
  return await res.json();
}

function renderError(message: string) {
  const el = document.getElementById("root");
  if (!el) return;
  el.innerHTML = `<div style="font-family:system-ui,sans-serif;color:#ddd;background:#1e1e1e;height:100%;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center">${message}</div>`;
}

async function main() {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  let snapshot: unknown;
  try {
    snapshot = await loadSnapshot();
  } catch (err) {
    renderError(
      `Couldn't load this project snapshot.<br/>${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    );
    return;
  }
  createRoot(rootEl).render(
    <VelxioSnapshotViewer snapshot={snapshot as never} interactive shareMode />,
  );
}

void main();
