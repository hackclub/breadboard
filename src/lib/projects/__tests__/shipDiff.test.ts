// @ts-nocheck — no @types/bun in the tree, so tsc can't resolve "bun:test".
// Same escape hatch the velxio simulation tests use.
import { describe, expect, test } from "bun:test";
import { diffShipPayloads } from "@/lib/projects/ship-diff";

type PayloadParts = {
  components?: unknown[];
  wires?: unknown[];
  boards?: unknown[];
  fileGroups?: Record<string, Array<{ name: string; content: string }>>;
};

function payload(parts: PayloadParts) {
  return JSON.stringify({
    format: "velxio-project",
    version: 1,
    boards: parts.boards ?? [],
    components: parts.components ?? [],
    wires: parts.wires ?? [],
    fileGroups: parts.fileGroups ?? {},
  });
}

const led = {
  id: "c1",
  metadataId: "led-red",
  x: 10,
  y: 20,
  properties: { value: false },
};

describe("diffShipPayloads", () => {
  test("reports nothing when the two ships are identical", () => {
    const same = payload({
      components: [led],
      fileGroups: { g1: [{ name: "sketch.ino", content: "void setup() {}" }] },
    });
    const diff = diffShipPayloads(same, same);
    expect(diff.empty).toBe(true);
    expect(diff.summary).toBe(
      "Nothing changed in the editor since the last ship.",
    );
  });

  test("names parts by their catalog name, not their metadata id", () => {
    const diff = diffShipPayloads(payload({}), payload({ components: [led] }));
    expect(diff.parts).toEqual([
      { id: "c1", label: "LED Red F5", status: "added", detail: "" },
    ]);
  });

  test("separates a reconfigured part from one that only moved", () => {
    const before = payload({
      components: [
        led,
        {
          id: "c2",
          metadataId: "resistor",
          x: 0,
          y: 0,
          properties: { resistance: "220" },
        },
      ],
    });
    const after = payload({
      components: [
        { ...led, x: 99, y: 99 },
        {
          id: "c2",
          metadataId: "resistor",
          x: 0,
          y: 0,
          properties: { resistance: "1000" },
        },
      ],
    });
    const diff = diffShipPayloads(before, after);
    expect(diff.movedParts).toBe(1);
    expect(diff.parts).toHaveLength(1);
    expect(diff.parts[0].status).toBe("reconfigured");
    expect(diff.parts[0].detail).toBe("resistance: 220 → 1000");
  });

  test("ignores preview-injected properties", () => {
    const before = payload({ components: [led] });
    const after = payload({
      components: [
        { ...led, properties: { value: false, __thumbnailSvg: "<svg/>" } },
      ],
    });
    expect(diffShipPayloads(before, after).empty).toBe(true);
  });

  test("describes wire changes by the pins they land on", () => {
    const wire = (endPin: string) => ({
      id: "w1",
      color: "red",
      start: { componentId: "c1", pinName: "A" },
      end: { componentId: "b1", pinName: endPin },
    });
    const before = payload({ components: [led], wires: [wire("D9")] });
    const after = payload({ components: [led], wires: [wire("D10")] });
    const diff = diffShipPayloads(before, after);
    expect(diff.wires).toEqual([
      { id: "w1", status: "rerouted", from: "LED Red F5 · A", to: "b1 · D10" },
    ]);
  });

  test("counts added and removed firmware lines, blank lines aside", () => {
    const before = payload({
      fileGroups: { g1: [{ name: "sketch.ino", content: "a();\nb();" }] },
    });
    const after = payload({
      fileGroups: {
        g1: [{ name: "sketch.ino", content: "a();\n\n\nc();\nd();" }],
      },
    });
    const diff = diffShipPayloads(before, after);
    expect(diff.files).toEqual([
      {
        path: "g1/sketch.ino",
        status: "modified",
        addedLines: 2,
        removedLines: 1,
      },
    ]);
    expect(diff.summary).toContain("1 file touched (+2/−1 lines)");
  });

  test("flags a whole file appearing or disappearing", () => {
    const before = payload({
      fileGroups: { g1: [{ name: "old.h", content: "#pragma once" }] },
    });
    const after = payload({
      fileGroups: { g1: [{ name: "new.h", content: "#pragma once" }] },
    });
    const statuses = Object.fromEntries(
      diffShipPayloads(before, after).files.map((f) => [f.path, f.status]),
    );
    expect(statuses).toEqual({ "g1/old.h": "removed", "g1/new.h": "added" });
  });

  test("treats an unparseable or missing payload as empty", () => {
    const diff = diffShipPayloads("not json", payload({ components: [led] }));
    expect(diff.parts).toHaveLength(1);
    expect(diff.parts[0].status).toBe("added");
  });
});
