// NB: intentionally not "server-only" — besides the Next API route, an
// operational backfill script (scripts/backfill-static-shares.ts) imports this
// under plain Bun. It is only ever imported server-side regardless.
import { renderStub } from "@/lib/projects/sharePlayerStub";
import { BOARD_KIND_FQBN } from "@/lib/velxio/types/board";

/**
 * Publishes a project's fully static, server-independent "play" page so the
 * share link keeps working for years even if the Breadboard server (and its
 * database) go away.
 *
 * Two files are written per project:
 *   snapshot.json  — the editor snapshot (circuit + code + compiled firmware),
 *                    the same JSON the /share route reads
 *   index.html     — a tiny stub that loads the shared, version-pinned player
 *                    bundle (Layer A, SHARE_PLAYER_BASE_URL) and points it at
 *                    snapshot.json
 *
 * Two hosting modes (SHARE_HOST_MODE):
 *   "central" (default) — a bot token writes both files into ONE central repo
 *      under p/<projectId>/, so no per-student GitHub permission is needed and
 *      the page is created even for students who never connected GitHub. Link:
 *      https://<centralOwner>.github.io/<centralRepo>/p/<projectId>/
 *   "student" — the student's own token writes play/ into their own repo and
 *      enables Pages there, so the student owns the page. Needs the broader
 *      `repo` OAuth scope (Pages enable). Link:
 *      https://<studentOwner>.github.io/<studentRepo>/play/
 *
 * The heavy player + wasm engine (Layer A) is never copied per project; it is
 * hosted once at SHARE_PLAYER_BASE_URL (served via jsDelivr, version pinned and
 * CORS-enabled). See share-player/.
 */

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// Canonical, version-pinned player host. jsDelivr mirrors a GitHub repo/tag and
// serves it from a multi-CDN with permissive CORS (required by the worker
// importScripts + wasm/JSON fetches). Override per deployment/version.
export function sharePlayerBaseUrl(): string {
  return (
    process.env.SHARE_PLAYER_BASE_URL?.trim().replace(/\/+$/, "") ||
    "https://cdn.jsdelivr.net/gh/hackclub/breadboard-play@v1"
  );
}

export type ShareHostMode = "central" | "student";

export function shareHostMode(): ShareHostMode {
  return process.env.SHARE_HOST_MODE?.trim() === "student"
    ? "student"
    : "central";
}

// Central hosting target: one repo owned by the program, written by a bot token.
// Returns null when not configured, so callers can fall back gracefully.
function centralConfig(): {
  owner: string;
  repo: string;
  token: string;
} | null {
  const repoFull = process.env.SHARE_PAGES_REPO?.trim(); // "owner/repo"
  const token = process.env.SHARE_PAGES_TOKEN?.trim();
  if (!repoFull || !token) return null;
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) return null;
  return { owner, repo, token };
}

type GitHubError = Error & { status?: number };

async function github<T>(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    const err = new Error(
      body?.message ?? `GitHub request failed: ${res.status}`,
    ) as GitHubError;
    err.status = res.status;
    throw err;
  }
  // 204 (no content) responses have no body.
  return (res.status === 204 ? null : await res.json()) as T;
}

function encodeGitHubPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function getContentSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(path)}`,
    { headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Could not check ${path}`);
  const content = (await res.json()) as { sha?: string };
  return content.sha;
}

async function putFile(opts: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  /** UTF-8 text content. */
  content: string;
  message: string;
}) {
  const sha = await getContentSha(opts.token, opts.owner, opts.repo, opts.path);
  await github(
    opts.token,
    `/repos/${opts.owner}/${opts.repo}/contents/${encodeGitHubPath(opts.path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: opts.message,
        content: Buffer.from(opts.content, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    },
  );
}

/**
 * Enable GitHub Pages for the repo, serving the default branch root.
 *
 * A 409 means Pages is already on (fine). A 422 right after the repo's first
 * commit means "not ready yet" and is transient, so retry a few times rather
 * than swallowing it (swallowing left Pages disabled and the page 404'd). Only
 * give up (and throw, so the caller falls back to the dynamic link) if it keeps
 * failing.
 */
async function ensurePagesEnabled(
  token: string,
  owner: string,
  repo: string,
  branch: string,
) {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await github(token, `/repos/${owner}/${repo}/pages`, {
        method: "POST",
        body: JSON.stringify({ source: { branch, path: "/" } }),
      });
      return;
    } catch (err) {
      const status = (err as GitHubError).status;
      if (status === 409) return; // already enabled
      if (status === 422 && attempt < maxAttempts - 1) {
        // Freshly-created repo not ready yet; back off and retry.
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

/**
 * The deterministic public play-page URL for a project, by mode. Computable
 * without any API call (used for the README link before the page is pushed).
 * Returns "" when the active mode isn't configured yet.
 */
export function staticPlayUrl(opts: {
  projectId: number;
  studentOwner?: string;
  studentRepo?: string;
}): string {
  if (shareHostMode() === "student") {
    if (!opts.studentOwner || !opts.studentRepo) return "";
    return `https://${opts.studentOwner.toLowerCase()}.github.io/${opts.studentRepo}/play/`;
  }
  const c = centralConfig();
  if (!c) return "";
  return `https://${c.owner.toLowerCase()}.github.io/${c.repo}/p/${opts.projectId}/`;
}

// Board kinds whose firmware runs entirely in-browser (avr8js / rp2040js), so a
// static page can execute them offline. ESP32/STM32/Pi run via the QEMU backend
// and can't, so they stay render-only. Exact match (a prefix test would wrongly
// catch arduino-nano-esp32).
const OFFLINE_RUNNABLE = new Set([
  "arduino-uno",
  "arduino-nano",
  "arduino-mega",
  "attiny85",
  "raspberry-pi-pico",
  "pi-pico-w",
]);

type SnapFile = { name?: string; content?: string };
type SnapBoard = {
  id?: string;
  boardKind?: string;
  compiledProgram?: string | null;
  activeFileGroupId?: string;
};
type SnapshotShape = {
  // Portable .vlx shape (what project.editorData actually is)
  boards?: SnapBoard[];
  fileGroups?: Record<string, SnapFile[]>;
  activeBoardId?: string | null;
  // Full-capture shape
  editor?: {
    codeChangedSinceLastCompile?: boolean;
    fileGroups?: Record<string, SnapFile[]>;
  };
  simulator?: {
    boards?: SnapBoard[];
    activeBoardId?: string | null;
    compiledHex?: string | null;
  };
};

function editorBackendUrl() {
  return (
    process.env.EDITOR_BACKEND_URL?.trim().replace(/\/+$/, "") ||
    "http://127.0.0.1:8001"
  );
}

/**
 * Compile a sketch to firmware via the editor backend, best-effort. Returns the
 * hex, or null on any failure/timeout (leaving the share render-only). This runs
 * ONCE at publish time on the server; the result is baked into the static page,
 * so the page itself stays fully static/offline.
 */
async function compileSketch(
  files: Array<{ name: string; content: string }>,
  fqbn: string,
): Promise<string | null> {
  const backend = editorBackendUrl();
  let jobId = "";
  try {
    const res = await fetch(`${backend}/api/compile/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files,
        board_fqbn: fqbn,
        project_id: null,
        board_options: null,
        spiffs_files: null,
      }),
    });
    if (!res.ok) return null;
    jobId = ((await res.json()) as { job_id?: string }).job_id ?? "";
  } catch {
    return null;
  }
  if (!jobId) return null;
  // Poll for completion (Arduino cold compiles can take a while).
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`${backend}/api/compile/status/${jobId}`);
      if (!res.ok) continue;
      const s = (await res.json()) as {
        state?: string;
        result?: { hex_content?: string | null };
      };
      if (s.state === "done") return s.result?.hex_content || null;
      if (s.state === "error") return null;
    } catch {
      // transient — keep polling
    }
  }
  return null;
}

/**
 * Make a snapshot runnable offline by embedding compiled firmware on the active
 * in-browser-runnable board.
 *
 * The viewer's Run only skips compilation when the active board carries
 * `compiledProgram`; without it a static page would try to compile against a
 * backend it can't reach. Handles both the portable `.vlx` shape (top-level
 * `boards`/`fileGroups`, which is what `project.editorData` actually is) and the
 * full-capture shape. Reuses a pre-captured hex when present, otherwise compiles
 * the active board's sketch once at publish time. Backend-only boards
 * (ESP32/STM32/Pi) and compile failures are left render-only.
 *
 * Async + exported so the route and backfill share the exact transform.
 */
export async function embedFirmwareForOfflineRun(
  snapshot: unknown,
): Promise<unknown> {
  const snap = snapshot as SnapshotShape | null;
  if (!snap || typeof snap !== "object") return snapshot;

  const isVlx = Array.isArray(snap.boards);
  const boards = isVlx ? snap.boards : snap.simulator?.boards;
  const fileGroups = isVlx ? snap.fileGroups : snap.editor?.fileGroups;
  const activeId = isVlx ? snap.activeBoardId : snap.simulator?.activeBoardId;
  if (!Array.isArray(boards) || !fileGroups || typeof fileGroups !== "object") {
    return snapshot;
  }

  const active = boards.find((b) => b?.id === activeId) ?? boards[0];
  if (!active || active.compiledProgram) return snapshot;
  const kind = active.boardKind;
  if (typeof kind !== "string" || !OFFLINE_RUNNABLE.has(kind)) return snapshot;
  const fqbn = BOARD_KIND_FQBN[kind as keyof typeof BOARD_KIND_FQBN];
  if (!fqbn) return snapshot;

  // Reuse a pre-captured hex if the snapshot has one (full-capture shape);
  // otherwise compile the active board's sketch.
  let hex: string | null =
    !isVlx && typeof snap.simulator?.compiledHex === "string"
      ? snap.simulator.compiledHex
      : null;
  if (!hex) {
    const groupId = active.activeFileGroupId;
    const group =
      (groupId && fileGroups[groupId]) || Object.values(fileGroups)[0];
    const files = Array.isArray(group)
      ? group
          .map((f) => ({
            name: String(f?.name ?? ""),
            content: String(f?.content ?? ""),
          }))
          .filter((f) => f.name)
      : [];
    if (!files.length) return snapshot;
    hex = await compileSketch(files, fqbn);
  }
  if (!hex) return snapshot;

  active.compiledProgram = hex;
  // Full-capture shape reads codeChangedSinceLastCompile from the snapshot; the
  // .vlx path is handled by loadProjectState calling markCompiled().
  if (!isVlx && snap.editor) snap.editor.codeChangedSinceLastCompile = false;
  return snapshot;
}

export async function publishStaticShare(opts: {
  projectId: number;
  title: string;
  description?: string;
  /** The project's editorData JSON string (the /share snapshot). */
  editorData: string;
  /** Required for "student" mode; ignored in "central" mode. */
  studentToken?: string;
  studentOwner?: string;
  studentRepo?: string;
}): Promise<{ pagesUrl: string }> {
  // Validate the snapshot parses before publishing a page that can't render.
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(opts.editorData);
  } catch {
    throw new Error(
      "Project snapshot is not valid JSON; cannot publish share.",
    );
  }
  // Embed compiled firmware so the static page runs offline instead of trying
  // to compile against a backend it can't reach.
  const snapshotJson = JSON.stringify(
    await embedFirmwareForOfflineRun(snapshot),
  );
  const html = renderStub({
    title: opts.title,
    description: opts.description,
    assetBase: sharePlayerBaseUrl(),
    snapshotUrl: "./snapshot.json",
  });

  // Resolve where to write: one central repo (bot token) or the student's repo.
  let target: { token: string; owner: string; repo: string; dir: string };
  if (shareHostMode() === "student") {
    if (!opts.studentToken || !opts.studentOwner || !opts.studentRepo) {
      throw new Error(
        "Student share hosting needs the student's GitHub token and repo.",
      );
    }
    target = {
      token: opts.studentToken,
      owner: opts.studentOwner,
      repo: opts.studentRepo,
      dir: "play",
    };
  } else {
    const c = centralConfig();
    if (!c) {
      throw new Error(
        "Central share hosting not configured (set SHARE_PAGES_REPO and SHARE_PAGES_TOKEN).",
      );
    }
    target = {
      token: c.token,
      owner: c.owner,
      repo: c.repo,
      dir: `p/${opts.projectId}`,
    };
  }

  await putFile({
    token: target.token,
    owner: target.owner,
    repo: target.repo,
    path: `${target.dir}/snapshot.json`,
    content: snapshotJson,
    message: `Publish Breadboard share snapshot (project ${opts.projectId})`,
  });
  await putFile({
    token: target.token,
    owner: target.owner,
    repo: target.repo,
    path: `${target.dir}/index.html`,
    content: html,
    message: `Publish Breadboard share page (project ${opts.projectId})`,
  });

  // Idempotent — a no-op after the first publish to a given repo.
  await ensurePagesEnabled(target.token, target.owner, target.repo, "main");

  return {
    pagesUrl: staticPlayUrl({
      projectId: opts.projectId,
      studentOwner: opts.studentOwner,
      studentRepo: opts.studentRepo,
    }),
  };
}
