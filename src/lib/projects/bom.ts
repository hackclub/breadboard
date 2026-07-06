// The bill of materials a user curates in the publish modal's BOM maker.
// Stored on the project as a JSON string; an empty string means the BOM
// should be derived from the schematic components instead.

export type BomItem = { name: string; quantity: number };

export const MAX_BOM_ITEMS = 100;
const MAX_NAME_LENGTH = 120;
const MAX_QUANTITY = 9999;

export function normalizeBomItems(value: unknown): BomItem[] {
  if (!Array.isArray(value)) return [];
  const items: BomItem[] = [];
  for (const entry of value.slice(0, MAX_BOM_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name =
      typeof record.name === "string"
        ? record.name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH)
        : "";
    if (!name) continue;
    const rawQuantity = Number(record.quantity);
    const quantity = Number.isFinite(rawQuantity)
      ? Math.min(MAX_QUANTITY, Math.max(1, Math.round(rawQuantity)))
      : 1;
    items.push({ name, quantity });
  }
  return items;
}

export function parseStoredBom(value: string): BomItem[] {
  if (!value.trim()) return [];
  try {
    return normalizeBomItems(JSON.parse(value));
  } catch {
    return [];
  }
}

export function serializeBom(items: BomItem[]): string {
  const normalized = normalizeBomItems(items);
  return normalized.length ? JSON.stringify(normalized) : "";
}

export function bomToMarkdown(items: BomItem[]): string {
  if (!items.length) return "";
  return [
    "| Part | Quantity |",
    "| --- | --- |",
    ...items.map((item) => `| ${escapeCell(item.name)} | ${item.quantity} |`),
  ].join("\n");
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|");
}
