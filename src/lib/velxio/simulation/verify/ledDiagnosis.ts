/**
 * diagnoseLed — one physics-based verdict for an LED, from the solved circuit.
 *
 * There are no per-wiring special cases here. Everything follows from three
 * quantities the solver already gives us:
 *   - the current through the LED,
 *   - the voltage across it (anode minus cathode),
 *   - whether each leg sits on a net that has a DC path (is in a loop).
 *
 * An LED lights only when forward current flows, and forward current flows
 * only around a complete loop from + through the LED to −. Every "why is it
 * dark" answer is a reading of those quantities, so the same code explains a
 * floating leg, a backwards LED, a missing return path, and an over-current
 * burnout without knowing anything about how the wires were drawn.
 */

export type LedState =
  | "ok" // forward current flows, LED is lit
  | "overcurrent" // beyond the absolute-max current
  | "reverse" // reverse-biased (cathode higher than anode)
  | "open" // a leg isn't in a complete circuit
  | "no-current"; // wired and not reversed, but under-driven — off or dim

export interface LedDiagnosis {
  state: LedState;
  /** Present for every non-"ok" state. */
  message?: string;
}

export interface LedElectrical {
  /** Current through the LED (A); sign ignored. */
  currentA: number;
  /** Anode node voltage (V). */
  vAnode: number;
  /** Cathode node voltage (V). */
  vCathode: number;
  /** Net names each leg resolved to (undefined = not wired at all). */
  anodeNet?: string;
  cathodeNet?: string;
  /** Nets with no DC path (open). From buildNetlist().floatingNets. */
  floatingNets: ReadonlySet<string>;
}

// A 5 mm indicator lights from ~1 mA and its datasheet absolute max is ~20 mA.
const LIT_MIN_A = 1e-3;
const MAX_A = 0.02;
// Enough reverse voltage to be sure it's wired the wrong way, not just noise.
const REVERSE_V = 0.3;

export function diagnoseLed(e: LedElectrical): LedDiagnosis {
  const i = Math.abs(e.currentA);

  // Real current settles the verdict first: a conducting LED is by definition
  // part of a complete loop, so the "open" heuristic below must not override
  // it. That heuristic reads floatingNets, which is built ignoring diode edges
  // (detectFloatingNets' DC_PREFIXES omits 'D'), so a leg whose only path
  // onward is another diode/LED — series LEDs, charlieplexing — looks floating
  // even while current flows through it.
  if (i > MAX_A) {
    return {
      state: "overcurrent",
      message: `carrying ${(i * 1000).toFixed(0)} mA, over the ~20 mA an LED can take. Add or increase the series resistor.`,
    };
  }

  if (i >= LIT_MIN_A) return { state: "ok" };

  // Open circuit: a leg has no DC path, so no current can flow through it.
  // (A net reachable only through the diode counts as open, which is exactly
  // a dangling leg.) Not wired at all counts as open too.
  const anodeOpen = !e.anodeNet || e.floatingNets.has(e.anodeNet);
  const cathodeOpen = !e.cathodeNet || e.floatingNets.has(e.cathodeNet);
  if (anodeOpen || cathodeOpen) {
    const legClause =
      anodeOpen && cathodeOpen
        ? "Neither leg is part of a complete circuit"
        : anodeOpen
          ? "The + leg (anode) is not part of a complete circuit"
          : "The − leg (cathode) is not part of a complete circuit";
    return {
      state: "open",
      message: `${legClause}, so no current can flow. Current flows in a loop: from + (power), through the LED, back to − (ground).`,
    };
  }

  // Wired and in a loop, but no useful current. Say why from the voltage.
  if (e.vCathode - e.vAnode > REVERSE_V) {
    return {
      state: "reverse",
      message: `connected backwards: the − leg (cathode) is ${(
        e.vCathode - e.vAnode
      ).toFixed(2)} V higher than the + leg (anode), so it blocks current. Flip it.`,
    };
  }
  // Under a milliamp, not reversed: the LED just isn't lit. This is a normal
  // off/dim state — commanded low, PWM below turn-on, or otherwise under-
  // driven — not a wiring fault, so the verifier does not raise it as a
  // circuit issue. The message stays accurate whether the legs differ by a
  // little (dim) or sit at the same potential (fully off); it never claims a
  // fault. Report it descriptively for tooltips/tests.
  return {
    state: "no-current",
    message: `is off: only ${(e.vAnode - e.vCathode).toFixed(2)} V across it (+ leg ${e.vAnode.toFixed(
      2,
    )} V, − leg ${e.vCathode.toFixed(2)} V), below the voltage it needs to light. That's expected when it's switched off or dimmed low.`,
  };
}
