// @ts-nocheck
/**
 * Component Registry
 *
 * Singleton service that loads and provides access to component metadata.
 * Loads from components-metadata.json generated at build time.
 */

import type {
  ComponentMetadata,
  ComponentCategory,
  ComponentMetadataCollection,
} from "@/lib/velxio/types/component-metadata";
import { filterAvailableComponents } from "@/lib/velxio/data/kitInventory";
import { assetUrl } from "@/lib/velxio/utils/assetBase";

// One-line picker descriptions for entries whose generated metadata ships
// without one. Fallbacks only: a description already present in
// components-metadata.json wins, so regenerating the JSON with real
// descriptions retires these automatically.
const DESCRIPTION_FALLBACKS: Record<string, string> = {
  "arduino-uno":
    "Arduino Uno R3 (ATmega328P) with 14 digital and 6 analog pins, the main board of the starter kit.",
  "esp32-devkit-v1":
    "ESP32 DevKit v1 board with built-in Wi-Fi and Bluetooth.",
  lcd1602:
    "16x2 character LCD wired in classic HD44780 parallel mode.",
  "lcd1602-i2c":
    "IIC/I2C/TWI serial interface adapter module (PCF8574). Wire all 16 header pins pin-for-pin to the LCD1602 and GND/VCC/SDA/SCL to the board — then use LiquidCrystal_I2C.",
  "ssd1306-i2c":
    "128x64 monochrome OLED display on I2C address 0x3C.",
  "membrane-keypad":
    "4x4 button module (membrane keypad) read by scanning its row and column pins.",
  potentiometer:
    "Rotary potentiometer (5K in the Arduino kit, 10K in the ESP32 kit), turn the knob to change the voltage on SIG.",
  pushbutton:
    "Momentary 12x12 tact switch that conducts while pressed.",
  "stepper-motor":
    "28BYJ-48 style 5V stepper motor, usually driven through the ULN2003 board.",
  "7segment":
    "Single-digit 7-segment LED display with A-G and DP segment pins.",
  "analog-joystick":
    "Two-axis analog joystick with a center pushbutton.",
  "rgb-led":
    "Four-leg RGB LED, mix colors by driving R, G and B with PWM.",
  "ir-receiver":
    "38 kHz infrared receiver that decodes NEC remote-control signals.",
  "ir-remote":
    "Infrared remote control, click its buttons to send NEC codes to the IR receiver.",
  resistor:
    "Resistor with a configurable value for current limiting, pull-ups and dividers.",
  "resistor-220":
    "220 ohm 1/6W resistor, the usual pick for LED current limiting.",
  "resistor-1k":
    "1 kOhm 1/6W resistor for current limiting and voltage dividers.",
  "resistor-10k":
    "10 kOhm 1/6W resistor, commonly used as a pull-up or pull-down.",
  "photoresistor-sensor":
    "Light-dependent resistor module whose analog output tracks brightness.",
  "pir-motion-sensor":
    "PIR motion sensor that drives OUT high when movement is detected.",
};

export class ComponentRegistry {
  private static instance: ComponentRegistry;
  private metadata: Map<string, ComponentMetadata> = new Map();
  private categories: Map<ComponentCategory, ComponentMetadata[]> = new Map();
  private allComponents: ComponentMetadata[] = [];
  private loaded = false;
  private _loadPromise: Promise<void> | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry();
    }
    return ComponentRegistry.instance;
  }

  /**
   * Load metadata from JSON file
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._doLoad();
    return this._loadPromise;
  }

  /**
   * Returns the load promise so consumers can await registry readiness
   */
  get loadPromise(): Promise<void> {
    return this._loadPromise ?? this.load();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  private async _doLoad(): Promise<void> {
    try {
      // `cache: 'no-store'` so adding a new component (or rebuilding the JSON)
      // shows up after a single page refresh — without this, the browser keeps
      // serving the stale copy until you do a hard reload.
      const response = await fetch(assetUrl("/components-metadata.json"), {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to load metadata: ${response.statusText}`);
      }

      const data: ComponentMetadataCollection = await response.json();

      // Inject Raspberry Pi 3 / 4 / 5 metadata. All three share the
      // same 40-pin GPIO header; the simulator backend picks a
      // different QEMU CPU model per board (Cortex-A53/A72/A76).
      data.components.push({
        id: "raspberry-pi-zero",
        tagName: "velxio-raspberry-pi-3", // reuse 40-pin board art
        name: "Raspberry Pi Zero",
        category: "boards",
        description:
          "Raspberry Pi Zero with 40-pin GPIO. QEMU virt + Cortex-A7 (armhf) backend; presents the Pi Zero memory/SMP profile (1 core, 512 MB).",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#7E2553" rx="4"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="9" fill="#FFF">RPi0</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 40,
        tags: ["raspberry", "pi", "pi-zero", "board", "qemu", "linux"],
      });
      data.components.push({
        id: "raspberry-pi-1",
        tagName: "velxio-raspberry-pi-3", // reuse 40-pin board art
        name: "Raspberry Pi 1",
        category: "boards",
        description:
          "Raspberry Pi 1 Model B+ with 40-pin GPIO. QEMU virt + Cortex-A7 (armhf) backend; 1 core / 512 MB profile.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#A8324B" rx="4"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="9" fill="#FFF">RPi1</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 40,
        tags: ["raspberry", "pi", "rp1", "board", "qemu", "linux"],
      });
      data.components.push({
        id: "raspberry-pi-2",
        tagName: "velxio-raspberry-pi-3",
        name: "Raspberry Pi 2",
        category: "boards",
        description:
          "Raspberry Pi 2 Model B with 40-pin GPIO. QEMU virt + Cortex-A7 (armhf) backend; 4 cores / 1 GB.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#C73E5A" rx="4"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="9" fill="#FFF">RPi2</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 40,
        tags: ["raspberry", "pi", "rp2", "board", "qemu", "linux"],
      });
      data.components.push({
        id: "raspberry-pi-3",
        tagName: "velxio-raspberry-pi-3",
        name: "Raspberry Pi 3",
        category: "boards",
        description:
          "Raspberry Pi 3 Model B with 40-pin GPIO. QEMU virt + Cortex-A53 backend.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#E60049" rx="4"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="10" fill="#FFF">RPi3</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 40,
        tags: ["raspberry", "pi", "rp3", "board", "qemu", "linux"],
      });
      data.components.push({
        id: "raspberry-pi-4",
        tagName: "velxio-raspberry-pi-4",
        name: "Raspberry Pi 4",
        category: "boards",
        description:
          "Raspberry Pi 4 Model B with 40-pin GPIO. QEMU virt + Cortex-A72 backend.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#006633" rx="4"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="10" fill="#FFF">RPi4</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 40,
        tags: ["raspberry", "pi", "rp4", "board", "qemu", "linux"],
      });
      data.components.push({
        id: "raspberry-pi-5",
        tagName: "velxio-raspberry-pi-5",
        name: "Raspberry Pi 5",
        category: "boards",
        description:
          "Raspberry Pi 5 with 40-pin GPIO + RP1 southbridge. QEMU virt + Cortex-A76 backend.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#004d27" rx="4"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="10" fill="#FFF">RPi5</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 40,
        tags: ["raspberry", "pi", "rp5", "board", "qemu", "linux"],
      });

      // Kit A's "remote control supporting LED module" — a KY-016-style
      // common-cathode RGB LED module. Velxio-local element, so no
      // auto-generated metadata; injected here like the entries above.
      data.components.push({
        id: "remote-led-module",
        tagName: "velxio-remote-led-module",
        name: "RGB LED Module",
        category: "output",
        description:
          "Common-cathode RGB LED module (KY-016 style) — the LED module paired with the IR remote in the starter kit. Drive R/G/B with digitalWrite or analogWrite; GND to ground.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="6" width="48" height="46" rx="4" fill="#7f1d1d" stroke="#450a0a" stroke-width="2"/><circle cx="32" cy="24" r="10" fill="#e5e5e5" stroke="#999"/><circle cx="32" cy="24" r="6" fill="#a855f7"/><text x="32" y="46" text-anchor="middle" font-size="7" fill="#fecaca">RGB LED</text><rect x="14" y="52" width="4" height="8" fill="#d6b25e"/><rect x="26" y="52" width="4" height="8" fill="#d6b25e"/><rect x="38" y="52" width="4" height="8" fill="#d6b25e"/><rect x="50" y="52" width="4" height="8" fill="#d6b25e"/></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 4,
        tags: ["led", "rgb", "module", "remote", "ir", "ky-016", "kit"],
      });

      // Inject SPICE probe instruments — these are Velxio-specific React
      // components (not wokwi web elements), so they have no auto-generated
      // metadata but still need a registry entry so the picker can offer
      // them and the canvas can resolve them by id.
      data.components.push({
        id: "instr-voltmeter",
        tagName: "velxio-instr-voltmeter",
        name: "Voltmeter",
        category: "analog",
        description:
          "SPICE probe — displays the voltage between V+ and V-. Used in electrical-mode circuits.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="6" fill="#1f1f1f" stroke="#ffa500" stroke-width="2"/><text x="50%" y="42%" text-anchor="middle" font-family="monospace" font-size="9" fill="#ffa500">V METER</text><text x="50%" y="68%" text-anchor="middle" font-family="monospace" font-size="11" fill="#ffa500" font-weight="bold">3.30 V</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 2,
        tags: [
          "voltmeter",
          "meter",
          "probe",
          "instrument",
          "spice",
          "multimeter",
          "dmm",
        ],
      });
      data.components.push({
        id: "instr-ammeter",
        tagName: "velxio-instr-ammeter",
        name: "Ammeter",
        category: "analog",
        description:
          "SPICE probe — measures the current through its body (connect in series). Used in electrical-mode circuits.",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="6" fill="#1f1f1f" stroke="#4dd0e1" stroke-width="2"/><text x="50%" y="42%" text-anchor="middle" font-family="monospace" font-size="9" fill="#4dd0e1">A METER</text><text x="50%" y="68%" text-anchor="middle" font-family="monospace" font-size="11" fill="#4dd0e1" font-weight="bold">12.4 mA</text></svg>',
        properties: [],
        defaultValues: {},
        pinCount: 2,
        tags: [
          "ammeter",
          "meter",
          "probe",
          "instrument",
          "spice",
          "current",
          "multimeter",
          "dmm",
        ],
      });

      // Custom Chip — user-supplied WASM compiled from C. Pin layout is
      // dynamic (read from the per-instance chip.json properties), so
      // pinCount=0 is just a placeholder for the picker grid.
      data.components.push({
        id: "custom-chip",
        tagName: "velxio-custom-chip",
        name: "Custom Chip",
        category: "logic",
        description:
          "Write your own chip in C and compile to WebAssembly. Includes a gallery of examples (EEPROM, RTC, shift register, ADC, UART, …).",
        thumbnail:
          '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="14" width="52" height="36" rx="3" fill="#1a1a1a" stroke="#888" stroke-width="2"/><rect x="2" y="20" width="6" height="3" fill="#c0c0c0"/><rect x="2" y="28" width="6" height="3" fill="#c0c0c0"/><rect x="2" y="36" width="6" height="3" fill="#c0c0c0"/><rect x="2" y="44" width="6" height="3" fill="#c0c0c0"/><rect x="56" y="20" width="6" height="3" fill="#c0c0c0"/><rect x="56" y="28" width="6" height="3" fill="#c0c0c0"/><rect x="56" y="36" width="6" height="3" fill="#c0c0c0"/><rect x="56" y="44" width="6" height="3" fill="#c0c0c0"/><text x="32" y="36" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#e0e0e0">CHIP</text></svg>',
        properties: [
          { name: "chipName", type: "string", defaultValue: "My Chip" },
          { name: "sourceC", type: "string", defaultValue: "" },
          {
            name: "chipJson",
            type: "string",
            defaultValue: '{"name":"My Chip","pins":["IN","OUT","GND","VCC"]}',
          },
          { name: "wasmBase64", type: "string", defaultValue: "" },
          // For CPU-emulator chips that load their program from a project file
          // (.s / .asm / .hex / .bin). Compile-rom populates romBytes; the chip
          // reads it on chip_setup via vx_rom_size / vx_rom_read.
          { name: "romBytes", type: "string", defaultValue: "" },
          { name: "programFile", type: "string", defaultValue: "" },
          { name: "programTarget", type: "string", defaultValue: "" },
        ],
        defaultValues: {
          chipName: "My Chip",
          sourceC: "",
          chipJson: '{"name":"My Chip","pins":["IN","OUT","GND","VCC"]}',
          wasmBase64: "",
          romBytes: "",
          programFile: "",
          programTarget: "",
        },
        pinCount: 0,
        tags: [
          "custom",
          "chip",
          "wasm",
          "c",
          "wokwi",
          "eeprom",
          "rtc",
          "logic",
          "cpu",
          "8080",
          "z80",
        ],
      });

      for (const component of data.components) {
        if (!component.description?.trim()) {
          const fallback = DESCRIPTION_FALLBACKS[component.id];
          if (fallback) component.description = fallback;
        }
      }
      // The generated servo entry carries a leaked property doc ("The angle
      // of the servo (0-180 degrees)") instead of a part description.
      const servo = data.components.find((c) => c.id === "servo");
      if (servo) {
        servo.description =
          "SG90 micro servo, sweeps its arm 0 to 180 degrees from a PWM signal.";
      }

      this.processMetadata(filterAvailableComponents(data.components));
      this.loaded = true;

      console.log(
        `Loaded ${this.allComponents.length} components from metadata`,
      );
    } catch (error) {
      console.error("Failed to load component metadata:", error);
      // Continue with empty registry - app should still work with manual component addition
    }
  }

  /**
   * Process and index metadata
   */
  private processMetadata(components: ComponentMetadata[]): void {
    this.allComponents = components;
    this.metadata.clear();
    this.categories.clear();

    // Index by ID
    components.forEach((component) => {
      this.metadata.set(component.id, component);

      // Group by category
      const categoryComponents = this.categories.get(component.category) || [];
      categoryComponents.push(component);
      this.categories.set(component.category, categoryComponents);
    });
  }

  /**
   * Get all components
   */
  getAllComponents(): ComponentMetadata[] {
    return [...this.allComponents];
  }

  /**
   * Merge additional components into the registry from an external source.
   *
   * Used by private overlays (e.g. the velxio.dev pro overlay) to add
   * premium components after the default `/components-metadata.json` has
   * loaded. Components with an existing `id` are replaced; new ones are
   * appended. Categories and search index are rebuilt.
   */
  mergeComponents(extras: ComponentMetadata[]): void {
    if (!extras || extras.length === 0) return;
    const byId = new Map(this.allComponents.map((c) => [c.id, c]));
    for (const extra of extras) {
      byId.set(extra.id, extra);
    }
    this.processMetadata(Array.from(byId.values()));
  }

  /**
   * Get components by category
   */
  getByCategory(category: ComponentCategory): ComponentMetadata[] {
    return this.categories.get(category) || [];
  }

  /**
   * Get component by ID
   */
  getById(id: string): ComponentMetadata | undefined {
    return this.metadata.get(id);
  }

  /**
   * Search components by query (name, description, tags)
   */
  search(query: string): ComponentMetadata[] {
    if (!query.trim()) {
      return this.getAllComponents();
    }

    const lowerQuery = query.toLowerCase();
    return this.allComponents.filter((component) => {
      return (
        component.name.toLowerCase().includes(lowerQuery) ||
        component.id.toLowerCase().includes(lowerQuery) ||
        component.description?.toLowerCase().includes(lowerQuery) ||
        component.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * Get all available categories
   */
  getCategories(): ComponentCategory[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Reload metadata (for hot-reload in dev mode)
   */
  async reload(): Promise<void> {
    this.loaded = false;
    await this.load();
  }

  /**
   * Get component count
   */
  getComponentCount(): number {
    return this.allComponents.length;
  }

  /**
   * Get category display name
   */
  static getCategoryDisplayName(category: ComponentCategory): string {
    const displayNames: Record<ComponentCategory, string> = {
      boards: "Boards",
      sensors: "Sensors",
      displays: "Displays",
      input: "Input",
      output: "Output",
      motors: "Motors",
      communication: "Communication",
      passive: "Passive",
      logic: "Logic Gates",
      analog: "Analog",
      electromech: "Electromechanical",
      other: "Other",
    };
    return displayNames[category] || category;
  }
}

// Auto-load on module import
const registry = ComponentRegistry.getInstance();
registry.load();

export default registry;
