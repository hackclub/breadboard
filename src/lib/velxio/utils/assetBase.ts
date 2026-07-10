/**
 * Asset base resolution for the velxio simulator/viewer.
 *
 * In the normal Next.js app, static assets (the ngspice/littlefs wasm, the
 * component-metadata JSON, and the board/component SVG artwork) are served from
 * the origin root. There `assetUrl("/foo")` returns "/foo" unchanged and
 * nothing about the running app changes.
 *
 * The standalone share player is a self-contained static bundle published to a
 * durable host (a canonical GitHub repo, served via GitHub Pages / jsDelivr).
 * Its HTML sets `window.__VELXIO_ASSET_BASE__` to the absolute URL where those
 * same assets live, BEFORE the player module loads. When that global is present,
 * `assetUrl` rewrites every root-absolute asset path to the canonical host, so
 * the player fetches its wasm/metadata/art cross-origin with no dependency on
 * the Breadboard server. jsDelivr serves these with permissive CORS, which the
 * worker `importScripts` and the wasm/JSON `fetch` calls require.
 *
 * The global must be set before any module that resolves an asset path at
 * evaluation time (e.g. board-SVG element modules) is imported. The player's
 * HTML sets it in an inline <script> ahead of the module <script>, so that
 * ordering holds.
 */

declare global {
  // eslint-disable-next-line no-var
  var __VELXIO_ASSET_BASE__: string | undefined;
}

/**
 * The configured asset base with any trailing slashes removed, or "" when
 * running in the normal app (no override set).
 */
export function getAssetBase(): string {
  const base = (globalThis as { __VELXIO_ASSET_BASE__?: string })
    .__VELXIO_ASSET_BASE__;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : "";
}

/**
 * Resolve a root-absolute asset path ("/wasm/...", "/component-svgs/...") to a
 * fully-qualified URL. Returns the path unchanged when no asset base is set,
 * which is the default (and only) behavior inside the Next.js app.
 */
export function assetUrl(path: string): string {
  const base = getAssetBase();
  if (!base) return path;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
