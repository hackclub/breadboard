// @ts-nocheck
/**
 * circuitVerifier — pre-flight safety check run when the user presses Run.
 *
 * Runs a one-shot ngspice solve against the current canvas and inspects the
 * branch currents for real-world fault conditions:
 *
 *   - **Short circuit**: any voltage source delivering current well above what
 *     a sensible circuit needs (default threshold: 500 mA). Catches the
 *     classic "5 V tied straight to GND" bug.
 *   - **LED overcurrent**: forward current above the datasheet absolute max
 *     (20 mA for standard 5 mm LEDs). Catches missing or undersized series
 *     resistors.
 *   - **Resistor overpower**: I²·R > rated power (1/4 W default). Catches
 *     load resistors that would burn out in the real world.
 *   - **Disconnected indicator**: an LED that's fully wired but carries
 *     zero current — usually means the user forgot a switch / power tie.
 *
 * Results are split into `errors` (severe enough to block the user with a
 * confirm dialog) and `warnings` (non-blocking — the simulation can proceed).
 *
 * The verifier never throws; if ngspice fails to converge it returns a
 * single solver-error warning and the rest of the rules are skipped.
 */
import {
  buildNetlist,
  railLabel,
} from "@/lib/velxio/simulation/spice/NetlistBuilder";
import { baseSimId } from "@/lib/velxio/simulation/metadataNormalize";
import { diagnoseLed } from "@/lib/velxio/simulation/verify/ledDiagnosis";
import { runNetlist as runSpice } from "@/lib/velxio/simulation/spice/runNetlist";
import type {
  BuildNetlistInput,
  ElectricalSolveResult,
} from "@/lib/velxio/simulation/spice/types";

export type WarningSeverity = "error" | "warning";
export type WarningCode =
  | "solver-failed"
  | "short-circuit"
  | "source-overload"
  | "led-overcurrent"
  | "resistor-overpower"
  | "led-dark";

export interface CircuitWarning {
  severity: WarningSeverity;
  code: WarningCode;
  /** Component this warning is attached to (when applicable). */
  componentId?: string;
  /** Human-readable message — already includes units and the actual value. */
  message: string;
  /** Extra diagnostic value (current in A, power in W, …). */
  metric?: number;
}

export interface VerificationResult {
  errors: CircuitWarning[];
  warnings: CircuitWarning[];
  /** Number of components inspected — useful for "nothing to check" UI. */
  componentsChecked: number;
  /** The full solve result, surfaced so callers can do extra checks. */
  solve?: ElectricalSolveResult;
}

// ── Rule thresholds (overridable per call) ────────────────────────────────

export interface VerifierConfig {
  /** Source current above this is flagged as a probable short circuit (A). */
  shortCircuitAmps: number;
  /** LED forward current above this is flagged as overcurrent (A). */
  ledMaxAmps: number;
  /** Default resistor power rating, W. Used when no property override. */
  resistorMaxWatts: number;
  /** Below this the LED is "wired but dark" — surface a hint. */
  ledMinAmps: number;
}

export const DEFAULT_CONFIG: VerifierConfig = {
  shortCircuitAmps: 0.5,
  ledMaxAmps: 0.02,
  resistorMaxWatts: 0.25,
  ledMinAmps: 1e-6,
};

// ── Public API ───────────────────────────────────────────────────────────

/** Build a netlist, solve, and return any safety warnings. */
export async function verifyCircuit(
  input: BuildNetlistInput,
  partialConfig: Partial<VerifierConfig> = {},
): Promise<VerificationResult> {
  const config = { ...DEFAULT_CONFIG, ...partialConfig };
  const errors: CircuitWarning[] = [];
  const warnings: CircuitWarning[] = [];

  // Run a forced .op solve so currents are scalar and deterministic.
  const opInput: BuildNetlistInput = { ...input, analysis: { kind: "op" } };
  const { netlist, pinNetMap, railShorts, railRailShorts, floatingNets } =
    buildNetlist(opInput);

  // ── Rule 0: supply rail wired straight to ground ────────────────────────
  // The union-find merges a shorted rail INTO ground, so the solve sees one
  // dead net and none of the current-based rules below can fire. This is the
  // only place the short is still visible — report it before solving.
  for (const rail of railShorts ?? []) {
    errors.push({
      severity: "error",
      code: "short-circuit",
      message: `Short circuit: ${railLabel(rail)} is connected directly to GND. Every part on that rail sees 0 V, so nothing will work. Find and remove the wire that connects + to −.`,
    });
  }

  // ── Rule 0b: two supply rails wired together ────────────────────────────
  // e.g. a board's 5 V pin tied to its 3.3 V pin. The union-find fuses them
  // into one net so the solve still converges (one source wins) and the
  // current rules stay quiet — this is the only surviving evidence.
  for (const pair of railRailShorts ?? []) {
    const [a, b] = pair.split(" ↔ ");
    errors.push({
      severity: "error",
      code: "short-circuit",
      message: `Short circuit: ${railLabel(a)} is wired directly to ${railLabel(b)}. Two supplies driving one net fight each other. Remove the wire tying them together.`,
    });
  }

  let solve: ElectricalSolveResult | undefined;
  try {
    const cooked = await runSpice(netlist);
    // Re-shape into the same flat dictionaries that the live store uses.
    const nodeVoltages: Record<string, number> = { "0": 0 };
    const branchCurrents: Record<string, number> = {};
    for (const name of cooked.variableNames) {
      if (name.startsWith("v(")) {
        const v = cooked.dcValue(name);
        if (Number.isFinite(v)) nodeVoltages[name.slice(2, -1)] = v;
      } else if (name.startsWith("i(")) {
        const v = cooked.dcValue(name);
        if (Number.isFinite(v)) branchCurrents[name.slice(2, -1)] = v;
      }
    }
    solve = {
      nodeVoltages,
      branchCurrents,
      converged: true,
      error: null,
      solveMs: 0,
      submittedNetlist: netlist,
      pinNetMap: new Map(),
      analysisMode: "op",
    };
  } catch (err) {
    warnings.push({
      severity: "warning",
      code: "solver-failed",
      message: `Circuit solver could not converge (${
        err instanceof Error ? err.message : String(err)
      }). Pre-flight checks were skipped.`,
    });
    return { errors, warnings, componentsChecked: 0, solve };
  }

  const branchCurrents = solve.branchCurrents;

  // ── Rule 1: short circuit / power source overload ──────────────────────
  // Every voltage source (battery / signal-generator / power-supply) emits
  // a branch current `i(v_<id>)`. SPICE convention: V-source's current is
  // measured + → − INTERNALLY, so external current draw is the absolute
  // value.
  //
  // power-supply components carry a per-instance `currentLimit` property
  // that overrides the global short-circuit threshold — that matches what
  // a real bench supply does: a 100mA-limited supply trips at 100mA, a
  // 5A-limited supply tolerates up to 5A before flagging fault.
  const sourceComponents = input.components.filter((c) =>
    /^(battery|signal-generator|power-supply)/.test(c.metadataId),
  );
  for (const src of sourceComponents) {
    const i = Math.abs(branchCurrents[`v_${src.id}`] ?? 0);
    const perInstanceLimit =
      src.metadataId === "power-supply"
        ? Number(src.properties?.currentLimit ?? config.shortCircuitAmps)
        : config.shortCircuitAmps;
    const threshold =
      Number.isFinite(perInstanceLimit) && perInstanceLimit > 0
        ? perInstanceLimit
        : config.shortCircuitAmps;
    if (i >= threshold) {
      const isPsu = src.metadataId === "power-supply";
      errors.push({
        severity: "error",
        code: isPsu ? "source-overload" : "short-circuit",
        componentId: src.id,
        message: isPsu
          ? `Power supply ${src.id} is being asked for ${formatAmps(i)}, past its ${formatAmps(threshold)} current limit. A real bench supply would foldback or cut out. Raise the currentLimit or add more series resistance to the load.`
          : `Possible short circuit: ${src.metadataId} ${src.id} is delivering ${formatAmps(i)} (threshold ${formatAmps(threshold)}). Check for power tied directly to GND.`,
        metric: i,
      });
    }
  }

  // ── Rule 2: LED state, from the solved circuit ─────────────────────────
  // One physics-based verdict per LED (see diagnoseLed): over-current, open
  // leg, reverse-biased, or no drive. Every LED emits a 0V sense source
  // (`V_<id>_sense`) whose branch current is the LED current.
  const floating = new Set(floatingNets);
  const leds = input.components.filter((c) => baseSimId(c.metadataId) === "led");
  for (const led of leds) {
    const aNet = pinNetMap.get(`${led.id}:A`);
    const cNet = pinNetMap.get(`${led.id}:C`);
    const diag = diagnoseLed({
      currentA: branchCurrents[`v_${led.id}_sense`] ?? 0,
      vAnode: aNet ? (solve.nodeVoltages[aNet] ?? 0) : 0,
      vCathode: cNet ? (solve.nodeVoltages[cNet] ?? 0) : 0,
      anodeNet: aNet,
      cathodeNet: cNet,
      floatingNets: floating,
    });
    if (diag.state === "ok") continue;
    // "no-current" means the LED is wired fine but simply isn't lit right
    // now — commanded off, PWM-dimmed below turn-on, or otherwise under-
    // driven. That's a normal runtime state, not a wiring fault, so it must
    // not raise a circuit issue; an intentionally-off LED shouldn't look
    // broken. Real faults (open leg, reversed, overcurrent) still surface.
    if (diag.state === "no-current") continue;
    // Over-current can damage the part, so it blocks; the rest are "it just
    // won't light" and pass through as warnings.
    const severity = diag.state === "overcurrent" ? "error" : "warning";
    (severity === "error" ? errors : warnings).push({
      severity,
      code: diag.state === "overcurrent" ? "led-overcurrent" : "led-dark",
      componentId: led.id,
      message: `LED ${led.id} ${diag.message}`,
    });
  }

  // ── Rule 3: resistor power above its rating ────────────────────────────
  // Resistors don't have a built-in sense source, so we recover their
  // current from the voltage drop across their two terminals and the
  // resistance value. Pin → net resolution piggy-backs on the netlist
  // text via a quick scan of the emitted R_<id> card.
  const resistorPattern = /^R_(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/gm;
  let m: RegExpExecArray | null;
  while ((m = resistorPattern.exec(netlist)) !== null) {
    const [, id, n1, n2, valStr] = m;
    // Skip the sense / internal helpers (e.g. R_<comp>_sense).
    if (id.endsWith("_sense") || id.endsWith("_load") || id.endsWith("_esr"))
      continue;
    const comp = input.components.find((c) => c.id === id);
    if (!comp || baseSimId(comp.metadataId) !== "resistor") continue;
    const R = parseResistance(valStr);
    if (!Number.isFinite(R) || R <= 0) continue;
    const v1 = solve.nodeVoltages[n1] ?? 0;
    const v2 = solve.nodeVoltages[n2] ?? 0;
    const power = Math.pow(v1 - v2, 2) / R;
    const rating =
      typeof comp.properties.power === "number"
        ? (comp.properties.power as number)
        : config.resistorMaxWatts;
    if (power > rating) {
      // Severity 'warning' (not 'error'): SPICE doesn't physically burn the
      // part out, and many teaching-circuit examples deliberately use a
      // small fixed load resistor across higher rails for clarity. We
      // surface it as a non-blocking hint so the user knows their physical
      // build needs a beefier resistor, but they can still click Run.
      warnings.push({
        severity: "warning",
        code: "resistor-overpower",
        componentId: id,
        message: `Resistor ${id} (${formatResistance(R)}) is dissipating ${formatPower(
          power,
        )}, above the ${formatPower(rating)} rating. A real ${formatResistance(R)} resistor at this current would overheat, so pick a higher-power part or a larger resistance.`,
        metric: power,
      });
    }
  }

  return {
    errors,
    warnings,
    componentsChecked: input.components.length,
    solve,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────

function formatAmps(a: number): string {
  if (a >= 1) return `${a.toFixed(2)} A`;
  if (a >= 1e-3) return `${(a * 1e3).toFixed(1)} mA`;
  if (a >= 1e-6) return `${(a * 1e6).toFixed(1)} µA`;
  return `${a.toExponential(2)} A`;
}

function formatPower(w: number): string {
  if (w >= 1) return `${w.toFixed(2)} W`;
  return `${(w * 1e3).toFixed(0)} mW`;
}

function formatResistance(r: number): string {
  if (r >= 1e6) return `${(r / 1e6).toFixed(1)} MΩ`;
  if (r >= 1e3) return `${(r / 1e3).toFixed(1)} kΩ`;
  return `${r.toFixed(0)} Ω`;
}

/** Parse `'10k'`, `'2.2K'`, `'4.7M'`, `'470'` into ohms. */
function parseResistance(raw: string): number {
  const s = raw.trim();
  const m = /^([-+]?[0-9]*\.?[0-9]+)([kKmMgG]?)/.exec(s);
  if (!m) return NaN;
  const base = parseFloat(m[1]);
  const suffix = m[2];
  const mult =
    suffix === "k" || suffix === "K"
      ? 1e3
      : suffix === "M"
        ? 1e6
        : suffix === "g" || suffix === "G"
          ? 1e9
          : suffix === "m"
            ? 1e-3
            : 1;
  return base * mult;
}
