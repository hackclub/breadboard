/**
 * What a maker actually changed between two ships of the same project.
 *
 * Every ship freezes the editor payload into project_editor_versions, so an
 * update ship can be read against the version frozen at the previous ship.
 * That turns "they shipped again" into a concrete list: these files grew by
 * this many lines, this part appeared, that wire moved to another pin.
 *
 * The companion to this is the repo diff (@/lib/github/repo-diff), which does
 * the same job for the linked GitHub repository. This one covers the circuit,
 * which git never sees.
 *
 * Pure and framework-free, like @/lib/editor/codeAuthenticity: it takes two
 * payload strings and returns a plain object, so it can be unit tested and
 * called from a script as easily as from a route.
 */

import componentsMetadata from "../../../public/components-metadata.json";

const PART_NAME_BY_METADATA_ID = new Map<string, string>(
  componentsMetadata.components.map((c) => [c.id, c.name]),
);

/** Enough to read what was written without turning the card into an IDE. */
const MAX_DIFF_LINES_PER_FILE = 60;
/** Above this many LCS cells the table costs more than the answer is worth. */
const MAX_LCS_CELLS = 4_000_000;
/** Long minified or generated lines get clipped rather than breaking layout. */
const MAX_LINE_CHARS = 400;

/** One changed line of firmware, so the card can show the code itself. */
export type ShipDiffLine = {
  kind: "add" | "del";
  text: string;
};

export type ShipFileChange = {
  /** "groupId/filename", the same key code-authenticity uses. */
  path: string;
  status: "added" | "modified" | "removed";
  addedLines: number;
  removedLines: number;
  /** The changed lines themselves, capped at MAX_DIFF_LINES_PER_FILE. A count
      alone doesn't tell a reviewer whether 40 new lines are real work or a
      pasted library. */
  lines: ShipDiffLine[];
  /** True when `lines` was cut short; the counts above are still complete. */
  linesTruncated: boolean;
};

export type ShipPartChange = {
  id: string;
  label: string;
  status: "added" | "removed" | "reconfigured";
  /** Plain-language "what about it changed", empty for added/removed. */
  detail: string;
};

export type ShipWireChange = {
  id: string;
  status: "added" | "removed" | "rerouted";
  from: string;
  to: string;
};

export type ShipEditorDiff = {
  files: ShipFileChange[];
  addedLines: number;
  removedLines: number;
  parts: ShipPartChange[];
  /** Parts that only slid around the canvas. Counted, never listed: a nudged
      LED is not a change a reviewer needs to read about. */
  movedParts: number;
  wires: ShipWireChange[];
  boards: { added: string[]; removed: string[] };
  /** True when the two payloads describe the same project, byte differences
      in layout and editor chrome aside. */
  empty: boolean;
  summary: string;
};

type Part = {
  id: string;
  metadataId: string;
  label: string;
  x: number;
  y: number;
  properties: Record<string, unknown>;
};

type Wire = {
  id: string;
  from: string;
  to: string;
  color: string;
  /** Everything that would make the same wire read differently on the canvas. */
  shape: string;
};

type Payload = {
  files: Map<string, string>;
  parts: Map<string, Part>;
  wires: Map<string, Wire>;
  boards: Map<string, string>;
};

const EMPTY_PAYLOAD: Payload = {
  files: new Map(),
  parts: new Map(),
  wires: new Map(),
  boards: new Map(),
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function partLabel(metadataId: string, fallbackId: string): string {
  return PART_NAME_BY_METADATA_ID.get(metadataId) || metadataId || fallbackId;
}

/**
 * Pull the comparable bits out of a stored payload. Accepts both the portable
 * project shape (fileGroups/components/wires at the top level, which is what a
 * frozen version row holds) and the older capture-state shape that nests the
 * editor under `editor`.
 */
function parsePayload(raw: string): Payload {
  if (!raw) return EMPTY_PAYLOAD;
  let root: Record<string, unknown>;
  try {
    root = asRecord(JSON.parse(raw));
  } catch {
    return EMPTY_PAYLOAD;
  }
  const editor = asRecord(root.editor);
  const simulator = asRecord(root.simulator);

  const files = new Map<string, string>();
  const groups = asRecord(root.fileGroups ?? editor.fileGroups);
  for (const [groupId, list] of Object.entries(groups)) {
    for (const entry of asArray(list)) {
      const file = asRecord(entry);
      const name = typeof file.name === "string" ? file.name : "unknown";
      files.set(
        `${groupId}/${name}`,
        typeof file.content === "string" ? file.content : "",
      );
    }
  }

  const parts = new Map<string, Part>();
  for (const entry of asArray(root.components ?? simulator.components)) {
    const raw = asRecord(entry);
    const id = String(raw.id ?? "");
    if (!id) continue;
    const metadataId =
      typeof raw.metadataId === "string"
        ? raw.metadataId
        : typeof raw.type === "string"
          ? raw.type
          : "";
    parts.set(id, {
      id,
      metadataId,
      label: partLabel(metadataId, id),
      x: typeof raw.x === "number" ? raw.x : 0,
      y: typeof raw.y === "number" ? raw.y : 0,
      properties: asRecord(raw.properties),
    });
  }

  const endpoint = (value: unknown, byId: Map<string, Part>) => {
    const point = asRecord(value);
    const componentId = String(point.componentId ?? "");
    const pin = String(point.pinName ?? "");
    const label = byId.get(componentId)?.label ?? componentId ?? "?";
    return pin ? `${label} · ${pin}` : label || "?";
  };

  const wires = new Map<string, Wire>();
  for (const entry of asArray(root.wires ?? simulator.wires)) {
    const raw = asRecord(entry);
    const id = String(raw.id ?? "");
    if (!id) continue;
    const start = asRecord(raw.start);
    const end = asRecord(raw.end);
    wires.set(id, {
      id,
      from: endpoint(raw.start, parts),
      to: endpoint(raw.end, parts),
      color: typeof raw.color === "string" ? raw.color : "",
      shape: JSON.stringify([
        start.componentId ?? "",
        start.pinName ?? "",
        end.componentId ?? "",
        end.pinName ?? "",
      ]),
    });
  }

  const boards = new Map<string, string>();
  for (const entry of asArray(root.boards ?? simulator.boards)) {
    const raw = asRecord(entry);
    const id = String(raw.id ?? "");
    if (!id) continue;
    boards.set(id, String(raw.boardKind ?? "board"));
  }

  return { files, parts, wires, boards };
}

/**
 * Properties the running simulator writes back into a part, keyed by metadata
 * id. A knob someone dragged, a tripped tilt switch, a sensor reading — these
 * land in the same `properties` bag as authored config and get frozen into the
 * ship payload, so without this a reviewer sees "Potentiometer — value: 864 →
 * 11" and reads it as work the maker did.
 *
 * Mirrors the emitPropertyChange() calls in @/lib/velxio/simulation/parts; add
 * a part here when you add one there.
 */
const RUNTIME_PROPERTIES: Record<string, readonly string[]> = {
  "analog-joystick": ["xValue", "yValue"],
  lm35dz: ["temperature"],
  "microphone-module": ["soundLevel"],
  "ntc-temperature-sensor": ["temperature"],
  photodiode: ["lux"],
  photoresistor: ["lux"],
  potentiometer: ["value"],
  pushbutton: ["pressed"],
  "pushbutton-6mm": ["pressed"],
  "slide-potentiometer": ["value"],
  "slide-switch": ["value"],
  "tilt-switch": ["tilted"],
  "vibration-switch": ["active"],
  "water-level-sensor": ["level"],
};

/**
 * True when the simulator owns this property rather than the maker, so a
 * difference between two ships says nothing about what they built.
 */
function isRuntimeProperty(
  part: Part,
  key: string,
  from: unknown,
  to: unknown,
): boolean {
  // updateComponentState() writes `state` (and mirrors it into `value`) on
  // every pin change, for any part a board pin drives — an LED that happened to
  // be lit when the maker hit ship. No part declares either as editable, and
  // authored `value` is always a string or number ("220" for a resistor).
  if (key === "state") return true;
  if (key === "value" && (typeof from === "boolean" || typeof to === "boolean"))
    return true;
  return RUNTIME_PROPERTIES[part.metadataId]?.includes(key) ?? false;
}

/** Which properties differ, rendered as "key: before → after". */
function propertyChanges(before: Part, after: Part): string[] {
  const keys = new Set([
    ...Object.keys(before.properties),
    ...Object.keys(after.properties),
  ]);
  const changes: string[] = [];
  for (const key of [...keys].sort()) {
    // Set by the preview layer, not the maker (see parseCircuitSnapshot).
    if (key.startsWith("__")) continue;
    const from = before.properties[key];
    const to = after.properties[key];
    if (isRuntimeProperty(after, key, from, to)) continue;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    const show = (value: unknown) =>
      value === undefined || value === "" ? "—" : String(value);
    changes.push(`${key}: ${show(from)} → ${show(to)}`);
  }
  return changes;
}

function fileStatus(
  before: string | undefined,
  after: string | undefined,
): ShipFileChange["status"] {
  if (before === undefined) return "added";
  if (after === undefined) return "removed";
  return "modified";
}

/** Blank lines are churn, not authored code — the same rule the line counts use. */
function codeLines(content: string): string[] {
  return content.split("\n").filter((line) => line.trim().length > 0);
}

function clip(line: string) {
  const trimmed = line.trimEnd();
  return trimmed.length > MAX_LINE_CHARS
    ? `${trimmed.slice(0, MAX_LINE_CHARS)}…`
    : trimmed;
}

/**
 * The changed lines between two versions of a file, in file order, via an LCS
 * backtrack. Returns both the lines and the totals, because the card shows a
 * capped sample but the counts must stay honest.
 *
 * Files here are student sketches, so the quadratic table is fine; past
 * MAX_LCS_CELLS it degrades to a set-membership diff, which loses ordering
 * against moved lines but still names the right ones.
 */
export function diffFileLines(prev: string, next: string) {
  const a = codeLines(prev);
  const b = codeLines(next);

  if (a.length * b.length > MAX_LCS_CELLS) {
    const prevSet = new Set(a.map((l) => l.trim()));
    const nextSet = new Set(b.map((l) => l.trim()));
    const added = b.filter((l) => !prevSet.has(l.trim()));
    const removed = a.filter((l) => !nextSet.has(l.trim()));
    return {
      added: added.length,
      removed: removed.length,
      lines: [
        ...removed.map((text) => ({ kind: "del" as const, text: clip(text) })),
        ...added.map((text) => ({ kind: "add" as const, text: clip(text) })),
      ],
    };
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  // Built from the end so the walk below runs forward and yields file order.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: ShipDiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ kind: "del", text: clip(a[i]) });
      removed++;
      i++;
    } else {
      lines.push({ kind: "add", text: clip(b[j]) });
      added++;
      j++;
    }
  }
  for (; i < a.length; i++) {
    lines.push({ kind: "del", text: clip(a[i]) });
    removed++;
  }
  for (; j < b.length; j++) {
    lines.push({ kind: "add", text: clip(b[j]) });
    added++;
  }

  return { added, removed, lines };
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Compare the editor payload frozen at the previous ship against this ship's.
 * Pass an empty `before` for a first ship — everything reads as added, which
 * is why callers only show this card once a project has shipped twice.
 */
export function diffShipPayloads(
  beforeRaw: string,
  afterRaw: string,
): ShipEditorDiff {
  const before = parsePayload(beforeRaw);
  const after = parsePayload(afterRaw);

  const files: ShipFileChange[] = [];
  let addedLines = 0;
  let removedLines = 0;
  for (const path of new Set([...before.files.keys(), ...after.files.keys()])) {
    const from = before.files.get(path);
    const to = after.files.get(path);
    if (from === to) continue;
    const { added, removed, lines } = diffFileLines(from ?? "", to ?? "");
    files.push({
      path,
      status: fileStatus(from, to),
      addedLines: added,
      removedLines: removed,
      lines: lines.slice(0, MAX_DIFF_LINES_PER_FILE),
      linesTruncated: lines.length > MAX_DIFF_LINES_PER_FILE,
    });
    addedLines += added;
    removedLines += removed;
  }
  files.sort(
    (a, b) =>
      b.addedLines + b.removedLines - (a.addedLines + a.removedLines) ||
      a.path.localeCompare(b.path),
  );

  const parts: ShipPartChange[] = [];
  let movedParts = 0;
  for (const [id, part] of after.parts) {
    const previous = before.parts.get(id);
    if (!previous) {
      parts.push({ id, label: part.label, status: "added", detail: "" });
      continue;
    }
    const changes = propertyChanges(previous, part);
    if (changes.length) {
      parts.push({
        id,
        label: part.label,
        status: "reconfigured",
        detail: changes.slice(0, 3).join(", "),
      });
    } else if (previous.x !== part.x || previous.y !== part.y) {
      movedParts += 1;
    }
  }
  for (const [id, part] of before.parts) {
    if (after.parts.has(id)) continue;
    parts.push({ id, label: part.label, status: "removed", detail: "" });
  }
  parts.sort(
    (a, b) =>
      a.status.localeCompare(b.status) || a.label.localeCompare(b.label),
  );

  const wires: ShipWireChange[] = [];
  for (const [id, wire] of after.wires) {
    const previous = before.wires.get(id);
    if (!previous) {
      wires.push({ id, status: "added", from: wire.from, to: wire.to });
    } else if (previous.shape !== wire.shape) {
      wires.push({ id, status: "rerouted", from: wire.from, to: wire.to });
    }
  }
  for (const [id, wire] of before.wires) {
    if (after.wires.has(id)) continue;
    wires.push({ id, status: "removed", from: wire.from, to: wire.to });
  }

  const boardKinds = (
    source: Map<string, string>,
    other: Map<string, string>,
  ) => [...source].filter(([id]) => !other.has(id)).map(([, kind]) => kind);
  const boards = {
    added: boardKinds(after.boards, before.boards),
    removed: boardKinds(before.boards, after.boards),
  };

  const empty =
    files.length === 0 &&
    parts.length === 0 &&
    wires.length === 0 &&
    boards.added.length === 0 &&
    boards.removed.length === 0;

  const bits: string[] = [];
  if (files.length) {
    bits.push(
      `${plural(files.length, "file")} touched (+${addedLines}/−${removedLines} lines)`,
    );
  }
  const addedParts = parts.filter((p) => p.status === "added").length;
  const removedParts = parts.filter((p) => p.status === "removed").length;
  const reconfigured = parts.filter((p) => p.status === "reconfigured").length;
  if (addedParts) bits.push(`${plural(addedParts, "part")} added`);
  if (removedParts) bits.push(`${plural(removedParts, "part")} removed`);
  if (reconfigured) bits.push(`${plural(reconfigured, "part")} reconfigured`);
  if (wires.length) bits.push(`${plural(wires.length, "wire")} changed`);
  if (boards.added.length) {
    bits.push(`${plural(boards.added.length, "board")} added`);
  }
  if (boards.removed.length) {
    bits.push(`${plural(boards.removed.length, "board")} removed`);
  }
  if (!bits.length && movedParts)
    bits.push(`${plural(movedParts, "part")} moved`);

  return {
    files,
    addedLines,
    removedLines,
    parts,
    movedParts,
    wires,
    boards,
    empty,
    summary: bits.length
      ? `${bits.join(", ")}.`
      : "Nothing changed in the editor since the last ship.",
  };
}
