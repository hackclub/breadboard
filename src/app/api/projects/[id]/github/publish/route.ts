import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guards";
import { assertHackClubYswsEligible } from "@/lib/auth/hackclub";
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
import { toPublicProjectData } from "@/lib/editor/public-project";
import {
  GITHUB_HEADERS,
  type GitHubError,
  type GitHubRepo,
  type GitHubUser,
  github,
  parseGitHubRepoUrl,
  putFile,
} from "@/lib/github/contents";
import { GITHUB_PUBLISH_PROVIDER_ID } from "@/lib/github/oauth";
import {
  normalizeBomItems,
  parseStoredBom,
  serializeBom,
} from "@/lib/projects/bom";
import {
  buildBom,
  buildJournalsMarkdown,
  buildReadme,
  projectReadmeHours,
  syncScreenshotToRepo,
} from "@/lib/projects/githubReadme";
import { publishStaticShare, staticPlayUrl } from "@/lib/projects/sharePublish";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function publicBaseUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    request.url
  );
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
  try {
    await assertHackClubYswsEligible(session.user.id);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Forbidden", 403);
  }

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
  const origin = new URL(publicBaseUrl(request)).origin;
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
  // Dynamic /share link: the page where the project actually runs in the
  // simulator. Goes in the README next to the durable render-only Pages URL
  // (staticPlayUrl), and doubles as the playableUrl fallback if the static
  // publish below fails.
  const shareFallbackUrl = `${origin}/share/${projectId}`;
  const editorData = project.editorData
    ? toPublicProjectData(
        JSON.parse(project.editorData) as Record<string, unknown>,
      )
    : null;
  // An array in the body is authoritative (an empty one clears the custom
  // BOM and falls back to the schematic); anything else keeps the saved BOM.
  const bomItems = Array.isArray(body.bom)
    ? normalizeBomItems(body.bom)
    : parseStoredBom(project.bom);
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

  const repoOwner = repo.full_name.split("/")[0] ?? "";
  // Durable, server-independent play link (GitHub Pages, published below). The
  // URL is deterministic (central repo path, or student repo), so it can go in
  // the README before Pages finishes building. Empty if hosting isn't
  // configured yet — buildReadme just omits the "Try it" line in that case.
  const playUrl = staticPlayUrl({
    projectId,
    studentOwner: repoOwner,
    studentRepo: repoName,
  });

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
  const hours = projectReadmeHours(project.hoursSpent, totalSeconds);

  // Committed into the repo so the README image renders on GitHub no matter
  // where the app is hosted (and keeps rendering if it goes away). Returns ""
  // when there's no screenshot; the README then omits the image line.
  const screenshotPath = await syncScreenshotToRepo({
    token: githubAccount.accessToken,
    owner: repoOwner,
    repo: repoName,
    screenshotUrl: project.screenshotUrl,
  });

  const readme = buildReadme({
    title: project.title,
    description: project.description,
    howToUse,
    demoUrl: playUrl,
    simulateUrl: shareFallbackUrl,
    videoUrl,
    screenshotUrl: screenshotPath,
    bom: buildBom(bomItems, editorData),
    hours,
  });
  const journalsMarkdown = buildJournalsMarkdown(project.title, journals);
  await putFile({
    token: githubAccount.accessToken,
    owner: repoOwner,
    repo: repoName,
    path: "README.md",
    content: readme,
    message: "Publish Breadboard README",
  });
  await putFile({
    token: githubAccount.accessToken,
    owner: repoOwner,
    repo: repoName,
    path: "journals.md",
    content: journalsMarkdown,
    message: "Publish Breadboard journals",
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

  // Publish the fully static, server-independent play page into the repo and
  // enable GitHub Pages. On success the durable Pages URL becomes the playable
  // link; on failure we keep the dynamic /share fallback so submission isn't
  // blocked by a transient GitHub Pages hiccup.
  let playableUrl = shareFallbackUrl;
  if (project.editorData) {
    try {
      const { pagesUrl } = await publishStaticShare({
        projectId,
        title: project.title,
        description: project.description,
        editorData: project.editorData,
        // Used only in "student" hosting mode; ignored in "central" mode.
        studentToken: githubAccount.accessToken,
        studentOwner: repoOwner,
        studentRepo: repoName,
      });
      playableUrl = pagesUrl;
    } catch (err) {
      await audit(
        "github.publish.static_share_failed",
        "project",
        String(projectId),
        { message: err instanceof Error ? err.message : "unknown" },
      );
    }
  }

  await db
    .update(projects)
    .set({
      codeUrl: repo.html_url,
      howToUse,
      ...(Array.isArray(body.bom) ? { bom: serializeBom(bomItems) } : {}),
      playableUrl,
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
