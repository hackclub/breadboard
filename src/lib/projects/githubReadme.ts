import "server-only";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db/db";
import { account, editorActivitySessions, projects } from "@/lib/db/schema";
import { toPublicProjectData } from "@/lib/editor/public-project";
import { parseGitHubRepoUrl, putFile } from "@/lib/github/contents";
import { GITHUB_PUBLISH_PROVIDER_ID } from "@/lib/github/oauth";
import {
  type BomItem,
  bomToMarkdown,
  parseStoredBom,
} from "@/lib/projects/bom";
import { staticPlayUrl } from "@/lib/projects/sharePublish";
import { getStorageObject, storageKeyFromUrl } from "@/lib/storage/s3";

export function bomFromEditorData(
  editorData: Record<string, unknown> | null,
): BomItem[] {
  const components = Array.isArray(editorData?.components)
    ? editorData.components
    : [];
  const counts = new Map<string, number>();
  for (const component of components) {
    if (!component || typeof component !== "object") continue;
    const metadataId = (component as Record<string, unknown>).metadataId;
    if (typeof metadataId !== "string") continue;
    counts.set(metadataId, (counts.get(metadataId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => ({ name, quantity }));
}

export function buildBom(
  customBom: BomItem[],
  editorData: Record<string, unknown> | null,
) {
  const items = customBom.length ? customBom : bomFromEditorData(editorData);
  if (!items.length) return "- Kit parts are listed in the editor schematic.\n";
  return bomToMarkdown(items);
}

export function projectReadmeHours(hoursSpent: number, totalSeconds: number) {
  return Math.max(
    1,
    Math.round((hoursSpent > 0 ? hoursSpent : totalSeconds / 3600) * 10) / 10,
  );
}

export function buildReadme({
  title,
  description,
  howToUse,
  demoUrl,
  simulateUrl,
  videoUrl,
  screenshotUrl,
  bom,
  hours,
}: {
  title: string;
  description: string;
  howToUse: string;
  /** Durable static play page (render-only schematic + code view). */
  demoUrl: string;
  /** Dynamic /share link where the project actually runs in the simulator. */
  simulateUrl: string;
  videoUrl: string;
  screenshotUrl: string;
  bom: string;
  hours: number;
}) {
  const desc = description || title;
  const section = (heading: string, body: string) =>
    body.trim() ? `## ${heading}\n\n${body.trim()}\n` : "";

  return [
    `# ${title}`,
    "",
    screenshotUrl ? `![${title}](${screenshotUrl})` : "",
    `\n> Built in [Breadboard](https://breadboard.hackclub.com), a Hack Club program. This project took ~${hours} hours of work.`,
    "",
    section("What It Does", desc),
    section(
      "How It Works",
      "The circuit is captured in `breadboard-project.json`, and the firmware that runs it is in the `firmware/` folder.",
    ),
    section("How To Use It", howToUse),
    section(
      "Demo",
      [
        simulateUrl
          ? `- **Simulate it live:** [${simulateUrl}](${simulateUrl}), runs the firmware in the Breadboard simulator`
          : "",
        demoUrl ? `- **View the design:** [${demoUrl}](${demoUrl})` : "",
        videoUrl ? `- **Video:** ${videoUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    section(
      "Schematic",
      `The editor snapshot is in \`breadboard-project.json\`.`,
    ),
    section("Bill of Materials", bom),
    section("Firmware", "Firmware files are in the `firmware/` folder."),
    section(
      "Build Journal",
      "Build journal entries are kept in [`journals.md`](journals.md).",
    ),
    "---",
    "",
    `*Made in [Breadboard](https://breadboard.hackclub.com) — ${hours}h of work*`,
    "",
    '<p align="center"><img src="https://cdn.hackclub.com/019efae7-6857-75a2-8bc1-2618087b4eae/a%20bred%20tanuki%20(3).png" width="64" alt="Breadboard mascot" /></p>',
  ]
    .join("\n\n")
    .trim();
}

export function buildJournalsMarkdown(
  title: string,
  journals: Array<{ content: string; createdAt: Date }>,
) {
  if (!journals.length) {
    return `# ${title} Build Journal\n\nNo journal entries yet.\n`;
  }

  return [
    `# ${title} Build Journal`,
    "",
    journals
      .map(
        (journal) =>
          `## ${new Date(journal.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}\n\n${journal.content.trim()}`,
      )
      .join("\n\n---\n\n"),
  ]
    .join("\n")
    .trim();
}

/**
 * Public origin for absolute links in the README. Reads request headers as a
 * fallback, so call it inside the request; the result can then be passed to
 * work scheduled with after(), where headers() is no longer available.
 */
export async function resolvePublicOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to request headers
    }
  }
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return null;
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

const SCREENSHOT_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function loadScreenshotBytes(screenshotUrl: string) {
  const key = storageKeyFromUrl(screenshotUrl);
  if (key) {
    const object = await getStorageObject(key);
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes?.length) return null;
    return { bytes: Buffer.from(bytes), contentType: object.ContentType ?? "" };
  }
  const url = new URL(screenshotUrl);
  if (url.protocol !== "https:") return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) return null;
  return { bytes, contentType: res.headers.get("content-type") ?? "" };
}

/**
 * Commit the project's current screenshot into its GitHub repo and return the
 * committed filename ("" when the project has no usable screenshot). The
 * README references this file relatively: a hosted URL would break whenever
 * the app origin isn't reachable from GitHub (localhost publishes) or the
 * server is down, while a committed file renders forever.
 */
export async function syncScreenshotToRepo({
  token,
  owner,
  repo,
  screenshotUrl,
}: {
  token: string;
  owner: string;
  repo: string;
  screenshotUrl: string;
}) {
  const trimmed = screenshotUrl.trim();
  if (!trimmed) return "";
  try {
    const image = await loadScreenshotBytes(trimmed);
    if (!image) return "";
    const extension =
      SCREENSHOT_EXTENSIONS[image.contentType.split(";")[0].trim()] ?? "png";
    const path = `screenshot.${extension}`;
    await putFile({
      token,
      owner,
      repo,
      path,
      content: image.bytes,
      message: "Update Breadboard screenshot",
    });
    return path;
  } catch {
    return "";
  }
}

function readmeVideoUrl(value: string, origin: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/demo/")) return `${origin}${trimmed}`;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

/**
 * Re-push README.md to a project's published GitHub repo so it reflects the
 * project's current title, description, and screenshot. Called after edits
 * that change those fields; the GitHub publish flow embeds a stable
 * screenshot URL, but a README published before any screenshot existed has
 * no image line at all until it's rewritten.
 *
 * Only touches repos our publisher created (editor projects whose codeUrl
 * points at GitHub) and never throws: a GitHub hiccup must not fail the
 * save that triggered the sync.
 */
export async function refreshGitHubReadme(
  projectId: number,
  userId: string,
  knownOrigin?: string | null,
) {
  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);
    if (!project) return;
    // Manual/off-platform projects store a repo the maker owns and manages
    // themselves; never write into those.
    if (project.submissionSource !== "editor") return;
    const repo = parseGitHubRepoUrl(project.codeUrl);
    if (!repo) return;

    const [githubAccount] = await db
      .select({ accessToken: account.accessToken })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, GITHUB_PUBLISH_PROVIDER_ID),
        ),
      )
      .limit(1);
    if (!githubAccount?.accessToken) return;

    const origin = knownOrigin ?? (await resolvePublicOrigin());
    if (!origin) return;

    const activityTotal = await db
      .select({ seconds: editorActivitySessions.activeSeconds })
      .from(editorActivitySessions)
      .where(eq(editorActivitySessions.projectId, projectId));
    const totalSeconds = activityTotal.reduce(
      (sum, row) => sum + (row.seconds ?? 0),
      0,
    );

    const editorData = project.editorData
      ? toPublicProjectData(
          JSON.parse(project.editorData) as Record<string, unknown>,
        )
      : null;

    const screenshotPath = await syncScreenshotToRepo({
      token: githubAccount.accessToken,
      owner: repo.owner,
      repo: repo.repo,
      screenshotUrl: project.screenshotUrl,
    });

    const readme = buildReadme({
      title: project.title,
      description: project.description,
      howToUse: project.howToUse,
      demoUrl: staticPlayUrl({
        projectId,
        studentOwner: repo.owner,
        studentRepo: repo.repo,
      }),
      simulateUrl: `${origin}/share/${projectId}`,
      videoUrl: readmeVideoUrl(project.demoVideoUrl, origin),
      screenshotUrl: screenshotPath,
      bom: buildBom(parseStoredBom(project.bom), editorData),
      hours: projectReadmeHours(project.hoursSpent, totalSeconds),
    });

    await putFile({
      token: githubAccount.accessToken,
      owner: repo.owner,
      repo: repo.repo,
      path: "README.md",
      content: readme,
      message: "Update Breadboard README",
    });
  } catch {
    // Best-effort sync; the next publish rewrites the README anyway.
  }
}
