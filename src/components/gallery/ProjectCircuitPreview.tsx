"use client";

import dynamic from "next/dynamic";

// The minimal slice of a project's saved editorData the preview needs. The
// server parses the full payload and passes only this, so file contents
// never reach the client.
export type CircuitSnapshot = {
  boards: { id: string; boardKind: string; x: number; y: number }[];
  components: {
    id: string;
    type: string;
    x: number;
    y: number;
    properties: Record<string, unknown>;
  }[];
  wires: {
    id: string;
    color: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    waypoints: { x: number; y: number }[];
  }[];
};

// The canvas registers the wokwi/velxio web components at import time, which
// requires the browser — so it loads client-only, in its own chunk.
const ProjectCircuitCanvas = dynamic(
  () => import("@/components/gallery/ProjectCircuitCanvas"),
  { ssr: false },
);

/** Fills its (positioned) parent with a faithful miniature of the project's
 * saved editor canvas. */
export function ProjectCircuitPreview({
  circuit,
  onReady,
}: {
  circuit: CircuitSnapshot;
  onReady?: () => void;
}) {
  return <ProjectCircuitCanvas circuit={circuit} onReady={onReady} />;
}
