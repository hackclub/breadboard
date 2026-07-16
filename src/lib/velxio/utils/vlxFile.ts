// @ts-nocheck
/**
 * .vlx file format — portable project export/import for OSS Velxio.
 *
 * Phase 4 of the OSS / pro split. The OSS image has no auth, no DB, no
 * server-side project persistence. The user's work is otherwise ephemeral
 * (lost on tab refresh). `.vlx` is a single-file JSON snapshot that
 * round-trips everything the server-side Save flow captures:
 *
 *   {
 *     "format": "velxio-project",
 *     "version": 1,
 *     "exportedAt": "ISO timestamp",
 *     "name": "project name (optional)",
 *     "boards": [...],
 *     "fileGroups": { "<groupId>": [{ name, content }, ...] },
 *     "components": [...],
 *     "wires": [...],
 *     "activeBoardId": "..." | null
 *   }
 *
 * Reading: `parseVlxFile(File) → payload` validates and returns a shape
 *  directly consumable by `useSimulatorStore.loadProjectState(...)`.
 *
 * Writing: `buildVlxBlob()` snapshots the current store state into a
 *  `Blob`, ready to feed an `<a download>` link.
 *
 * The format is INTENTIONALLY identical to the server's POST/PUT body
 * for `/api/projects/`, so a pro user can export-from-Pro / import-into-
 * OSS (and vice-versa) without surprises.
 */

import type { BoardInstance } from "@/lib/velxio/types/board";
import type { Component } from "@/lib/velxio/types/component";
import type { Wire } from "@/lib/velxio/types/wire";
import {
  useEditorStore,
  chipFileGroupId,
} from "@/services/velxio/store/useEditorStore";
import { useSimulatorStore } from "@/services/velxio/store/useSimulatorStore";

const VLX_FORMAT = "velxio-project";
const VLX_VERSION = 1;

export interface VlxPayload {
  format: typeof VLX_FORMAT;
  version: number;
  exportedAt: string;
  name?: string;
  boards: Array<{
    id: string;
    name?: string;
    boardKind: string;
    x: number;
    y: number;
    activeFileGroupId: string;
    languageMode?: string;
    serialBaudRate?: number;
    /** Last compiled firmware (Intel HEX text or base64 binary). Present only
     *  when the source still matches this build and it's small enough to embed,
     *  so a shared/reopened project runs without recompiling. */
    compiledProgram?: string;
  }>;
  fileGroups: Record<string, Array<{ name: string; content: string }>>;
  components: Component[];
  wires: Wire[];
  activeBoardId: string | null;
  ignoreStock?: boolean;
}

// Cap on an embedded compiled program. AVR / kit-board hex is a few KB of Intel
// HEX, which keeps the whole editorData payload under MAX_EDITOR_BYTES (5MB) on
// the autosave PUT. Larger images (a 4MB ESP32 flash binary base64s past the
// cap) are dropped and fall back to recompiling on Run.
const MAX_EMBEDDED_PROGRAM_BYTES = 1_500_000;

function serialisableBoard(b: BoardInstance, includeProgram: boolean) {
  const board: VlxPayload["boards"][number] = {
    id: b.id,
    name: b.name,
    boardKind: b.boardKind,
    x: b.x,
    y: b.y,
    activeFileGroupId: b.activeFileGroupId,
    languageMode: b.languageMode,
    serialBaudRate: b.serialBaudRate,
  };
  // Ship the last compiled firmware so a shared or reopened project runs
  // without a fresh backend compile. This is what lets sketch-driven output
  // (a buzzer, LEDs, serial) work for signed-out /share visitors, who can no
  // longer recompile. Guarded two ways: only when the source still matches
  // this build (includeProgram), so we never boot a stale hex, and only when
  // it fits the size cap.
  if (
    includeProgram &&
    typeof b.compiledProgram === "string" &&
    b.compiledProgram.length > 0 &&
    b.compiledProgram.length <= MAX_EMBEDDED_PROGRAM_BYTES
  ) {
    board.compiledProgram = b.compiledProgram;
  }
  return board;
}

/**
 * Snapshot the current editor + simulator state into a VlxPayload object.
 * Pure function: no side effects.
 */
export function buildVlxPayload(opts: { name?: string } = {}): VlxPayload {
  const sim = useSimulatorStore.getState();
  const editor = useEditorStore.getState();

  // Persist file groups referenced by a board, plus each programmable chip's
  // own program group (group-chip-<id>) — otherwise the chip's program would
  // be dropped on export. Stray groups from deleted boards don't round-trip.
  const referencedGroupIds = new Set(
    sim.boards.map((b) => b.activeFileGroupId),
  );
  for (const c of sim.components) {
    if (c.metadataId !== "custom-chip") continue;
    const gid = chipFileGroupId(c.id);
    if (editor.fileGroups[gid]?.length) referencedGroupIds.add(gid);
  }
  const fileGroups: VlxPayload["fileGroups"] = {};
  for (const gid of referencedGroupIds) {
    fileGroups[gid] = (editor.fileGroups[gid] ?? []).map((f) => ({
      name: f.name,
      content: f.content,
    }));
  }

  return {
    format: VLX_FORMAT,
    version: VLX_VERSION,
    exportedAt: new Date().toISOString(),
    name: opts.name,
    // Embed firmware only when the source still matches the last compile, so a
    // shared project never boots a hex that's stale relative to its code.
    boards: sim.boards.map((b) =>
      serialisableBoard(b, !editor.codeChangedSinceLastCompile),
    ),
    fileGroups,
    components: sim.components,
    wires: sim.wires,
    activeBoardId: sim.activeBoardId,
    ignoreStock: sim.ignoreStock === true,
  };
}

/** Build a Blob (MIME: application/json) carrying the current state. */
export function buildVlxBlob(opts: { name?: string } = {}): Blob {
  const payload = buildVlxPayload(opts);
  const json = JSON.stringify(payload, null, 2);
  return new Blob([json], { type: "application/json" });
}

/** Sanitise a filename: keep letters, digits, dashes, dots, underscores. */
function safeFilename(name?: string): string {
  const base = (name ?? "velxio-project").trim() || "velxio-project";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${cleaned || "velxio-project"}.vlx`;
}

/**
 * Trigger a browser download of the current state as `<name>.vlx`.
 * Returns the filename actually used (for UI feedback).
 */
export function triggerDownloadVlx(opts: { name?: string } = {}): string {
  const blob = buildVlxBlob(opts);
  const filename = safeFilename(opts.name);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // The browser starts the download immediately. Revoke the URL on the
  // next tick so the click handler has time to settle before GC.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
  return filename;
}

/** Thrown by parseVlxFile when the file isn't a valid .vlx payload. */
export class VlxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VlxParseError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_VLX_JSON_DEPTH = 32;

// Mirror the server-side editor payload validator (src/lib/editor/payload.ts):
// reject prototype-polluting keys, non-finite numbers, and pathological depth.
// A .vlx file is hand-editable and loads straight into the live stores, so it
// shouldn't be trusted more loosely than data that round-trips through the API.
function assertJsonSafe(value: unknown, depth = 0): void {
  if (depth > MAX_VLX_JSON_DEPTH) {
    throw new VlxParseError("File is nested too deeply.");
  }
  if (value === null) return;
  const type = typeof value;
  if (type === "string" || type === "boolean") return;
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new VlxParseError("File contains a non-finite number.");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonSafe(item, depth + 1);
    return;
  }
  if (!isPlainObject(value)) {
    throw new VlxParseError("File contains an unsupported value.");
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new VlxParseError("File contains a disallowed key.");
    }
    assertJsonSafe(nested, depth + 1);
  }
}

/**
 * Validate that `data` is shaped like a VlxPayload. Throws VlxParseError
 * on mismatch with a human-readable reason. Keep the checks defensive —
 * users may edit .vlx files by hand or feed us a wrong file by accident.
 */
function validatePayload(data: unknown): VlxPayload {
  if (!isPlainObject(data)) {
    throw new VlxParseError("File is not a JSON object.");
  }
  // Reject prototype-polluting keys and non-finite numbers before the data
  // reaches the stores / gets spread into objects.
  assertJsonSafe(data);
  if (data.format !== VLX_FORMAT) {
    throw new VlxParseError(
      `Not a Velxio project file (expected format="${VLX_FORMAT}", got ${JSON.stringify(
        data.format,
      )}).`,
    );
  }
  if (typeof data.version !== "number") {
    throw new VlxParseError('Missing or invalid "version" field.');
  }
  if (data.version > VLX_VERSION) {
    throw new VlxParseError(
      `This file uses .vlx format version ${data.version}, but this Velxio supports up to v${VLX_VERSION}. Update Velxio to open it.`,
    );
  }
  if (!Array.isArray(data.boards)) {
    throw new VlxParseError('Missing or invalid "boards" array.');
  }
  if (!isPlainObject(data.fileGroups)) {
    throw new VlxParseError('Missing or invalid "fileGroups" object.');
  }
  if (!Array.isArray(data.components)) {
    throw new VlxParseError('Missing or invalid "components" array.');
  }
  if (!Array.isArray(data.wires)) {
    throw new VlxParseError('Missing or invalid "wires" array.');
  }
  return data as unknown as VlxPayload;
}

/**
 * Read a File object (from a `<input type="file">` change event or a
 * drop), parse it as JSON, validate, and return the payload. Throws
 * VlxParseError on any failure.
 */
export async function parseVlxFile(file: File): Promise<VlxPayload> {
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    throw new VlxParseError(`Could not read file: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new VlxParseError(`Invalid JSON: ${(err as Error).message}`);
  }
  return validatePayload(parsed);
}

/**
 * Convenience wrapper: parse the file AND load its contents into the
 * simulator stores via `loadProjectState`. Returns the parsed payload
 * so the caller can show a confirmation toast or similar.
 */
export async function importVlxFile(file: File): Promise<VlxPayload> {
  const payload = await parseVlxFile(file);
  useSimulatorStore.getState().loadProjectState({
    boards: payload.boards as unknown as BoardInstance[],
    fileGroups: payload.fileGroups,
    components: payload.components,
    wires: payload.wires,
    activeBoardId: payload.activeBoardId,
  });
  return payload;
}
