export function storageReadUrl(value: string) {
  if (!value) return value;
  if (value.startsWith("/demo/")) return value;
  if (value.startsWith("/api/uploads/")) return value;
  try {
    const url = new URL(value);
    const publicBase = process.env.NEXT_PUBLIC_S3_PUBLIC_URL;
    const fallbackHost = "onsilo.dev";
    if (publicBase && value.startsWith(publicBase.replace(/\/$/, "/"))) {
      return `/api/uploads/${value.slice(publicBase.replace(/\/$/, "/").length)}`;
    }
    if (url.hostname === fallbackHost) {
      const parts = url.pathname.split("/").filter(Boolean);
      return `/api/uploads/${parts.slice(1).join("/")}`;
    }
  } catch {
    return value;
  }
  return value;
}

// Normalize a stored image reference to something <Image> can render: a
// root-relative /api/uploads path or an http(s) URL, or null if it's neither.
export function safeImageUrl(value: string): string | null {
  const storageUrl = storageReadUrl(value);
  if (storageUrl.startsWith("/")) return storageUrl;
  try {
    const url = new URL(storageUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Uploaded images (/api/uploads/*) 302-redirect to presigned S3 URLs, which
// Next's image optimizer can't follow ("internal image response is empty"), so
// they must render unoptimized. Only the allowlisted CDN hosts get optimized.
export function shouldOptimizeImage(src: string): boolean {
  if (src.startsWith("/api/uploads/")) return false;
  try {
    const { hostname, protocol } = new URL(src);
    return (
      protocol === "https:" &&
      (hostname === "cdn.hackclub.com" || hostname === "assets.hackclub.com")
    );
  } catch {
    return false;
  }
}
