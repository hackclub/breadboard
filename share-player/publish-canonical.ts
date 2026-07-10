/**
 * Publishes the built player bundle (share-player/dist, "Layer A") to the
 * canonical GitHub repo at a version tag. jsDelivr then serves it from that tag
 * with a permanent cache and permissive CORS:
 *
 *   https://cdn.jsdelivr.net/gh/<owner>/<repo>@<version>/
 *
 * Every project's static play page (Layer B) points at exactly one such pinned
 * version (SHARE_PLAYER_BASE_URL), so shipping a new player is additive: cut a
 * new tag and move the env forward; existing links keep resolving their old tag
 * forever.
 *
 * Operational script — run by a maintainer after `bun run share-player/build.ts`.
 * Env:
 *   PLAY_REPO_REMOTE  git remote incl. auth, e.g.
 *                     https://x-access-token:<TOKEN>@github.com/hackclub/breadboard-play.git
 *   PLAY_VERSION      version tag to publish, e.g. v1 (default: v1)
 *
 * Usage:
 *   bun run share-player/build.ts
 *   PLAY_REPO_REMOTE=... PLAY_VERSION=v1 bun run share-player/publish-canonical.ts
 */

import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "dist");
const remote = process.env.PLAY_REPO_REMOTE;
const version = process.env.PLAY_VERSION ?? "v1";

if (!remote) {
  console.error("PLAY_REPO_REMOTE is required (git remote incl. auth token).");
  process.exit(1);
}
if (!existsSync(join(DIST, "player.js"))) {
  console.error(
    "dist/player.js missing — run `bun run share-player/build.ts` first.",
  );
  process.exit(1);
}
// Never ship the local dev harness files.
await $`rm -f ${join(DIST, "index.html")} ${join(DIST, "snapshot.json")} ${join(DIST, "_verify.png")}`.nothrow();

// A fresh single-commit history per release keeps the artifacts repo small; the
// immutable value is the tag, which jsDelivr pins to. dist is wiped by the next
// build, so re-initializing git here each time is expected.
await $`git -C ${DIST} init -q`;
await $`git -C ${DIST} add -A`;
await $`git -C ${DIST} -c user.email=bot@breadboard.hackclub.com -c user.name=breadboard-bot commit -qm ${`player ${version}`}`;
await $`git -C ${DIST} branch -M main`;
await $`git -C ${DIST} push -f ${remote} main`;
await $`git -C ${DIST} tag -f ${version}`;
await $`git -C ${DIST} push -f ${remote} ${version}`;

// Purge jsDelivr for the key files so a re-pushed tag (or a premature request
// that negative-cached a 404) is picked up immediately instead of after the
// cache TTL. Best-effort; parse owner/repo from the remote.
const slug = remote
  .replace(/\.git$/, "")
  .match(/github\.com[/:]([^/]+\/[^/]+)/);
if (slug) {
  const files = [
    "player.js",
    "player.css",
    "ngspice-interactive-worker.js",
    "components-metadata.json",
    "wasm/ngspice-interactive/ngspice-lib.js",
  ];
  await Promise.all(
    files.map((f) =>
      fetch(`https://purge.jsdelivr.net/gh/${slug[1]}@${version}/${f}`).catch(
        () => {},
      ),
    ),
  );
  console.log("Purged jsDelivr cache for key files.");
}

console.log(`Published player ${version}.`);
console.log(`jsDelivr: https://cdn.jsdelivr.net/gh/<owner>/<repo>@${version}/`);
console.log(
  "Set SHARE_PLAYER_BASE_URL to that (no trailing slash) in the app env.",
);
