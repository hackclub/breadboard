// @ts-nocheck
/**
 * Wokwi zip import/export
 *
 * Converts between Wokwi's diagram.json format and Velxio's internal
 * component/wire format, bundling everything into a .zip file.
 *
 * Wokwi zip structure:
 *   diagram.json     — parts + connections
 *   sketch.ino       — main sketch (or projectname.ino)
 *   *.h / *.cpp      — additional files
 *   libraries.txt    — optional library list
 *   wokwi-project.txt — optional metadata
 */

import JSZip from "jszip";
import type { Wire } from "@/lib/velxio/types/wire";

// ── Type definitions ──────────────────────────────────────────────────────────

interface WokwiPart {
  type: string;
  id: string;
  top: number;
  left: number;
  rotate?: number;
  attrs: Record<string, unknown>;
}

interface WokwiDiagram {
  version: number;
  author: string;
  editor: string;
  parts: WokwiPart[];
  connections: [string, string, string, string[]][];
}

export interface VelxioComponent {
  id: string;
  metadataId: string;
  x: number;
  y: number;
  properties: Record<string, unknown>;
}

export interface ImportResult {
  boardType:
    | "arduino-uno"
    | "arduino-nano"
    | "arduino-mega"
    | "raspberry-pi-pico";
  boardPosition: { x: number; y: number };
  components: VelxioComponent[];
  wires: Wire[];
  files: Array<{ name: string; content: string }>;
  /** Library names parsed from libraries.txt. Includes both standard Arduino Library Manager names and Wokwi-hosted entries in the form "LibName@wokwi:hash". */
  libraries: string[];
}

// ── Board mappings ────────────────────────────────────────────────────────────

// Wokwi board type → Velxio boardType
const WOKWI_TYPE_TO_BOARD: Record<
  string,
  "arduino-uno" | "arduino-nano" | "arduino-mega" | "raspberry-pi-pico"
> = {
  "wokwi-arduino-uno": "arduino-uno",
  "wokwi-arduino-nano": "arduino-nano",
  "wokwi-arduino-mega": "arduino-mega",
  "wokwi-raspberry-pi-pico": "raspberry-pi-pico",
};

// Velxio boardType → Wokwi type
const BOARD_TO_WOKWI_TYPE: Record<string, string> = {
  "arduino-uno": "wokwi-arduino-uno",
  "arduino-nano": "wokwi-arduino-nano",
  "arduino-mega": "wokwi-arduino-mega",
  "raspberry-pi-pico": "wokwi-raspberry-pi-pico",
};

// Velxio boardType → default Wokwi part id
const BOARD_TO_WOKWI_ID: Record<string, string> = {
  "arduino-uno": "uno",
  "arduino-nano": "nano",
  "arduino-mega": "mega",
  "raspberry-pi-pico": "pico",
};

// ── Pin name aliases ─────────────────────────────────────────────────────────

// Maps Wokwi connection "signal" pin names to wokwi-element physical pin names.
// Wokwi boards (e.g. board-ssd1306) use different naming than the bare elements.
const COMPONENT_PIN_ALIASES: Record<string, Record<string, string>> = {
  ssd1306: {
    SDA: "DATA",
    SCL: "CLK",
    VCC: "VIN",
  },
};

function normalizePinName(metadataId: string, pinName: string): string {
  return COMPONENT_PIN_ALIASES[metadataId]?.[pinName] ?? pinName;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const COLOR_NAME_TO_HEX: Record<string, string> = {
  red: "#ff0000",
  black: "#000000",
  green: "#00c800",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ff8800",
  white: "#ffffff",
  gray: "#808080",
  grey: "#808080",
  purple: "#800080",
  pink: "#ff69b4",
  cyan: "#00ffff",
  gold: "#ffd700",
  brown: "#8b4513",
  magenta: "#ff00ff",
  lime: "#00ff00",
  violet: "#ee82ee",
  maroon: "#800000",
  navy: "#000080",
  teal: "#008080",
};

const HEX_TO_COLOR_NAME: Record<string, string> = {
  "#ff0000": "red",
  "#000000": "black",
  "#00ff00": "green",
  "#00c800": "green",
  "#0000ff": "blue",
  "#ffff00": "yellow",
  "#ff8800": "orange",
  "#ffffff": "white",
  "#808080": "gray",
  "#800080": "purple",
  "#00ffff": "cyan",
  "#ffd700": "gold",
};

function colorToHex(color: string): string {
  if (!color) return "#888888";
  if (color.startsWith("#")) return color.toLowerCase();
  return COLOR_NAME_TO_HEX[color.toLowerCase()] ?? "#888888";
}

function hexToColorName(hex: string): string {
  return HEX_TO_COLOR_NAME[hex.toLowerCase()] ?? hex;
}

// ── Type conversion ───────────────────────────────────────────────────────────

function wokwiTypeToMetadataId(type: string): string {
  if (type.startsWith("wokwi-")) return type.slice(6);
  if (type.startsWith("board-")) return type.slice(6);
  return type;
}

function metadataIdToWokwiType(metadataId: string): string {
  return `wokwi-${metadataId}`;
}

// ── Library list parser ───────────────────────────────────────────────────────

/**
 * Parse the contents of a Wokwi libraries.txt file.
 * - Strips blank lines and # comments
 * - Includes Wokwi-hosted entries in the form  name@wokwi:hash
 *   so the backend can download and install them from wokwi.com
 */
// A single libraries.txt line: a library name, optionally with a version
// (`@1.2.3`) or a Wokwi hosted marker (`@wokwi:<hash>`). Reject anything with
// control chars / shell metacharacters so a crafted bundle can't smuggle
// surprises into the install requests these names are fanned out to.
const LIBRARY_LINE = /^[\w .+-]{1,120}(@wokwi:[a-zA-Z0-9]{1,64}|@[\w.-]{1,40})?$/;
// Cap the list so a bundle with thousands of lines can't drive thousands of
// sequential backend install calls (client-driven amplification).
const MAX_LIBRARIES = 64;

export function parseLibrariesTxt(content: string): string[] {
  const libs: string[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (!LIBRARY_LINE.test(line)) continue;
    libs.push(line);
    if (libs.length >= MAX_LIBRARIES) break;
  }
  return libs;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportToWokwiZip(
  files: Array<{ name: string; content: string }>,
  components: VelxioComponent[],
  wires: Wire[],
  boardType: string,
  projectName: string,
  boardPosition: { x: number; y: number } = { x: 50, y: 50 },
): Promise<void> {
  const zip = new JSZip();

  const boardWokwiType = BOARD_TO_WOKWI_TYPE[boardType] ?? "wokwi-arduino-uno";
  const boardId = BOARD_TO_WOKWI_ID[boardType] ?? "uno";

  // Build parts — board first, then user components
  // Subtract boardPosition so coords are relative to the board
  const parts: WokwiPart[] = [
    { type: boardWokwiType, id: boardId, top: 0, left: 0, attrs: {} },
    ...components.map((c) => ({
      type: metadataIdToWokwiType(c.metadataId),
      id: c.id,
      top: Math.round(c.y - boardPosition.y),
      left: Math.round(c.x - boardPosition.x),
      attrs: c.properties as Record<string, unknown>,
    })),
  ];

  // Build connections
  const connections: [string, string, string, string[]][] = wires.map((w) => {
    const isBoardStart =
      w.start.componentId === "arduino-uno" ||
      w.start.componentId === "arduino-nano" ||
      w.start.componentId === "nano-rp2040";
    const isBoardEnd =
      w.end.componentId === "arduino-uno" ||
      w.end.componentId === "arduino-nano" ||
      w.end.componentId === "nano-rp2040";
    const startId = isBoardStart ? boardId : w.start.componentId;
    const endId = isBoardEnd ? boardId : w.end.componentId;
    return [
      `${startId}:${w.start.pinName}`,
      `${endId}:${w.end.pinName}`,
      hexToColorName(w.color ?? "#888888"),
      [],
    ];
  });

  const diagram: WokwiDiagram = {
    version: 1,
    author: "Velxio",
    editor: "wokwi",
    parts,
    connections,
  };

  zip.file("diagram.json", JSON.stringify(diagram, null, 2));
  zip.file(
    "wokwi-project.txt",
    `Exported from Velxio\n\nSimulate this project on https://velxio.dev\n`,
  );

  for (const f of files) {
    zip.file(f.name, f.content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(projectName || "velxio-project").replace(/[^a-z0-9_-]/gi, "-")}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importFromWokwiZip(file: File): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);

  // diagram.json is required
  const diagramEntry = zip.file("diagram.json");
  if (!diagramEntry) throw new Error("No diagram.json found in the zip file.");

  const diagramText = await diagramEntry.async("string");
  let parsed: unknown;
  try {
    parsed = JSON.parse(diagramText);
  } catch {
    throw new Error("diagram.json is not valid JSON.");
  }
  // The zip is untrusted input; validate the shape rather than assuming
  // parts/connections exist and are arrays (a missing key otherwise throws a
  // raw TypeError, and non-numeric coords would flow to the canvas as NaN).
  if (!parsed || typeof parsed !== "object") {
    throw new Error("diagram.json must be a JSON object.");
  }
  const diagram = parsed as WokwiDiagram;
  const rawParts = Array.isArray(diagram.parts) ? diagram.parts : [];
  const rawConnections = Array.isArray(diagram.connections)
    ? diagram.connections
    : [];
  // Keep only well-formed parts and coerce coordinates to finite numbers so a
  // missing/garbage left/top can't place a component at NaN,NaN.
  const finite = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const parts = rawParts
    .filter(
      (p): p is WokwiDiagram["parts"][number] =>
        !!p && typeof p === "object" && typeof (p as { type?: unknown }).type === "string",
    )
    .map((p) => ({
      ...p,
      left: finite(p.left),
      top: finite(p.top),
    }));

  // Detect board
  const boardPart = parts.find((p) => WOKWI_TYPE_TO_BOARD[p.type]);
  const boardType = boardPart
    ? WOKWI_TYPE_TO_BOARD[boardPart.type]
    : "arduino-uno";
  const boardId = boardPart?.id ?? "uno";

  // Velxio internal component ID for the board element (must match DOM element id)
  const VELXIO_BOARD_ID: Record<string, string> = {
    "arduino-uno": "arduino-uno",
    "arduino-nano": "arduino-nano",
    "arduino-mega": "arduino-mega",
    "raspberry-pi-pico": "nano-rp2040",
  };
  const velxioBoardId = VELXIO_BOARD_ID[boardType] ?? "arduino-uno";

  // Board position from diagram. Apply a minimum offset so the board is never
  // crammed against the canvas top-left corner (Wokwi diagrams often use 0,0).
  const MIN_OFFSET = 50;
  const rawBoardX = boardPart?.left ?? MIN_OFFSET;
  const rawBoardY = boardPart?.top ?? MIN_OFFSET;
  const offsetX = rawBoardX < MIN_OFFSET ? MIN_OFFSET - rawBoardX : 0;
  const offsetY = rawBoardY < MIN_OFFSET ? MIN_OFFSET - rawBoardY : 0;
  const boardPosition = {
    x: rawBoardX + offsetX,
    y: rawBoardY + offsetY,
  };

  // Convert non-board parts to Velxio components.
  // Apply the same offset so components keep their relative position to the board.
  const components: VelxioComponent[] = parts
    .filter((p) => !WOKWI_TYPE_TO_BOARD[p.type])
    .map((p) => ({
      id: p.id,
      metadataId: wokwiTypeToMetadataId(p.type),
      x: p.left + offsetX,
      y: p.top + offsetY,
      properties: { ...p.attrs },
    }));

  // Convert connections to Velxio wires. Each entry should be
  // [start, end, color, ...]; skip anything that isn't the expected shape so a
  // malformed entry can't throw on .indexOf.
  const wires: Wire[] = rawConnections
    .filter(
      (conn): conn is [string, string, string] =>
        Array.isArray(conn) &&
        typeof conn[0] === "string" &&
        typeof conn[1] === "string",
    )
    .map((conn, i) => {
      const [startStr, endStr, color] = conn;
      const colonA = startStr.indexOf(":");
      const colonB = endStr.indexOf(":");
    const startCompRaw = colonA >= 0 ? startStr.slice(0, colonA) : startStr;
    const startPin = colonA >= 0 ? startStr.slice(colonA + 1) : "";
    const endCompRaw = colonB >= 0 ? endStr.slice(0, colonB) : endStr;
    const endPin = colonB >= 0 ? endStr.slice(colonB + 1) : "";

    // Remap board part id → Velxio internal board id
    const startId = startCompRaw === boardId ? velxioBoardId : startCompRaw;
    const endId = endCompRaw === boardId ? velxioBoardId : endCompRaw;

    // Normalize pin names: Wokwi uses signal names (SDA, SCL, VCC) while
    // wokwi-elements use physical/board pin names (DATA, CLK, VIN).
    const startMetadataId =
      components.find((c) => c.id === startId)?.metadataId ?? "";
    const endMetadataId =
      components.find((c) => c.id === endId)?.metadataId ?? "";
    const normalizedStartPin = normalizePinName(startMetadataId, startPin);
    const normalizedEndPin = normalizePinName(endMetadataId, endPin);

    return {
      id: `wire-${i}-${Date.now()}`,
      start: { componentId: startId, pinName: normalizedStartPin, x: 0, y: 0 },
      end: { componentId: endId, pinName: normalizedEndPin, x: 0, y: 0 },
      waypoints: [],
      color: colorToHex(color),
    };
  });

  // Read code files (.ino, .h, .cpp, .c)
  const CODE_EXTS = new Set([".ino", ".h", ".cpp", ".c"]);
  const files: Array<{ name: string; content: string }> = [];

  for (const [filename, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const basename = filename.split("/").pop() ?? filename;
    const ext = "." + basename.split(".").pop()!.toLowerCase();
    if (CODE_EXTS.has(ext)) {
      const content = await entry.async("string");
      files.push({ name: basename, content });
    }
  }

  // Sort: .ino first, then alphabetically
  files.sort((a, b) => {
    const aIno = a.name.endsWith(".ino");
    const bIno = b.name.endsWith(".ino");
    if (aIno && !bIno) return -1;
    if (!aIno && bIno) return 1;
    return a.name.localeCompare(b.name);
  });

  // Parse libraries.txt
  const libraries: string[] = [];
  const libEntry = zip.file("libraries.txt");
  if (libEntry) {
    libraries.push(...parseLibrariesTxt(await libEntry.async("string")));
  }

  return { boardType, boardPosition, components, wires, files, libraries };
}
