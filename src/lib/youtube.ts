// YouTube helpers for attaching build videos to journal entries. No API key
// needed: we parse the video id from a URL and derive the watch + thumbnail
// URLs directly.

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (VIDEO_ID.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return VIDEO_ID.test(id) ? id : null;
    }
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      if (url.pathname === "/watch") {
        const v = url.searchParams.get("v");
        return v && VIDEO_ID.test(v) ? v : null;
      }
      const match = url.pathname.match(
        /^\/(?:shorts|embed|v|live)\/([a-zA-Z0-9_-]{11})/,
      );
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function youtubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// Parses a blob of text (newlines/commas/spaces) into unique valid video ids.
export function parseYouTubeVideoIds(input: string): string[] {
  const ids = input
    .split(/[\s,]+/)
    .map((part) => parseYouTubeVideoId(part))
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids));
}
