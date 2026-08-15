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

import { addedLineCount } from "@/lib/editor/codeAuthenticity";
import componentsMetadata from "../../../public/components-metadata.json";

const PART_NAME_BY_METADATA_ID = new Map<string, string>(
  componentsMetadata.components.map((c) => [c.id, c.name]),
);

export type ShipFileChange = {
  /** "groupId/filename", the same key code-authenticity uses. */
  path: string;
  status: "added" | "modified" | "removed";
  addedLines: number;
  removedLines: number;
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
    // Non-blank lines only, so reflow and spacing churn stay out of the count
    // (addedLineCount's rule, reused in both directions).
    const added = addedLineCount(from ?? "", to ?? "");
    const removed = addedLineCount(to ?? "", from ?? "");
    files.push({
      path,
      status: fileStatus(from, to),
      addedLines: added,
      removedLines: removed,
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
