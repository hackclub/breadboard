// @ts-nocheck
/**
 * ChipParts.ts — Simulation logic for complex IC chips
 *
 * Implements:
 *  - 74HC595 8-bit Serial-to-Parallel Shift Register
 *  - wokwi-7segment display (driven by 74HC595 outputs)
 *  - 8×8 dot matrix (bare 788BS, direct row/col multiplex)
 */

import { PartSimulationRegistry } from "@/lib/velxio/simulation/parts/PartSimulationRegistry";
import { useSimulatorStore } from "@/services/velxio/store/useSimulatorStore";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Given a 74HC595 component ID and a pin name (e.g. 'Q0'), find the DOM element
 * of whatever component is connected on the other side of that wire, plus the
 * pin name on that component.
 */
function getConnectedToPin(
  componentId: string,
  pinName: string,
): { element: HTMLElement; pinName: string } | null {
  const { wires } = useSimulatorStore.getState();
  for (const wire of wires) {
    let otherCompId: string | null = null;
    let otherPin: string | null = null;

    if (
      wire.start.componentId === componentId &&
      wire.start.pinName === pinName
    ) {
      otherCompId = wire.end.componentId;
      otherPin = wire.end.pinName;
    } else if (
      wire.end.componentId === componentId &&
      wire.end.pinName === pinName
    ) {
      otherCompId = wire.start.componentId;
      otherPin = wire.start.pinName;
    }

    if (otherCompId && otherPin) {
      const el = document.getElementById(otherCompId);
      if (el) return { element: el as HTMLElement, pinName: otherPin };
    }
  }
  return null;
}

/**
 * Per-element multiplexing state for 7-segment displays.
 *
 * wokwi-7segment exposes either COM.1/COM.2 (for digits=1 — same physical
 * cathode, two pin positions) or DIG1..DIGn (for digits=2/3/4). Code that
 * lights more than one digit via multiplexing rapidly toggles the digit-
 * select pin while writing different segment patterns. We capture this:
 *
 *  - segments[] holds the live Arduino-driven segment pin states (A-G+DP).
 *  - digitEnabled[d] tracks whether the d-th digit-select pin is HIGH.
 *  - digitValues[d][seg] is the LATCHED state of that digit's segments —
 *    updated continuously while digitEnabled[d] is true, frozen otherwise.
 *
 * The wokwi-7segment element renders `values` as a flat array of length
 * `digits*8` (indices d*8..d*8+7 are digit d's A..DP). We rebuild that
 * flat array from digitValues on every update.
 *
 * Polarity convention: digit pin HIGH = digit enabled. Matches the
 * transistor-driver pattern most multiplex code uses (Arduino HIGH →
 * transistor on → COM line pulled low → common-cathode digit lit). For
 * direct common-cathode without a transistor (active-low COM), users
 * should add a transistor — that's the wiring this simulator models.
 *
 * Fallback: if NO digit-select pin is wired to an Arduino pin (pure
 * direct-drive single display, common cathode tied to GND), we default
 * all digits to enabled so segment writes propagate immediately. That
 * preserves the pre-multiplex-aware behaviour for the simplest case.
 */
const SEGMENT_INDEX: Record<string, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
  G: 6,
  DP: 7,
};
const SEGMENT_NAMES = ["A", "B", "C", "D", "E", "F", "G", "DP"] as const;

interface SevenSegState {
  digits: number;
  segments: number[]; // length 8
  digitValues: number[][]; // [digit][seg]; flattened into element.values
  digitEnabled: boolean[]; // length = digits
}

const sevenSegState = new WeakMap<HTMLElement, SevenSegState>();

function getDigitsCount(element: HTMLElement): number {
  const raw = (element as unknown as { digits?: unknown }).digits;
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? 1), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(8, Math.floor(n));
}

function get7SegState(element: HTMLElement): SevenSegState {
  let s = sevenSegState.get(element);
  if (!s) {
    const digits = getDigitsCount(element);
    s = {
      digits,
      segments: [0, 0, 0, 0, 0, 0, 0, 0],
      digitValues: Array.from({ length: digits }, () => [
        0, 0, 0, 0, 0, 0, 0, 0,
      ]),
      digitEnabled: Array(digits).fill(false),
    };
    sevenSegState.set(element, s);
  }
  return s;
}

function flush7SegValues(element: HTMLElement) {
  const s = get7SegState(element);
  const flat: number[] = [];
  for (let d = 0; d < s.digits; d++) flat.push(...s.digitValues[d]);
  (element as unknown as { values: number[] }).values = flat;
}

function handle7SegSegment(
  element: HTMLElement,
  segIdx: number,
  state: boolean,
) {
  const s = get7SegState(element);
  s.segments[segIdx] = state ? 1 : 0;
  // Mirror into every currently-enabled digit's latched slot, so multiplex
  // sequences that change segments WHILE a digit is enabled keep working.
  let any = false;
  for (let d = 0; d < s.digits; d++) {
    if (s.digitEnabled[d]) {
      s.digitValues[d][segIdx] = s.segments[segIdx];
      any = true;
    }
  }
  if (any) flush7SegValues(element);
}

function handle7SegDigit(
  element: HTMLElement,
  digitIdx: number,
  state: boolean,
) {
  const s = get7SegState(element);
  if (digitIdx < 0 || digitIdx >= s.digits) return;
  const wasEnabled = s.digitEnabled[digitIdx];
  s.digitEnabled[digitIdx] = state;
  // On LOW->HIGH transition, latch the live segments into this digit's slot
  // so the very first frame this digit is enabled reflects the current
  // Arduino-driven pattern. Without this, multiplex code that sets segments
  // BEFORE toggling the digit pin would miss the first refresh and render
  // a stale value for one cycle.
  if (!wasEnabled && state) {
    s.digitValues[digitIdx] = [...s.segments];
    flush7SegValues(element);
  }
}

/** Legacy entry point — direct segment write with no multiplex awareness.
 *  Kept for the chained-via-74HC595 path which still uses the old API. */
function set7SegPin(element: HTMLElement, pinName: string, state: boolean) {
  const idx = SEGMENT_INDEX[pinName.toUpperCase()];
  if (idx === undefined) return;
  // Force the legacy single-digit assumption: enable digit 0 so the segment
  // write actually surfaces. Multi-digit displays driven via 74HC595 would
  // need their own dedicated wiring; that path doesn't exist in the wild.
  const s = get7SegState(element);
  s.digitEnabled[0] = true;
  handle7SegSegment(element, idx, state);
}

// ─── 74HC595 simulation ───────────────────────────────────────────────────────

PartSimulationRegistry.register("74hc595", {
  attachEvents: (
    element,
    simulator,
    getArduinoPinHelper,
    _componentId,
    getPinResolver,
  ) => {
    const pinManager = (simulator as any).pinManager;
    if (!pinManager) return () => {};

    // Internal state
    let shiftReg = 0; // 8-bit shift register
    let storageReg = 0; // 8-bit storage register (output)
    let oeActive = false; // output enable (active low)
    let mrActive = true; // master reset (active low — HIGH = not reset)

    let prevShcp = false;
    let prevStcp = false;

    // Phase 5 migration: prefer PinResolver subscriptions so the 595's
    // five control pins (DS / SHCP / STCP / MR / OE) work correctly
    // even when driven through an active device (BJT, level shifter).
    // The rising-edge detection on SHCP / STCP still works — resolver
    // onChange only fires on real transitions, so `state === 'HIGH'`
    // is the rising edge.  Output side stays untouched (still pushes
    // visual state via the wokwi DOM elements + downstream parts).
    const useResolver = typeof getPinResolver === "function";

    type PinSub = {
      getInitialHigh(): boolean;
      onHighLow(cb: (high: boolean) => void): () => void;
    };

    function pinSub(name: string): PinSub | null {
      if (useResolver) {
        const r = getPinResolver!(name);
        if (!r) return null;
        return {
          getInitialHigh: () => r.getCurrentState() === "HIGH",
          onHighLow: (cb) => r.onChange((state) => cb(state === "HIGH")),
        };
      }
      const pin = getArduinoPinHelper(name);
      if (pin === null) return null;
      return {
        getInitialHigh: () => false,
        onHighLow: (cb) =>
          pinManager.onPinChange(pin, (_: number, s: boolean) => cb(s)),
      };
    }

    const subDS = pinSub("DS");
    const subSHCP = pinSub("SHCP");
    const subSTCP = pinSub("STCP");
    const subMR = pinSub("MR");
    const subOE = pinSub("OE");

    const unsubscribers: (() => void)[] = [];

    // Helper: propagate current storage reg outputs to connected components
    const propagateOutputs = () => {
      if (!oeActive) return; // outputs disabled (OE high = disabled)
      const compId = element.id;

      // Q0-Q7 maps to bits 0-7 of storageReg
      const outputPins = ["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"];
      for (let i = 0; i < 8; i++) {
        const state = ((storageReg >> i) & 1) === 1;
        const connected = getConnectedToPin(compId, outputPins[i]);
        if (connected) {
          // Update 7-segment or LED or any other component
          const tagName = connected.element.tagName.toLowerCase();
          if (tagName === "wokwi-7segment") {
            set7SegPin(connected.element, connected.pinName, state);
          } else if (tagName === "wokwi-led") {
            (connected.element as any).value = state ? 1 : 0;
          }
          // Update 74HC595 chained via Q7S
          if (tagName === "velxio-74hc595" && outputPins[i] === "Q7S") {
            // Q7S is serial out — drives DS of next chip (handled via wire logic)
          }
        }
      }

      // Update this element's visual (Q0-Q7 output dots)
      const el = element as any;
      el.values = outputPins.map((_, i) => (storageReg >> i) & 1);

      // Also propagate Q7S (serial output = bit 7 of shift register, not storage)
      const q7sConn = getConnectedToPin(element.id, "Q7S");
      if (q7sConn) {
        // Q7S is used to chain to the DS pin of next 74HC595 — this is handled
        // by the DS monitoring of the downstream chip
      }
    };

    // OE (active low — LOW enables outputs)
    if (subOE) {
      oeActive = !subOE.getInitialHigh(); // OE high at start = disabled
      unsubscribers.push(
        subOE.onHighLow((high) => {
          oeActive = !high; // OE low = active
          propagateOutputs();
        }),
      );
    } else {
      oeActive = true; // assume OE tied to GND (always enabled)
    }

    // MR (active low — LOW resets shift register)
    if (subMR) {
      mrActive = subMR.getInitialHigh();
      unsubscribers.push(
        subMR.onHighLow((high) => {
          mrActive = high;
          if (!mrActive) shiftReg = 0;
        }),
      );
    } else {
      mrActive = true; // assume MR tied high
    }

    // DS — latched on SHCP rising edge; just track current value
    let dsState = false;
    if (subDS) {
      dsState = subDS.getInitialHigh();
      unsubscribers.push(subDS.onHighLow((high) => (dsState = high)));
    }

    // SHCP — rising edge shifts DS into shift register
    if (subSHCP) {
      prevShcp = subSHCP.getInitialHigh();
      unsubscribers.push(
        subSHCP.onHighLow((high) => {
          if (high && !prevShcp && mrActive) {
            shiftReg = ((shiftReg << 1) | (dsState ? 1 : 0)) & 0xff;
          }
          prevShcp = high;
        }),
      );
    }

    // STCP — rising edge latches shift register to storage register
    if (subSTCP) {
      prevStcp = subSTCP.getInitialHigh();
      unsubscribers.push(
        subSTCP.onHighLow((high) => {
          if (high && !prevStcp) {
            storageReg = shiftReg;
            propagateOutputs();
          }
          prevStcp = high;
        }),
      );
    }

    // Initial state propagation
    propagateOutputs();

    return () => unsubscribers.forEach((u) => u());
  },
});

// ─── 7-segment display (direct-drive, when connected directly to Arduino) ────

PartSimulationRegistry.register("7segment", {
  attachEvents: (
    element,
    simulator,
    getArduinoPinHelper,
    _componentId,
    getPinResolver,
  ) => {
    const pinManager = (simulator as any).pinManager;
    if (!pinManager) return () => {};

    const unsubscribers: (() => void)[] = [];
    const s = get7SegState(element);

    // Phase 5 migration of the mixed-mode simulator project: prefer the
    // PinResolver path so digit-select pins driven through a BJT (the
    // classic multiplexed 7-segment topology) get SPICE-aware HIGH/LOW
    // detection instead of relying on the `[C, B]` PASSIVE_PIN_PAIRS
    // shortcut.  Falls back to direct pinManager + getArduinoPinHelper
    // for harnesses or builds without Phase 0.
    const useResolver = typeof getPinResolver === "function";

    // Figure out which digit-select pins this display exposes and subscribe
    // to whichever ones are actually wired. Polarity: HIGH = digit enabled.
    const digitPinNames: string[] =
      s.digits === 1
        ? ["COM.1", "COM.2"] // 1-digit: both COM pins map to digit 0
        : Array.from({ length: s.digits }, (_, i) => `DIG${i + 1}`); // 2/3/4-digit: DIG1..DIGn
    let digitPinsWired = 0;
    for (let d = 0; d < digitPinNames.length; d++) {
      const pinName = digitPinNames[d];
      const digitIdx = s.digits === 1 ? 0 : d;
      if (useResolver) {
        const resolver = getPinResolver!(pinName);
        if (!resolver) continue;
        digitPinsWired++;
        // Seed initial state — important when the wire is already
        // settled at sim start (e.g. examples that hard-wire a COM to GND).
        handle7SegDigit(
          element,
          digitIdx,
          resolver.getCurrentState() === "HIGH",
        );
        unsubscribers.push(
          resolver.onChange((state) => {
            handle7SegDigit(element, digitIdx, state === "HIGH");
          }),
        );
      } else {
        const pin = getArduinoPinHelper(pinName);
        if (pin === null) continue;
        digitPinsWired++;
        unsubscribers.push(
          pinManager.onPinChange(pin, (_: number, state: boolean) => {
            handle7SegDigit(element, digitIdx, state);
          }),
        );
      }
    }
    // No digit-select pin wired → direct drive (common cathode tied to GND,
    // or a single display being lit unconditionally). Enable every digit
    // so segment writes propagate immediately.
    if (digitPinsWired === 0) {
      for (let d = 0; d < s.digits; d++) s.digitEnabled[d] = true;
    }

    // Subscribe to A-G + DP segment pins.
    for (let i = 0; i < SEGMENT_NAMES.length; i++) {
      const seg = SEGMENT_NAMES[i];
      if (useResolver) {
        const resolver = getPinResolver!(seg);
        if (!resolver) continue;
        handle7SegSegment(element, i, resolver.getCurrentState() === "HIGH");
        unsubscribers.push(
          resolver.onChange((state) => {
            handle7SegSegment(element, i, state === "HIGH");
          }),
        );
      } else {
        const arduinoPin = getArduinoPinHelper(seg);
        if (arduinoPin === null) continue;
        unsubscribers.push(
          pinManager.onPinChange(arduinoPin, (_: number, state: boolean) => {
            handle7SegSegment(element, i, state);
          }),
        );
      }
    }

    return () => unsubscribers.forEach((u) => u());
  },
  // Called by SimulatorCanvas for boards without a local simulator (e.g.
  // ESP32 via QEMU backend). Dispatch by pin name.
  onPinStateChange: (pinName: string, state: boolean, element: HTMLElement) => {
    const upper = pinName.toUpperCase();
    const segIdx = SEGMENT_INDEX[upper];
    if (segIdx !== undefined) {
      // For the QEMU path we don't see the digit-select pins, so fall back
      // to legacy direct-drive: ensure digit 0 is enabled.
      const s = get7SegState(element);
      if (!s.digitEnabled.some(Boolean)) s.digitEnabled[0] = true;
      handle7SegSegment(element, segIdx, state);
      return;
    }
    if (upper === "COM.1" || upper === "COM.2") {
      handle7SegDigit(element, 0, state);
      return;
    }
    const dm = upper.match(/^DIG(\d+)$/);
    if (dm) {
      handle7SegDigit(element, parseInt(dm[1], 10) - 1, state);
    }
  },
});

const sevenSegmentLogic = PartSimulationRegistry.get("7segment");
if (sevenSegmentLogic) {
  PartSimulationRegistry.register("7segment-4digit", sevenSegmentLogic);
}

// ─── 8×8 dot matrix (bare 788BS, row-anode) ──────────────────────────────────
//
// The kit part is a bare 16-pin matrix with no driver IC. Physical pin →
// row/col mapping follows the 788BS datasheet — the same table every kit
// tutorial ships:
//   rows 1-8 (anodes):   pins 9, 14, 8, 12, 1, 7, 2, 5
//   cols 1-8 (cathodes): pins 13, 3, 4, 10, 6, 11, 15, 16
//
// A dot (r,c) conducts while its row pin is HIGH and its col pin is LOW.
// Sketches multiplex fast (one row or column enabled at a time), so a dot
// stays visually lit for DM_PERSIST_MS after it last conducted — standing in
// for the persistence-of-vision the eye provides on real hardware. Unlike
// the 7-segment latch model, the decay approach works for both row-scan and
// column-scan sketches.

const DM_ROW_PINS = ["9", "14", "8", "12", "1", "7", "2", "5"];
const DM_COL_PINS = ["13", "3", "4", "10", "6", "11", "15", "16"];
const DM_PERSIST_MS = 200;

interface DotMatrixState {
  rowHigh: boolean[]; // anode pin level; row enabled when HIGH
  colHigh: boolean[]; // cathode pin level; column conducts when LOW
  lastLit: number[]; // per dot (row*8+col), timestamp of last conduction
  shown: number[]; // what the element currently displays
}

const dotMatrixState = new WeakMap<HTMLElement, DotMatrixState>();

function getDotMatrixState(element: HTMLElement): DotMatrixState {
  let s = dotMatrixState.get(element);
  if (!s) {
    s = {
      rowHigh: Array(8).fill(false),
      colHigh: Array(8).fill(false),
      lastLit: Array(64).fill(0),
      shown: Array(64).fill(0),
    };
    dotMatrixState.set(element, s);
  }
  return s;
}

function refreshDotMatrix(element: HTMLElement, s: DotMatrixState) {
  const now = Date.now();
  const next: number[] = Array(64);
  let changed = false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const i = r * 8 + c;
      const conducting = s.rowHigh[r] && !s.colHigh[c];
      if (conducting) s.lastLit[i] = now;
      const on =
        conducting || now - s.lastLit[i] < DM_PERSIST_MS ? 1 : 0;
      next[i] = on;
      if (on !== s.shown[i]) changed = true;
    }
  }
  if (changed) {
    s.shown = next;
    (element as unknown as { values: number[] }).values = next;
  }
}

PartSimulationRegistry.register("dot-matrix-8x8", {
  attachEvents: (
    element,
    simulator,
    getArduinoPinHelper,
    _componentId,
    getPinResolver,
  ) => {
    const pinManager = (simulator as any).pinManager;
    const useResolver = typeof getPinResolver === "function";
    if (!pinManager && !useResolver) return () => {};

    const s = getDotMatrixState(element);
    const unsubscribers: (() => void)[] = [];

    const subscribe = (
      pinName: string,
      apply: (high: boolean) => void,
    ): boolean => {
      if (useResolver) {
        const resolver = getPinResolver!(pinName);
        if (resolver) {
          apply(resolver.getCurrentState() === "HIGH");
          unsubscribers.push(
            resolver.onChange((state) => {
              apply(state === "HIGH");
              refreshDotMatrix(element, s);
            }),
          );
          return true;
        }
      }
      const pin = getArduinoPinHelper(pinName);
      if (pin === null || !pinManager) return false;
      unsubscribers.push(
        pinManager.onPinChange(pin, (_: number, state: boolean) => {
          apply(state);
          refreshDotMatrix(element, s);
        }),
      );
      return true;
    };

    for (let r = 0; r < 8; r++) {
      subscribe(DM_ROW_PINS[r], (high) => (s.rowHigh[r] = high));
    }
    for (let c = 0; c < 8; c++) {
      const wired = subscribe(DM_COL_PINS[c], (high) => (s.colHigh[c] = high));
      // Cathode not driven by a GPIO → treat as tied to GND (conducting), so
      // simple row-only demos (columns hard-wired to ground through
      // resistors) still light their rows.
      if (!wired) s.colHigh[c] = false;
    }
    refreshDotMatrix(element, s);

    // Persistence decay — clears dots whose row/col scan has moved on.
    const timer = setInterval(() => refreshDotMatrix(element, s), 50);

    return () => {
      clearInterval(timer);
      unsubscribers.forEach((u) => u());
    };
  },
  // QEMU-backed boards (no local pinManager) dispatch by component pin name.
  // No decay timer on this path — the display updates on each pin event.
  onPinStateChange: (pinName: string, state: boolean, element: HTMLElement) => {
    const s = getDotMatrixState(element);
    const r = DM_ROW_PINS.indexOf(pinName);
    const c = DM_COL_PINS.indexOf(pinName);
    if (r < 0 && c < 0) return;
    if (r >= 0) s.rowHigh[r] = state;
    if (c >= 0) s.colHigh[c] = state;
    refreshDotMatrix(element, s);
  },
});
