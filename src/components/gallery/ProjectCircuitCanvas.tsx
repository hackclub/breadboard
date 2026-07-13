"use client";
/**
 * ProjectCircuitCanvas — a faithful, non-interactive miniature of the editor
 * canvas for gallery cards.
 *
 * Renders the SAME web components the editor uses (@wokwi/elements plus the
 * velxio-local element registries) at their saved world coordinates, then
 * scales the whole world with a single CSS transform. Because wires are drawn
 * from their stored absolute coordinates in that same world space, they land
 * exactly where the editor drew them — no size approximations, no overlap
 * shuffling.
 *
 * This module is loaded with `ssr: false` (see ProjectCircuitPreview): the
 * element registries call customElements.define at import time, which only
 * exists in the browser.
 */

import "@wokwi/elements";
import "@/components/velxio/velxio-elements";
import "@/components/velxio/components/velxio-components/BreadboardElements";
import "@/components/velxio/components/velxio-components/KitElements";
import "@/components/velxio/components/velxio-components/IC74HC595";
import "@/components/velxio/components/velxio-components/LogicGateElements";
import "@/components/velxio/components/velxio-components/TransistorElements";
import "@/components/velxio/components/velxio-components/OpAmpElements";
import "@/components/velxio/components/velxio-components/PowerElements";
import "@/components/velxio/components/velxio-components/DiodeElements";
import "@/components/velxio/components/velxio-components/RelayElements";
import "@/components/velxio/components/velxio-components/LogicICElements";
import "@/components/velxio/components/velxio-components/MotorDriverElements";
import "@/components/velxio/components/velxio-components/FlipFlopElements";
import "@/components/velxio/components/velxio-components/Bmp280Element";
import "@/components/velxio/components/velxio-components/EPaperElement";
import "@/components/velxio/components/velxio-components/Esp32Element";
import "@/components/velxio/components/velxio-components/PiPicoWElement";
import "@/components/velxio/components/velxio-components/Attiny85Element";
import "@/components/velxio/components/velxio-components/RaspberryPi3Element";

import React, { useEffect, useRef, useState } from "react";
import { generateOrthogonalPath } from "@/lib/velxio/utils/wireUtils";
import type { CircuitSnapshot } from "@/components/gallery/ProjectCircuitPreview";

const THUMBNAIL_KEY = "__thumbnailSvg";

// boardKind → element tag, mirroring BoardOnCanvas.tsx. Boards render the raw
// element at exactly (x, y) — no wrapper offset.
const BOARD_TAGS: Record<string, string> = {
  "arduino-uno": "wokwi-arduino-uno",
  "arduino-nano": "wokwi-arduino-nano",
  "arduino-mega": "wokwi-arduino-mega",
  "raspberry-pi-pico": "velxio-pi-pico-w",
  "pi-pico-w": "velxio-pi-pico-w",
  attiny85: "velxio-attiny85",
};
const ESP32_KINDS = new Set([
  "esp32",
  "esp32-devkit-c-v4",
  "esp32-cam",
  "wemos-lolin32-lite",
  "esp32-s3",
  "xiao-esp32-s3",
  "arduino-nano-esp32",
  "esp32-c3",
  "xiao-esp32-c3",
  "aitewinrobot-esp32c3-supermini",
]);

function boardTag(boardKind: string): string | null {
  if (ESP32_KINDS.has(boardKind)) return "velxio-esp32";
  return BOARD_TAGS[boardKind] ?? null;
}

function isValidTag(tag: string): boolean {
  return /^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(tag);
}

function BoardPart({ board }: { board: CircuitSnapshot["boards"][number] }) {
  const tag = boardTag(board.boardKind);
  const style: React.CSSProperties = {
    position: "absolute",
    left: board.x,
    top: board.y,
  };
  if (!tag) {
    // Unmapped board kind — neutral PCB-ish placeholder so the layout keeps
    // its anchor.
    return (
      <div
        data-part=""
        style={{
          ...style,
          width: 220,
          height: 150,
          background: "#20304a",
          border: "1px solid #47617a",
          borderRadius: 8,
        }}
      />
    );
  }
  return React.createElement(tag, {
    "data-part": "",
    ...(tag === "velxio-esp32" ? { "board-kind": board.boardKind } : {}),
    style,
  });
}

// Renders the actual web component and syncs saved properties onto it, the
// same way DynamicComponent does. Falls back to the catalog thumbnail if the
// tag never upgrades (part missing from the registries).
function PartElement({
  tag,
  properties,
}: {
  tag: string;
  properties: Record<string, unknown>;
}) {
  const ref = useRef<HTMLElement>(null);
  const [missing, setMissing] = useState(!isValidTag(tag));

  useEffect(() => {
    if (!isValidTag(tag)) return;
    let alive = true;
    const timer = setTimeout(() => {
      if (alive && !customElements.get(tag)) setMissing(true);
    }, 2000);
    customElements
      .whenDefined(tag)
      .then(() => {
        if (alive) {
          clearTimeout(timer);
          setMissing(false);
        }
      })
      .catch(() => {
        if (alive) setMissing(true);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tag]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const [key, value] of Object.entries(properties)) {
      if (key === THUMBNAIL_KEY) continue;
      try {
        (el as unknown as Record<string, unknown>)[key] = value;
      } catch {
        // Some saved properties don't exist on the element — ignore.
      }
    }
  });

  if (missing) {
    const thumb = properties[THUMBNAIL_KEY];
    if (typeof thumb === "string" && thumb) {
      return (
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(thumb)}`}
          width={64}
          height={64}
          alt=""
        />
      );
    }
    return (
      <div
        style={{
          width: 56,
          height: 40,
          border: "1px dashed #777",
          borderRadius: 4,
        }}
      />
    );
  }
  return React.createElement(tag, { ref });
}

function CircuitPart({
  part,
}: {
  part: CircuitSnapshot["components"][number];
}) {
  const rotation =
    typeof part.properties.rotation === "number" ? part.properties.rotation : 0;
  // 4px padding + 2px transparent border = the editor's +6/+6 wrapper offset,
  // so parts sit exactly where their stored pin coordinates expect them.
  return (
    <div
      data-part=""
      style={{
        position: "absolute",
        left: part.x,
        top: part.y,
        padding: 4,
        border: "2px solid transparent",
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center center",
      }}
    >
      <PartElement tag={part.type} properties={part.properties} />
    </div>
  );
}

/** True when a hex color is dark enough to blend into the dark background —
 * mirrors WireRenderer's treatment of black wires. */
function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b < 40;
}

// Draws each wire exactly like the editor's WireRenderer: the same
// generateOrthogonalPath routing (horizontal-then-vertical elbows), the
// crossing outline, and the endpoint/waypoint dots.
function WireOverlay({ wires }: { wires: CircuitSnapshot["wires"] }) {
  if (wires.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const wire of wires) {
    for (const p of [wire.start, ...wire.waypoints, wire.end]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`${minX} ${minY} ${w} ${h}`}
      style={{
        position: "absolute",
        left: minX,
        top: minY,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <title>Circuit wiring</title>
      {wires.map((wire, i) => {
        const path = generateOrthogonalPath(
          wire.start,
          wire.waypoints,
          wire.end,
        );
        if (!path) return null;
        const color = wire.color || "#4ade80";
        const black = isDarkColor(color);
        return (
          <g key={wire.id || i}>
            {black ? (
              <path
                d={path}
                stroke="#e6e9ee"
                strokeWidth={3}
                fill="none"
                opacity={0.25}
              />
            ) : (
              <path d={path} stroke="#1a1a1a" strokeWidth={5} fill="none" />
            )}
            <path
              d={path}
              stroke={color}
              strokeWidth={2}
              fill="none"
              opacity={0.85}
            />
            <circle
              cx={wire.start.x}
              cy={wire.start.y}
              r={3}
              fill={color}
              stroke={black ? "#e6e9ee" : "#1a1a1a"}
              strokeWidth={1}
            />
            <circle
              cx={wire.end.x}
              cy={wire.end.y}
              r={3}
              fill={color}
              stroke={black ? "#e6e9ee" : "#1a1a1a"}
              strokeWidth={1}
            />
            {wire.waypoints.map((wp) => (
              <circle
                key={`${wp.x},${wp.y}`}
                cx={wp.x}
                cy={wp.y}
                r={2}
                fill={color}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function ProjectCircuitCanvas({
  circuit,
  onReady,
}: {
  circuit: CircuitSnapshot;
  /** Fires once the circuit has been measured, scaled, and painted — the
   * point where a screenshot of the container is faithful. */
  onReady?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [bounds, setBounds] = useState<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure the real rendered extent of the circuit once the web components
  // have upgraded — element sizes come from the elements themselves, so the
  // framing matches what the editor shows.
  useEffect(() => {
    let alive = true;
    const tags = new Set<string>();
    for (const b of circuit.boards) {
      const tag = boardTag(b.boardKind);
      if (tag) tags.add(tag);
    }
    for (const c of circuit.components) {
      if (isValidTag(c.type)) tags.add(c.type);
    }
    const waits = [...tags].map((tag) =>
      Promise.race([
        customElements.whenDefined(tag).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]),
    );
    Promise.all(waits)
      .then(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      )
      .then(() => {
        if (!alive || !worldRef.current) return;
        const origin = worldRef.current.getBoundingClientRect();
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const child of worldRef.current.querySelectorAll("[data-part]")) {
          const rect = child.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          minX = Math.min(minX, rect.left - origin.left);
          minY = Math.min(minY, rect.top - origin.top);
          maxX = Math.max(maxX, rect.right - origin.left);
          maxY = Math.max(maxY, rect.bottom - origin.top);
        }
        for (const wire of circuit.wires) {
          for (const p of [wire.start, ...wire.waypoints, wire.end]) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
        }
        if (!Number.isFinite(minX)) {
          minX = 0;
          minY = 0;
          maxX = 100;
          maxY = 100;
        }
        setBounds({ minX, minY, maxX, maxY });
      });
    return () => {
      alive = false;
    };
  }, [circuit]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (!bounds || !containerSize || readyFiredRef.current) return;
    // Two frames: one for React to commit the final transform, one for the
    // browser to paint it.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        readyFiredRef.current = true;
        onReadyRef.current?.();
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [bounds, containerSize]);

  const PAD = 20;
  let worldStyle: React.CSSProperties = { visibility: "hidden" };
  if (bounds && containerSize) {
    const bw = bounds.maxX - bounds.minX + PAD * 2;
    const bh = bounds.maxY - bounds.minY + PAD * 2;
    const scale = Math.min(containerSize.w / bw, containerSize.h / bh, 1.4);
    const dx = (containerSize.w - bw * scale) / 2 - (bounds.minX - PAD) * scale;
    const dy = (containerSize.h - bh * scale) / 2 - (bounds.minY - PAD) * scale;
    worldStyle = {
      transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
      transformOrigin: "0 0",
    };
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[#1e1e1e]"
    >
      <div
        ref={worldRef}
        style={{ position: "absolute", left: 0, top: 0, ...worldStyle }}
      >
        {circuit.boards.map((board, i) => (
          <BoardPart key={`${board.id}-${i}`} board={board} />
        ))}
        {circuit.components.map((part, i) => (
          <CircuitPart key={`${part.id}-${i}`} part={part} />
        ))}
        <WireOverlay wires={circuit.wires} />
      </div>
    </div>
  );
}
