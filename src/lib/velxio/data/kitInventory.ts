// @ts-nocheck
import type { ComponentMetadata } from "@/lib/velxio/types/component-metadata";
import type { BoardKind } from "@/lib/velxio/types/board";

export type KitType = "arduino" | "esp32";

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

export const KIT_BOARD_LIMITS: Record<KitType, Partial<Record<BoardKind, number>>> = {
  arduino: { "arduino-uno": 1 },
  esp32: { esp32: 1 },
};

export const ALL_KIT_BOARD_LIMITS: Partial<Record<BoardKind, number>> = {
  "arduino-uno": 1,
  esp32: 1,
};

export const MISSING_KIT_A_PARTS = [
  "Tact switch 12x12 distinct from generic pushbutton",
  "Remote control supporting LED module",
  "Dupont/battery/USB/bread pan wires as placeable parts",
];

export const MISSING_KIT_B_PARTS = [
  "DuPont cables as placeable parts",
];

const KIT_DEFAULT_PROPERTIES: Record<string, Record<string, unknown>> = {
  "led-red": { color: "red" },
  "led-yellow": { color: "yellow" },
  "led-blue": { color: "blue" },
  "led-green": { color: "green" },
  thermistor: { temperature: 25 },
  lm35dz: { temperature: 25 },
  dht11: { temperature: 25, humidity: 50 },
  "water-level-sensor": { level: 0 },
  "microphone-module": { soundLevel: 512 },
  "obstacle-avoidance-module": { distance: 100 },
  "74hc595": { values: [0, 0, 0, 0, 0, 0, 0, 0] },
};

export function normalizeKitType(kitType?: string | null): KitType {
  return kitType === "esp32" ? "esp32" : "arduino";
}

export function isKitComponent(metadataId: string, kitType?: string | null): boolean {
  return kitComponentLimit(metadataId, kitType) > 0;
}

export function isAnyKitComponent(metadataId: string): boolean {
  return ALL_KIT_COMPONENT_LIMITS[metadataId] !== undefined;
}

export function isKitBoard(kind: BoardKind, kitType?: string | null): boolean {
  return kitBoardLimit(kind, kitType) > 0;
}

export function isAnyKitBoard(kind: BoardKind): boolean {
  return ALL_KIT_BOARD_LIMITS[kind] !== undefined;
}

export function kitComponentLimit(metadataId: string, kitType?: string | null): number {
  return KIT_COMPONENT_LIMITS[normalizeKitType(kitType)][metadataId] ?? 0;
}

export function kitBoardLimit(kind: BoardKind, kitType?: string | null): number {
  return KIT_BOARD_LIMITS[normalizeKitType(kitType)][kind] ?? 0;
}

export function filterKitComponents(
  components: ComponentMetadata[],
  kitType?: string | null,
): ComponentMetadata[] {
  return components.filter((component) => isKitComponent(component.id, kitType));
}

export function filterAnyKitComponents(
  components: ComponentMetadata[],
): ComponentMetadata[] {
  return components.filter((component) => isAnyKitComponent(component.id));
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

function createKitComponent(metadataId: string, index: number, x: number, y: number) {
  return {
    id: `${metadataId.replace(/-/g, "_")}_kit_${index}`,
    metadataId,
    x,
    y,
    properties: { ...(KIT_DEFAULT_PROPERTIES[metadataId] ?? {}) },
  };
}

export function createInitialKitPayload(kitType?: string | null) {
  const kit = normalizeKitType(kitType);
  const boardKind: BoardKind = kit === "esp32" ? "esp32" : "arduino-uno";
  const boardId = boardKind;
  const components = [];
  let slot = 0;

  for (const [metadataId, quantity] of Object.entries(KIT_COMPONENT_LIMITS[kit])) {
    for (let i = 0; i < quantity; i += 1) {
      if (metadataId === "breadboard-full") {
        components.push(createKitComponent(metadataId, i + 1, 520, 80));
        continue;
      }

      const col = slot % 8;
      const row = Math.floor(slot / 8);
      components.push(createKitComponent(metadataId, i + 1, 80 + col * 170, 620 + row * 150));
      slot += 1;
    }
  }

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
      [`group-${boardId}`]: [{ name: "sketch.ino", content: "" }],
    },
    components,
    wires: [],
    activeBoardId: boardId,
  };
}
