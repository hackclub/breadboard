// @ts-nocheck
/**
 * breadboardSnap — geometry for auto-plugging parts into breadboards.
 *
 * While a part is dragged over a breadboard, we look for a translation
 * that lands its pins on the hole grid (like physically seating the part).
 * The result carries both the snapped component position and a
 * pin-name → hole-name map that becomes the component's `attachedTo`
 * attachment on drop. Connectivity is lenient per-pin: every pin that
 * ends up within PIN_CONNECT_DIST of a hole connects; pins that miss
 * (center gap, off the edge) stay floating, exactly like real hardware.
 */

import {
  getBreadboardConnectedPins,
  isBreadboard,
} from "@/lib/velxio/utils/breadboard";

/** A part pin must come at least this close (world px) to a hole for the
 *  snap to engage at all. Roughly one hole pitch. */
const ACTIVATION_DIST = 10;

/** After snapping, a pin connects to a hole when within this distance
 *  (world px). Half the 9.6 px hole pitch, so a pin can never be
 *  ambiguous between two holes. */
const PIN_CONNECT_DIST = 4.8;

export interface BreadboardAttachment {
  breadboardId: string;
  /** part pin name → breadboard hole name, e.g. { S: "F12", "+": "G12" } */
  pinMap: Record<string, string>;
}

export interface SnapResult {
  breadboardId: string;
  /** Snapped component position (store x/y, i.e. wrapper top-left). */
  x: number;
  y: number;
  pinMap: Record<string, string>;
  /** World positions of the holes that will connect (for the preview). */
  holes: Array<{ name: string; x: number; y: number }>;
  /** Part pins that will NOT land in a hole. */
  unmappedPins: string[];
}

interface WorldPin {
  name: string;
  x: number;
  y: number;
}

/**
 * All pin positions of a placed component in world coordinates, with the
 * component's rotation applied. Mirrors the math in calculatePinPosition
 * (wrapper offset +6/+6, rotation about the wrapper center) but resolves
 * the DOM element once for the whole pin list instead of per pin.
 */
export function getComponentPinsWorld(component: {
  id: string;
  x: number;
  y: number;
  properties?: Record<string, unknown>;
}): WorldPin[] {
  const element = document.getElementById(component.id);
  if (!element) return [];
  const pinInfo = (element as any).pinInfo;
  if (!pinInfo || !Array.isArray(pinInfo)) return [];

  const wrapper = element.closest(
    ".dynamic-component-wrapper",
  ) as HTMLElement | null;
  // DynamicComponent wraps parts with padding:4 + border:2 → the inner
  // element sits at (+6, +6) from the stored x/y. Instrument probes render
  // without that wrapper and use the raw position.
  const offset = wrapper ? 6 : 0;
  const originX = component.x + offset;
  const originY = component.y + offset;

  const rotation =
    ((Number(component.properties?.rotation) || 0) % 360 + 360) % 360;
  if (rotation === 0 || !wrapper) {
    return pinInfo.map((pin: any) => ({
      name: pin.name,
      x: originX + pin.x,
      y: originY + pin.y,
    }));
  }

  const pivotX = component.x + wrapper.offsetWidth / 2;
  const pivotY = component.y + wrapper.offsetHeight / 2;
  const theta = (rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return pinInfo.map((pin: any) => {
    const dx = originX + pin.x - pivotX;
    const dy = originY + pin.y - pivotY;
    return {
      name: pin.name,
      x: pivotX + (dx * cos - dy * sin),
      y: pivotY + (dx * sin + dy * cos),
    };
  });
}

/** Squared-distance nearest hole; holes lists are ≤ ~630 entries. */
function nearestHole(
  holes: WorldPin[],
  x: number,
  y: number,
): { hole: WorldPin; dist: number } | null {
  let best: WorldPin | null = null;
  let bestD2 = Infinity;
  for (const hole of holes) {
    const dx = hole.x - x;
    const dy = hole.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = hole;
    }
  }
  return best ? { hole: best, dist: Math.sqrt(bestD2) } : null;
}

/**
 * Try to snap a dragged part onto one of the breadboards on the canvas.
 *
 * `rawX`/`rawY` is the unsnapped drop position from the drag. Candidate
 * snap offsets are derived from a few reference pins (first / middle /
 * last — enough to catch parts whose first pin hangs off the board while
 * the rest align); the offset that connects the most pins with the least
 * residual wins. Returns null when no breadboard is close enough.
 */
export function computeBreadboardSnap(
  component: {
    id: string;
    metadataId: string;
    x: number;
    y: number;
    properties?: Record<string, unknown>;
  },
  rawX: number,
  rawY: number,
  breadboards: Array<{
    id: string;
    metadataId: string;
    x: number;
    y: number;
    properties?: Record<string, unknown>;
  }>,
): SnapResult | null {
  if (isBreadboard(component.metadataId)) return null;
  const pins = getComponentPinsWorld({ ...component, x: rawX, y: rawY });
  if (pins.length === 0) return null;

  let best: SnapResult | null = null;
  let bestScore = -Infinity;

  for (const bb of breadboards) {
    if (bb.id === component.id) continue;
    const holes = getComponentPinsWorld(bb);
    if (holes.length === 0) continue;

    // Reference pins: ends + middle cover single-row headers, two-leg
    // parts, and DIP-style packages without trying all N pins.
    const refIndices = new Set([
      0,
      Math.floor(pins.length / 2),
      pins.length - 1,
    ]);

    for (const refIdx of refIndices) {
      const ref = pins[refIdx];
      const near = nearestHole(holes, ref.x, ref.y);
      if (!near || near.dist > ACTIVATION_DIST) continue;

      const offX = near.hole.x - ref.x;
      const offY = near.hole.y - ref.y;

      // Map every pin to its nearest hole after applying the offset.
      // A hole can seat only one pin — on conflict the closer pin wins.
      const claims = new Map<
        string,
        { pin: string; dist: number; hole: WorldPin }
      >();
      let residual = 0;
      for (const pin of pins) {
        const hit = nearestHole(holes, pin.x + offX, pin.y + offY);
        if (!hit || hit.dist > PIN_CONNECT_DIST) continue;
        const existing = claims.get(hit.hole.name);
        if (!existing || hit.dist < existing.dist) {
          claims.set(hit.hole.name, {
            pin: pin.name,
            dist: hit.dist,
            hole: hit.hole,
          });
        }
      }
      const pinMap: Record<string, string> = {};
      const holesOut: Array<{ name: string; x: number; y: number }> = [];
      for (const [holeName, claim] of claims) {
        pinMap[claim.pin] = holeName;
        holesOut.push({ name: holeName, x: claim.hole.x, y: claim.hole.y });
        residual += claim.dist;
      }
      const connected = holesOut.length;
      if (connected === 0) continue;

      const score = connected * 100 - residual;
      if (score > bestScore) {
        bestScore = score;
        best = {
          breadboardId: bb.id,
          x: rawX + offX,
          y: rawY + offY,
          pinMap,
          holes: holesOut,
          unmappedPins: pins
            .map((p) => p.name)
            .filter((name) => !(name in pinMap)),
        };
      }
    }
  }
  return best;
}

/**
 * Human-readable problems with a just-made attachment, for the wiring
 * issues panel: pins that missed the grid, and part pins shorted together
 * by landing on the same internal strip (both allowed, both flagged).
 */
export function describeAttachmentIssues(
  breadboardMetadataId: string,
  attachment: BreadboardAttachment,
  unmappedPins: string[],
): string[] {
  const issues = unmappedPins.map((pin) => `${pin} not in a hole`);

  // Group plugged pins by internal strip. Two pins of the same part on
  // one strip are electrically shorted — legal, but worth a warning.
  const stripOf = (hole: string) => {
    const strip = [hole, ...getBreadboardConnectedPins(breadboardMetadataId, hole)];
    return strip.sort().join(",");
  };
  const byStrip = new Map<string, string[]>();
  for (const [pin, hole] of Object.entries(attachment.pinMap)) {
    const key = stripOf(hole);
    byStrip.set(key, [...(byStrip.get(key) ?? []), pin]);
  }
  for (const pinsOnStrip of byStrip.values()) {
    if (pinsOnStrip.length > 1) {
      issues.push(`${pinsOnStrip.join(" and ")} shorted (same strip)`);
    }
  }
  return issues;
}

/**
 * Attachments as virtual wires: one zero-length edge per plugged pin,
 * from the part pin to the breadboard hole it sits in. Lets the wire-graph
 * consumers (netTrace BFS, the SPICE union-find) treat a plugged part
 * exactly like a hand-wired one without learning a new concept.
 */
export function attachmentWires(
  components: Array<{
    id: string;
    attachedTo?: BreadboardAttachment;
  }>,
): Array<{
  id: string;
  start: { componentId: string; pinName: string };
  end: { componentId: string; pinName: string };
}> {
  const wires = [];
  const componentIds = new Set(components.map((c) => c.id));
  for (const c of components) {
    if (!c.attachedTo) continue;
    // Stale attachment (breadboard deleted out from under it) — skip.
    if (!componentIds.has(c.attachedTo.breadboardId)) continue;
    for (const [pinName, holeName] of Object.entries(c.attachedTo.pinMap)) {
      wires.push({
        id: `attach-${c.id}-${pinName}`,
        start: { componentId: c.id, pinName },
        end: { componentId: c.attachedTo.breadboardId, pinName: holeName },
      });
    }
  }
  return wires;
}
