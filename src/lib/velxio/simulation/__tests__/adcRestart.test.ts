// @ts-nocheck
/**
 * Analog inputs must survive a simulator restart.
 *
 * Same shape as the SPI problem in spiRestart.test.ts, one peripheral over:
 * reset() rebuilds the ADC, and the parts that inject voltages into it
 * (joystick, potentiometer, photoresistor, NTC, …) do so from attachEvents,
 * which does NOT re-run on a restart. So every analog channel read 0 after the
 * first Stop, with no way back short of a page reload.
 *
 * Physically the injected voltage belongs to the circuit, not the MCU — a
 * joystick still sits at centre when you power the board back on — so the
 * values carry across the rebuild.
 *
 * Run with `bun test`.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVRSimulator } from "@/lib/velxio/simulation/AVRSimulator";
import { setAdcVoltage } from "@/lib/velxio/simulation/parts/partUtils";
import { PinManager } from "@/lib/velxio/simulation/PinManager";

// Sketch: prints "X:<analogRead(A0)> Y:<analogRead(A1)>" every 100 ms.
const HEX = readFileSync(
  join(import.meta.dir, "fixtures/analog-read-uno.hex"),
  "utf8",
);

const A0 = 14; // AVR pin numbering: A0..A5 are 14..19
const A1 = 15;

/** floor(2.5 / 5.0 * 1024) — mid-rail on a 5 V reference. */
const MID_RAIL_COUNTS = 512;

// Anchored on the newline: without it this matches a half-transmitted line and
// reads "Y:5" out of a "Y:512" still going out over the UART.
const READING = /X:(\d+) Y:(\d+)\r?\n/;

test("an injected analog voltage survives reset()", () => {
  const sim = new AVRSimulator(new PinManager(), "uno");

  let serial = "";
  sim.onSerialData = (ch) => {
    serial += ch;
  };
  sim.loadHex(HEX);

  // Both axes parked at centre, exactly what the joystick part does once from
  // attachEvents and never again.
  setAdcVoltage(sim, A0, 2.5);
  setAdcVoltage(sim, A1, 2.5);

  /** Step until the sketch prints a fresh reading, then parse it. */
  const nextReading = (maxSteps = 20_000_000) => {
    const from = serial.length;
    for (let i = 0; i < maxSteps; i++) {
      sim.step();
      if (i % 50_000 === 0) {
        const m = serial.slice(from).match(READING);
        if (m) return { x: Number(m[1]), y: Number(m[2]) };
      }
    }
    const m = serial.slice(from).match(READING);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  };

  expect(nextReading()).toEqual({ x: MID_RAIL_COUNTS, y: MID_RAIL_COUNTS });

  sim.reset(); // Stop, then Run again
  expect(nextReading()).toEqual({ x: MID_RAIL_COUNTS, y: MID_RAIL_COUNTS });

  sim.reset(); // Reset button
  expect(nextReading()).toEqual({ x: MID_RAIL_COUNTS, y: MID_RAIL_COUNTS });
});

test("reset() keeps the channel values on the rebuilt ADC", () => {
  const sim = new AVRSimulator(new PinManager(), "uno");
  sim.loadHex(HEX);

  setAdcVoltage(sim, A0, 1.25);
  const before = sim.getADC();
  expect(before.channelValues[0]).toBe(1.25);

  sim.reset();

  // A genuinely new AVRADC — it is built against the new CPU — but carrying
  // the voltages the circuit is still applying.
  expect(sim.getADC()).not.toBe(before);
  expect(sim.getADC().channelValues[0]).toBe(1.25);
});
