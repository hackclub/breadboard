import type { CircuitSnapshot } from "@/components/gallery/ProjectCircuitPreview";
import componentsMetadata from "../../../public/components-metadata.json";

// The editor saves components by metadataId ("led-red", "pushbutton", …);
// CircuitPreview draws wokwi/velxio element tags. components-metadata.json is
// the id → tagName bridge the canvas itself uses.
const TAG_BY_METADATA_ID = new Map<string, string>(
  componentsMetadata.components.map((c) => [c.id, c.tagName]),
);
const THUMBNAIL_BY_METADATA_ID = new Map<string, string>(
  componentsMetadata.components.map((c) => [c.id, c.thumbnail ?? ""]),
);

// Pull the board/component layout out of a project's saved editorData so a
// preview can draw the circuit as it currently stands when no photo was
// uploaded. Anything malformed or empty comes back as null.
export function parseCircuitSnapshot(
  editorData: string,
): CircuitSnapshot | null {
  if (!editorData) return null;
  try {
    const payload = JSON.parse(editorData) as {
      boards?: unknown;
      components?: unknown;
      wires?: unknown;
    };
    const boards = (Array.isArray(payload.boards) ? payload.boards : [])
      .filter(
        (b): b is { id: string; boardKind: string; x: number; y: number } =>
          typeof b === "object" &&
          b !== null &&
          typeof (b as { boardKind?: unknown }).boardKind === "string" &&
          Number.isFinite((b as { x?: unknown }).x) &&
          Number.isFinite((b as { y?: unknown }).y),
      )
      .map((b) => ({ id: b.id, boardKind: b.boardKind, x: b.x, y: b.y }));
    const components = (
      Array.isArray(payload.components) ? payload.components : []
    ).flatMap((raw) => {
      if (typeof raw !== "object" || raw === null) return [];
      const c = raw as {
        id?: unknown;
        type?: unknown;
        metadataId?: unknown;
        x?: unknown;
        y?: unknown;
        properties?: unknown;
      };
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return [];
      const metadataId = typeof c.metadataId === "string" ? c.metadataId : null;
      const type =
        typeof c.type === "string"
          ? c.type
          : metadataId
            ? (TAG_BY_METADATA_ID.get(metadataId) ?? metadataId)
            : null;
      if (!type) return [];
      let properties =
        typeof c.properties === "object" && c.properties !== null
          ? (c.properties as Record<string, unknown>)
          : {};
      // Attach the catalog thumbnail as a last-resort visual: the preview
      // canvas renders the real web component and only shows this if the
      // element tag never registers.
      if (metadataId) {
        const thumbnail = THUMBNAIL_BY_METADATA_ID.get(metadataId);
        if (thumbnail)
          properties = { ...properties, __thumbnailSvg: thumbnail };
      }
      return [
        {
          id: String(c.id ?? ""),
          type,
          x: c.x as number,
          y: c.y as number,
          properties,
        },
      ];
    });
    const toPoint = (p: unknown) => {
      const point = p as { x?: unknown; y?: unknown } | null;
      return point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ? [{ x: point.x as number, y: point.y as number }]
        : [];
    };
    const wires = (Array.isArray(payload.wires) ? payload.wires : []).flatMap(
      (raw) => {
        if (typeof raw !== "object" || raw === null) return [];
        const w = raw as {
          id?: unknown;
          color?: unknown;
          start?: unknown;
          end?: unknown;
          waypoints?: unknown;
        };
        const [start] = toPoint(w.start);
        const [end] = toPoint(w.end);
        if (!start || !end) return [];
        return [
          {
            id: String(w.id ?? ""),
            color: typeof w.color === "string" ? w.color : "",
            start,
            end,
            waypoints: (Array.isArray(w.waypoints) ? w.waypoints : []).flatMap(
              toPoint,
            ),
          },
        ];
      },
    );
    if (boards.length === 0 && components.length === 0) return null;
    return { boards, components, wires };
  } catch {
    return null;
  }
}
