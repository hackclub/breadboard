// @ts-nocheck
/**
 * Coverage for the parts that answer over a scheduled bit protocol.
 *
 * Only two parts drive a waveform through simulator.schedulePinChange: the DHT
 * family and HC-SR04. Both are timing-critical against a real Arduino driver,
 * and neither had a test, which is how the DHT RESPONSE_START regression
 * shipped and sat unnoticed. The DHT side is covered end-to-end in
 * plantWateringButtons.test.ts; this pins down HC-SR04.
 *
 * These only work because step() delivers due pin changes itself. Before that
 * it ran the CPU without ever flushing the schedule, so a part could emit a
 * perfect waveform and the sketch would see a flat line.
 *
 * Run with `bun test`.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVRSimulator } from "@/lib/velxio/simulation/AVRSimulator";
import { PartSimulationRegistry } from "@/lib/velxio/simulation/parts/PartSimulationRegistry";
import { PinManager } from "@/lib/velxio/simulation/PinManager";
import "@/lib/velxio/simulation/parts/SensorParts";

const HEX = readFileSync(
  join(import.meta.dir, "fixtures/hcsr04-uno.hex"),
  "utf8",
);

const TRIG_PIN = 9;
const ECHO_PIN = 10;

/** Run the pulseIn sketch against an HC-SR04 held at `distanceCm`. */
function measure(distanceCm) {
  const sim = new AVRSimulator(new PinManager(), "uno");
  let serial = "";
  sim.onSerialData = (ch) => {
    serial += ch;
  };
  sim.loadHex(HEX);

  const detach = PartSimulationRegistry.get("hc-sr04").attachEvents(
    { distance: String(distanceCm) },
    sim,
    (p) => (p === "TRIG" ? TRIG_PIN : p === "ECHO" ? ECHO_PIN : null),
  );

  try {
    while (sim.getCurrentCycles() / 16_000 < 3_000) sim.step();
  } finally {
    detach?.();
  }
  return serial;
}

test("HC-SR04 echo pulse reads back the distance it was set to", () => {
  for (const cm of [10, 100, 300]) {
    const serial = measure(cm);
    expect(serial).not.toContain("no echo");

    const readings = [...serial.matchAll(/cm=(\d+)/g)].map((m) => Number(m[1]));
    expect(readings.length).toBeGreaterThan(0);

    // pulseIn measures in µs and the sketch divides by 58; the part schedules
    // the echo at distance/17150 seconds. Allow a couple of cm for that
    // rounding plus the µs pulseIn spends recognising the edge.
    for (const got of readings) {
      expect(Math.abs(got - cm)).toBeLessThanOrEqual(2);
    }
    console.log(`set ${cm} cm -> read ${readings.slice(0, 3).join(", ")} cm`);
  }
}, 120_000);
