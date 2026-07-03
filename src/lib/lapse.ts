import "server-only";

// Lapse integration, modeled on hackclub/fallout's LapseService. Per-user
// OAuth (PKCE): the user connects their Lapse account, we store the access
// token, then read their timelapses so reviewers can watch every one.

const LAPSE_BASE_URL =
  process.env.LAPSE_BASE_URL ?? "https://api.lapse.hackclub.com";
const CLIENT_ID = process.env.LAPSE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.LAPSE_CLIENT_SECRET ?? "";
// Program key issued by the Lapse team: server-side reads of any user's
// published timelapses by their Hack Club email, no per-user OAuth needed.
const PROGRAM_KEY = process.env.LAPSE_PROGRAM_KEY ?? "";
const SCOPE = "user:read timelapse:read";

export function lapseOAuthConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function lapseProgramKeyConfigured() {
  return Boolean(PROGRAM_KEY);
}

export function lapseConfigured() {
  return lapseOAuthConfigured() || lapseProgramKeyConfigured();
}

export function lapseAuthorizeUrl(options: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: SCOPE,
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${LAPSE_BASE_URL}/api/auth/authorize?${params.toString()}`;
}

export type LapseToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

type RawTokenResponse = {
  access_token?: string;
  refresh_token?: string | null;
  expires_in?: number;
  data?: {
    access_token?: string;
    refresh_token?: string | null;
    expires_in?: number;
  };
};

export async function exchangeCodeForToken(options: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<LapseToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code_verifier: options.codeVerifier,
  });
  const res = await fetch(`${LAPSE_BASE_URL}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Lapse token exchange failed.");
  const json = (await res.json().catch(() => null)) as RawTokenResponse | null;
  const payload = json?.data ?? json ?? {};
  const accessToken = payload.access_token;
  if (!accessToken) throw new Error("Lapse did not return an access token.");
  const expiresIn = Number(payload.expires_in ?? 0);
  return {
    accessToken,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
  };
}

export type LapseTimelapse = {
  id: string;
  name: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  hackatimeProject: string;
  recordedAt: Date | null;
};

type RawTimelapse = {
  id?: string | number;
  name?: string | null;
  playbackUrl?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  createdAt?: number | null;
  private?: { hackatimeProject?: string | null } | null;
};

type RawTimelapseList = {
  data?: { timelapses?: RawTimelapse[] };
  timelapses?: RawTimelapse[];
};

function normalizeTimelapse(raw: RawTimelapse): LapseTimelapse | null {
  if (raw.id === undefined || raw.id === null) return null;
  return {
    id: String(raw.id),
    name: (raw.name ?? "").trim(),
    playbackUrl: (raw.playbackUrl ?? "").trim(),
    thumbnailUrl: (raw.thumbnailUrl ?? "").trim(),
    durationSeconds: Math.max(0, Math.floor(Number(raw.duration ?? 0))),
    hackatimeProject: (raw.private?.hackatimeProject ?? "").trim(),
    recordedAt:
      typeof raw.createdAt === "number" ? new Date(raw.createdAt) : null,
  };
}

// Reads the user's published timelapses. Optionally filters to those tagged
// with a given Hackatime project so a build's timelapses line up with its
// tracked hours.
export async function fetchPublishedTimelapses(
  accessToken: string,
  options: { hackatimeProject?: string; limit?: number } = {},
): Promise<LapseTimelapse[]> {
  const limit = options.limit ?? 100;
  const res = await fetch(
    `${LAPSE_BASE_URL}/api/timelapse/myPublishedTimelapses?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error("LAPSE_REAUTH");
  }
  if (!res.ok) throw new Error("Could not load your Lapse timelapses.");
  const json = (await res.json().catch(() => null)) as RawTimelapseList | null;
  const list = json?.data?.timelapses ?? json?.timelapses ?? [];
  const timelapses = (Array.isArray(list) ? list : [])
    .map(normalizeTimelapse)
    .filter((entry): entry is LapseTimelapse => entry !== null);
  const wanted = options.hackatimeProject?.trim().toLowerCase();
  if (!wanted) return timelapses;
  return timelapses.filter(
    (entry) => entry.hackatimeProject.toLowerCase() === wanted,
  );
}

export type LapseUser = {
  id: string;
  handle: string;
  displayName: string;
  slackId: string;
};

type RawLapseUser = {
  id?: string | number;
  handle?: string | null;
  displayName?: string | null;
  slackId?: string | null;
};

type RawUserLookup = {
  data?: { user?: RawLapseUser | null } | null;
  user?: RawLapseUser | null;
};

function normalizeLapseUser(raw: RawLapseUser | null | undefined) {
  if (!raw || raw.id === undefined || raw.id === null) return null;
  return {
    id: String(raw.id),
    handle: (raw.handle ?? "").trim(),
    displayName: (raw.displayName ?? "").trim(),
    slackId: (raw.slackId ?? "").trim(),
  } satisfies LapseUser;
}

async function lookupLapseUser(path: string): Promise<LapseUser | null> {
  if (!PROGRAM_KEY) return null;
  const res = await fetch(`${LAPSE_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${PROGRAM_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as RawUserLookup | null;
  return normalizeLapseUser(json?.data?.user ?? json?.user);
}

// Program-key lookups (fallout's server-side flow). Email is case-sensitive on
// Lapse's side, so try the exact form then lowercase.
export async function queryLapseUserByEmail(
  email: string,
): Promise<LapseUser | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const exact = await lookupLapseUser(
    `/api/user/queryByEmail?email=${encodeURIComponent(trimmed)}`,
  );
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  if (lower === trimmed) return null;
  return await lookupLapseUser(
    `/api/user/queryByEmail?email=${encodeURIComponent(lower)}`,
  );
}

export async function queryLapseUserByHandle(
  handle: string,
): Promise<LapseUser | null> {
  const trimmed = handle.trim().replace(/^@/, "");
  if (!trimmed) return null;
  return await lookupLapseUser(
    `/api/user/query?handle=${encodeURIComponent(trimmed)}`,
  );
}

export async function fetchTimelapsesByLapseUserId(
  lapseUserId: string,
): Promise<LapseTimelapse[]> {
  if (!PROGRAM_KEY) return [];
  const res = await fetch(
    `${LAPSE_BASE_URL}/api/timelapse/findByUser?user=${encodeURIComponent(lapseUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${PROGRAM_KEY}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as RawTimelapseList | null;
  const list = json?.data?.timelapses ?? json?.timelapses ?? [];
  return (Array.isArray(list) ? list : [])
    .map(normalizeTimelapse)
    .filter((entry): entry is LapseTimelapse => entry !== null);
}

// Preferred read path: the user's own OAuth token when connected, otherwise
// the program key with a resolved Lapse user id. Throws LAPSE_REAUTH only for
// an expired OAuth token; program-key misses just return [].
export async function fetchTimelapsesForUser(options: {
  accessToken: string | null;
  lapseUserId: string | null;
}): Promise<LapseTimelapse[]> {
  if (options.accessToken) {
    return await fetchPublishedTimelapses(options.accessToken);
  }
  if (!PROGRAM_KEY || !options.lapseUserId) return [];
  return await fetchTimelapsesByLapseUserId(options.lapseUserId);
}
