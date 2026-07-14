// Client-side image shrinking. Screenshots and photos are often multi-megabyte
// at full resolution, which is wasteful to store and can trip the server's
// request-body cap. Downscaling to a sane edge and re-encoding keeps uploads
// small. Anything we can't decode (SVG, exotic formats, decode failure) passes
// through untouched so we never lose an upload trying to optimize it.

export type DownscaleOptions = {
  maxEdge?: number;
  mime?: "image/webp" | "image/jpeg" | "image/png";
  quality?: number;
};

export type DownscaledImage = { blob: Blob; contentType: string };

const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.85;

export async function downscaleImage(
  input: Blob,
  options: DownscaleOptions = {},
): Promise<DownscaledImage> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const mime = options.mime ?? "image/webp";
  const quality = options.quality ?? DEFAULT_QUALITY;
  const fallback: DownscaledImage = {
    blob: input,
    contentType: input.type || mime,
  };

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    return fallback;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    return fallback;
  }

  try {
    const largestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = largestEdge > maxEdge ? maxEdge / largestEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;

    // JPEG has no alpha, so flatten transparency onto white instead of black.
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    );
    if (!encoded) return fallback;

    // A tiny source can come out larger after re-encoding; keep the smaller one.
    if (input.type && encoded.size >= input.size) {
      return { blob: input, contentType: input.type };
    }
    return { blob: encoded, contentType: mime };
  } finally {
    bitmap.close?.();
  }
}
