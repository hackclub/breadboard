// @ts-nocheck
export type BreadboardSize = "mini" | "half" | "full";

export const BREADBOARD_IDS: Record<BreadboardSize, string> = {
  mini: "breadboard-mini",
  half: "breadboard-half",
  full: "breadboard-full",
};

export const BREADBOARD_COLUMNS: Record<BreadboardSize, number> = {
  mini: 17,
  half: 30,
  full: 63,
};

export const BREADBOARD_HOLE_SPACING = 9.6;
export const BREADBOARD_MARGIN_X = 25;
export const BREADBOARD_HEIGHT = 208;

const TOP_ROWS = ["A", "B", "C", "D", "E"] as const;
const BOTTOM_ROWS = ["F", "G", "H", "I", "J"] as const;
const RAILS = ["TP", "TN", "BP", "BN"] as const;

export type BreadboardPinInfo = {
  name: string;
  x: number;
  y: number;
  number: number;
  signals: string[];
};

export function getBreadboardSize(metadataId: string): BreadboardSize | null {
  if (metadataId === BREADBOARD_IDS.mini) return "mini";
  if (metadataId === BREADBOARD_IDS.half) return "half";
  if (metadataId === BREADBOARD_IDS.full) return "full";
  if (metadataId === "breadboard") return "half";
  return null;
}

export function getBreadboardWidth(size: BreadboardSize): number {
  return Math.round(
    BREADBOARD_MARGIN_X * 2 +
      (BREADBOARD_COLUMNS[size] - 1) * BREADBOARD_HOLE_SPACING +
      28,
  );
}

export function isBreadboard(metadataId: string): boolean {
  return getBreadboardSize(metadataId) !== null;
}

function holeX(column: number): number {
  return BREADBOARD_MARGIN_X + (column - 1) * BREADBOARD_HOLE_SPACING;
}

function holeY(row: string): number {
  if (row === "TP") return 17;
  if (row === "TN") return 30;
  if (row === "BP") return 188;
  if (row === "BN") return 201;
  const topIndex = TOP_ROWS.indexOf(row as (typeof TOP_ROWS)[number]);
  if (topIndex >= 0) return 52 + topIndex * 10;
  const bottomIndex = BOTTOM_ROWS.indexOf(row as (typeof BOTTOM_ROWS)[number]);
  if (bottomIndex >= 0) return 125 + bottomIndex * 10;
  return 0;
}

export function makeBreadboardPinInfo(
  size: BreadboardSize,
): BreadboardPinInfo[] {
  const columns = BREADBOARD_COLUMNS[size];
  const pins: BreadboardPinInfo[] = [];
  let number = 1;
  for (const rail of RAILS) {
    for (let column = 1; column <= columns; column += 1) {
      pins.push({
        name: `${rail}${column}`,
        x: holeX(column),
        y: holeY(rail),
        number: number++,
        signals: [],
      });
    }
  }
  for (const row of TOP_ROWS) {
    for (let column = 1; column <= columns; column += 1) {
      pins.push({
        name: `${row}${column}`,
        x: holeX(column),
        y: holeY(row),
        number: number++,
        signals: [],
      });
    }
  }
  for (const row of BOTTOM_ROWS) {
    for (let column = 1; column <= columns; column += 1) {
      pins.push({
        name: `${row}${column}`,
        x: holeX(column),
        y: holeY(row),
        number: number++,
        signals: [],
      });
    }
  }
  return pins;
}

function parsePin(
  pinName: string,
  size: BreadboardSize,
): { row: string; column: number } | null {
  const match = /^([A-J]|TP|TN|BP|BN)(\d{1,2})$/.exec(pinName);
  if (!match) return null;
  const column = Number(match[2]);
  if (
    !Number.isInteger(column) ||
    column < 1 ||
    column > BREADBOARD_COLUMNS[size]
  )
    return null;
  return { row: match[1], column };
}

export function getBreadboardConnectedPins(
  metadataId: string,
  pinName: string,
): string[] {
  const size = getBreadboardSize(metadataId);
  if (!size) return [];
  const parsed = parsePin(pinName, size);
  if (!parsed) return [];
  const { row, column } = parsed;
  const columns = BREADBOARD_COLUMNS[size];
  if ((RAILS as readonly string[]).includes(row)) {
    return Array.from(
      { length: columns },
      (_, index) => `${row}${index + 1}`,
    ).filter((pin) => pin !== pinName);
  }
  if ((TOP_ROWS as readonly string[]).includes(row)) {
    return TOP_ROWS.map((r) => `${r}${column}`).filter(
      (pin) => pin !== pinName,
    );
  }
  if ((BOTTOM_ROWS as readonly string[]).includes(row)) {
    return BOTTOM_ROWS.map((r) => `${r}${column}`).filter(
      (pin) => pin !== pinName,
    );
  }
  return [];
}

export function getBreadboardConnectionGroups(metadataId: string): string[][] {
  const size = getBreadboardSize(metadataId);
  if (!size) return [];
  const columns = BREADBOARD_COLUMNS[size];
  const groups: string[][] = [];
  for (const rail of RAILS) {
    groups.push(
      Array.from({ length: columns }, (_, index) => `${rail}${index + 1}`),
    );
  }
  for (let column = 1; column <= columns; column += 1) {
    groups.push(TOP_ROWS.map((row) => `${row}${column}`));
    groups.push(BOTTOM_ROWS.map((row) => `${row}${column}`));
  }
  return groups;
}
