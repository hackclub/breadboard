import "server-only";

const HACKATIME_BASE_URL = "https://hackatime.hackclub.com";

type HackatimeStats = {
  data?: {
    username?: string;
    total_seconds?: number;
    projects?: Array<{ name?: string; total_seconds?: number; seconds?: number }>;
  };
  // Some deployments return stats at the top level rather than under `data`.
  username?: string;
  total_seconds?: number;
  projects?: Array<{ name?: string; total_seconds?: number; seconds?: number }>;
};

export type HackatimePull = {
  username: string;
  projectName: string;
  seconds: number;
};

function normalizeSeconds(project: {
  total_seconds?: number;
  seconds?: number;
}) {
  return Math.max(0, Math.floor(project.total_seconds ?? project.seconds ?? 0));
}

/**
 * Pulls a single Hackatime project's tracked seconds for a user, using the
 * user's personal API key. WakaTime-compatible: GET /api/v1/users/{user}/stats
 * returns total_seconds plus a projects[] breakdown. Lapse time syncs into
 * Hackatime, so this covers both. We never persist the API key, only the
 * resulting seconds.
 */
export async function fetchHackatimeProjectSeconds(
  apiKey: string,
  username: string,
  projectName: string,
): Promise<HackatimePull> {
  const key = apiKey.trim();
  const user = username.trim();
  const project = projectName.trim();
  if (!key) throw new Error("Enter your Hackatime API key.");
  if (!user) throw new Error("Enter your Hackatime username.");
  if (!project) throw new Error("Enter the Hackatime project name.");

  const target = user === "current" ? "current" : encodeURIComponent(user);
  let res: Response;
  try {
    res = await fetch(
      `${HACKATIME_BASE_URL}/api/v1/users/${target}/stats?features=projects`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("Could not reach Hackatime. Try again.");
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error("Hackatime rejected that API key. Double-check it.");
  }
  if (!res.ok) {
    throw new Error("Hackatime returned an error. Try again later.");
  }

  const body = (await res.json().catch(() => null)) as HackatimeStats | null;
  if (!body) throw new Error("Hackatime returned an unexpected response.");

  const stats = body.data ?? body;
  const projects = stats.projects ?? [];
  const match = projects.find(
    (entry) => (entry.name ?? "").trim().toLowerCase() === project.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `No Hackatime project named "${project}" found for that account. Check the exact name in your Hackatime dashboard.`,
    );
  }

  return {
    username: stats.username?.trim() || user,
    projectName: (match.name ?? project).trim(),
    seconds: normalizeSeconds(match),
  };
}
