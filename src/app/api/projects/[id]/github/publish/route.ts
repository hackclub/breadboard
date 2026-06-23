import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { account, projects } from "@/lib/db/schema";
import {
  enforceSameOrigin,
  hasAllowedContentLength,
} from "@/lib/editor/security";

type GitHubUser = { login: string };
type GitHubRepo = { html_url: string; full_name: string };
type GitHubContent = { sha?: string };

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
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "breadboard-project"
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
    } | null;
    throw new Error(body?.message ?? `GitHub request failed: ${res.status}`);
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
  demoUrl,
  videoUrl,
  editorData,
}: {
  title: string;
  description: string;
  demoUrl: string;
  videoUrl: string;
  editorData: Record<string, unknown> | null;
}) {
  return `# ${title}

${description || "Describe what your project is and what makes it interesting."}

## What It Does

Explain the goal of the project, what inputs it uses, and what outputs it controls.

## How It Works

Describe the circuit, firmware, and any important design decisions.

## How To Use It

1. Wire the project using the schematic in this repository.
2. Upload the firmware from the \`firmware/\` folder.
3. Power the board and test each input/output.

## Demo

${demoUrl ? `Try it here: ${demoUrl}` : "Add a playable/demo link here if you have one."}

${videoUrl ? `Video: ${videoUrl}` : "Add a photo/video of the physical build here after the kit arrives."}

## Wiring / Schematic

The editor snapshot is saved in \`breadboard-project.json\`. Add an exported image or screenshot here before final review.

## Bill of Materials

${buildBom(editorData)}

## Firmware

Firmware files are in \`firmware/\`.

## Build Journal

- Initial project published from Breadboard.
- Add notes, photos, and debugging discoveries as you build.
`;
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
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    )
    .limit(1);
  if (!project) return error("Project not found", 404);

  const [githubAccount] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "github"),
      ),
    )
    .limit(1);

  if (!githubAccount?.accessToken) {
    return NextResponse.json({ needsGitHubAuth: true }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  let videoUrl = "";
  try {
    videoUrl = optionalUrl(body.videoUrl);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Invalid URL", 400);
  }
  const origin = new URL(request.url).origin;
  const demoUrl = `${origin}/share/${projectId}`;
  const editorData = project.editorData
    ? (JSON.parse(project.editorData) as Record<string, unknown>)
    : null;
  const repoName = slugify(`${project.title}-${project.id}`);
  const ghUser = await github<GitHubUser>(githubAccount.accessToken, "/user");

  let repo: GitHubRepo;
  try {
    repo = await github<GitHubRepo>(githubAccount.accessToken, "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: repoName,
        description:
          project.description || `Breadboard project: ${project.title}`,
        private: false,
        auto_init: false,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!message.toLowerCase().includes("name already exists")) throw err;
    repo = await github<GitHubRepo>(
      githubAccount.accessToken,
      `/repos/${ghUser.login}/${repoName}`,
    );
  }

  const readme = buildReadme({
    title: project.title,
    description: project.description,
    demoUrl,
    videoUrl,
    editorData,
  });
  await putFile({
    token: githubAccount.accessToken,
    owner: ghUser.login,
    repo: repoName,
    path: "README.md",
    content: readme,
    message: "Publish Breadboard README",
  });

  if (editorData) {
    await putFile({
      token: githubAccount.accessToken,
      owner: ghUser.login,
      repo: repoName,
      path: "breadboard-project.json",
      content: JSON.stringify(editorData, null, 2),
      message: "Overwrite Breadboard editor snapshot",
    });

    for (const file of flattenFiles(editorData.fileGroups)) {
      await putFile({
        token: githubAccount.accessToken,
        owner: ghUser.login,
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
      playableUrl: demoUrl,
      demoVideoUrl: videoUrl || project.demoVideoUrl,
      updatedAt: new Date(),
    })
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
    );

  return NextResponse.json({
    repoUrl: repo.html_url,
    fullName: repo.full_name,
  });
}
