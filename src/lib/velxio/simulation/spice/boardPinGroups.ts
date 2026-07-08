// @ts-nocheck
/**
 * Per-board pin classification: which pin names should be canonicalized
 * to the ground net ("0"), which are supply pins, and — for each supply
 * pin — the real voltage it sources.
 *
 * A board is not a single "Vcc rail": an Arduino UNO exposes both a 5 V
 * and a 3.3 V pin, an ESP32 dev board exposes 3.3 V plus a 5 V / VIN pin
 * fed from USB. `vcc_pins` therefore maps each supply pin name to its
 * actual voltage so the netlist can drive them as separate rails. `vcc`
 * stays the board's nominal logic / I-O voltage (used for GPIO high
 * levels and logic thresholds), which is not always the same as the
 * highest supply pin.
 *
 * Extend this table as new boards are added.
 */
import type { BoardKind } from "@/lib/velxio/types/board";

export interface BoardPinGroup {
  /** Nominal logic / I-O supply voltage (V) — GPIO high level. */
  vcc: number;
  /** Pin names treated as ground. */
  gnd: string[];
  /** Supply pin name → the real voltage that pin sources (V). */
  vcc_pins: Record<string, number>;
}

type AllBoardKinds = BoardKind | "default";

export const BOARD_PIN_GROUPS: Record<AllBoardKinds, BoardPinGroup> = {
  default: {
    vcc: 5,
    gnd: ["GND", "GND.1", "GND.2"],
    vcc_pins: { "5V": 5, VCC: 5 },
  },

  "arduino-uno": {
    vcc: 5,
    gnd: ["GND.1", "GND.2", "GND.3", "GND"],
    vcc_pins: { "5V": 5, VCC: 5, "3.3V": 3.3, AREF: 5 },
  },
  "arduino-nano": {
    vcc: 5,
    gnd: ["GND.1", "GND.2", "GND"],
    vcc_pins: { "5V": 5, VCC: 5, "3V3": 3.3, AREF: 5 },
  },
  "arduino-mega": {
    vcc: 5,
    gnd: ["GND.1", "GND.2", "GND.3", "GND.4", "GND"],
    vcc_pins: { "5V": 5, VCC: 5, "3.3V": 3.3, AREF: 5 },
  },
  attiny85: { vcc: 5, gnd: ["GND"], vcc_pins: { VCC: 5 } },

  "raspberry-pi-pico": {
    vcc: 3.3,
    gnd: ["GND.1", "GND.2", "GND.3", "GND"],
    vcc_pins: { "3V3": 3.3, VBUS: 5, VSYS: 5 },
  },
  "pi-pico-w": {
    vcc: 3.3,
    gnd: ["GND.1", "GND.2", "GND.3", "GND"],
    vcc_pins: { "3V3": 3.3, VBUS: 5, VSYS: 5 },
  },
  "raspberry-pi-3": { vcc: 5, gnd: ["GND"], vcc_pins: { "5V": 5, "3V3": 3.3 } },
  "raspberry-pi-4": { vcc: 5, gnd: ["GND"], vcc_pins: { "5V": 5, "3V3": 3.3 } },
  "raspberry-pi-5": { vcc: 5, gnd: ["GND"], vcc_pins: { "5V": 5, "3V3": 3.3 } },

  esp32: {
    vcc: 3.3,
    gnd: ["GND", "GND.1", "GND.2"],
    vcc_pins: { "3V3": 3.3, VIN: 5, "5V": 5 },
  },
  "esp32-devkit-c-v4": {
    vcc: 3.3,
    gnd: ["GND", "GND.1", "GND.2"],
    vcc_pins: { "3V3": 3.3, VIN: 5, "5V": 5 },
  },
  "esp32-cam": { vcc: 3.3, gnd: ["GND"], vcc_pins: { "3V3": 3.3, "5V": 5 } },
  "wemos-lolin32-lite": {
    vcc: 3.3,
    gnd: ["GND"],
    vcc_pins: { "3V3": 3.3, "5V": 5 },
  },
  "esp32-s3": {
    vcc: 3.3,
    gnd: ["GND", "GND.1", "GND.2"],
    vcc_pins: { "3V3": 3.3, VIN: 5, "5V": 5 },
  },
  "xiao-esp32-s3": { vcc: 3.3, gnd: ["GND"], vcc_pins: { "3V3": 3.3, "5V": 5 } },
  "arduino-nano-esp32": {
    vcc: 3.3,
    gnd: ["GND"],
    vcc_pins: { "3V3": 3.3, "5V": 5, VUSB: 5 },
  },
  "esp32-c3": {
    vcc: 3.3,
    gnd: ["GND", "GND.1", "GND.2"],
    vcc_pins: { "3V3": 3.3, VIN: 5, "5V": 5 },
  },
  "xiao-esp32-c3": { vcc: 3.3, gnd: ["GND"], vcc_pins: { "3V3": 3.3, "5V": 5 } },
  "aitewinrobot-esp32c3-supermini": {
    vcc: 3.3,
    gnd: ["GND"],
    vcc_pins: { "3V3": 3.3, "5V": 5 },
  },
};
