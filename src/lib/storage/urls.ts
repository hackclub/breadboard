export function storageReadUrl(value: string) {
  if (!value) return value;
  if (value.startsWith("/demo/")) return value;
  if (value.startsWith("/api/uploads/")) return value;
  try {
    const url = new URL(value);
    const publicBase = process.env.NEXT_PUBLIC_S3_PUBLIC_URL;
    const fallbackHost = "silo.deployor.dev";
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
