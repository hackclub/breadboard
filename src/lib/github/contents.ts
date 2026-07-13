import "server-only";

export const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export type GitHubError = Error & { status?: number };
export type GitHubUser = { login: string };
export type GitHubRepo = { html_url: string; full_name: string };

type GitHubFileContent = {
  sha?: string;
  content?: string;
  encoding?: string;
};

export async function github<T>(
  token: string,
  path: string,
  init: RequestInit = {},
) {
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

export function encodeGitHubPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function maybeGetExistingFile(
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
  const file = (await res.json()) as GitHubFileContent;
  return {
    sha: file.sha,
    // GitHub wraps the base64 payload in newlines; strip them so it compares
    // against a freshly encoded body.
    contentBase64:
      file.encoding === "base64" && typeof file.content === "string"
        ? file.content.replace(/\s/g, "")
        : undefined,
  };
}

export async function putFile({
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
  content: string | Buffer;
  message: string;
}) {
  const contentBase64 = Buffer.isBuffer(content)
    ? content.toString("base64")
    : Buffer.from(content, "utf8").toString("base64");
  const existing = await maybeGetExistingFile(token, owner, repo, path);
  // Same bytes already on GitHub: skip the write so repeat syncs don't pile
  // up empty commits.
  if (existing?.contentBase64 === contentBase64) return;
  await github(
    token,
    `/repos/${owner}/${repo}/contents/${encodeGitHubPath(path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: contentBase64,
        ...(existing?.sha ? { sha: existing.sha } : {}),
      }),
    },
  );
}

export function parseGitHubRepoUrl(value: string) {
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
