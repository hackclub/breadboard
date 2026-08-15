// @ts-nocheck
/**
 * Reproduction for the "buttons don't switch the view" report on project 215
 * (myRaspberryPiArticles/plant-watering-system).
 *
 * The claim under test is that this is a firmware bug, not a simulator bug.
 * The sketch's loop() is:
 *
 *     buttons() -> digitalRead(8); digitalRead(4); then dht11() or water()
 *
 * and dht11() opens with delay(2000) before two blocking DHT reads. So on the
 * default page the pins are sampled for an instant once every ~2 s, and a click
 * that lands in the blocking stretch is never seen. Holding the button works,
 * which is the asymmetry the reviewer hit.
 *
 * Observables, both taken from real emulation rather than from the sketch:
 *  - loop iterations   -> bursts of activity on the DHT data line (pin 2)
 *  - page == false     -> pin 5 driven HIGH, which only set_rgb_led() in
 *                         water() ever does; dht11() never touches the LED
 *
 * The fixture is the students' own firmware/*.ino concatenated as the Arduino
 * IDE would, compiled by the editor backend at arduino:avr:uno — the same build
 * a user gets from Run.
 *
 * Run with `bun test`. Drives the CPU via step() rather than start(), which
 * needs requestAnimationFrame.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVRSimulator } from "@/lib/velxio/simulation/AVRSimulator";
import { PartSimulationRegistry } from "@/lib/velxio/simulation/parts/PartSimulationRegistry";
import { PinManager } from "@/lib/velxio/simulation/PinManager";
import "@/lib/velxio/simulation/parts/ProtocolParts";

const HEX = readFileSync(
  join(import.meta.dir, "fixtures/plant-watering-uno.hex"),
  "utf8",
);

const BUTTON_PIN = 8; // sets page = false -> water view
const BUTTON_2_PIN = 4; // sets page = true  -> dht view
const DHT_PIN = 2; // DHT11 data, per breadboard-project.json
const RGB_R_PIN = 5; // only written from water()

function boot() {
  const sim = new AVRSimulator(new PinManager(), "uno");
  const ledHigh = [];
  const dhtEdges = [];
  let serial = "";
  sim.onSerialData = (ch) => {
    serial += ch;
  };
  sim.onPinChangeWithTime = (pin, state, timeMs) => {
    if (pin === RGB_R_PIN && state) ledHigh.push(timeMs);
    if (pin === DHT_PIN) dhtEdges.push(timeMs);
  };
  sim.loadHex(HEX);

  // Real DHT11 emulation on pin 2, attached the way DynamicComponent does.
  // componentId is left off so the part skips its canvas wiring check.
  const detach = PartSimulationRegistry.get("dht11").attachEvents(
    { temperature: 25.0, humidity: 50.0 },
    sim,
    (p) => (p === "SDA" ? DHT_PIN : null),
  );

  // Both buttons idle HIGH, exactly what the pushbutton part seeds for
  // INPUT_PULLUP (see BasicParts.ts).
  sim.setPinState(BUTTON_PIN, true);
  sim.setPinState(BUTTON_2_PIN, true);

  const now = () => sim.getCurrentCycles() / 16_000; // ms of simulated time
  // step() delivers due pin changes itself, so a scheduled sensor waveform
  // reaches the CPU here exactly as it does under start()'s rAF loop.
  const runTo = (targetMs) => {
    while (now() < targetMs) sim.step();
  };
  return { sim, ledHigh, dhtEdges, detach, now, runTo, serial: () => serial };
}

/** Burst starts = first edge after >100 ms of quiet on the DHT line. */
function burstStarts(edges) {
  const out = [];
  let prev = -Infinity;
  for (const t of edges) {
    if (t - prev > 100) out.push(t);
    prev = t;
  }
  return out;
}

/**
 * Regression guard for the DHT response window. The emulated sensor has to
 * pull DATA low before the Adafruit library takes its first sample, which it
 * does pullTime (55 µs by default, set in dht.begin()) after releasing the
 * line. Answer later than that and expectPulse(LOW) returns 0 instead of
 * measuring the preamble, so the whole frame shifts by one pulse pair and the
 * checksum fails on every read. RESPONSE_START was us(70) from 079bb49 until
 * this was caught, which broke DHT11 and DHT22 on every AVR board.
 */
test("the DHT11 read succeeds, so the sketch never prints a read failure", () => {
  const { detach, runTo, serial } = boot();
  try {
    runTo(15_000);
  } finally {
    detach?.();
  }
  expect(serial()).not.toContain("Failed to read");
}, 120_000);

test("loop() only samples the buttons once every ~2 s", () => {
  const { dhtEdges, detach, runTo } = boot();
  try {
    runTo(15_000);
  } finally {
    detach?.();
  }

  const starts = burstStarts(dhtEdges);
  expect(starts.length).toBeGreaterThan(3);

  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  const period = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  console.log(
    `loop period: ${period.toFixed(0)} ms over ${gaps.length} iterations`,
  );

  // One sample per loop, and the loop is dominated by dht11()'s delay(2000).
  expect(period).toBeGreaterThan(1900);
}, 120_000);

test("a realistic 150 ms click is dropped", () => {
  const { sim, ledHigh, dhtEdges, detach, runTo } = boot();
  try {
    // Land the click inside the blocking stretch: just after a loop began.
    runTo(2_500);
    const before = burstStarts(dhtEdges).length;
    sim.setPinState(BUTTON_PIN, false); // press
    runTo(2_650); // hold 150 ms
    sim.setPinState(BUTTON_PIN, true); // release
    runTo(12_000);

    expect(burstStarts(dhtEdges).length).toBeGreaterThan(before); // still looping
    expect(ledHigh).toEqual([]); // water() never ran
  } finally {
    detach?.();
  }
}, 120_000);

test("holding the same button for 3 s switches the view", () => {
  const { sim, ledHigh, detach, runTo } = boot();
  try {
    runTo(2_500);
    sim.setPinState(BUTTON_PIN, false); // press and hold
    runTo(5_500);
    sim.setPinState(BUTTON_PIN, true); // release
    runTo(8_000);

    console.log(`water view first rendered at ${ledHigh[0]?.toFixed(0)} ms`);
    expect(ledHigh.length).toBeGreaterThan(0);
  } finally {
    detach?.();
  }
}, 120_000);
