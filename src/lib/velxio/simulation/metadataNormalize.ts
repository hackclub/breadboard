/**
 * baseSimId — the single source of truth mapping a catalog component's
 * `metadataId` to the BASE id that simulation logic is registered under.
 *
 * Why this exists: the component catalog ships *variants* — `led-red`,
 * `led-yellow`, `resistor-220`, `cap-100n`, `photoresistor-sensor` — but every
 * simulation subsystem (the SPICE mapper, the part-runtime registry, the
 * pre-flight verifier, the burnout detector) writes its logic ONCE per base
 * type (`led`, `resistor`, `capacitor`, `photoresistor`). If any subsystem
 * keys on the raw `metadataId`, a variant silently falls through: no netlist
 * card, no runtime behaviour, no warning. That's exactly the class of bug
 * where a red LED dropped from the kit never lit and never flagged.
 *
 * EVERY place that looks up simulation behaviour by metadataId MUST resolve
 * through here, so:
 *   1. a new variant (led-purple, resistor-3k3, cap-220n) is handled with no
 *      extra wiring, and
 *   2. there is one obvious place to look when something isn't simulating.
 *
 * Rules are intentionally narrow (explicit colour list, digit-led value
 * presets) so they can't accidentally swallow genuinely different parts like
 * `led-matrix`, `led-ring`, or `resistor-us`.
 */

// Simple single-die indicator LEDs. NOT led-matrix / led-ring / led-strip /
// led-bar (addressable or multi-element parts with their own simulation).
const LED_COLOR_RE =
  /^led-(red|yellow|green|blue|white|orange|amber|pink|purple|cyan|uv|ir|infrared)$/;

export function baseSimId(metadataId: string): string {
  const id = metadataId;
  if (LED_COLOR_RE.test(id)) return "led";
  // Value presets always carry a numeric size after the dash (resistor-220,
  // resistor-1k, cap-100n, cap-1u, ind-10m) — the digit guard keeps named
  // variants like `resistor-us` on their own mapper.
  if (/^resistor-\d/.test(id)) return "resistor";
  if (/^cap-elec-/.test(id)) return "capacitor-electrolytic";
  if (/^cap-\d/.test(id)) return "capacitor";
  if (/^ind-\d/.test(id)) return "inductor";
  // Breakout board that reuses the discrete part's model.
  if (id === "photoresistor-sensor") return "photoresistor";
  return id;
}

/** True when this metadataId is any single-die LED (base or colour variant). */
export function isLed(metadataId: string): boolean {
  return baseSimId(metadataId) === "led";
}
