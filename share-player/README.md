# Static share player

Makes project share links permanent. A published project's playable link keeps
working for years, even if the Breadboard server and its database go away,
because the link and everything it needs are hosted outside Breadboard.

## Why

The normal `/share/[id]` route is server-rendered from Postgres: kill the Next
server or the DB and the link dies. Hack Club Unified needs links that outlive an
unmaintained project, so at publish time we generate a fully static version.

## How it works: two layers

**Layer A, the shared player** (this folder → `dist/`). A self-contained SPA of
the read-only viewer + simulator, built with `bun build`. It has zero Next.js
coupling and runs entirely in the browser: ngspice (analog) is WASM, AVR is
avr8js, RP2040 is rp2040js, Monaco loads from jsDelivr. Built once and published
to a canonical GitHub repo, then served version-pinned via jsDelivr (multi-CDN,
permanent tag cache, CORS-enabled — which the worker `importScripts` and wasm
fetches require).

**Layer B, per project.** At GitHub publish time
([src/app/api/projects/[id]/github/publish/route.ts](../src/app/api/projects/[id]/github/publish/route.ts)
→ [src/lib/projects/sharePublish.ts](../src/lib/projects/sharePublish.ts)) two
tiny files are written and GitHub Pages serves them:

- `snapshot.json` — the project's editor snapshot (circuit + code + compiled
  firmware), the same JSON `/share` reads.
- `index.html` — a stub ([src/lib/projects/sharePlayerStub.ts](../src/lib/projects/sharePlayerStub.ts))
  that sets `window.__VELXIO_ASSET_BASE__` to the Layer A host and loads the
  player.

Either way the link depends only on GitHub Pages + jsDelivr, never on Breadboard.

### Hosting modes (`SHARE_HOST_MODE`)
- **`central`** (default) — a bot token (`SHARE_PAGES_TOKEN`) writes both files
  into one shared repo (`SHARE_PAGES_REPO`) under `p/<projectId>/`. No per-student
  GitHub permission is needed, and the page is created even for students who never
  connected GitHub. Link: `https://<centralOwner>.github.io/<centralRepo>/p/<projectId>/`.
- **`student`** — the student's own token writes `play/` into their own repo and
  enables Pages there, so the student owns the page. Needs the broader `repo`
  OAuth scope (Pages enable requires it). Link:
  `https://<student>.github.io/<repo>/play/`.

The two are a config flip: switching later doesn't touch already-published links
(each keeps the URL it was minted with), so keep the central repo alive even after
moving to `student`.

## Asset resolution

The viewer normally fetches assets (wasm, `components-metadata.json`, board SVGs)
from origin-root `/…` paths. [src/lib/velxio/utils/assetBase.ts](../src/lib/velxio/utils/assetBase.ts)
wraps those paths with `assetUrl()`: a no-op in the app (leaves `/…` unchanged),
but in the player it prefixes the canonical host set by the stub. The stub sets
that global in an inline `<script>` before the module loads, so module-eval-time
asset consts resolve correctly.

### The 24 MB wasm exception
jsDelivr refuses GitHub files over **20 MB**, and `ngspice-lib.wasm` is ~24 MB.
So the stub also sets `__VELXIO_WASM_BASE__` to the same repo/ref on GitHub's
**raw** host (`raw.githubusercontent.com`, CORS-enabled, no size cap), and the
ngspice worker loads just the `.wasm` from there while glue + code models + the
rest of the player stay on jsDelivr ([sharePlayerStub.ts](../src/lib/projects/sharePlayerStub.ts)
`deriveWasmBase`, [NgSpiceInteractive.ts](../src/lib/velxio/simulation/spice/wasm/NgSpiceInteractive.ts)).
If you instead publish the player to jsDelivr's **npm** endpoint (50 MB limit),
no split is needed and `deriveWasmBase` returns "" so everything loads from one
base. `publish-canonical.ts` purges jsDelivr for the key files after each push
(jsDelivr negative-caches a premature 404 for ~a minute otherwise).

## What is and isn't interactive offline

- Fully interactive: Arduino (Uno/Nano/Mega/ATtiny85), Raspberry Pi Pico
  (Pico W non-WiFi), and any analog/digital circuit + custom chips whose
  `wasmBase64` is in the snapshot.
- Static only (schematic + code + captured serial, no live run): **ESP32, STM32,
  Raspberry Pi Zero–5.** These run via QEMU on the Python backend, which cannot
  ship in a static page. A stored compiled hex doesn't help because *running* the
  firmware is the backend call.

## Build & publish

```bash
# Build the player (Layer A) into dist/
bun run share-player/build.ts

# Publish dist/ to the canonical repo at a version tag (jsDelivr serves it)
PLAY_REPO_REMOTE="https://x-access-token:<TOKEN>@github.com/hackclub/breadboard-play.git" \
PLAY_VERSION=v1 \
bun run share-player/publish-canonical.ts
```

Then set `SHARE_PLAYER_BASE_URL` (no trailing slash) in the app env to
`https://cdn.jsdelivr.net/gh/hackclub/breadboard-play@v1`. Shipping a new player
is additive: cut a new tag, bump the env; existing links keep resolving their
pinned tag.

## Central page hosting setup (default mode)

Layer A above is the shared player. The per-project **pages** in `central` mode
also need a home:

1. Create a public repo for the pages, e.g. `hackclub/breadboard-plays`.
2. Make a token with Contents + Pages/Administration write on it (classic `repo`
   scope, or a fine-grained PAT).
3. In the app env set `SHARE_HOST_MODE=central`, `SHARE_PAGES_REPO=hackclub/breadboard-plays`,
   `SHARE_PAGES_TOKEN=<token>`. The first publish enables Pages on that repo
   automatically.

Pages then serves each project at `…github.io/breadboard-plays/p/<projectId>/`.
(Note: GitHub Pages rebuilds the whole repo per push, fine at moderate scale; if
the pages repo grows very large, shard by project-id prefix or move to a bucket.)

## Backfill existing projects

```bash
bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-static-shares.ts --dry-run
bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-static-shares.ts
```

Republishes play pages for already-submitted projects and repoints their
`playableUrl`. Projects whose owner never connected GitHub are skipped (no token)
and reported.

## Local verification

`build.ts` honors `MINIFY=0` for a readable debug build. `_writeDevStub.ts`
restores a runnable test snapshot + `index.html` into `dist/` after a build
(which wipes `dist/`). Serve `dist/` over HTTP and open it — with no asset base
set it runs same-origin from the bundle root.
