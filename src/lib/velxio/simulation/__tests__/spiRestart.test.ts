// @ts-nocheck
/**
 * SPI parts must keep working across a simulator restart.
 *
 * reset() (Stop, and the Reset button) rebuilds the CPU and every peripheral,
 * but parts hook `simulator.spi.onByte` once from attachEvents and are never
 * re-attached on a restart — DynamicComponent only re-runs attachEvents when
 * the simulator instance, the hex, or the wiring changes. So `.spi` has to be
 * a facade that outlives the peripheral behind it. When it wasn't, every SPI
 * part (RC522, ILI9341, SD card, e-paper, MAX7219) worked on the first Run and
 * was dead for the rest of the session.
 *
 * Run with `bun test`. These drive the CPU through step() rather than start(),
 * which needs requestAnimationFrame; timers still advance because step() ticks
 * the CPU clock.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVRSimulator } from "@/lib/velxio/simulation/AVRSimulator";
import { PartSimulationRegistry } from "@/lib/velxio/simulation/parts/PartSimulationRegistry";
import { PinManager } from "@/lib/velxio/simulation/PinManager";
import "@/lib/velxio/simulation/parts/ProtocolParts";

const HEX = readFileSync(
  join(import.meta.dir, "fixtures/rc522-uno.hex"),
  "utf8",
);

/** Chip-select pin the fixture's sketch uses (Uno hardware SS). */
const SS_PIN = 10;

test("a hook on .spi.onByte outlives reset()", () => {
  const sim = new AVRSimulator(new PinManager(), "uno");
  sim.loadHex(HEX);

  // Stand in for a part's attachEvents: hook the bus once, never again.
  const seen = [];
  sim.spi.onByte = (mosi) => {
    seen.push(mosi);
    sim.spi.completeTransfer(0xa5);
  };

  // What avr8js does when the sketch writes SPDR, plus a peek at the byte the
  // peripheral was told to put on MISO.
  const transfer = (byte) => {
    const peripheral = sim.spiPeripheral;
    let miso = 0;
    const complete = peripheral.completeTransfer.bind(peripheral);
    peripheral.completeTransfer = (value) => {
      miso = value;
      complete(value);
    };
    peripheral.onByte(byte);
    peripheral.completeTransfer = complete;
    return miso;
  };

  const firstPeripheral = sim.spiPeripheral;
  expect(sim.peripherals).toContain(firstPeripheral);
  expect(transfer(0x26)).toBe(0xa5);

  sim.reset(); // Stop
  expect(sim.spiPeripheral).not.toBe(firstPeripheral); // really was rebuilt
  expect(transfer(0x26)).toBe(0xa5);

  sim.reset(); // Reset button
  expect(transfer(0x26)).toBe(0xa5);

  expect(seen).toEqual([0x26, 0x26, 0x26]);
});

test(
  "real MFRC522 firmware reads the card on every run, not just the first",
  () => {
    const logic = PartSimulationRegistry.get("rc522-rfid");
    const sim = new AVRSimulator(new PinManager(), "uno");

    let serial = "";
    sim.onSerialData = (ch) => {
      serial += ch;
    };
    sim.loadHex(HEX);

    // Attach the part once, the way DynamicComponent does on mount. The
    // componentId is left off so the part skips its canvas wiring check —
    // there are no stores here. Everything else is the real emulation.
    const element = { cardPresent: true, uid: "DE AD BE EF" };
    const detach = logic.attachEvents(element, sim, (pin) =>
      pin === "SDA" ? SS_PIN : null,
    );

    /** Step until `want` shows up in newly printed serial, or give up. */
    const runUntil = (want, maxSteps = 40_000_000) => {
      const from = serial.length;
      for (let i = 0; i < maxSteps; i++) {
        sim.step();
        if (i % 100_000 === 0 && serial.slice(from).includes(want)) return true;
      }
      return serial.slice(from).includes(want);
    };

    try {
      expect(runUntil("UID:DEADBEEF")).toBe(true); // fresh run
      sim.reset(); // Stop, then Run again
      expect(runUntil("UID:DEADBEEF")).toBe(true);
      sim.reset(); // Reset button
      expect(runUntil("UID:DEADBEEF")).toBe(true);

      // Three boots, three reads. Before the .spi facade existed the sketch
      // still printed "ready" three times — it booted fine, it just never
      // saw the card again.
      expect(serial.match(/ready/g)).toHaveLength(3);
      expect(serial.match(/UID:DEADBEEF/g)).toHaveLength(3);
    } finally {
      detach?.();
    }
  },
  120_000,
);
