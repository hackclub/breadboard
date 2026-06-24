import { randomUUID } from "node:crypto";

export const GITHUB_PUBLISH_PROVIDER_ID = "github-publish";
export const GITHUB_PUBLISH_STATE_COOKIE = "breadboard_github_publish_state";
export const GITHUB_PUBLISH_RETURN_COOKIE = "breadboard_github_publish_return";

export function githubOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() ?? "";
  return { clientId, clientSecret };
}

export function createGitHubOAuthState() {
  return randomUUID();
}

export function safeReturnTo(value: string | null) {
  if (!value) return "/platform/projects";
  if (!value.startsWith("/")) return "/platform/projects";
  if (value.startsWith("//")) return "/platform/projects";
  return value;
}
