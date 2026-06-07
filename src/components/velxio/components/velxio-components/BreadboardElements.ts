// @ts-nocheck
import {
  BREADBOARD_COLUMNS,
  BREADBOARD_HEIGHT,
  BREADBOARD_HOLE_SPACING,
  BREADBOARD_MARGIN_X,
  type BreadboardSize,
  getBreadboardWidth,
  makeBreadboardPinInfo,
} from "@/lib/velxio/utils/breadboard";

const STYLE = ":host{display:inline-block;line-height:0}";
const BOARD_FILL = "#eeefed";
const GROOVE = "#e3e3e3";
const RED = "#f97466";
const BLUE = "#55d2fd";
const LABEL = "#1a1a1a";

function holeX(column: number): number {
  return BREADBOARD_MARGIN_X + (column - 1) * BREADBOARD_HOLE_SPACING;
}

function railY(rail: "TP" | "TN" | "BP" | "BN"): number {
  return { TP: 17, TN: 30, BP: 188, BN: 201 }[rail];
}

function rowY(row: string): number {
  const topRows = ["a", "b", "c", "d", "e"];
  const bottomRows = ["f", "g", "h", "i", "j"];
  const topIndex = topRows.indexOf(row);
  if (topIndex >= 0) return 52 + topIndex * 10;
  const bottomIndex = bottomRows.indexOf(row);
  if (bottomIndex >= 0) return 125 + bottomIndex * 10;
  return 0;
}

function hole(cx: number, cy: number, r = 1.95): string {
  return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="0.8" fill="#111" opacity="0.5"/>`;
}

function holes(rows: readonly string[], columns: number): string {
  const parts: string[] = [];
  for (const row of rows) {
    for (let column = 1; column <= columns; column += 1) {
      parts.push(hole(holeX(column), rowY(row)));
    }
  }
  return parts.join("");
}

function railHoles(
  rails: readonly ("TP" | "TN" | "BP" | "BN")[],
  columns: number,
): string {
  const parts: string[] = [];
  for (const rail of rails) {
    for (let column = 1; column <= columns; column += 1) {
      parts.push(hole(holeX(column), railY(rail), 1.8));
    }
  }
  return parts.join("");
}

function rowLabels(rows: readonly string[], x: number): string {
  return rows
    .map(
      (row) =>
        `<text x="${x}" y="${rowY(row) + 2.5}" font-size="7" fill="${LABEL}" opacity="0.55" font-family="sans-serif">${row}</text>`,
    )
    .join("");
}

function columnLabels(columns: number, y: number): string {
  const step = columns > 40 ? 5 : 5;
  const labels: string[] = [];
  for (let column = 1; column <= columns; column += 1) {
    if (column === 1 || column === columns || column % step === 0) {
      labels.push(
        `<text x="${holeX(column) - 2}" y="${y}" font-size="7" fill="${LABEL}" opacity="0.55" font-family="sans-serif">${column}</text>`,
      );
    }
  }
  return labels.join("");
}

function railLine(y: number, color: string, width: number): string {
  return `<rect x="${BREADBOARD_MARGIN_X - 6}" y="${y}" width="${width - BREADBOARD_MARGIN_X * 2 + 12}" height="1" fill="${color}" opacity="0.75"/>`;
}

function polarityMarks(width: number): string {
  return `
    <g stroke-width="1" fill="none">
      <g transform="translate(14 8) scale(0.5)"><line x1="4" x2="17" y1="10.5" y2="10.5" stroke="${RED}"/><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${RED}"/></g>
      <g transform="translate(14 23) scale(0.5)"><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${BLUE}"/></g>
      <g transform="translate(${width - 22} 8) scale(0.5)"><line x1="4" x2="17" y1="10.5" y2="10.5" stroke="${RED}"/><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${RED}"/></g>
      <g transform="translate(${width - 22} 23) scale(0.5)"><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${BLUE}"/></g>
      <g transform="translate(14 180) scale(0.5)"><line x1="4" x2="17" y1="10.5" y2="10.5" stroke="${RED}"/><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${RED}"/></g>
      <g transform="translate(14 195) scale(0.5)"><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${BLUE}"/></g>
      <g transform="translate(${width - 22} 180) scale(0.5)"><line x1="4" x2="17" y1="10.5" y2="10.5" stroke="${RED}"/><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${RED}"/></g>
      <g transform="translate(${width - 22} 195) scale(0.5)"><line y1="4" y2="17" x1="10.5" x2="10.5" stroke="${BLUE}"/></g>
    </g>`;
}

function breadboardSvg(size: BreadboardSize): string {
  const columns = BREADBOARD_COLUMNS[size];
  const width = getBreadboardWidth(size);
  const bodyWidth = width - 2;
  const label =
    size === "mini" ? "mini" : size === "half" ? "half-size" : "full-size";
  return `
    <style>${STYLE}</style>
    <svg width="${width}" height="${BREADBOARD_HEIGHT}" viewBox="0 0 ${width} ${BREADBOARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect fill="${BOARD_FILL}" width="${bodyWidth}" height="${BREADBOARD_HEIGHT - 1}" x="1" y="1" rx="5"/>
      <rect x="9" y="100" width="${width - 18}" height="7" fill="${GROOVE}"/>
      ${polarityMarks(width)}
      ${railLine(13, RED, width)}
      ${railLine(28, BLUE, width)}
      ${railLine(185, RED, width)}
      ${railLine(200, BLUE, width)}
      ${railHoles(["TP", "TN", "BP", "BN"], columns)}
      ${rowLabels(["a", "b", "c", "d", "e"], 14)}
      ${rowLabels(["a", "b", "c", "d", "e"], width - 21)}
      ${rowLabels(["f", "g", "h", "i", "j"], 14)}
      ${rowLabels(["f", "g", "h", "i", "j"], width - 21)}
      ${columnLabels(columns, 42)}
      ${columnLabels(columns, 178)}
      <rect x="${BREADBOARD_MARGIN_X - 6}" y="47" width="${width - BREADBOARD_MARGIN_X * 2 + 12}" height="50" fill="transparent"/>
      <rect x="${BREADBOARD_MARGIN_X - 6}" y="120" width="${width - BREADBOARD_MARGIN_X * 2 + 12}" height="50" fill="transparent"/>
      ${holes(["a", "b", "c", "d", "e"], columns)}
      ${holes(["f", "g", "h", "i", "j"], columns)}
      <text x="${width / 2}" y="117" text-anchor="middle" font-family="sans-serif" font-size="8" fill="${LABEL}" opacity="0.3">${label} breadboard</text>
    </svg>`;
}

function makeBreadboardClass(size: BreadboardSize) {
  return class extends HTMLElement {
    readonly pinInfo = makeBreadboardPinInfo(size);
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML = breadboardSvg(size);
    }
  };
}

const definitions: Array<[string, BreadboardSize]> = [
  ["velxio-breadboard-mini", "mini"],
  ["velxio-breadboard-half", "half"],
  ["velxio-breadboard-full", "full"],
];

for (const [tag, size] of definitions) {
  if (!customElements.get(tag))
    customElements.define(tag, makeBreadboardClass(size));
}

export {};
