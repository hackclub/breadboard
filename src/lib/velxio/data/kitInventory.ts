// @ts-nocheck
import type { ComponentMetadata } from "@/lib/velxio/types/component-metadata";
import type { BoardKind } from "@/lib/velxio/types/board";

export type KitType = "arduino" | "esp32";

// Starter sketch for a brand-new project. Must define setup() and loop() —
// an empty sketch.ino compiles to a translation unit with neither, and the
// AVR linker fails with "undefined reference to `setup'/`loop'". Mirrors
// DEFAULT_INO_CONTENT in useEditorStore (the per-board default) so a fresh
// project and a freshly-added board start from the same place.
const STARTER_INO = `// Arduino Blink Example
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}`;

export const KIT_A_COMPONENT_LIMITS: Record<string, number> = {
  "breadboard-full": 1,
  "led-yellow": 5,
  "led-red": 5,
  "led-blue": 5,
  "ir-transmitter": 1,
  "resistor-220": 8,
  "resistor-1k": 5,
  "resistor-10k": 6,
  "ir-receiver": 1,
  "ir-remote": 1,
  "vibration-switch": 2,
  thermistor: 3,
  "buzzer-passive": 1,
  "buzzer-active": 1,
  "74hc595": 1,
  lm35dz: 1,
  pushbutton: 4,
  potentiometer: 1,
  lcd1602: 1,
  "lcd1602-i2c": 1,
  "rc522-rfid": 1,
  "water-level-sensor": 1,
  "membrane-keypad": 1,
  "uln2003-driver": 1,
  dht11: 1,
  "7segment": 1,
  "7segment-4digit": 1,
  "analog-joystick": 1,
  "relay-1ch": 1,
  "microphone-module": 1,
  servo: 1,
  "stepper-motor": 1,
  "dot-matrix-8x8": 1,
  ds1302: 1,
  "remote-led-module": 1,
};

export const KIT_B_COMPONENT_LIMITS: Record<string, number> = {
  "breadboard-full": 1,
  "ssd1306-i2c": 1,
  "photoresistor-sensor": 1,
  dht11: 1,
  "pir-motion-sensor": 1,
  potentiometer: 1,
  resistor: 30,
  "buzzer-passive": 1,
  "buzzer-active": 1,
  "relay-2ch": 1,
  pushbutton: 6,
  "led-red": 5,
  "led-yellow": 5,
  "led-green": 5,
  "rgb-led": 2,
  "obstacle-avoidance-module": 1,
};

export const KIT_COMPONENT_LIMITS: Record<KitType, Record<string, number>> = {
  arduino: KIT_A_COMPONENT_LIMITS,
  esp32: KIT_B_COMPONENT_LIMITS,
};

export const ALL_KIT_COMPONENT_LIMITS: Record<string, number> = {
  ...KIT_A_COMPONENT_LIMITS,
  ...KIT_B_COMPONENT_LIMITS,
};

// Parts that belong to NO kit but should still be selectable when "ignore
// stock" is on. Normal kit mode never shows these and they don't count
// against either kit's limits; they only surface once a student opts into
// ignore stock to source their own supplies. Quantities are unlimited, like
// the rest of ignore-stock. Keep this list to parts the simulator can
// actually drive so students don't place dead components.
export const IGNORE_STOCK_ONLY_COMPONENTS: ReadonlySet<string> = new Set([
  // Passive value presets (220/1k/10k already ship in the kits)
  "resistor-330",
  "resistor-470",
  "resistor-2k2",
  "resistor-4k7",
  "resistor-22k",
  "resistor-47k",
  "resistor-100k",
  "resistor-1m",
  "capacitor",
  "capacitor-electrolytic",
  "inductor",
  "cap-10p",
  "cap-22p",
  "cap-100p",
  "cap-1n",
  "cap-10n",
  "cap-100n",
  "cap-1u",
  "cap-elec-1u",
  "cap-elec-10u",
  "cap-elec-47u",
  "cap-elec-100u",
  "cap-elec-470u",
  "cap-elec-1000u",
  "ind-100u",
  "ind-1m",
  "ind-10m",
  // Diodes
  "diode",
  "diode-1n4148",
  "diode-1n4007",
  "diode-1n5817",
  "diode-1n5819",
  "zener-1n4733",
  "photodiode",
  // Transistors
  "bjt-2n2222",
  "bjt-bc547",
  "bjt-2n3055",
  "bjt-2n3906",
  "bjt-bc557",
  "mosfet-2n7000",
  "mosfet-irf540",
  "mosfet-irf9540",
  "mosfet-fqp27p06",
  // Op-amps
  "opamp-ideal",
  "opamp-lm358",
  "opamp-lm741",
  "opamp-tl072",
  "opamp-lm324",
  // Regulators + power sources
  "reg-7805",
  "reg-7812",
  "reg-7905",
  "reg-lm317",
  "battery-9v",
  "battery-aa",
  "battery-coin-cell",
  "power-supply",
  "signal-generator",
  // Optocouplers
  "opto-4n25",
  "opto-pc817",
  // Logic gates (2/3/4-input families)
  "logic-gate-and",
  "logic-gate-nand",
  "logic-gate-or",
  "logic-gate-nor",
  "logic-gate-xor",
  "logic-gate-xnor",
  "logic-gate-not",
  "logic-gate-and-3",
  "logic-gate-or-3",
  "logic-gate-nand-3",
  "logic-gate-nor-3",
  "logic-gate-and-4",
  "logic-gate-or-4",
  "logic-gate-nand-4",
  "logic-gate-nor-4",
  // 74HC logic ICs
  "ic-74hc00",
  "ic-74hc02",
  "ic-74hc04",
  "ic-74hc08",
  "ic-74hc14",
  "ic-74hc32",
  "ic-74hc86",
  // Motor drivers
  "motor-driver-l293d",
  "a4988",
  // Sensors
  "hc-sr04",
  "dht22",
  "mpu6050",
  "ds1307",
  "ky-040",
  "hx711",
  "gas-sensor",
  "flame-sensor",
  "big-sound-sensor",
  "small-sound-sensor",
  "heart-beat-sensor",
  "ntc-temperature-sensor",
  "microsd-card",
  "tilt-switch",
  "bmp280",
  // Displays / LED strips
  "ssd1306",
  "ssd1306-spi",
  "lcd2004",
  "lcd2004-i2c",
  "ili9341",
  "neopixel",
  "neopixel-matrix",
  "led-ring",
  "led-bar-graph",
  "epaper-1in54-bw",
  "epaper-2in13-bw",
  "epaper-2in13-bwr",
  "epaper-2in9-bw",
  "epaper-2in9-bwr",
  "epaper-4in2-bw",
  "epaper-7in5-bw",
  "epaper-5in65-7c",
  // Input / switches
  "slide-switch",
  "dip-switch-8",
  "pushbutton-6mm",
  "slide-potentiometer",
  "rotary-dialer",
  "biaxial-stepper",
  // Bench instruments + custom chip (injected in ComponentRegistry, no kit)
  "custom-chip",
  "instr-voltmeter",
  "instr-ammeter",
]);

export const KIT_BOARD_LIMITS: Record<
  KitType,
  Partial<Record<BoardKind, number>>
> = {
  arduino: { "arduino-uno": 1 },
  esp32: { esp32: 1 },
};

export const ALL_KIT_BOARD_LIMITS: Partial<Record<BoardKind, number>> = {
  "arduino-uno": 1,
  esp32: 1,
};

// Kit-specific display names. The same simulated part ships as a different
// physical component per kit (the Arduino kit's parts sheet calls the
// pushbutton a "Tact switch 12*12" and its pot is 5K; the ESP32 kit has a
// "Button switch" and a 10K pot), so the picker labels follow the sheet of
// whichever kit the project uses.
export const KIT_COMPONENT_NAMES: Record<KitType, Record<string, string>> = {
  arduino: {
    pushbutton: "Tact Switch 12x12",
    potentiometer: "Potentiometer 5K",
  },
  esp32: {
    pushbutton: "Button Switch",
    potentiometer: "Potentiometer 10K",
  },
};

export function kitComponentName(
  metadataId: string,
  fallback: string,
  kitType?: string | null,
): string {
  return KIT_COMPONENT_NAMES[normalizeKitType(kitType)][metadataId] ?? fallback;
}

export const MISSING_KIT_A_PARTS = [
  "Dupont/battery/USB/bread pan wires as placeable parts",
];

export const MISSING_KIT_B_PARTS = ["DuPont cables as placeable parts"];

export function normalizeKitType(kitType?: string | null): KitType {
  return kitType === "esp32" ? "esp32" : "arduino";
}

export function isKitComponent(
  metadataId: string,
  kitType?: string | null,
): boolean {
  return kitComponentLimit(metadataId, kitType) > 0;
}

export function isAnyKitComponent(metadataId: string): boolean {
  return ALL_KIT_COMPONENT_LIMITS[metadataId] !== undefined;
}

// True for parts available only through ignore stock (in no kit).
export function isIgnoreStockOnlyComponent(metadataId: string): boolean {
  return IGNORE_STOCK_ONLY_COMPONENTS.has(metadataId);
}

// Everything the picker may show (and let you place) while ignore stock is on:
// both kits' parts plus the ignore-stock-only extras.
export function isIgnoreStockComponent(metadataId: string): boolean {
  return isAnyKitComponent(metadataId) || isIgnoreStockOnlyComponent(metadataId);
}

export function isKitBoard(kind: BoardKind, kitType?: string | null): boolean {
  return kitBoardLimit(kind, kitType) > 0;
}

export function isAnyKitBoard(kind: BoardKind): boolean {
  return ALL_KIT_BOARD_LIMITS[kind] !== undefined;
}

export function kitComponentLimit(
  metadataId: string,
  kitType?: string | null,
): number {
  return KIT_COMPONENT_LIMITS[normalizeKitType(kitType)][metadataId] ?? 0;
}

export function kitBoardLimit(
  kind: BoardKind,
  kitType?: string | null,
): number {
  return KIT_BOARD_LIMITS[normalizeKitType(kitType)][kind] ?? 0;
}

export function filterKitComponents(
  components: ComponentMetadata[],
  kitType?: string | null,
): ComponentMetadata[] {
  return components.filter((component) =>
    isKitComponent(component.id, kitType),
  );
}

export function filterAnyKitComponents(
  components: ComponentMetadata[],
): ComponentMetadata[] {
  return components.filter((component) => isAnyKitComponent(component.id));
}

// The component registry is intentionally limited to the two shipped kits.
// "Ignore stock" affects quantities only; it must never introduce a third
// inventory of unrelated parts into the editor.
export function filterAvailableComponents(
  components: ComponentMetadata[],
): ComponentMetadata[] {
  return filterAnyKitComponents(components);
}

export function countKitComponents(components: { metadataId?: string }[]) {
  const counts: Record<string, number> = {};
  for (const component of components) {
    const id = component.metadataId;
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function countKitBoards(boards: { boardKind?: BoardKind }[]) {
  const counts: Partial<Record<BoardKind, number>> = {};
  for (const board of boards) {
    const kind = board.boardKind;
    if (!kind) continue;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export function createInitialKitPayload(kitType?: string | null) {
  const kit = normalizeKitType(kitType);
  const boardKind: BoardKind = kit === "esp32" ? "esp32" : "arduino-uno";
  const boardId = boardKind;

  return {
    boards: [
      {
        id: boardId,
        boardKind,
        x: 80,
        y: 80,
        running: false,
        compiledProgram: null,
        serialOutput: "",
        serialBaudRate: 0,
        serialMonitorOpen: false,
        activeFileGroupId: `group-${boardId}`,
        languageMode: "arduino",
      },
    ],
    fileGroups: {
      [`group-${boardId}`]: [{ name: "sketch.ino", content: STARTER_INO }],
    },
    components: [],
    wires: [],
    activeBoardId: boardId,
    ignoreStock: false,
  };
}
