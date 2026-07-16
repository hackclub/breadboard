// @ts-nocheck
/**
 * Dynamic Component Renderer
 *
 * Generic component that renders any wokwi-element web component dynamically.
 * Replaces individual React wrapper components (LED.tsx, Resistor.tsx, etc.)
 *
 * Features:
 * - Creates web component from metadata
 * - Syncs React props to web component properties
 * - Extracts pinInfo from DOM for wire connections
 * - Handles component lifecycle
 */

import React, { useRef, useEffect, useCallback, useState } from "react";
import type { ComponentMetadata } from "@/lib/velxio/types/component-metadata";
import { useSimulatorStore } from "@/services/velxio/store/useSimulatorStore";
import { useWiringIssuesStore } from "@/services/velxio/store/useWiringIssuesStore";
import { useElectricalStore } from "@/services/velxio/store/useElectricalStore";
import { PartSimulationRegistry } from "@/lib/velxio/simulation/parts";
import {
  isBoardComponent,
  boardPinToNumber,
} from "@/lib/velxio/utils/boardPinMapping";
import {
  createDefaultPinResolver,
  createSpiceResolvedPinResolver,
  configFromLogicFamily,
  isActiveDevice,
  type PinResolver,
} from "@/lib/velxio/simulation/PinResolver";
import { BOARD_PIN_GROUPS } from "@/lib/velxio/simulation/spice/boardPinGroups";
import { syntheticChipPin } from "@/lib/velxio/simulation/customChips/syntheticPins";
import {
  getBreadboardConnectedPins,
  isBreadboard,
} from "@/lib/velxio/utils/breadboard";
import { getMixedModeScheduler } from "@/lib/velxio/simulation/spice/MixedModeScheduler";
import { getBoardLogicFamily } from "@/lib/velxio/simulation/LogicFamilies";

// Side-effect imports: register every web component we'll create at runtime.
// `@wokwi/elements` covers the upstream catalog; `../velxio-elements` adds
// the velxio-local elements (e.g. <velxio-capacitor-electrolytic>,
// <velxio-instr-voltmeter>) that don't exist upstream.
import "@wokwi/elements";
import "../velxio-elements";

// Map metadataId → [pinA, pinB] for 2-terminal passives.
// "Tracing through" means: if the caller arrived on pinA, continue from pinB
// (and vice-versa).
//
// NOTE: diodes / transistors / op-amps are NOT traced through as passives —
// they have polarity / Vf / non-linear behaviour that the digital layer
// cannot interpret as "same pin". BJTs are an explicit shortcut for the
// canonical "Arduino digital pin controls a load via transistor" pattern so
// 7-segment multiplex circuits with BJT digit drivers still resolve.
const PASSIVE_PIN_PAIRS_BASE: Record<string, [string, string]> = {
  resistor: ["1", "2"],
  "resistor-us": ["1", "2"],
  capacitor: ["1", "2"],
  "capacitor-electrolytic": ["+", "−"],
  inductor: ["1", "2"],
  "analog-resistor": ["A", "B"],
  "analog-capacitor": ["A", "B"],
  "analog-inductor": ["A", "B"],
  "bjt-2n2222": ["C", "B"],
  "bjt-bc547": ["C", "B"],
  "bjt-2n3055": ["C", "B"],
  "bjt-2n3906": ["C", "B"],
  "bjt-bc557": ["C", "B"],
};
// Preset variants of the generic passives share their parent's tag and pin
// layout. Mirrors the PASSIVE_PRESETS map in spice/componentToSpice.ts.
const PRESET_TO_BASE: Record<string, string> = {
  "resistor-220": "resistor",
  "resistor-330": "resistor",
  "resistor-470": "resistor",
  "resistor-1k": "resistor",
  "resistor-2k2": "resistor",
  "resistor-4k7": "resistor",
  "resistor-10k": "resistor",
  "resistor-22k": "resistor",
  "resistor-47k": "resistor",
  "resistor-100k": "resistor",
  "resistor-1m": "resistor",
  "cap-10p": "capacitor",
  "cap-22p": "capacitor",
  "cap-100p": "capacitor",
  "cap-1n": "capacitor",
  "cap-10n": "capacitor",
  "cap-100n": "capacitor",
  "cap-1u": "capacitor",
  "cap-elec-1u": "capacitor-electrolytic",
  "cap-elec-10u": "capacitor-electrolytic",
  "cap-elec-47u": "capacitor-electrolytic",
  "cap-elec-100u": "capacitor-electrolytic",
  "cap-elec-470u": "capacitor-electrolytic",
  "cap-elec-1000u": "capacitor-electrolytic",
  "ind-100u": "inductor",
  "ind-1m": "inductor",
  "ind-10m": "inductor",
};
const PASSIVE_PIN_PAIRS: Record<string, [string, string]> = {
  ...PASSIVE_PIN_PAIRS_BASE,
};
for (const [preset, base] of Object.entries(PRESET_TO_BASE)) {
  PASSIVE_PIN_PAIRS[preset] = PASSIVE_PIN_PAIRS_BASE[base];
}

type TraceState = ReturnType<typeof useSimulatorStore.getState>;

// Custom-chip output pins get stable synthetic pin numbers from
// simulation/customChips/syntheticPins so the chip is a first-class pin source.

// Depth-limited BFS: trace from (fromId, fromPin) through wires, traversing
// through passive components to reach a board pin.  Returns the arduino pin
// plus a `crossedActiveDevice` flag so the resolver factory can decide
// between digital fast-path and SPICE-resolved per-pin.
//
// A real board pin always wins (digital GPIO semantics are unchanged). Only
// when NO board pin is reachable do we fall back to a custom-chip pin on the
// net — either a neighbour chip pin, or (when the trace itself started at a
// chip pin) the starting chip pin — resolving it to its synthetic number.
//
// Lifted to module scope (was inside getArduinoPin) so that getPinResolver
// can call it too — the previous nested-scope version caused a runtime
// ReferenceError "traceDetailed is not defined" on the simulator page.
function traceDetailed(
  state: TraceState,
  fromId: string,
  fromPin: string,
  depth: number,
  activeSeen = false,
): { arduinoPin: number | null; crossedActiveDevice: boolean } {
  if (depth > 6) return { arduinoPin: null, crossedActiveDevice: activeSeen };

  const wires = state.wires.filter(
    (w) =>
      (w.start.componentId === fromId && w.start.pinName === fromPin) ||
      (w.end.componentId === fromId && w.end.pinName === fromPin),
  );

  // Remember a custom-chip neighbour on this net (if any) as a fallback —
  // a real board pin found in any branch still takes priority over it.
  let chipNeighbour: { id: string; pin: string } | null = null;

  for (const w of wires) {
    const selfEp =
      w.start.componentId === fromId && w.start.pinName === fromPin
        ? w.start
        : w.end;
    const otherEp = selfEp === w.start ? w.end : w.start;

    if (isBoardComponent(otherEp.componentId)) {
      const boardKind =
        state.boards.find((b) => b.id === otherEp.componentId)?.boardKind ??
        otherEp.componentId;
      const pin = boardPinToNumber(boardKind, otherEp.pinName);
      if (pin !== null)
        return { arduinoPin: pin, crossedActiveDevice: activeSeen };
    } else {
      const comp = state.components.find((c) => c.id === otherEp.componentId);
      if (!chipNeighbour && comp?.metadataId === "custom-chip") {
        chipNeighbour = { id: otherEp.componentId, pin: otherEp.pinName };
      }
      if (comp && isBreadboard(comp.metadataId)) {
        const nowActive = activeSeen || isActiveDevice(comp.metadataId);
        for (const otherPin of getBreadboardConnectedPins(
          comp.metadataId,
          otherEp.pinName,
        )) {
          const result = traceDetailed(
            state,
            otherEp.componentId,
            otherPin,
            depth + 1,
            nowActive,
          );
          if (result.arduinoPin !== null) return result;
        }
      }
      const pair = comp && PASSIVE_PIN_PAIRS[comp.metadataId];
      if (pair) {
        const [p1, p2] = pair;
        const otherPin = otherEp.pinName === p1 ? p2 : p1;
        const nowActive =
          activeSeen || (comp ? isActiveDevice(comp.metadataId) : false);
        const result = traceDetailed(
          state,
          otherEp.componentId,
          otherPin,
          depth + 1,
          nowActive,
        );
        if (result.arduinoPin !== null) return result;
      }
    }
  }

  // Seated on a breadboard with no wire on this pin: follow the breadboard
  // strip the pin is plugged into. Without this, a part simply pushed into the
  // board (buzzer, button, LED) never resolves a driving pin — the wire walk
  // above only sees parts that are explicitly wired. Example: a buzzer whose
  // "+" is in hole F32 reaches D8 through the J32-to-D8 wire on the same strip.
  const self = state.components.find((c) => c.id === fromId);
  const seatHole = self?.attachedTo?.pinMap?.[fromPin];
  if (self?.attachedTo && seatHole) {
    const bbId = self.attachedTo.breadboardId;
    const bb = state.components.find((c) => c.id === bbId);
    if (bb && isBreadboard(bb.metadataId)) {
      const nowActive = activeSeen || isActiveDevice(self.metadataId);
      for (const otherPin of getBreadboardConnectedPins(bb.metadataId, seatHole)) {
        const result = traceDetailed(state, bbId, otherPin, depth + 1, nowActive);
        if (result.arduinoPin !== null) return result;
      }
    }
  }

  // No board pin reachable. Fall back to a custom-chip pin on this net so the
  // chip can still drive / read it through the synthetic-pin PinManager key.
  if (chipNeighbour) {
    return {
      arduinoPin: syntheticChipPin(chipNeighbour.id, chipNeighbour.pin),
      crossedActiveDevice: activeSeen,
    };
  }
  if (
    depth === 0 &&
    state.components.find((c) => c.id === fromId)?.metadataId === "custom-chip"
  ) {
    return {
      arduinoPin: syntheticChipPin(fromId, fromPin),
      crossedActiveDevice: activeSeen,
    };
  }
  return { arduinoPin: null, crossedActiveDevice: activeSeen };
}

interface DynamicComponentProps {
  id: string;
  metadata: ComponentMetadata;
  properties: Record<string, any>;
  x?: number;
  y?: number;
  isSelected?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onPinInfoReady?: (pinInfo: any[]) => void;
}

export const DynamicComponent: React.FC<DynamicComponentProps> = ({
  id,
  metadata,
  properties,
  x = 0,
  y = 0,
  isSelected = false,
  onMouseDown,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  onPinInfoReady,
}) => {
  const elementRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Where to place the burnout badge, as % of the part graphic. Defaults to
  // centre; refined to the part's body (opposite its pins) once pinInfo loads.
  const [badgeAnchor, setBadgeAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const mountedRef = useRef(false);

  // Tracks hover over the part graphic itself (not the wrapper's padding or
  // the label strip below it) — the name label only shows while this is true.
  const [partHovered, setPartHovered] = useState(false);

  const handleComponentEvent = useSimulatorStore((s) => s.handleComponentEvent);
  const damage = useSimulatorStore((s) => s.damagedComponents[id]);
  const wiringIssue = useWiringIssuesStore((s) => s.issues[id]);
  const running = useSimulatorStore((s) => s.running);
  const simulator = useSimulatorStore((s) => s.simulator);
  // Board-less SPICE circuits (digital / analog gallery) have no MCU to
  // run, so `running` is always false — but interactive parts like
  // slide-switches and pushbuttons should still show a pointer cursor
  // and let the user click them. We treat board-less + un-paused as
  // "interactive" so the cursor + dialog gating mirror the MCU mode.
  const boardCount = useSimulatorStore((s) => s.boards.length);
  const electricalPaused = useElectricalStore((s) => s.paused);
  const interactionRunning = running || (boardCount === 0 && !electricalPaused);
  // hexEpoch increments each time a new hex is loaded, triggering a fresh
  // attachEvents call (and re-registration of I2C devices on the new bus).
  // We intentionally do NOT depend on `running` so that I2C displays and
  // other protocol parts (SSD1306, DS1307 …) are NOT torn down and
  // re-created on every stop/play cycle — which previously caused the
  // display to flash blank and lose its frame buffer.
  const hexEpoch = useSimulatorStore((s) => s.hexEpoch);

  // Track wires connected to this component so attachEvents re-runs when
  // wires are added or removed (e.g. disconnecting an LED cathode from GND).
  // Breadboard attachments count too: plugging into / out of a breadboard
  // changes connectivity exactly like adding or removing wires.
  const wireFingerprint = useSimulatorStore((s) => {
    const myWires = s.wires.filter(
      (w) => w.start.componentId === id || w.end.componentId === id,
    );
    const att = s.components.find((c) => c.id === id)?.attachedTo;
    const attSig = att
      ? `@${att.breadboardId}:${Object.entries(att.pinMap)
          .map(([pin, hole]) => `${pin}=${hole}`)
          .sort()
          .join(";")}`
      : "";
    return myWires.map((w) => w.id).join(",") + attSig;
  });

  // Check if component is interactive (has simulation logic with attachEvents)
  const logic = PartSimulationRegistry.get(metadata.id || id.split("-")[0]);
  const isInteractive = logic?.attachEvents !== undefined;

  /**
   * Sync React properties to Web Component
   */
  useEffect(() => {
    if (!elementRef.current) return;

    Object.entries(properties).forEach(([key, value]) => {
      try {
        (elementRef.current as any)[key] = value;
      } catch (error) {
        console.warn(
          `Failed to set property ${key} on ${metadata.tagName}:`,
          error,
        );
      }
    });
  }, [properties, metadata.tagName]);

  /**
   * Extract pinInfo from web component after it initializes
   */
  useEffect(() => {
    if (!elementRef.current || !onPinInfoReady) return;

    // Wait for web component to fully initialize
    const checkPinInfo = () => {
      try {
        const pinInfo = (elementRef.current as any)?.pinInfo;
        if (pinInfo && Array.isArray(pinInfo) && pinInfo.length > 0) {
          onPinInfoReady(pinInfo);
          return true;
        }
      } catch {
        // Element not ready yet
      }
      return false;
    };

    // Try immediately
    if (checkPinInfo()) return;

    // Otherwise poll every 100ms for up to 2 seconds
    const interval = setInterval(() => {
      if (checkPinInfo()) {
        clearInterval(interval);
      }
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onPinInfoReady]);

  /**
   * Handle mouse events
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onMouseDown) return;
      // Don't swallow the pointerdown for wokwi components that own their
      // own pointer interaction (rotary knobs, pushbuttons, slide-switches,
      // joysticks, keypads, encoders). For those the wokwi element binds
      // pointerdown/move/up on its shadow-DOM SVG; if we call
      // stopPropagation() in the capture phase here the internal logic
      // never sees the event and the knob can't rotate, the button never
      // reports pressed, etc.
      //
      // EVERY OTHER component (sensors, displays, LEDs, resistors, even
      // ones with attachEvents for the sensor-update / SPICE-prop bridge)
      // expects clicks to bubble up to the canvas → open the property
      // dialog or grab for drag-to-rearrange. The previous "swallow only
      // when isInteractive" heuristic was too broad: it included DHT22,
      // HC-SR04, NTC, photoresistor, LED, etc. — all of which have
      // attachEvents but no internal pointer handler, so clicks on them
      // SHOULD bubble. With the broad guard, those dialogs never opened.
      //
      // The whitelist below is tight on purpose: only add a tag name when
      // the wokwi element actually has its own pointerdown handler that
      // the user needs to reach. If a new interactive part is added,
      // append its tag here.
      const target = e.target as HTMLElement;
      const tag = target.tagName?.toLowerCase() ?? "";
      const ownsPointer =
        interactionRunning &&
        (tag === "wokwi-pushbutton" ||
          tag === "wokwi-pushbutton-6mm" ||
          tag === "wokwi-potentiometer" ||
          tag === "wokwi-slide-potentiometer" ||
          tag === "wokwi-slide-switch" ||
          tag === "wokwi-dip-switch-8" ||
          tag === "wokwi-analog-joystick" ||
          tag === "wokwi-ky-040" ||
          tag === "wokwi-membrane-keypad" ||
          tag === "wokwi-rotary-dialer");
      if (ownsPointer) {
        // Let the wokwi component own this pointerdown.
        return;
      }
      e.stopPropagation();
      onMouseDown(e);
    },
    [onMouseDown, interactionRunning],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (onDoubleClick) {
        e.stopPropagation();
        onDoubleClick(e);
      }
    },
    [onDoubleClick],
  );

  /**
   * Mount web component (only once)
   */
  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent double-mount in React StrictMode
    if (mountedRef.current) {
      return;
    }

    const element = document.createElement(metadata.tagName);
    element.id = id;

    // Set initial properties
    Object.entries(properties).forEach(([key, value]) => {
      try {
        (element as any)[key] = value;
      } catch (error) {
        console.warn(`Failed to set initial property ${key}:`, error);
      }
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(element);
    elementRef.current = element;
    mountedRef.current = true;

    // Make the hitbox match the drawing. HTML boxes hit-test across their
    // whole rect, so the wrapper used to grab clicks anywhere in the part's
    // (mostly transparent) bounding box — LED svgs for example reserve wide
    // margins for the glow filter. The wrapper sets pointer-events:none,
    // which inherits all the way into the shadow DOM; this injected sheet
    // re-enables hit-testing on painted SVG shapes only (plus the HTML
    // <canvas> screens that displays like the SSD1306 use), so the clickable
    // area is exactly the visible artwork. Events from shadow content still
    // bubble through the wrapper, so its capture-phase mousedown / hover /
    // dblclick handlers keep working. Lit elements attach their shadow root
    // on the first (async) render, hence the retry loop.
    let hitboxTimer = 0;
    const injectHitboxStyle = (tries: number) => {
      const root = element.shadowRoot;
      if (root) {
        if (!root.querySelector("style[data-painted-hitbox]")) {
          const style = document.createElement("style");
          style.setAttribute("data-painted-hitbox", "");
          style.textContent =
            "svg * { pointer-events: visiblePainted; } canvas, img { pointer-events: auto; }";
          root.appendChild(style);
        }
        return;
      }
      if (tries < 20) {
        hitboxTimer = window.setTimeout(
          () => injectHitboxStyle(tries + 1),
          100,
        );
      }
    };
    injectHitboxStyle(0);

    return () => {
      if (hitboxTimer) window.clearTimeout(hitboxTimer);
      if (containerRef.current && element.parentNode === containerRef.current) {
        containerRef.current.removeChild(element);
      }
      elementRef.current = null;
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata.tagName, id]); // Only re-create if tagName or id changes

  /**
   * Place the burnout badge on the part's BODY, not its bounding-box centre.
   * Through-hole parts (LED, diode) put their leads at one end and the body at
   * the other, so the box centre lands on the leads. The body sits opposite the
   * pins, so we reflect the pin centroid across the box centre. `offsetWidth/
   * Height` are the part's intrinsic size (unaffected by the canvas zoom
   * transform) and share pinInfo's coordinate space. Falls back to centre when
   * pinInfo is unavailable or symmetric.
   */
  useEffect(() => {
    if (!damage && !wiringIssue) return;
    let tries = 0;
    let timer = 0;
    const compute = () => {
      const el = elementRef.current as unknown as {
        pinInfo?: Array<{ x: number; y: number }>;
        offsetWidth?: number;
        offsetHeight?: number;
      } | null;
      const pins = el?.pinInfo;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      if (Array.isArray(pins) && pins.length > 0 && w > 0 && h > 0) {
        const cx = pins.reduce((s, p) => s + p.x, 0) / pins.length;
        const cy = pins.reduce((s, p) => s + p.y, 0) / pins.length;
        // Body = pin centroid reflected across the box centre, in the part's
        // own pixel space (matches pinInfo units and the element's layout box).
        setBadgeAnchor({
          left: Math.min(w, Math.max(0, w - cx)),
          top: Math.min(h, Math.max(0, h - cy)),
        });
        return;
      }
      if (tries++ < 15) timer = window.setTimeout(compute, 60);
    };
    compute();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [damage, wiringIssue]);

  /**
   * Attach component-specific DOM events (like button presses)
   */
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const onButtonPress = (e: Event) =>
      handleComponentEvent(id, "button-press", e);
    const onButtonRelease = (e: Event) =>
      handleComponentEvent(id, "button-release", e);

    el.addEventListener("button-press", onButtonPress);
    el.addEventListener("button-release", onButtonRelease);

    const logic = PartSimulationRegistry.get(metadata.id || id.split("-")[0]);

    let cleanupSimulationEvents: (() => void) | undefined;
    if (logic && logic.attachEvents) {
      // Board-less circuits (analog/digital SPICE examples) have no MCU
      // simulator, but input parts (switches, buttons, DIP switches) still
      // need their `change`/`button-press` events to fire `emitPropertyChange`
      // so the SPICE solver re-runs. Every part already guards its
      // `simulator.setPinState` / `pinManager.onPinChange` calls behind a
      // null pin lookup (`getArduinoPin` returns null when there's no board),
      // so the stub below is enough — it satisfies the type signature without
      // doing anything when called.
      const stubSimulator =
        simulator ??
        ({
          setPinState: () => {},
          isRunning: () => false,
          // Board-less circuits have no MCU simulator, but a custom chip still
          // needs a real PinManager so its digital pin writes/reads reach the
          // components wired to it (LEDs, buttons, other chips). Hand it the
          // shared flat PinManager that SimulatorCanvas subscribes LEDs to, so
          // both sides talk on the same numeric/synthetic pin ids. Falls back
          // to a no-op only if even that isn't ready yet.
          pinManager: (useSimulatorStore.getState().pinManager as any) ?? {
            onPinChange: () => () => {},
            triggerPinChange: () => {},
          },
        } as any);
      // Helper to find Arduino pin connected to a component pin.
      // Traces through electrically-transparent passive components so that a
      // circuit like  LED-cathode → resistor → GND  returns -1 (GND) instead
      // of null. Delegates to the module-level `traceDetailed`.
      //
      // Two call shapes are supported because this same function is passed
      // BOTH to PartSimulationRegistry handlers (which call it as
      // `getArduinoPin(componentPinName)`) AND to `createDefaultPinResolver`
      // as a `PinTracer` (which calls it as `tracePin(componentId,
      // componentPinName)`). When the second arg is present we treat the
      // first as a componentId override; otherwise we use the closure-
      // captured component id. The previous single-arg signature silently
      // matched the PinTracer 2-arg call as `(componentId, undefined)` —
      // traceDetailed then looked up a pin literally named "rgb-led-1" on
      // component "rgb-led-1", got null, and the PinResolver reported
      // FLOATING forever (the canonical "wokwi-rgb-led never lights up
      // even though SPICE is driving R/G/B" symptom).
      const getArduinoPin = (
        componentIdOrPin: string,
        maybePinName?: string,
      ): number | null => {
        const state = useSimulatorStore.getState();
        const componentId = maybePinName !== undefined ? componentIdOrPin : id;
        const componentPinName =
          maybePinName !== undefined ? maybePinName : componentIdOrPin;
        return traceDetailed(state, componentId, componentPinName, 0)
          .arduinoPin;
      };

      // PinResolver factory — Phase 0 of the mixed-mode simulator project
      // (see project/sim-mixedmode/ in the velxio-prod repo). For now it
      // wraps getArduinoPin + pinManager.onPinChange — zero behavioral
      // change vs the legacy path. Phase 1+ will swap in a SPICE-resolved
      // implementation that watches node voltages and threshold-converts
      // to logic states.
      const simState = useSimulatorStore.getState();
      const ownerBoard =
        simState.boards.find((b) => b.id === simState.activeBoardId) ?? null;
      const ownerBoardVcc =
        (ownerBoard &&
          BOARD_PIN_GROUPS[
            ownerBoard.boardKind as keyof typeof BOARD_PIN_GROUPS
          ]?.vcc) ??
        5;
      const getPinResolver = (componentPinName: string): PinResolver | null => {
        const state = useSimulatorStore.getState();
        const pinManager = (
          stubSimulator as {
            pinManager?: {
              onPinChange?: (
                pin: number,
                cb: (pin: number, state: boolean) => void,
              ) => () => void;
              getPinState?: (pin: number) => boolean | null;
            };
          }
        ).pinManager;

        // Phase 1b: detect whether the path between this component pin and
        // an Arduino pin passes through any active device (BJT, MOSFET,
        // op-amp, diode, regulator).  If yes → use the SPICE-resolved
        // resolver flavor so the digital state is derived from real node
        // voltages (handles transistor inversion, op-amp gain, diode
        // forward-drop, etc.).  If no → use the legacy digital fast-path
        // (zero SPICE cost, identical to Phase 0 behavior).
        const detailed = traceDetailed(state, id, componentPinName, 0);
        if (detailed.crossedActiveDevice) {
          const scheduler = getMixedModeScheduler();
          // Phase 3: threshold model from the OWNER BOARD's logic family
          // (e.g. AVR_HC for Uno, LVCMOS33 for ESP32).  Includes Schmitt
          // hysteresis when the family declares it.  Phase 3 continued
          // will let individual components override via a `logicFamily`
          // field in components-metadata.json so e.g. a 74HC14 input
          // gets Schmitt behavior even when driven from an AVR.
          const family = ownerBoard
            ? getBoardLogicFamily(ownerBoard.boardKind)
            : {
                vcc: ownerBoardVcc,
                vil: ownerBoardVcc / 2,
                vih: ownerBoardVcc / 2,
              };
          return createSpiceResolvedPinResolver(
            id,
            componentPinName,
            scheduler,
            configFromLogicFamily(family),
          );
        }

        return createDefaultPinResolver(
          id,
          componentPinName,
          {
            components: state.components as any,
            boards: state.boards,
            wires: state.wires,
            ownerBoard,
            ownerBoardVcc,
            subscribeArduinoPin: (pin, cb) => {
              if (!pinManager?.onPinChange) return () => {};
              return pinManager.onPinChange(pin, cb);
            },
            readArduinoPin: (pin) => {
              if (!pinManager?.getPinState) return null;
              try {
                return pinManager.getPinState(pin);
              } catch {
                return null;
              }
            },
          },
          getArduinoPin,
        );
      };

      cleanupSimulationEvents = logic.attachEvents(
        el,
        stubSimulator,
        getArduinoPin,
        id,
        getPinResolver,
      );
    }

    return () => {
      if (cleanupSimulationEvents) cleanupSimulationEvents();

      el.removeEventListener("button-press", onButtonPress);
      el.removeEventListener("button-release", onButtonRelease);
    };
  }, [
    id,
    handleComponentEvent,
    metadata.id,
    simulator,
    hexEpoch,
    wireFingerprint,
  ]);

  // The wrapper uses `onMouseDownCapture` (not `onMouseDown`) so it sees
  // the mousedown BEFORE the inner wokwi-element. Interactive wokwi parts
  // (pushbutton, slide-switch, potentiometer …) call stopPropagation in
  // their own bubble-phase handlers, which used to prevent any drag from
  // starting once the simulator was running. Capture phase fires first
  // and lets the canvas's drag-threshold logic distinguish click vs drag
  // at mouseup time — so the user can rearrange interactive components
  // while simulation is live.
  return (
    <div
      className="dynamic-component-wrapper"
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        cursor: interactionRunning && isInteractive ? "pointer" : "move",
        border: isSelected ? "2px dashed #007acc" : "2px solid transparent",
        borderRadius: "4px",
        padding: "4px",
        userSelect: "none",
        // Breadboards are a backing surface: they must never paint over the
        // parts plugged into them, even while selected. Pin them to a base
        // layer below every other part (which sit at 1, or 5 when selected).
        zIndex: isBreadboard(metadata.id) ? 0 : isSelected ? 5 : 1,
        // None — so the wrapper's padding, border and label strip don't
        // catch clicks. Inherits into the shadow DOM, where the injected
        // painted-hitbox sheet (see mount effect) re-enables hit-testing
        // on the drawn artwork only. Events from those painted shapes
        // still propagate through this wrapper, so the capture-phase
        // mousedown and hover handlers below are unaffected.
        pointerEvents: "none",
        transform: properties.rotation
          ? `rotate(${properties.rotation}deg)`
          : undefined,
        transformOrigin: "center center",
      }}
      onMouseDownCapture={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-component-id={id}
      data-component-type={metadata.id}
    >
      {/* Container for web component. Wrapped in a relative box so the damage
          badge can center on the PART GRAPHIC (not the padded wrapper, which
          also reserves space for the label below) and inherit the wrapper's
          rotation. */}
      <div style={{ position: "relative" }}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only visual affordance on a canvas part; keyboard users see the name via the selection action bar. */}
        <div
          ref={containerRef}
          className="web-component-container"
          onMouseEnter={() => setPartHovered(true)}
          onMouseLeave={() => setPartHovered(false)}
        />
        {!interactionRunning ? null : damage ? (
          // Burnt-out part — a scorch/smoke puff over the body, à la Tinkercad.
          <div
            className="component-damage-badge"
            title={damage.reason}
            style={{
              position: "absolute",
              top: badgeAnchor ? `${badgeAnchor.top}px` : "50%",
              left: badgeAnchor ? `${badgeAnchor.left}px` : "50%",
              transform: "translate(-50%, -50%)",
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              // charred scorch that fades into a smoky halo
              background:
                "radial-gradient(circle, rgba(20,20,20,0.85) 0%, rgba(60,60,60,0.55) 45%, rgba(120,120,120,0.18) 70%, transparent 100%)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <span
              style={{
                fontSize: 30,
                lineHeight: 1,
                filter: "drop-shadow(0 0 3px rgba(0,0,0,0.95))",
              }}
            >
              💥
            </span>
          </div>
        ) : wiringIssue ? (
          // Live wiring mistake (e.g. LED backwards) — a warning right on the
          // part so it's impossible to miss. Details also list in the panel.
          <div
            className="component-wiring-badge"
            title={`${metadata.name}: ${wiringIssue.missing.join(", ")}`}
            style={{
              position: "absolute",
              top: badgeAnchor ? `${badgeAnchor.top}px` : "50%",
              left: badgeAnchor ? `${badgeAnchor.left}px` : "50%",
              transform: "translate(-50%, -50%)",
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "#f59e0b",
              color: "#1a1300",
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1,
              border: "2px solid #fff8e1",
              boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            !
          </div>
        ) : null}
      </div>

      {/* Component label — only visible while the cursor is directly over
          the part graphic. visibility (not conditional render) keeps the
          wrapper's layout box stable, which PinOverlay measures for its
          rotation pivot. */}
      <div
        className="component-label"
        style={{
          visibility: partHovered ? "visible" : "hidden",
          fontSize: "11px",
          textAlign: "center",
          marginTop: "4px",
          color: "#666",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
        }}
      >
        {properties.pin !== undefined ? `Pin ${properties.pin}` : metadata.name}
        {properties.protocol && (
          <span
            style={{
              fontSize: "9px",
              padding: "1px 4px",
              borderRadius: "3px",
              backgroundColor:
                properties.protocol === "spi" ? "#e67e22" : "#3498db",
              color: "#fff",
              fontWeight: 600,
              textTransform: "uppercase",
              lineHeight: "1.2",
            }}
          >
            {String(properties.protocol)}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Helper function to create a component instance from metadata
 */
export function createComponentFromMetadata(
  metadata: ComponentMetadata,
  x: number,
  y: number,
): {
  id: string;
  metadataId: string;
  x: number;
  y: number;
  properties: Record<string, any>;
} {
  // Underscore separators (not '-') so the resulting id is safe to embed
  // in SPICE component / source names. ngspice's WASM build truncates
  // vector keys at '-', which broke branch-current lookups for any LED /
  // ammeter wired up by the user (visible symptom: correct node voltage,
  // dark LED). Also strip '-' from metadata.id (e.g. 'led-bar-graph') so
  // the prefix doesn't reintroduce a hyphen.
  const safePrefix = metadata.id.replace(/-/g, "_");
  return {
    id: `${safePrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    metadataId: metadata.id,
    x,
    y,
    properties: { ...metadata.defaultValues },
  };
}
