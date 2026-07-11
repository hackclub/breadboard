// NB: intentionally not "server-only" — besides the Next API route, an
// operational backfill script (scripts/backfill-static-shares.ts) imports this
// under plain Bun. It is only ever imported server-side regardless.
import { renderStub } from "@/lib/projects/sharePlayerStub";

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
 * Enable GitHub Pages for the repo, serving the default branch root. Idempotent:
 * a 409/422 means Pages is already on, which is left as-is.
 */
async function ensurePagesEnabled(
  token: string,
  owner: string,
  repo: string,
  branch: string,
) {
  try {
    await github(token, `/repos/${owner}/${repo}/pages`, {
      method: "POST",
      body: JSON.stringify({ source: { branch, path: "/" } }),
    });
  } catch (err) {
    const status = (err as GitHubError).status;
    if (status !== 409 && status !== 422) throw err;
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
// and can't, so they're left render-only.
const OFFLINE_RUNNABLE_KIND =
  /^(arduino-(uno|nano|mega)|attiny85|raspberry-pi-pico|pi-pico-w)/;

/**
 * Make a snapshot runnable offline.
 *
 * captureState stores the last compiled firmware in `simulator.compiledHex` but
 * not per-board, while the viewer's run path only skips compilation when the
 * active board carries `compiledProgram`. Without this, a static page's Run
 * button tries to compile (which needs the backend it doesn't have). So attach
 * the compiled hex to the active in-browser-runnable board and mark the code as
 * already compiled. No hex (project never compiled) → left render-only.
 *
 * Exported so the backfill script and tests share the exact transform.
 */
export function embedFirmwareForOfflineRun(snapshot: unknown): unknown {
  const snap = snapshot as {
    editor?: { codeChangedSinceLastCompile?: boolean };
    simulator?: {
      compiledHex?: string | null;
      activeBoardId?: string | null;
      boards?: Array<{
        id?: string;
        boardKind?: string;
        compiledProgram?: string | null;
      }>;
    };
  } | null;
  const sim = snap?.simulator;
  const hex = sim?.compiledHex;
  if (!snap || !sim || !hex || !Array.isArray(sim.boards)) return snapshot;

  let embedded = false;
  sim.boards = sim.boards.map((board) => {
    const isActive = board?.id === sim.activeBoardId;
    if (
      isActive &&
      typeof board?.boardKind === "string" &&
      OFFLINE_RUNNABLE_KIND.test(board.boardKind) &&
      !board.compiledProgram
    ) {
      embedded = true;
      return { ...board, compiledProgram: hex };
    }
    return board;
  });
  if (embedded && snap.editor) snap.editor.codeChangedSinceLastCompile = false;
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
  const snapshotJson = JSON.stringify(embedFirmwareForOfflineRun(snapshot));
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
