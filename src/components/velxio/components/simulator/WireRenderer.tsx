// @ts-nocheck
/**
 * WireRenderer — purely visual renderer for a single wire.
 * All interaction (click/hover/drag) is handled by SimulatorCanvas.
 */

import React from "react";
import type { Wire } from "@/lib/velxio/types/wire";
import { generateOrthogonalPath } from "@/lib/velxio/utils/wireUtils";

/** True when a hex color is dark enough to blend into the dark crossing outline. */
function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceived luminance (ITU-R BT.601).
  return 0.299 * r + 0.587 * g + 0.114 * b < 40;
}

interface WireRendererProps {
  wire: Wire;
  isSelected: boolean;
  isHovered: boolean;
  /** Temporary waypoints used during drag preview */
  previewWaypoints?: { x: number; y: number }[];
  /** Override the full SVG path string (used during segment drag preview) */
  overridePath?: string;
  /** Fade this wire while another connection is spotlighted. */
  isDimmed?: boolean;
}

export const WireRenderer: React.FC<WireRendererProps> = ({
  wire,
  isSelected,
  isHovered,
  previewWaypoints,
  overridePath,
  isDimmed = false,
}) => {
  const waypoints = previewWaypoints ?? wire.waypoints;
  const path =
    overridePath ?? generateOrthogonalPath(wire.start, waypoints, wire.end);

  if (!path) return null;

  const color = wire.color;
  const strokeW = isSelected ? 3 : 2;
  const outlineW = isSelected ? 6 : 5;
  const opacity = isSelected || isHovered ? 1 : 0.85;

  // Black wires blend into the dark background, so instead of the dark
  // crossing outline they get a skinny, very faint light outline just to
  // catch the edge and keep them visible.
  const isBlackWire = isDarkColor(color);

  return (
    <g
      style={{
        pointerEvents: "none",
        opacity: isDimmed ? 0.08 : 1,
        transition: "opacity 140ms ease",
      }}
    >
      {/* Outline for wire crossing effect */}
      {isBlackWire ? (
        <path
          d={path}
          stroke="#e6e9ee"
          strokeWidth={strokeW + 1}
          fill="none"
          opacity="0.25"
        />
      ) : (
        <path d={path} stroke="#1a1a1a" strokeWidth={outlineW} fill="none" />
      )}

      {/* Hover highlight (below wire) */}
      {isHovered && !isSelected && (
        <path
          d={path}
          stroke="#ffffff"
          strokeWidth="6"
          fill="none"
          opacity="0.2"
        />
      )}

      {/* Visible wire */}
      <path
        d={path}
        stroke={color}
        strokeWidth={strokeW}
        fill="none"
        opacity={opacity}
      />

      {/* Selection dashed highlight */}
      {isSelected && (
        <path
          d={path}
          stroke="#ffffff"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="6,4"
          opacity="0.6"
        />
      )}

      {/* Endpoint dots */}
      <circle
        cx={wire.start.x}
        cy={wire.start.y}
        r="3"
        fill={color}
        stroke={isBlackWire ? "#e6e9ee" : "#1a1a1a"}
        strokeWidth="1"
      />
      <circle
        cx={wire.end.x}
        cy={wire.end.y}
        r="3"
        fill={color}
        stroke={isBlackWire ? "#e6e9ee" : "#1a1a1a"}
        strokeWidth="1"
      />

      {/* Waypoint dots */}
      {waypoints.map((wp, i) => (
        <circle key={i} cx={wp.x} cy={wp.y} r="2" fill={color} />
      ))}
    </g>
  );
};
