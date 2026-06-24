import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  account,
  editorActivitySessions,
  projectJournals,
  projects,
} from "@/lib/db/schema";
import {
  enforceSameOrigin,
  hasAllowedContentLength,
} from "@/lib/editor/security";
import { GITHUB_PUBLISH_PROVIDER_ID } from "@/lib/github/oauth";

type GitHubUser = { login: string };
type GitHubRepo = { html_url: string; full_name: string };
type GitHubContent = { sha?: string };
type GitHubError = Error & { status?: number };

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 80)
      .replace(/-+$/g, "") || "breadboard-project"
  );
}

function safeRepoPathSegment(value: string) {
  return (
    value
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "sketch.ino"
  );
}

function optionalUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:") {
    throw new Error("Links must use https:// URLs.");
  }
  return parsed.toString();
}

function optionalPublicUrl(value: unknown, origin: string) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/demo/")) return `${origin}${trimmed}`;
  return optionalUrl(trimmed);
}

function encodeBase64(content: string) {
  return Buffer.from(content, "utf8").toString("base64");
}

function encodeGitHubPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

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
      errors?: Array<{ message?: string; field?: string; code?: string }>;
    } | null;
    const details = body?.errors
      ?.map((item) => item.message ?? item.field ?? item.code)
      .filter(Boolean)
      .join("; ");
    const err = new Error(
      [body?.message ?? `GitHub request failed: ${res.status}`, details]
        .filter(Boolean)
        .join(" "),
    ) as GitHubError;
    err.status = res.status;
    throw err;
  }

  return (await res.json()) as T;
}

async function maybeGetContentSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(path)}`,
    {
      headers: {
        ...GITHUB_HEADERS,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Could not check ${path}`);
  const content = (await res.json()) as GitHubContent;
  return content.sha;
}

async function putFile({
  token,
  owner,
  repo,
  path,
  content,
  message,
}: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
}) {
  const sha = await maybeGetContentSha(token, owner, repo, path);
  await github(
    token,
    `/repos/${owner}/${repo}/contents/${encodeGitHubPath(path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: encodeBase64(content),
        ...(sha ? { sha } : {}),
      }),
    },
  );
}

async function createUniqueRepo({
  token,
  owner,
  baseName,
  description,
}: {
  token: string;
  owner: string;
  baseName: string;
  description: string;
}) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const name = `${baseName.slice(0, 100 - suffix.length)}${suffix}`;
    try {
      const repo = await github<GitHubRepo>(token, "/user/repos", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          private: false,
          auto_init: false,
        }),
      });
      return { repo, existed: false };
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : "";
      const status = (err as GitHubError).status;
      if (status !== 422) throw err;

      const existing = await getRepoIfExists(token, owner, name);
      if (existing) return { repo: existing, existed: true };

      if (!message.includes("name already exists")) throw err;
    }
  }
  throw new Error(
    `Could not find an available repository name for ${baseName}`,
  );
}

async function getRepoIfExists(token: string, owner: string, repo: string) {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      headers: {
        ...GITHUB_HEADERS,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as GitHubRepo;
}

function parseGitHubRepoUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function flattenFiles(
  fileGroups: unknown,
): Array<{ name: string; content: string }> {
  if (!fileGroups || typeof fileGroups !== "object") return [];
  const files: Array<{ name: string; content: string }> = [];
  for (const groupFiles of Object.values(
    fileGroups as Record<string, unknown>,
  )) {
    if (!Array.isArray(groupFiles)) continue;
    for (const file of groupFiles) {
      if (!file || typeof file !== "object") continue;
      const record = file as Record<string, unknown>;
      if (typeof record.name !== "string") continue;
      files.push({
        name: safeRepoPathSegment(record.name),
        content: typeof record.content === "string" ? record.content : "",
      });
    }
  }
  return files;
}

function buildBom(editorData: Record<string, unknown> | null) {
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
  if (counts.size === 0)
    return "- Kit parts are listed in the editor schematic.\n";
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `- ${name}: ${count}`)
    .join("\n");
}

function buildReadme({
  title,
  description,
  howToUse,
  demoUrl,
  videoUrl,
  screenshotUrl,
  editorData,
  hours,
  journals,
}: {
  title: string;
  description: string;
  howToUse: string;
  demoUrl: string;
  videoUrl: string;
  screenshotUrl: string;
  editorData: Record<string, unknown> | null;
  hours: number;
  journals: Array<{ content: string; createdAt: Date }>;
}) {
  const desc = description || title;
  const section = (heading: string, body: string) =>
    body.trim() ? `## ${heading}\n\n${body.trim()}\n` : "";

  const journalSection = journals.length
    ? `## Build Journal\n\n${journals
        .map(
          (j) =>
            `> ${new Date(j.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}\n\n${j.content}`,
        )
        .join("\n\n---\n\n")}\n`
    : "";

  const bom = buildBom(editorData);

  return [
    `# ${title}`,
    "",
    desc,
    `\n> Built in [Breadboard](https://breadboard.hackclub.com), a Hack Club program. This project took ~${hours} hours of work.`,
    "",
    section("How To Use It", howToUse),
    section(
      "Demo",
      [
        demoUrl ? `- **Try it:** [${demoUrl}](${demoUrl})` : "",
        videoUrl ? `- **Video:** ${videoUrl}` : "",
        screenshotUrl ? `\n![${title} screenshot](${screenshotUrl})` : "",
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
    journalSection,
    "---",
    "",
    `*Made in [Breadboard](https://breadboard.hackclub.com) — ${hours}h of work*`,
    "",
    '<p align="center"><img src="https://cdn.hackclub.com/019efae7-6857-75a2-8bc1-2618087b4eae/a%20bred%20tanuki%20(3).png" width="64" alt="Breadboard mascot" /></p>',
  ]
    .join("\n\n")
    .trim();
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) return error("Invalid project id", 400);
  if (!(await enforceSameOrigin(request))) return error("Forbidden", 403);
  if (!hasAllowedContentLength(request)) return error("Request too large", 413);

  const session = await getSession();
  if (!session) return error("Unauthorized", 401);

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return error("Project not found", 404);
  if (project.userId !== session.user.id) {
    return error("You can only publish your own projects", 403);
  }

  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    await audit("github.publish.missing_config", "project", String(projectId));
    return error(
      "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      503,
    );
  }

  const [githubAccount] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, GITHUB_PUBLISH_PROVIDER_ID),
      ),
    )
    .limit(1);

  if (!githubAccount?.accessToken) {
    await audit("github.publish.needs_auth", "project", String(projectId));
    return NextResponse.json({ needsGitHubAuth: true }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const origin = new URL(request.url).origin;
  const requestedHowToUse =
    typeof body.howToUse === "string" ? body.howToUse.trim() : "";
  const howToUse = requestedHowToUse || project.howToUse;
  if (wordCount(howToUse) < 3) {
    return error(
      "Add step-by-step instructions for how to use your project. Minimum 3 words.",
      400,
    );
  }
  let videoUrl = "";
  try {
    videoUrl = optionalPublicUrl(body.videoUrl, origin);
    if (!videoUrl) videoUrl = optionalPublicUrl(project.demoVideoUrl, origin);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Invalid URL", 400);
  }
  const demoUrl = `${origin}/share/${projectId}`;
  const editorData = project.editorData
    ? (JSON.parse(project.editorData) as Record<string, unknown>)
    : null;
  await audit("github.publish.attempt", "project", String(projectId), {
    storedRepoUrl: project.codeUrl || null,
  });

  let repo: GitHubRepo;
  let repoExisted = false;
  let repoName = "";
  try {
    const baseRepoName = slugify(project.title);
    const ghUser = await github<GitHubUser>(githubAccount.accessToken, "/user");
    const storedRepo = parseGitHubRepoUrl(project.codeUrl);
    const reusableRepo = storedRepo
      ? await getRepoIfExists(
          githubAccount.accessToken,
          storedRepo.owner,
          storedRepo.repo,
        )
      : null;
    const resolved = reusableRepo
      ? { repo: reusableRepo, existed: true }
      : await createUniqueRepo({
          token: githubAccount.accessToken,
          owner: ghUser.login,
          baseName: baseRepoName,
          description:
            project.description || `Breadboard project: ${project.title}`,
        });
    repo = resolved.repo;
    repoExisted = resolved.existed;
    repoName = repo.full_name.split("/").pop() ?? baseRepoName;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "GitHub publish failed";
    await audit("github.publish.failure", "project", String(projectId), {
      message,
      storedRepoUrl: project.codeUrl || null,
    });
    return error(message, (err as GitHubError).status === 422 ? 422 : 502);
  }

  const [journals, activityTotal] = await Promise.all([
    db
      .select({
        content: projectJournals.content,
        createdAt: projectJournals.createdAt,
      })
      .from(projectJournals)
      .where(eq(projectJournals.projectId, projectId))
      .orderBy(asc(projectJournals.createdAt)),
    db
      .select({ seconds: editorActivitySessions.activeSeconds })
      .from(editorActivitySessions)
      .where(eq(editorActivitySessions.projectId, projectId)),
  ]);
  const totalSeconds = activityTotal.reduce(
    (sum, row) => sum + (row.seconds ?? 0),
    0,
  );
  const hours = Math.max(
    1,
    Math.round(
      (project.hoursSpent > 0 ? project.hoursSpent : totalSeconds / 3600) * 10,
    ) / 10,
  );

  const readme = buildReadme({
    title: project.title,
    description: project.description,
    howToUse,
    demoUrl,
    videoUrl,
    screenshotUrl: project.screenshotUrl,
    editorData,
    hours,
    journals,
  });
  const repoOwner = repo.full_name.split("/")[0] ?? "";
  await putFile({
    token: githubAccount.accessToken,
    owner: repoOwner,
    repo: repoName,
    path: "README.md",
    content: readme,
    message: "Publish Breadboard README",
  });

  if (editorData) {
    await putFile({
      token: githubAccount.accessToken,
      owner: repoOwner,
      repo: repoName,
      path: "breadboard-project.json",
      content: JSON.stringify(editorData, null, 2),
      message: "Overwrite Breadboard editor snapshot",
    });

    for (const file of flattenFiles(editorData.fileGroups)) {
      await putFile({
        token: githubAccount.accessToken,
        owner: repoOwner,
        repo: repoName,
        path: `firmware/${file.name}`,
        content: file.content,
        message: `Overwrite firmware ${file.name}`,
      });
    }
  }

  await db
    .update(projects)
    .set({
      codeUrl: repo.html_url,
      howToUse,
      playableUrl: demoUrl,
      demoVideoUrl:
        typeof body.videoUrl === "string" && body.videoUrl.trim()
          ? body.videoUrl.trim()
          : project.demoVideoUrl,
      updatedAt: new Date(),
    })
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    );

  await audit(
    repoExisted ? "github.publish.update" : "github.publish.create",
    "project",
    String(projectId),
    {
      repoUrl: repo.html_url,
      fullName: repo.full_name,
      storedRepoUrl: project.codeUrl || null,
    },
  );

  return NextResponse.json({
    repoUrl: repo.html_url,
    fullName: repo.full_name,
    repoExisted,
  });
}
