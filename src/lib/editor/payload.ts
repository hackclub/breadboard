const MAX_EDITOR_BYTES = 5_000_000;
const MAX_JSON_DEPTH = 32;

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isJsonSafe(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH) return false;
  if (value === null) return true;
  const type = typeof value;
  if (type === "string" || type === "boolean") return true;
  if (type === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonSafe(item, depth + 1));
  if (!isPlainJsonObject(value)) return false;

  for (const [key, nested] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return false;
    }
    if (!isJsonSafe(nested, depth + 1)) return false;
  }
  return true;
}

export function validateEditorPayload(value: unknown): string | null {
  if (!isPlainJsonObject(value)) return "Invalid editor data";
  if (!isJsonSafe(value)) return "Invalid editor data";

  if (
    value.format !== "velxio-project" ||
    typeof value.version !== "number" ||
    !Number.isFinite(value.version) ||
    !Array.isArray(value.boards) ||
    !isPlainJsonObject(value.fileGroups) ||
    !Array.isArray(value.components) ||
    !Array.isArray(value.wires)
  ) {
    return "Invalid editor data";
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_EDITOR_BYTES) return "Editor data too large";
  return null;
}
