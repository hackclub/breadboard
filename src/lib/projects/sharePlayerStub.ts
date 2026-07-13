/**
 * Renders the per-project "Layer B" HTML stub that is committed into each
 * builder's own GitHub repo and served by GitHub Pages.
 *
 * The stub is tiny and self-contained: it sets the asset base to the canonical
 * player host (so wasm/metadata/art resolve there), carries the project
 * snapshot, and loads the shared player. It has no dependency on the Breadboard
 * server, so the link stays up as long as GitHub Pages + the canonical player
 * host are reachable.
 *
 * Single source of truth: the standalone build's dev harness and the server-side
 * publisher both render through here so the two never drift.
 *
 * `assetBase` should be the versioned canonical URL WITHOUT a trailing slash,
 * e.g. "https://cdn.jsdelivr.net/gh/hackclub/breadboard-play@v1". When empty
 * (local dev served from the bundle root), no override is emitted and the
 * player uses same-origin root paths.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * jsDelivr refuses GitHub files over 20 MB and the ngspice wasm is ~24 MB, so
 * that one file is served from GitHub's raw host instead (CORS-enabled, no size
 * cap). Derive the raw base from a jsDelivr `/gh/<owner>/<repo>@<ref>` URL.
 * Returns "" for any other base (e.g. jsDelivr /npm/, which allows 50 MB and
 * needs no split), so the player just uses the normal asset base.
 */
function deriveWasmBase(assetBase: string): string {
  const m = assetBase.match(
    /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@/]+)@([^/]+)/,
  );
  if (!m) return "";
  const [, owner, repo, ref] = m;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}`;
}

export function renderStub(opts: {
  title: string;
  description?: string;
  /** Canonical player base URL, no trailing slash. Empty for local root dev. */
  assetBase: string;
  /** Inline the snapshot object (preferred — no extra fetch, same-origin). */
  snapshot?: unknown;
  /** Or point at a snapshot JSON URL instead of inlining. */
  snapshotUrl?: string;
  /**
   * The dynamic, server-backed share URL where the project can actually be
   * simulated (compile + run, all boards). Rendered as a banner link so
   * viewers of this read-only page know where the live version lives. Omitted
   * when the app URL isn't configured; the page works fine without it (and
   * keeps working if the server ever goes away — that's the whole point of
   * the static page).
   */
  liveUrl?: string;
}): string {
  const base = opts.assetBase.replace(/\/+$/, "");
  const asset = (p: string) => (base ? `${base}/${p}` : `./${p}`);
  const title = escapeHtml(opts.title || "Breadboard project");
  const description = escapeHtml(
    opts.description || "An interactive circuit built in Breadboard.",
  );

  const snapshotScript = opts.snapshot
    ? `<script id="snapshot">window.__VELXIO_SNAPSHOT__ = ${JSON.stringify(
        opts.snapshot,
      ).replace(/</g, "\\u003c")};</script>`
    : opts.snapshotUrl
      ? `<script>window.__VELXIO_SNAPSHOT_URL__ = ${JSON.stringify(
          opts.snapshotUrl,
        )};</script>`
      : "";

  const wasmBase = base ? deriveWasmBase(base) : "";
  const assetBaseScript = base
    ? `<script>window.__VELXIO_ASSET_BASE__ = ${JSON.stringify(base)};${
        wasmBase
          ? `window.__VELXIO_WASM_BASE__ = ${JSON.stringify(wasmBase)};`
          : ""
      }</script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>${title} — Breadboard</title>
<meta name="description" content="${description}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<link rel="stylesheet" href="${asset("player.css")}" />
<style>
  /* The bundled viewer sizes itself to its parent; the /share page relies on
     Tailwind's h-full for that, which this standalone bundle does not ship, so
     size the container explicitly with flexbox instead. */
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: #1e1e1e; color: #fff; font-family: system-ui, sans-serif; }
  #banner { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; padding: 10px 16px; background: #111; border-bottom: 1px solid #333; }
  #banner .headings { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
  #banner .tag { font-size: 11px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; color: #ff6b86; }
  #banner h1 { font-size: 17px; font-weight: 800; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #banner .live-link { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1px solid #ff6b86; border-radius: 999px; color: #ff9aad; font-size: 12px; font-weight: 800; text-decoration: none; white-space: nowrap; }
  #banner .live-link:hover { background: #ff6b86; color: #111; }
  #stage { flex: 1 1 auto; min-height: 0; }
  #root { height: 100%; }
  #root > * { height: 100%; }
</style>
</head>
<body>
<div id="banner">
  <div class="headings">
    <span class="tag">Read Only Demo</span>
    <h1>${title}</h1>
  </div>
${
  opts.liveUrl
    ? `  <a class="live-link" href="${escapeHtml(opts.liveUrl)}" target="_blank" rel="noreferrer">&#9654; Simulate it live</a>
`
    : ""
}</div>
<div id="stage"><div id="root"></div></div>
${assetBaseScript}
${snapshotScript}
<script type="module" src="${asset("player.js")}"></script>
</body>
</html>
`;
}
