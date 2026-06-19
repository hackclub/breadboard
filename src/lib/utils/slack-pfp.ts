export function slackPfpUrl(slackId: string | null | undefined): string | null {
  if (!slackId) return null;
  return `https://cachet.dunkirk.sh/users/${slackId}/r`;
}
