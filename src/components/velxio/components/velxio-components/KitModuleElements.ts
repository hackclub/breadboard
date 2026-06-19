// @ts-nocheck
/** Native Velxio web components for starter-kit modules not covered by @wokwi/elements. */

const power = (signal: string, voltage?: number) => ({
  type: "power",
  signal,
  ...(voltage ? { voltage } : {}),
});
const analog = (channel: number) => ({ type: "analog", channel });
const spi = (signal: string) => ({ type: "spi", signal, bus: 0 });

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
        <image href="/component-svgs/vibration-switch.svg" x="0" y="0" width="86" height="68"/>
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
  private _cardPresent = true;
  uid = "DE AD BE EF";

  set cardPresent(value: boolean) {
    this._cardPresent = Boolean(value);
    const card = this.shadowRoot?.getElementById("rfid-card");
    const led = this.shadowRoot?.getElementById("rfid-led");
    card?.setAttribute("opacity", this._cardPresent ? "1" : "0.16");
    led?.setAttribute("class", this._cardPresent ? "led-on" : "led-off");
  }

  get cardPresent() {
    return this._cardPresent;
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
        <image href="/component-svgs/rc522-rfid.svg" x="0" y="0" width="74.333" height="111.6"/>
        <rect id="rfid-card" x="14" y="30" width="26" height="18" rx="2" fill="#f8fafc" opacity="1" filter="drop-shadow(0 1px 2px rgba(0,0,0,.35))"/>
        <path d="M18 36h17M18 41h12" stroke="#f59e0b" stroke-width="1.2"/>
        <circle id="rfid-led" class="led-on" cx="63" cy="22" r="2.8"/>
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
        <image href="/component-svgs/water-level-sensor.svg" x="0" y="0" width="86" height="100" transform="scale(1 .84)"/>
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
        <image href="/component-svgs/uln2003-driver.svg" x="0" y="0" width="87.87" height="99.21"/>
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
        <image href="/component-svgs/ds1302-module.svg" x="0" y="0" width="92" height="80"/>
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
        <image href="/component-svgs/dht22.svg" x="13" y="8" width="60" height="60"/>
        <rect x="12" y="66" width="62" height="6" rx="2" fill="#111827" stroke="#020617" stroke-width=".8"/>
        <circle cx="18" cy="69" r="1.8" fill="#f4c430"/><circle cx="43" cy="69" r="1.8" fill="#f4c430"/><circle cx="68" cy="69" r="1.8" fill="#f4c430"/>
        <circle id="dht-led" class="red-led-on" cx="70" cy="25" r="3"/>
        <text x="43" y="15" text-anchor="middle" font-family="Arial" font-size="8" font-weight="700" fill="#fff">DHT11</text>
        <text id="dht-readout" class="readout" x="43" y="62">25C 50%</text>
      </svg>`,
    );
  }
}

for (const [name, ctor] of [
  ["velxio-lm35dz-v3", Lm35Element],
  ["velxio-rc522-v3", Rc522Element],
  ["velxio-water-level-v3", WaterLevelElement],
  ["velxio-uln2003-v3", Uln2003Element],
  ["velxio-ds1302-v3", Ds1302Element],
  ["velxio-dht11-v3", Dht11Element],
] as Array<[string, CustomElementConstructor]>) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}

export {};
