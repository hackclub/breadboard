/**
 * Builds the standalone share-player bundle ("Layer A").
 *
 * Output (share-player/dist) is a self-contained set of static files:
 *   player.js / player.css      — the bundled read-only viewer
 *   ngspice-interactive-worker.js
 *   wasm/ngspice-interactive/*  — the analog engine (24 MB) + code models
 *   littlefs.wasm               — RP2040 MicroPython filesystem
 *   components-metadata.json    — component definitions
 *   component-svgs/ boards/ components/ — board + component artwork
 *
 * These are published once to a canonical GitHub repo and served, version
 * pinned, via jsDelivr (CORS-enabled) + GitHub Pages. Each project's own repo
 * only holds a tiny snapshot.json + an index.html stub that points here.
 *
 * Run with: bun run share-player/build.ts
 */

import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BunPlugin } from "bun";

const ROOT = join(import.meta.dir, "..");
const OUT = join(import.meta.dir, "dist");
const PUBLIC = join(ROOT, "public");
const SRC = join(ROOT, "src");

function resolveAlias(path: string, importer: string) {
  if (path.startsWith("@/")) return join(SRC, path.slice(2));
  if (path.startsWith("/")) return join(PUBLIC, path);
  return join(dirname(importer), path);
}

// Handles `import x from "...file?raw"` (Vite convention) — loads the file as a
// default-exported string. Used by custom-chip examples (.c / .chip.json).
const rawImportPlugin: BunPlugin = {
  name: "raw-imports",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolveAlias(args.path.replace(/\?raw$/, ""), args.importer),
      namespace: "raw-file",
    }));
    build.onLoad({ filter: /.*/, namespace: "raw-file" }, async (args) => ({
      loader: "js",
      contents: `export default ${JSON.stringify(await Bun.file(args.path).text())};`,
    }));
  },
};

// CSS references self-hosted fonts by origin-absolute path (url("/fonts/..")).
// Point those at public/ so Bun bundles them into the player instead of
// erroring or leaving a dead origin-root link.
const publicAssetPlugin: BunPlugin = {
  name: "public-absolute-assets",
  setup(build) {
    build.onResolve({ filter: /^\/fonts\// }, (args) => ({
      path: join(PUBLIC, args.path),
    }));
  },
};

async function copyInto(from: string, toRel: string) {
  const src = join(ROOT, from);
  if (!existsSync(src)) {
    console.warn(`! skip (missing): ${from}`);
    return;
  }
  const dest = join(OUT, toRel);
  await cp(src, dest, { recursive: true });
  console.log(`  copied ${from} -> dist/${toRel}`);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  console.log("Bundling player...");
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "entry.tsx")],
    outdir: OUT,
    target: "browser",
    format: "esm",
    minify: process.env.MINIFY !== "0",
    sourcemap: "linked",
    plugins: [rawImportPlugin, publicAssetPlugin],
    // Bun applies the `entry` template to both the entry JS and its extracted
    // CSS sibling, so `[ext]` (not a hardcoded extension) yields the pair
    // player.js + player.css. Stable names are fine: the canonical bundle is
    // version-pinned by git tag, not filename hash.
    naming: {
      entry: "player.[ext]",
      chunk: "chunk-[hash].[ext]",
      asset: "asset-[name]-[hash].[ext]",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  for (const log of result.logs) {
    if (log.level === "error" || log.level === "warning") console.warn(log);
  }
  if (!result.success) {
    console.error("Build failed.");
    process.exit(1);
  }
  for (const output of result.outputs) {
    console.log(`  ${output.path.replace(OUT, "dist")} (${output.kind})`);
  }

  console.log("Copying static assets...");
  // The ngspice worker is vendored plain JS; ship it as-is so the player's
  // cross-origin blob wrapper can importScripts it.
  await copyInto(
    "src/lib/velxio/simulation/spice/wasm/ngspice-interactive-worker.js",
    "ngspice-interactive-worker.js",
  );
  await copyInto("public/wasm/ngspice-interactive", "wasm/ngspice-interactive");
  await copyInto("public/littlefs.wasm", "littlefs.wasm");
  await copyInto("public/components-metadata.json", "components-metadata.json");
  await copyInto("public/component-svgs", "component-svgs");
  await copyInto("public/boards", "boards");
  await copyInto("public/components", "components");
  // MicroPython firmware fallbacks (optional; remote is micropython.org).
  if (existsSync(join(PUBLIC, "firmware"))) {
    await copyInto("public/firmware", "firmware");
  }

  console.log("Done. Bundle in share-player/dist");
}

void main();
