// @ts-nocheck

function defineElement(name: string, cls: CustomElementConstructor) {
  if (!customElements.get(name)) customElements.define(name, cls);
}

const pin = (name: string, x: number, y: number) => ({ name, x, y, signals: [] });

class IrTransmitterElement extends HTMLElement {
  readonly pinInfo = [pin("A", 10, 31), pin("C", 70, 31)];
  private _active = false;
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}.beam{opacity:0}.on .beam{opacity:.9}.on .lens{fill:#421818;filter:drop-shadow(0 0 8px #ff3b30)}</style>
      <svg width="80" height="42" viewBox="0 0 80 42" xmlns="http://www.w3.org/2000/svg">
        <g class="root">
        <path class="beam" d="M52 16 C64 8 70 8 78 11" fill="none" stroke="#ff4d4d" stroke-width="2" stroke-linecap="round"/>
        <path class="beam" d="M54 22 C65 22 72 23 79 29" fill="none" stroke="#ff4d4d" stroke-width="2" stroke-linecap="round"/>
        <line x1="10" y1="31" x2="28" y2="24" stroke="#b8b8b8" stroke-width="3"/>
        <line x1="70" y1="31" x2="52" y2="24" stroke="#b8b8b8" stroke-width="3"/>
        <path d="M24 22c0-11 8-19 16-19s16 8 16 19c0 9-7 15-16 15s-16-6-16-15Z" fill="#151515" stroke="#444" stroke-width="1.5"/>
        <ellipse class="lens" cx="40" cy="13" rx="10" ry="7" fill="#2b2b2b" opacity=".75"/>
        <circle cx="10" cy="31" r="2.5" fill="#b8b8b8"/><circle cx="70" cy="31" r="2.5" fill="#b8b8b8"/>
        <text x="40" y="41" text-anchor="middle" font-size="6" fill="#888">IR LED</text>
        </g>
      </svg>`;
  }
  set active(value: boolean) { this._active = Boolean(value); this.shadowRoot?.querySelector(".root")?.classList.toggle("on", this._active); }
  get active() { return this._active; }
}

class ThermistorElement extends HTMLElement {
  readonly pinInfo = [pin("1", 8, 28), pin("2", 70, 28)];
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}</style>
      <svg width="78" height="40" viewBox="0 0 78 40" xmlns="http://www.w3.org/2000/svg">
        <line x1="8" y1="28" x2="31" y2="22" stroke="#c7c7c7" stroke-width="2"/>
        <line x1="70" y1="28" x2="47" y2="22" stroke="#c7c7c7" stroke-width="2"/>
        <path d="M27 18c0-9 5-15 12-15s12 6 12 15-5 15-12 15-12-6-12-15Z" fill="#29401f" stroke="#111" stroke-width="1.2"/>
        <path d="M31 10c5 3 10 3 16 0" fill="none" stroke="#8fb15b" stroke-width="1.2"/>
        <text x="39" y="21" text-anchor="middle" font-size="6" fill="#d6ec9b">NTC</text>
        <circle cx="8" cy="28" r="2" fill="#c7c7c7"/><circle cx="70" cy="28" r="2" fill="#c7c7c7"/>
      </svg>`;
  }
}

class KitBuzzerElement extends HTMLElement {
  readonly pinInfo = [pin("+", 14, 58), pin("-", 54, 58)];
  private _active = false;
  static get observedAttributes() { return ["active"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}.ring{filter:drop-shadow(0 2px 2px #0006)}.waves{opacity:0}.on .waves{opacity:1}.on .ring{stroke:#facc15;filter:drop-shadow(0 0 8px #facc15)}</style>
      <svg width="70" height="66" viewBox="0 0 70 66" xmlns="http://www.w3.org/2000/svg">
        <g class="root">
        <circle class="ring" cx="34" cy="30" r="28" fill="#111" stroke="#333" stroke-width="2"/>
        <circle cx="34" cy="30" r="17" fill="#050505" stroke="#3b3b3b" stroke-width="2"/>
        <circle cx="34" cy="30" r="5" fill="#2b2b2b"/>
        <path class="waves" d="M58 18q8 12 0 24M63 12q13 18 0 36" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
        <text x="17" y="36" font-size="9" fill="#ddd">+</text><text x="50" y="36" font-size="9" fill="#ddd">-</text>
        <line x1="14" y1="58" x2="22" y2="49" stroke="#b8b8b8" stroke-width="2"/><line x1="54" y1="58" x2="46" y2="49" stroke="#b8b8b8" stroke-width="2"/>
        <circle cx="14" cy="58" r="2" fill="#b8b8b8"/><circle cx="54" cy="58" r="2" fill="#b8b8b8"/>
        </g>
      </svg>`;
  }
  set active(value: boolean) { this._active = Boolean(value); this.shadowRoot?.querySelector(".root")?.classList.toggle("on", this._active); }
  get active() { return this._active; }
}

class DotMatrix8x8Element extends HTMLElement {
  readonly pinInfo = [
    ...Array.from({ length: 8 }, (_, i) => pin(String(i + 1), 10 + i * 10, 4)),
    ...Array.from({ length: 8 }, (_, i) => pin(String(16 - i), 10 + i * 10, 94)),
  ];
  constructor() {
    super();
    const dots = Array.from({ length: 64 }, (_, i) => {
      const x = 12 + (i % 8) * 9;
      const y = 20 + Math.floor(i / 8) * 8;
      return `<circle cx="${x}" cy="${y}" r="2.6" fill="#370606" stroke="#701111" stroke-width=".5"/>`;
    }).join("");
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}</style>
      <svg width="92" height="100" viewBox="0 0 92 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="9" width="82" height="78" rx="5" fill="#151515" stroke="#333" stroke-width="2"/>
        ${dots}
        ${this.pinInfo.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2" fill="#bbb"/>`).join("")}
        <text x="46" y="83" text-anchor="middle" font-size="6" fill="#777">8x8 DOT MATRIX</text>
      </svg>`;
  }
}

class MicrophoneModuleElement extends HTMLElement {
  readonly pinInfo = [pin("AO", 10, 70), pin("GND", 25, 70), pin("VCC", 40, 70), pin("DO", 55, 70)];
  private _soundLevel = 512;
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}.sig{filter:drop-shadow(0 0 4px #4ade80)}.bars rect{fill:#67e8f9}</style>
      <svg width="90" height="78" viewBox="0 0 90 78" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="5" width="72" height="58" rx="3" fill="#174b9a" stroke="#0d2b5c" stroke-width="2"/>
        <circle cx="25" cy="31" r="16" fill="#c8c8c8" stroke="#777" stroke-width="2"/>
        <circle cx="25" cy="31" r="9" fill="#1f1f1f"/><circle cx="25" cy="31" r="3" fill="#444"/>
        <rect x="50" y="13" width="18" height="8" rx="2" fill="#111"/><circle cx="55" cy="39" r="4" fill="#f44336"/><circle class="sig" cx="67" cy="39" r="4" fill="#1f7a34"/>
        <g class="bars"><rect x="50" y="50" width="3" height="3"/><rect x="55" y="48" width="3" height="5"/><rect x="60" y="45" width="3" height="8"/><rect x="65" y="42" width="3" height="11"/></g>
        ${this.pinInfo.map((p) => `<line x1="${p.x}" y1="63" x2="${p.x}" y2="70" stroke="#d6b25e" stroke-width="2"/><circle cx="${p.x}" cy="${p.y}" r="2.4" fill="#d6b25e"/><text x="${p.x}" y="60" text-anchor="middle" font-size="5" fill="#fff">${p.name}</text>`).join("")}
      </svg>`;
    this.soundLevel = this._soundLevel;
  }
  set soundLevel(value: number) {
    this._soundLevel = Math.max(0, Math.min(1023, Number(value) || 0));
    const opacity = 0.2 + (this._soundLevel / 1023) * 0.8;
    this.shadowRoot?.querySelector(".sig")?.setAttribute("fill", this._soundLevel > 500 ? "#4ade80" : "#1f7a34");
    this.shadowRoot?.querySelector(".bars")?.setAttribute("opacity", String(opacity));
  }
  get soundLevel() { return this._soundLevel; }
}

class ObstacleAvoidanceElement extends HTMLElement {
  readonly pinInfo = [pin("OUT", 10, 72), pin("GND", 25, 72), pin("VCC", 40, 72), pin("EN", 55, 72)];
  private _detected = false;
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}.beam{opacity:.15}.detected .beam{opacity:1}.detected .led{fill:#ff3b30;filter:drop-shadow(0 0 6px #ff3b30)}</style>
      <svg width="96" height="80" viewBox="0 0 96 80" xmlns="http://www.w3.org/2000/svg">
        <g class="root">
        <path class="beam" d="M34 22h46M34 31h46M34 40h46" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
        <rect x="6" y="6" width="76" height="58" rx="3" fill="#1e8f3a" stroke="#0d5520" stroke-width="2"/>
        <circle cx="27" cy="30" r="14" fill="#111" stroke="#333" stroke-width="2"/><circle cx="27" cy="30" r="7" fill="#2d0044"/>
        <rect x="49" y="17" width="20" height="26" rx="4" fill="#111" stroke="#444"/><circle cx="59" cy="30" r="7" fill="#1a1a1a"/>
        <rect x="15" y="48" width="48" height="8" rx="2" fill="#0b2f16"/><circle class="led" cx="72" cy="50" r="4" fill="#7f1d1d"/>
        ${this.pinInfo.map((p) => `<line x1="${p.x}" y1="64" x2="${p.x}" y2="72" stroke="#d6b25e" stroke-width="2"/><circle cx="${p.x}" cy="${p.y}" r="2.4" fill="#d6b25e"/><text x="${p.x}" y="61" text-anchor="middle" font-size="5" fill="#fff">${p.name}</text>`).join("")}
        </g>
      </svg>`;
  }
  set detected(value: boolean) { this._detected = Boolean(value); this.shadowRoot?.querySelector(".root")?.classList.toggle("detected", this._detected); }
  get detected() { return this._detected; }
}

class DualRelayModuleElement extends HTMLElement {
  readonly pinInfo = [
    pin("VCC", 10, 88), pin("GND", 25, 88), pin("IN1", 40, 88), pin("IN2", 55, 88),
    pin("NO1", 110, 18), pin("COM1", 110, 32), pin("NC1", 110, 46), pin("NO2", 110, 62), pin("COM2", 110, 76), pin("NC2", 110, 90),
  ];
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}.led{fill:#133b1f}.on{fill:#4ade80;filter:drop-shadow(0 0 5px #4ade80)}</style>
      <svg width="122" height="98" viewBox="0 0 122 98" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="108" height="88" rx="4" fill="#1467b0" stroke="#0a3760" stroke-width="2"/>
        <rect x="14" y="15" width="34" height="25" rx="3" fill="#0d51a6" stroke="#9fd0ff"/><rect x="14" y="51" width="34" height="25" rx="3" fill="#0d51a6" stroke="#9fd0ff"/>
        <text x="31" y="30" text-anchor="middle" font-size="7" fill="#fff">RELAY</text><text x="31" y="66" text-anchor="middle" font-size="7" fill="#fff">RELAY</text>
        <rect x="76" y="12" width="26" height="36" rx="2" fill="#1a1a1a"/><rect x="76" y="54" width="26" height="36" rx="2" fill="#1a1a1a"/>
        <circle class="led relay1" cx="56" cy="25" r="4"/><circle class="led relay2" cx="56" cy="61" r="4"/>
        ${this.pinInfo.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.3" fill="#d6b25e"/>`).join("")}
      </svg>`;
  }
  set relay1(value: boolean) { this.shadowRoot?.querySelector(".relay1")?.classList.toggle("on", Boolean(value)); }
  set relay2(value: boolean) { this.shadowRoot?.querySelector(".relay2")?.classList.toggle("on", Boolean(value)); }
}

class SingleRelayModuleElement extends HTMLElement {
  readonly pinInfo = [
    pin("VCC", 10, 72), pin("GND", 25, 72), pin("IN", 40, 72),
    pin("NO", 92, 20), pin("COM", 92, 38), pin("NC", 92, 56),
  ];
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>:host{display:inline-block}svg{overflow:visible}.led{fill:#133b1f}.on{fill:#4ade80;filter:drop-shadow(0 0 5px #4ade80)}</style>
      <svg width="104" height="82" viewBox="0 0 104 82" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="92" height="70" rx="4" fill="#1467b0" stroke="#0a3760" stroke-width="2"/>
        <rect x="15" y="18" width="36" height="28" rx="3" fill="#0d51a6" stroke="#9fd0ff"/>
        <text x="33" y="35" text-anchor="middle" font-size="7" fill="#fff">5V RELAY</text>
        <rect x="68" y="13" width="18" height="50" rx="2" fill="#1a1a1a"/>
        <circle class="led relay" cx="55" cy="32" r="4"/>
        ${this.pinInfo.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.3" fill="#d6b25e"/>`).join("")}
      </svg>`;
  }
  set relay(value: boolean) { this.shadowRoot?.querySelector(".relay")?.classList.toggle("on", Boolean(value)); }
}

defineElement("velxio-ir-transmitter", IrTransmitterElement);
defineElement("velxio-thermistor", ThermistorElement);
defineElement("velxio-kit-buzzer", KitBuzzerElement);
defineElement("velxio-dot-matrix-8x8", DotMatrix8x8Element);
defineElement("velxio-microphone-module", MicrophoneModuleElement);
defineElement("velxio-obstacle-avoidance", ObstacleAvoidanceElement);
defineElement("velxio-dual-relay-module", DualRelayModuleElement);
defineElement("velxio-single-relay-module", SingleRelayModuleElement);

export {};
