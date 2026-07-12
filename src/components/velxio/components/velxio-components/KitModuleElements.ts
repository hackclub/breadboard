// @ts-nocheck
/** Native Velxio web components for starter-kit modules not covered by @wokwi/elements. */

import { assetUrl } from "@/lib/velxio/utils/assetBase";

const power = (signal: string, voltage?: number) => ({
  type: "power",
  signal,
  ...(voltage ? { voltage } : {}),
});
const analog = (channel: number) => ({ type: "analog", channel });
const spi = (signal: string) => ({ type: "spi", signal, bus: 0 });
const i2c = (signal: string) => ({ type: "i2c", signal, bus: 0 });

type Pin = { name: string; x: number; y: number; signals?: Array<unknown> };

const styles = `
  :host { display: inline-block; line-height: 0; }
  svg { display: block; overflow: visible; }
  .pcb { filter: drop-shadow(0 2px 2px rgba(0,0,0,.28)); }
  .hole { fill: #dbeafe; stroke: #6b7280; stroke-width: .6; }
  .header { fill: #111827; stroke: #020617; stroke-width: .8; }
  .gold { fill: #f4c430; stroke: #5b4200; stroke-width: .45; }
  .silk { font: 800 7px Inter, Arial, sans-serif; fill: white; text-anchor: middle; letter-spacing: .35px; }
  .sub { font: 700 5.4px Inter, Arial, sans-serif; fill: #bfdbfe; text-anchor: middle; letter-spacing: .2px; }
  .chip { fill: #111827; stroke: #020617; stroke-width: 1; }
  .metal { fill: #d1d5db; stroke: #64748b; stroke-width: .8; }
  .trace { fill: none; stroke: #93c5fd; stroke-width: 1.15; opacity: .75; }
  .led-on { fill: #22c55e; filter: drop-shadow(0 0 3px #22c55e); }
  .led-off { fill: #14532d; stroke: #86efac; stroke-width: .6; }
  .red-led-on { fill: #ef4444; filter: drop-shadow(0 0 4px #ef4444); }
  .red-led-off { fill: #4c0519; stroke: #fecdd3; stroke-width: .55; }
  .readout { font: 700 5.5px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #e0f2fe; text-anchor: middle; }
`;

class SvgPartElement extends HTMLElement {
  readonly pinInfo: Pin[];

  constructor(pinInfo: Pin[], svg: string) {
    super();
    this.pinInfo = pinInfo;
    this.attachShadow({
      mode: "open",
    }).innerHTML = `<style>${styles}</style>${svg}`;
  }
}

class VibrationSwitchElement extends SvgPartElement {
  private _active = false;

  set active(value: boolean) {
    this._active = Boolean(value);
    const led = this.shadowRoot?.getElementById("activity-led");
    led?.setAttribute("class", this._active ? "red-led-on" : "red-led-off");
  }

  get active() {
    return this._active;
  }

  constructor() {
    const pins = [
      { name: "VCC", x: 18, y: 64, signals: [power("VCC", 5)] },
      { name: "OUT", x: 43, y: 64 },
      { name: "GND", x: 68, y: 64, signals: [power("GND")] },
    ];
    super(
      pins,
      `<svg width="86" height="68" viewBox="0 0 86 68">
        <image href="${assetUrl("/component-svgs/vibration-switch.svg")}" x="0" y="0" width="86" height="68"/>
        <circle id="activity-led" class="red-led-off" cx="70" cy="22" r="3"/>
      </svg>`,
    );
  }
}

class Lm35Element extends SvgPartElement {
  private _temperature = 25;

  set temperature(value: number) {
    this._temperature = Number(value) || 0;
    const text = this.shadowRoot?.getElementById("temperature-readout");
    if (text) text.textContent = `${this._temperature.toFixed(0)}C`;
  }

  get temperature() {
    return this._temperature;
  }

  constructor() {
    const pins = [
      { name: "+VS", x: 25, y: 78, signals: [power("VCC", 5)] },
      { name: "OUT", x: 36, y: 78, signals: [analog(0)] },
      { name: "GND", x: 47, y: 78, signals: [power("GND")] },
    ];
    super(
      pins,
      `<svg width="72" height="84" viewBox="0 0 72 84" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lm35-body" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#2b3038"/><stop offset="1" stop-color="#050505"/>
          </linearGradient>
          <filter id="lm35-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.6" stdDeviation="1.2" flood-opacity=".35"/>
          </filter>
        </defs>
        <path d="M18 58V30c0-17 36-17 36 0v28z" fill="url(#lm35-body)" stroke="#020617" stroke-width="1.2" filter="url(#lm35-shadow)"/>
        <path d="M20 31c2-9 30-9 32 0" fill="none" stroke="#4b5563" stroke-width="2" opacity=".9"/>
        <rect x="25" y="25" width="22" height="7" rx="3.5" fill="#1f2937" opacity=".85"/>
        <text x="36" y="43" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="8" font-weight="800" fill="#f8fafc">LM35</text>
        <text x="36" y="52" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="5" font-weight="700" fill="#cbd5e1">DZ</text>
        <path d="M25 58v20M36 58v20M47 58v20" stroke="#cbd5e1" stroke-width="2.4" stroke-linecap="round"/>
        <text x="25" y="83" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">+VS</text>
        <text x="36" y="83" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">OUT</text>
        <text x="47" y="83" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">GND</text>
        <text id="temperature-readout" class="readout" x="36" y="16">25C</text>
      </svg>`,
    );
  }
}

class Rc522Element extends SvgPartElement {
  private _cardPresent = false;
  private _uid = "DE AD BE EF";

  set cardPresent(value: boolean) {
    this._cardPresent = Boolean(value);
    const card = this.shadowRoot?.getElementById("rfid-card");
    const led = this.shadowRoot?.getElementById("rfid-led");
    const wave = this.shadowRoot?.getElementById("rfid-wave");
    card?.setAttribute("opacity", this._cardPresent ? "1" : "0.16");
    led?.setAttribute("class", this._cardPresent ? "led-on" : "led-off");
    wave?.setAttribute("opacity", this._cardPresent ? "0.9" : "0");
  }

  get cardPresent() {
    return this._cardPresent;
  }

  set uid(value: string) {
    this._uid = String(value ?? "");
    const label = this.shadowRoot?.getElementById("rfid-uid");
    if (label) label.textContent = this._uid.replace(/\s+/g, " ").trim();
  }

  get uid() {
    return this._uid;
  }

  constructor() {
    const pins = [
      { name: "SDA", x: 61.8, y: 3.6, signals: [spi("CS")] },
      { name: "SCK", x: 54.6, y: 3.6, signals: [spi("SCK")] },
      { name: "MOSI", x: 47.4, y: 3.6, signals: [spi("MOSI")] },
      { name: "MISO", x: 40.2, y: 3.6, signals: [spi("MISO")] },
      { name: "IRQ", x: 33.0, y: 3.6 },
      { name: "GND", x: 25.8, y: 3.6, signals: [power("GND")] },
      { name: "RST", x: 18.6, y: 3.6 },
      { name: "3V3", x: 11.4, y: 3.6, signals: [power("VCC", 3.3)] },
    ];
    super(
      pins,
      `<svg width="74.333" height="111.6" viewBox="0 0 74.333 111.6">
        <style>
          @keyframes rfid-ping { 0% { transform: scale(.6); opacity:.9 } 100% { transform: scale(1.25); opacity:0 } }
          #rfid-wave { transform-box: fill-box; transform-origin: center; animation: rfid-ping 1.4s ease-out infinite; }
        </style>
        <image href="${assetUrl("/component-svgs/rc522-rfid.svg")}" x="0" y="0" width="74.333" height="111.6"/>
        <circle id="rfid-wave" cx="27" cy="39" r="20" fill="none" stroke="#38bdf8" stroke-width="1.6" opacity="0"/>
        <rect id="rfid-card" x="14" y="30" width="26" height="18" rx="2" fill="#f8fafc" opacity="0.16" filter="drop-shadow(0 1px 2px rgba(0,0,0,.35))"/>
        <path d="M18 36h17M18 41h12" stroke="#f59e0b" stroke-width="1.2"/>
        <text id="rfid-uid" class="readout" x="37" y="60" fill="#38bdf8">DE AD BE EF</text>
        <circle id="rfid-led" class="led-off" cx="63" cy="22" r="2.8"/>
      </svg>`,
    );
  }
}

class WaterLevelElement extends SvgPartElement {
  private _level = 0;

  set level(value: number) {
    this._level = Math.max(0, Math.min(100, Number(value) || 0));
    const water = this.shadowRoot?.getElementById("water-fill");
    const text = this.shadowRoot?.getElementById("level-readout");
    const height = (this._level / 100) * 42;
    water?.setAttribute("y", String(66 - height));
    water?.setAttribute("height", String(height));
    if (text) text.textContent = `${this._level.toFixed(0)}%`;
  }

  get level() {
    return this._level;
  }

  constructor() {
    const pins = [
      { name: "+", x: 18, y: 80, signals: [power("VCC", 5)] },
      { name: "S", x: 43, y: 80, signals: [analog(0)] },
      { name: "-", x: 68, y: 80, signals: [power("GND")] },
    ];
    super(
      pins,
      `<svg width="86" height="84" viewBox="0 0 86 84">
        <image href="${assetUrl("/component-svgs/water-level-sensor.svg")}" x="0" y="0" width="86" height="100" transform="scale(1 .84)"/>
        <rect id="water-fill" x="17" y="66" width="52" height="0" rx="2" fill="#38bdf8" opacity=".5"/>
        <text id="level-readout" class="readout" x="43" y="72">0%</text>
      </svg>`,
    );
  }
}

class Uln2003Element extends SvgPartElement {
  private _inputs = [false, false, false, false];

  private setInput(index: number, value: boolean) {
    this._inputs[index] = Boolean(value);
    const led = this.shadowRoot?.getElementById(`in${index + 1}-led`);
    led?.setAttribute(
      "class",
      this._inputs[index] ? "red-led-on" : "red-led-off",
    );
  }

  set in1(value: boolean) {
    this.setInput(0, value);
  }
  get in1() {
    return this._inputs[0];
  }
  set in2(value: boolean) {
    this.setInput(1, value);
  }
  get in2() {
    return this._inputs[1];
  }
  set in3(value: boolean) {
    this.setInput(2, value);
  }
  get in3() {
    return this._inputs[2];
  }
  set in4(value: boolean) {
    this.setInput(3, value);
  }
  get in4() {
    return this._inputs[3];
  }

  constructor() {
    const pins = [
      { name: "IN1", x: 75.2, y: 20.4 },
      { name: "IN2", x: 68.0, y: 20.4 },
      { name: "IN3", x: 60.8, y: 20.4 },
      { name: "IN4", x: 53.6, y: 20.4 },
      { name: "VCC", x: 10.4, y: 34.8, signals: [power("VCC", 5)] },
      { name: "GND", x: 10.4, y: 27.6, signals: [power("GND")] },
      { name: "A", x: 50.7, y: 63.6 },
      { name: "B", x: 57.9, y: 63.6 },
      { name: "C", x: 65.1, y: 63.6 },
      { name: "D", x: 72.3, y: 63.6 },
    ];
    super(
      pins,
      `<svg width="87.87" height="99.21" viewBox="0 0 87.87 99.21">
        <image href="${assetUrl("/component-svgs/uln2003-driver.svg")}" x="0" y="0" width="87.87" height="99.21"/>
        <circle id="in1-led" class="red-led-off" cx="30" cy="78" r="2.7"/><circle id="in2-led" class="red-led-off" cx="39" cy="78" r="2.7"/><circle id="in3-led" class="red-led-off" cx="48" cy="78" r="2.7"/><circle id="in4-led" class="red-led-off" cx="57" cy="78" r="2.7"/>
      </svg>`,
    );
  }
}

class Ds1302Element extends SvgPartElement {
  private _running = true;

  set running(value: boolean) {
    this._running = Boolean(value);
    const led = this.shadowRoot?.getElementById("rtc-led");
    led?.setAttribute("class", this._running ? "led-on" : "led-off");
  }

  get running() {
    return this._running;
  }

  constructor() {
    const pins = [
      { name: "VCC", x: 14, y: 76, signals: [power("VCC", 5)] },
      { name: "GND", x: 30, y: 76, signals: [power("GND")] },
      { name: "CLK", x: 46, y: 76 },
      { name: "DAT", x: 62, y: 76 },
      { name: "RST", x: 78, y: 76 },
    ];
    super(
      pins,
      `<svg width="92" height="80" viewBox="0 0 92 80">
        <image href="${assetUrl("/component-svgs/ds1302-module.svg")}" x="0" y="0" width="92" height="80"/>
        <circle id="rtc-led" class="led-on" cx="78" cy="24" r="3"/>
      </svg>`,
    );
  }
}

class Dht11Element extends SvgPartElement {
  private _temperature = 25;
  private _humidity = 50;

  private updateReadout() {
    const text = this.shadowRoot?.getElementById("dht-readout");
    if (text)
      text.textContent = `${this._temperature.toFixed(0)}C ${this._humidity.toFixed(0)}%`;
  }

  set temperature(value: number) {
    this._temperature = Number(value) || 0;
    this.updateReadout();
  }

  get temperature() {
    return this._temperature;
  }

  set humidity(value: number) {
    this._humidity = Number(value) || 0;
    this.updateReadout();
  }

  get humidity() {
    return this._humidity;
  }

  constructor() {
    const pins = [
      { name: "VCC", x: 18, y: 72, signals: [power("VCC", 5)] },
      { name: "SDA", x: 43, y: 72 },
      { name: "GND", x: 68, y: 72, signals: [power("GND")] },
    ];
    super(
      pins,
      `<svg width="86" height="76" viewBox="0 0 86 76">
        <image href="${assetUrl("/component-svgs/dht22.svg")}" x="13" y="8" width="60" height="60"/>
        <rect x="12" y="66" width="62" height="6" rx="2" fill="#111827" stroke="#020617" stroke-width=".8"/>
        <circle cx="18" cy="69" r="1.8" fill="#f4c430"/><circle cx="43" cy="69" r="1.8" fill="#f4c430"/><circle cx="68" cy="69" r="1.8" fill="#f4c430"/>
        <circle id="dht-led" class="red-led-on" cx="70" cy="25" r="3"/>
        <text x="43" y="15" text-anchor="middle" font-family="Arial" font-size="8" font-weight="700" fill="#fff">DHT11</text>
        <text id="dht-readout" class="readout" x="43" y="62">25C 50%</text>
      </svg>`,
    );
  }
}

class Ssd1306I2cElement extends SvgPartElement {
  imageData = new ImageData(128, 64);
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor() {
    const pins = [
      { name: "GND", x: 60, y: 5, signals: [power("GND")] },
      { name: "VCC", x: 70, y: 5, signals: [power("VCC")] },
      { name: "SCL", x: 80, y: 5, signals: [i2c("SCL")] },
      { name: "SDA", x: 90, y: 5, signals: [i2c("SDA")] },
    ];
    super(
      pins,
      `<div style="position:relative;width:150px;height:96px">
        <svg width="150" height="96" viewBox="0 0 150 96">
          <rect class="pcb" x=".5" y=".5" width="149" height="95" rx="8" fill="#025caf" stroke="#01417d"/>
          <g fill="#59340a" stroke="#be9b72" stroke-width=".6">
            <circle cx="8" cy="8" r="4"/><circle cx="142" cy="8" r="4"/>
            <circle cx="8" cy="88" r="4"/><circle cx="142" cy="88" r="4"/>
          </g>
          <circle class="gold" cx="60" cy="5" r="2.6"/>
          <circle class="gold" cx="70" cy="5" r="2.6"/>
          <circle class="gold" cx="80" cy="5" r="2.6"/>
          <circle class="gold" cx="90" cy="5" r="2.6"/>
          <text class="sub" x="60" y="15">GND</text>
          <text class="sub" x="70" y="15">VCC</text>
          <text class="sub" x="80" y="15">SCL</text>
          <text class="sub" x="90" y="15">SDA</text>
          <text class="sub" x="34" y="15">0.96&quot; OLED</text>
          <rect x="11" y="24" width="128" height="64" fill="#1a1a1a"/>
        </svg>
        <canvas width="128" height="64" style="position:absolute;left:11px;top:24px"></canvas>
      </div>`,
    );
    this.ctx =
      this.shadowRoot?.querySelector("canvas")?.getContext("2d") ?? null;
  }

  redraw() {
    this.ctx?.putImageData(this.imageData, 0, 0);
  }
}

/**
 * IIC/I2C/TWI serial interface adapter module (PCF8574 backpack) — kit
 * sheet item "LCD controller 1602 transfer". Standalone board: 4-pin I2C
 * header up top, 16-pin header below that wires to a bare LCD1602. The
 * lcd1602-i2c part simulation finds the wired LCD and drives it.
 */
class Lcd1602I2cAdapterElement extends SvgPartElement {
  private _backlight = true;
  private _contrast = 50;

  set backlight(value: boolean) {
    this._backlight = Boolean(value);
    const led = this.shadowRoot?.getElementById("power-led");
    led?.setAttribute("class", this._backlight ? "red-led-on" : "red-led-off");
  }

  get backlight() {
    return this._backlight;
  }

  /** Trimpot position 0–100; the screw turns with it (~270° travel). */
  set contrast(value: number) {
    const next = Math.max(0, Math.min(100, Number(value) || 0));
    const changed = next !== this._contrast;
    this._contrast = next;
    const screw = this.shadowRoot?.getElementById("trimpot-screw");
    screw?.setAttribute(
      "transform",
      `rotate(${(this._contrast - 50) * 2.7} 15 37)`,
    );
    // Property-dialog edits land here (DynamicComponent sets el.contrast);
    // tell the running part simulation so the LCD fade follows. Only fire on a
    // real change: the running sim also writes el.contrast (to turn the screw),
    // and re-dispatching an unchanged value ping-pongs with the sim's own
    // contrast-change listener until the call stack overflows.
    if (changed) {
      this.dispatchEvent(
        new CustomEvent("contrast-change", { detail: this._contrast }),
      );
    }
  }

  get contrast() {
    return this._contrast;
  }

  constructor() {
    const lcdPinNames = [
      "VSS",
      "VDD",
      "V0",
      "RS",
      "RW",
      "E",
      "D0",
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "A",
      "K",
    ];
    const pins = [
      { name: "GND", x: 11, y: 3, signals: [power("GND")] },
      { name: "VCC", x: 18, y: 3, signals: [power("VCC", 5)] },
      { name: "SDA", x: 25, y: 3, signals: [i2c("SDA")] },
      { name: "SCL", x: 32, y: 3, signals: [i2c("SCL")] },
      ...lcdPinNames.map((name, i) => ({
        name,
        x: 7.6 + i * 7.5,
        y: 73,
      })),
    ];
    const bottomPins = lcdPinNames
      .map((name, i) => {
        const x = 6.5 + i * 7.5;
        return `<rect x="${x}" y="62" width="2.2" height="12" fill="#d1d5db"/><text x="${x + 1.1}" y="80" text-anchor="middle" font-family="sans-serif" font-size="2.8" fill="#94a3b8">${name}</text>`;
      })
      .join("");
    super(
      pins,
      `<svg width="124" height="82" viewBox="0 0 124 82">
        <g fill="#f4c430">
          <rect x="9.9" y="2" width="2.2" height="13"/><rect x="16.9" y="2" width="2.2" height="13"/>
          <rect x="23.9" y="2" width="2.2" height="13"/><rect x="30.9" y="2" width="2.2" height="13"/>
        </g>
        <rect x="6" y="14" width="31" height="6" class="header"/>
        <rect x="2" y="20" width="120" height="36" rx="2.5" fill="#0f172a" stroke="#334155" stroke-width="1.2"/>
        <text x="11" y="25.5" text-anchor="middle" font-family="sans-serif" font-size="3" fill="#94a3b8">GND</text>
        <text x="18" y="25.5" text-anchor="middle" font-family="sans-serif" font-size="3" fill="#94a3b8">VCC</text>
        <text x="25" y="25.5" text-anchor="middle" font-family="sans-serif" font-size="3" fill="#94a3b8">SDA</text>
        <text x="32" y="25.5" text-anchor="middle" font-family="sans-serif" font-size="3" fill="#94a3b8">SCL</text>
        <rect x="8" y="30" width="14" height="14" rx="2" fill="#2563eb" stroke="#1e3a8a"/>
        <g id="trimpot-screw">
          <circle cx="15" cy="37" r="3.6" fill="#93c5fd"/>
          <path d="M12.5 34.5l5 5M17.5 34.5l-5 5" stroke="#1e3a8a" stroke-width="1"/>
        </g>
        <g fill="#9ca3af">
          <rect x="44" y="33" width="2" height="2.6"/><rect x="44" y="37.5" width="2" height="2.6"/><rect x="44" y="42" width="2" height="2.6"/>
          <rect x="80" y="33" width="2" height="2.6"/><rect x="80" y="37.5" width="2" height="2.6"/><rect x="80" y="42" width="2" height="2.6"/>
        </g>
        <rect x="46" y="31" width="34" height="15" rx="1.5" fill="#1f2937" stroke="#4b5563"/>
        <circle cx="50" cy="35" r="1.1" fill="#6b7280"/>
        <text x="63" y="38" text-anchor="middle" font-family="monospace" font-size="4.6" fill="#e5e7eb">PCF8574</text>
        <text x="63" y="43" text-anchor="middle" font-family="monospace" font-size="3.2" fill="#9ca3af">IIC/I2C/TWI</text>
        <circle id="power-led" class="red-led-on" cx="90" cy="27" r="2"/>
        <text x="90" y="33" text-anchor="middle" font-family="sans-serif" font-size="2.8" fill="#94a3b8">PWR</text>
        <g fill="#d6d3d1">
          <rect x="86" y="37" width="7" height="3.2" rx="0.6"/><rect x="86" y="42" width="7" height="3.2" rx="0.6"/>
        </g>
        <g fill="#292524">
          <rect x="86" y="37" width="1.7" height="3.2"/><rect x="91.3" y="37" width="1.7" height="3.2"/>
          <rect x="86" y="42" width="1.7" height="3.2"/><rect x="91.3" y="42" width="1.7" height="3.2"/>
        </g>
        <rect x="99" y="31" width="10" height="8" rx="1" fill="#111827" stroke="#374151" stroke-width="0.8"/>
        <rect x="101" y="26" width="2" height="6" fill="#9ca3af"/>
        <rect x="105" y="26" width="2" height="6" fill="#9ca3af"/>
        <text x="104" y="45" text-anchor="middle" font-family="sans-serif" font-size="2.8" fill="#94a3b8">JMP</text>
        <rect x="2" y="56" width="120" height="6" class="header"/>
        ${bottomPins}
      </svg>`,
    );
  }
}

class Stepper28byj48Element extends SvgPartElement {
  private _angle = 0;

  set angle(value: number) {
    this._angle = Number(value) || 0;
    const marker = this.shadowRoot?.getElementById("shaft-marker");
    marker?.setAttribute("transform", `rotate(${this._angle} 55 44)`);
  }

  get angle() {
    return this._angle;
  }

  constructor() {
    const pins = [
      { name: "A", x: 15, y: 103 },
      { name: "B", x: 35, y: 103 },
      { name: "C", x: 55, y: 103 },
      { name: "D", x: 75, y: 103 },
      { name: "+5V", x: 95, y: 103, signals: [power("VCC", 5)] },
    ];
    super(
      pins,
      `<svg width="110" height="116" viewBox="0 0 110 116">
        <rect x="2" y="36" width="106" height="16" rx="8" class="metal"/>
        <circle cx="9" cy="44" r="2.6" fill="#475569"/>
        <circle cx="101" cy="44" r="2.6" fill="#475569"/>
        <circle cx="55" cy="44" r="37" fill="#d1d5db" stroke="#64748b" stroke-width="1.4"/>
        <path d="M22 68 a37 37 0 0 0 66 0 z" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1"/>
        <text x="55" y="66" text-anchor="middle" font-family="Arial" font-size="7.5" font-weight="800" fill="#334155">28BYJ-48</text>
        <text x="55" y="78" text-anchor="middle" font-family="Arial" font-size="5.5" font-weight="700" fill="#dbeafe">5V DC</text>
        <circle cx="55" cy="44" r="9" class="metal"/>
        <g id="shaft-marker"><rect x="53.6" y="31" width="2.8" height="14" rx="1.2" fill="#ef4444"/></g>
        <circle cx="55" cy="44" r="2.4" fill="#94a3b8"/>
        <path d="M15 86v11M35 86v11M55 84v13M75 86v11M95 86v11" stroke-width="2.2" fill="none" stroke-linecap="round"
          stroke="#94a3b8"/>
        <path d="M15 86v6" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M35 86v6" stroke="#ec4899" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M55 84v8" stroke="#eab308" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M75 86v6" stroke="#f97316" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M95 86v6" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round"/>
        <rect x="5" y="97" width="100" height="9" rx="2" class="header"/>
        <circle class="gold" cx="15" cy="101.5" r="2.2"/>
        <circle class="gold" cx="35" cy="101.5" r="2.2"/>
        <circle class="gold" cx="55" cy="101.5" r="2.2"/>
        <circle class="gold" cx="75" cy="101.5" r="2.2"/>
        <circle class="gold" cx="95" cy="101.5" r="2.2"/>
        <text x="15" y="114" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">A</text>
        <text x="35" y="114" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">B</text>
        <text x="55" y="114" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">C</text>
        <text x="75" y="114" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">D</text>
        <text x="95" y="114" text-anchor="middle" font-family="sans-serif" font-size="5" fill="#475569">+5V</text>
      </svg>`,
    );
  }
}

for (const [name, ctor] of [
  ["velxio-ssd1306-i2c", Ssd1306I2cElement],
  ["velxio-lcd1602-i2c-adapter", Lcd1602I2cAdapterElement],
  ["velxio-stepper-28byj48", Stepper28byj48Element],
  ["velxio-lm35dz-v3", Lm35Element],
  ["velxio-rc522-v3", Rc522Element],
  ["velxio-water-level-v3", WaterLevelElement],
  ["velxio-uln2003-v3", Uln2003Element],
  ["velxio-ds1302-v3", Ds1302Element],
  ["velxio-dht11-v3", Dht11Element],
] as Array<[string, CustomElementConstructor]>) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
