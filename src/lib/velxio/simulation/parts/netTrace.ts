// @ts-nocheck
/**
 * netTrace.ts — lightweight electrical-net reachability over the canvas.
 *
 * Walks the wire graph plus breadboard internal strips (a row column shares
 * a net top-to-bottom, a power rail shares a net end-to-end) without
 * invoking SPICE. Used by bus-attached parts (I2C displays and the like) to
 * enforce real-life hookup: the virtual device only joins the simulated bus
 * when its pins actually trace back to the right board pins — through any
 * number of breadboard hops.
 */

import {
  getBreadboardConnectedPins,
  isBreadboard,
} from "@/lib/velxio/utils/breadboard";
import { attachmentWires } from "@/lib/velxio/utils/breadboardSnap";
import { useSimulatorStore } from "@/services/velxio/store/useSimulatorStore";

export interface PinRef {
  componentId: string;
  pinName: string;
}

/**
 * Pins tied together INSIDE a component, so nets propagate through it.
 * The LCD1602 I2C adapter feeds the LCD's power pins from its own VCC/GND
 * (and the backlight via the jumper), exactly like the real PCF8574 board.
 */
const COMPONENT_INTERNAL_TIES: Record<string, string[][]> = {
  "lcd1602-i2c": [
    ["VCC", "VDD", "A"],
    ["GND", "VSS", "K"],
  ],
};

/**
 * Breadth-first search from one pin across wires and breadboard strips.
 * Returns true as soon as `isTarget` accepts a reached pin.
 */
export function netReaches(
  from: PinRef,
  isTarget: (ref: PinRef) => boolean,
): boolean {
  const { wires: storeWires, components } = useSimulatorStore.getState();
  // Parts plugged into a breadboard contribute one zero-length edge per
  // seated pin, so a plugged part traces exactly like a hand-wired one.
  const wires = [...storeWires, ...attachmentWires(components)];
  const metadataOf = new Map(components.map((c) => [c.id, c.metadataId]));
  const seen = new Set([`${from.componentId}:${from.pinName}`]);
  const queue: PinRef[] = [from];

  while (queue.length > 0) {
    const cur = queue.pop();
    if (isTarget(cur)) return true;

    const visit = (componentId: string, pinName: string) => {
      const key = `${componentId}:${pinName}`;
      if (seen.has(key)) return;
      seen.add(key);
      queue.push({ componentId, pinName });
    };

    for (const wire of wires) {
      if (
        wire.start.componentId === cur.componentId &&
        wire.start.pinName === cur.pinName
      ) {
        visit(wire.end.componentId, wire.end.pinName);
      } else if (
        wire.end.componentId === cur.componentId &&
        wire.end.pinName === cur.pinName
      ) {
        visit(wire.start.componentId, wire.start.pinName);
      }
    }

    const metadataId = metadataOf.get(cur.componentId);
    if (metadataId && isBreadboard(metadataId)) {
      for (const pin of getBreadboardConnectedPins(metadataId, cur.pinName)) {
        visit(cur.componentId, pin);
      }
    }
    const ties = metadataId ? COMPONENT_INTERNAL_TIES[metadataId] : undefined;
    if (ties) {
      for (const group of ties) {
        if (!group.includes(cur.pinName)) continue;
        for (const pin of group) {
          if (pin !== cur.pinName) visit(cur.componentId, pin);
        }
      }
    }
  }
  return false;
}

/** Hardware I2C pin names per board family (plus dedicated SDA/SCL pads). */
function boardI2cNames(boardKind: string): { sda: string[]; scl: string[] } {
  if (boardKind === "arduino-mega") {
    return { sda: ["20", "D20", "SDA"], scl: ["21", "D21", "SCL"] };
  }
  if (boardKind.includes("esp32")) {
    return { sda: ["21", "D21", "SDA"], scl: ["22", "D22", "SCL"] };
  }
  if (boardKind.includes("pico") || boardKind.includes("rp2040")) {
    return { sda: ["GP4", "4", "SDA"], scl: ["GP5", "5", "SCL"] };
  }
  if (boardKind.startsWith("stm32")) {
    return { sda: ["PB7", "SDA"], scl: ["PB6", "SCL"] };
  }
  // AVR Uno / Nano
  return { sda: ["A4", "A4.2", "SDA"], scl: ["A5", "A5.2", "SCL"] };
}

const BOARD_VCC_PINS = new Set(["5V", "3V3", "3.3V", "VIN", "VCC"]);

type PinRole = "gnd" | "vcc" | "sda" | "scl";

/** Target predicate: is this pin the given role on any placed board? */
function boardPinTarget(role: PinRole): (ref: PinRef) => boolean {
  const { boards } = useSimulatorStore.getState();
  const kindOf = new Map(boards.map((b) => [b.id, b.boardKind]));
  return (ref) => {
    const boardKind = kindOf.get(ref.componentId);
    if (!boardKind) return false;
    if (role === "gnd") return ref.pinName.startsWith("GND");
    if (role === "vcc") return BOARD_VCC_PINS.has(ref.pinName);
    const names = boardI2cNames(boardKind);
    return names[role].includes(ref.pinName);
  };
}

export interface I2cHookupResult {
  ok: boolean;
  /** Roles that failed to trace to the board, e.g. ["VCC", "SCL"]. */
  missing: string[];
}

/**
 * Power pins each kit module must have wired for its simulation to attach —
 * the same real-life rule as the I2C check, applied to VCC/GND only. Pin
 * names are the element's own (LM35 calls VCC "+VS", the water sensor uses
 * "+"/"-", the 28BYJ-48 has only a +5V common). Omitted parts either have
 * no power pins (buttons, keypad, bare LEDs, 7-segments) or are handled
 * electrically by SPICE.
 */
export const POWER_PIN_REQUIREMENTS: Record<
  string,
  Partial<Record<"gnd" | "vcc", string[]>>
> = {
  // Kit A (Arduino UNO starter kit)
  "vibration-switch": { vcc: ["VCC"], gnd: ["GND"] },
  lm35dz: { vcc: ["+VS"], gnd: ["GND"] },
  "rc522-rfid": { vcc: ["3V3"], gnd: ["GND"] },
  "water-level-sensor": { vcc: ["+"], gnd: ["-"] },
  "uln2003-driver": { vcc: ["VCC"], gnd: ["GND"] },
  ds1302: { vcc: ["VCC"], gnd: ["GND"] },
  dht11: { vcc: ["VCC"], gnd: ["GND"] },
  "microphone-module": { vcc: ["VCC"], gnd: ["GND"] },
  "relay-1ch": { vcc: ["VCC"], gnd: ["GND"] },
  "analog-joystick": { vcc: ["VCC"], gnd: ["GND"] },
  "ir-receiver": { vcc: ["VCC"], gnd: ["GND"] },
  "remote-led-module": { gnd: ["GND"] }, // common cathode, no VCC pin
  "stepper-motor": { vcc: ["+5V"] }, // unipolar common, no GND pin
  lcd1602: { vcc: ["VDD"], gnd: ["VSS"] },
  // Kit B (ESP32 starter kit)
  "photoresistor-sensor": { vcc: ["VCC"], gnd: ["GND"] },
  "pir-motion-sensor": { vcc: ["VCC"], gnd: ["GND"] },
  "obstacle-avoidance-module": { vcc: ["VCC"], gnd: ["GND"] },
  "relay-2ch": { vcc: ["VCC"], gnd: ["GND"] },
};

/** Hardware SPI pin names per board family. */
function boardSpiNames(boardKind: string): Record<string, string[]> {
  if (boardKind === "arduino-mega") {
    return {
      sck: ["52", "D52", "SCK"],
      mosi: ["51", "D51", "MOSI"],
      miso: ["50", "D50", "MISO"],
    };
  }
  if (boardKind.includes("esp32")) {
    return {
      sck: ["18", "D18", "SCK"],
      mosi: ["23", "D23", "MOSI"],
      miso: ["19", "D19", "MISO"],
    };
  }
  if (boardKind.includes("pico") || boardKind.includes("rp2040")) {
    return {
      sck: ["GP18", "18", "SCK"],
      mosi: ["GP19", "19", "MOSI"],
      miso: ["GP16", "16", "MISO"],
    };
  }
  if (boardKind.startsWith("stm32")) {
    return { sck: ["PA5", "SCK"], mosi: ["PA7", "MOSI"], miso: ["PA6", "MISO"] };
  }
  // AVR Uno / Nano
  return {
    sck: ["13", "D13", "SCK"],
    mosi: ["11", "D11", "MOSI"],
    miso: ["12", "D12", "MISO"],
  };
}

function boardSpiTarget(role: "sck" | "mosi" | "miso"): (ref: PinRef) => boolean {
  const { boards } = useSimulatorStore.getState();
  const kindOf = new Map(boards.map((b) => [b.id, b.boardKind]));
  return (ref) => {
    const boardKind = kindOf.get(ref.componentId);
    if (!boardKind) return false;
    return boardSpiNames(boardKind)[role].includes(ref.pinName);
  };
}

/** Target predicate: any pin of any placed board (for CS/RST — user-chosen). */
function anyBoardPinTarget(): (ref: PinRef) => boolean {
  const { boards } = useSimulatorStore.getState();
  const ids = new Set(boards.map((b) => b.id));
  return (ref) => ids.has(ref.componentId);
}

/**
 * Check an SPI device's hookup: SCK/MOSI/MISO must trace to the board's
 * hardware SPI pins, and each pin in `anyBoardPin` (chip select, reset —
 * user-chosen in the sketch) must trace to some board pin.
 */
export function checkSpiHookup(
  componentId: string,
  pins: {
    sck: string[];
    mosi: string[];
    miso: string[];
    anyBoardPin?: string[];
  },
): I2cHookupResult {
  const missing: string[] = [];
  for (const role of ["sck", "mosi", "miso"] as const) {
    const reached = pins[role].some((pinName) =>
      netReaches({ componentId, pinName }, boardSpiTarget(role)),
    );
    if (!reached) missing.push(role.toUpperCase());
  }
  for (const pinName of pins.anyBoardPin ?? []) {
    if (!netReaches({ componentId, pinName }, anyBoardPinTarget())) {
      missing.push(pinName);
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Check that a component's power pins trace to a board's supply and ground.
 * Roles absent from `pins` are skipped.
 */
export function checkPowerHookup(
  componentId: string,
  pins: Partial<Record<"gnd" | "vcc", string[]>>,
): I2cHookupResult {
  const missing: string[] = [];
  for (const role of ["gnd", "vcc"] as const) {
    const names = pins[role];
    if (!names || names.length === 0) continue;
    const reached = names.some((pinName) =>
      netReaches({ componentId, pinName }, boardPinTarget(role)),
    );
    if (!reached) missing.push(names.join("/"));
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Check that a component's power and I2C pins each trace to the matching
 * board pins. `pins` maps each role to the component's own pin-name
 * candidates (elements name them differently: SDA vs DATA, VCC vs VIN…).
 */
export function checkI2cHookup(
  componentId: string,
  pins: Record<PinRole, string[]>,
): I2cHookupResult {
  const missing: string[] = [];
  for (const role of ["gnd", "vcc", "sda", "scl"] as PinRole[]) {
    const reached = pins[role].some((pinName) =>
      netReaches({ componentId, pinName }, boardPinTarget(role)),
    );
    if (!reached) missing.push(role.toUpperCase());
  }
  return { ok: missing.length === 0, missing };
}
