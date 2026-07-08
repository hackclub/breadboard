// @ts-nocheck
/**
 * start.ts — production wiring for the mixed-mode simulator.
 *
 * The single function `startSimulation()` mounts everything the
 * editor needs to run circuits end-to-end against the WASM ngspice:
 *
 *   1. CircuitSimulationService — orchestrates solves, publishes to
 *      useElectricalStore.
 *   2. connectAnalogInputsToMcu — subscribes to useElectricalStore
 *      and pushes voltages into MCU ADCs.
 *   3. connectMcuEdgesToService — MCU pin transitions trigger
 *      scheduler.alterSource + republish via the service.
 *
 * Replaces the old EditorPage useEffect that chained the legacy
 * wireElectricalSolver + connectLegacySolverToMixedMode +
 * connectMixedModeSchedulerToStore + connectAnalogInputsToMcu.
 *
 * Phase 1c step G1 of the mixed-mode migration.
 */
import {
  useSimulatorStore,
  getBoardPinManager,
} from "@/services/velxio/store/useSimulatorStore";
import { useElectricalStore } from "@/services/velxio/store/useElectricalStore";
import { getMixedModeScheduler } from "@/lib/velxio/simulation/spice/MixedModeScheduler";
import {
  CircuitSimulationService,
  type SimulatorStorePort,
  type ElectricalStorePort,
  type MixedModeSchedulerPort,
  type ElectricalSnapshot,
} from "@/lib/velxio/simulation/spice/CircuitSimulationService";
import { connectAnalogInputsToMcu } from "@/lib/velxio/simulation/spice/connectAnalogInputsToMcu";
import { connectChipInputsToSolve } from "@/lib/velxio/simulation/spice/connectChipInputsToSolve";
import { connectMcuEdgesToService } from "@/lib/velxio/simulation/spice/connectMcuEdgesToService";
import { setElectricalResolveHook } from "@/lib/velxio/simulation/spice/electricalResolveHook";
import { collectPinStates } from "@/lib/velxio/simulation/spice/collectPinStates";
import { isLed } from "@/lib/velxio/simulation/metadataNormalize";
import { isCircuitPowered } from "@/lib/velxio/simulation/isCircuitPowered";
import { diagnoseLed } from "@/lib/velxio/simulation/verify/ledDiagnosis";
import {
  reportWiringIssue,
  clearWiringIssue,
} from "@/services/velxio/store/useWiringIssuesStore";

// An LED driven past this settles into permanent damage. A 5 mm indicator's
// continuous max is ~20 mA; real burnout is well above that, so we use 50 mA
// to avoid nuisance-burning circuits that merely run a touch bright. The
// pre-flight verifier already blocks at 20 mA before the run — this is the
// "you clicked Run Anyway and left the resistor out" backstop.
const LED_DAMAGE_AMPS = 0.05;

/**
 * After each solve, look for parts operating past their absolute maximum and
 * mark them damaged in the simulator store (sticky for the rest of the run).
 * Runs before the electrical snapshot is published so LED handlers see the
 * damaged flag on the same frame and render dark immediately.
 */
function detectDamage(branchCurrents: Record<string, number>): void {
  const sim = useSimulatorStore.getState();
  // Parts only burn while the simulation is actually powered. The analog solver
  // also runs while EDITING so wire previews stay live — burning parts during
  // editing would brand an LED before the user even presses Run, and the sticky
  // damage would then mask the "connected backwards" hint.
  if (!isCircuitPowered(sim.boards)) return;
  for (const comp of sim.components) {
    if (!isLed(comp.metadataId)) continue;
    if (sim.damagedComponents[comp.id]) continue; // already burnt
    const i = Math.abs(branchCurrents[`v_${comp.id}_sense`] ?? 0);
    if (Number.isFinite(i) && i > LED_DAMAGE_AMPS) {
      sim.markComponentDamaged(comp.id, {
        reason: `Burned out. ${(i * 1000).toFixed(0)} mA through the LED, about 20 mA max. Add a series resistor.`,
        metric: i,
      });
    }
  }
}

/**
 * After each solve, surface LED wiring mistakes that produce no light so the
 * user gets a visible reason (in the WiringIssuesPanel) instead of a part that
 * silently stays dark. Right now: a backwards (reverse-biased) LED — it carries
 * ~no current but has real voltage across it, cathode higher than anode. The
 * check reports/clears live as the wiring changes.
 */
function detectLedWiring(snapshot: ElectricalSnapshot): void {
  const sim = useSimulatorStore.getState();
  // Same powered gate as detectDamage: the solver runs during editing to keep
  // previews live, but diagnosing wiring then would populate the issues store
  // (and thrash the badge-anchor effect) for parts the user is still placing.
  if (!isCircuitPowered(sim.boards)) return;
  const floating = new Set(snapshot.floatingNets ?? []);
  for (const comp of sim.components) {
    if (!isLed(comp.metadataId)) continue;
    // A burnt-out LED already shows its own badge; don't double-report.
    if (sim.damagedComponents[comp.id]) {
      clearWiringIssue(comp.id);
      continue;
    }
    const aNet = snapshot.pinNetMap.get(`${comp.id}:A`);
    const cNet = snapshot.pinNetMap.get(`${comp.id}:C`);
    const diag = diagnoseLed({
      currentA: snapshot.branchCurrents[`v_${comp.id}_sense`] ?? 0,
      vAnode: aNet ? (snapshot.nodeVoltages[aNet] ?? 0) : 0,
      vCathode: cNet ? (snapshot.nodeVoltages[cNet] ?? 0) : 0,
      anodeNet: aNet,
      cathodeNet: cNet,
      floatingNets: floating,
    });
    // "ok" (lit) and "overcurrent" (its own burnout badge) need no wiring
    // note. "no-current" means the LED is wired fine but simply off or dimmed
    // below turn-on right now — a normal runtime state, not a wiring fault, so
    // it must not raise a live circuit issue (an intentionally-off LED
    // shouldn't look broken). Genuine faults — "open" (a floating leg) and
    // "reverse" (backwards) — still report.
    if (
      diag.state === "ok" ||
      diag.state === "overcurrent" ||
      diag.state === "no-current" ||
      !diag.message
    ) {
      clearWiringIssue(comp.id);
    } else {
      reportWiringIssue(comp.id, comp.metadataId, [diag.message]);
    }
  }
}

/** Adapt useElectricalStore to the ElectricalStorePort. */
function createElectricalStorePort(): ElectricalStorePort {
  return {
    reportRailShorts(rails: string[]): void {
      useElectricalStore.getState().setRailShorts(rails);
    },
    publish(snapshot: ElectricalSnapshot): void {
      detectDamage(snapshot.branchCurrents);
      detectLedWiring(snapshot);
      useElectricalStore.getState().setSolveResult({
        nodeVoltages: snapshot.nodeVoltages,
        branchCurrents: snapshot.branchCurrents,
        pinNetMap: snapshot.pinNetMap,
        analysisMode: snapshot.analysisMode,
        timeWaveforms: snapshot.timeWaveforms,
        converged: snapshot.warnings.length === 0,
        error: snapshot.warnings[0] ?? null,
        lastSolveMs: 0,
        submittedNetlist: "",
        railShorts: snapshot.railShorts ?? [],
      });
    },
  };
}

/**
 * Mount the simulation loop.  Returns an unsubscribe handle for
 * editor cleanup.
 */
export function startSimulation(): () => void {
  const service = new CircuitSimulationService(
    useSimulatorStore as unknown as SimulatorStorePort,
    createElectricalStorePort(),
    getMixedModeScheduler() as unknown as MixedModeSchedulerPort,
    {
      collectBoardPinStates: (boardId, boardKind, wires) =>
        collectPinStates(
          boardId,
          boardKind as Parameters<typeof collectPinStates>[1],
          wires as Parameters<typeof collectPinStates>[2],
        ),
    },
  );
  // Phase 1d #3 — pre-boot the WASM engine the moment the editor
  // mounts.  Without this, the first solve (typically the user's
  // first canvas edit) pays the full WASM init cost (~2-5 s) and the
  // canvas appears frozen.  By kicking init now, the Worker boots
  // while the user looks at the empty canvas; by the time they wire
  // anything, the engine is warm.
  void getMixedModeScheduler().start();

  const unsubService = service.start();
  const unsubAdc = connectAnalogInputsToMcu();
  const unsubChipIn = connectChipInputsToSolve();
  const unsubEdges = connectMcuEdgesToService(service);

  // Let custom chips request a re-solve when they toggle an output pin, so
  // their SPICE voltage sources (emitted by the custom-chip mapper) are
  // refreshed and LEDs / analog parts on the chip's nets update. The service
  // coalesces overlapping ticks, so frequent chip toggles are cheap.
  setElectricalResolveHook(() => {
    void service.tick();
  });

  // Phase 1d #16 — debug helper. Call `__spiceDebug()` from DevTools
  // to get a snapshot of the simulation state (analysis mode, voltage
  // count, pin map, last solve time, etc.).  Useful for diagnosing
  // "why is my circuit not solving?" reports from users.
  (window as unknown as { __spiceDebug?: () => unknown }).__spiceDebug = () => {
    const electrical = useElectricalStore.getState();
    // Probe: collect every board's outputPins set so we can verify the
    // MCU-direction-tracking fix from the harness.
    const outputPinsByBoard: Record<string, number[]> = {};
    try {
      const boards = useSimulatorStore.getState().boards;
      for (const b of boards) {
        const pm = getBoardPinManager(b.id);
        if (pm && typeof pm.getOutputPins === "function") {
          outputPinsByBoard[b.id] = [...pm.getOutputPins()];
        }
      }
    } catch {
      // ignore — fallback already covered by snapshot fields below
    }
    const snapshot = {
      analysisMode: electrical.analysisMode,
      converged: electrical.converged,
      error: electrical.error,
      lastSolveMs: electrical.lastSolveMs,
      nodeVoltageCount: Object.keys(electrical.nodeVoltages).length,
      branchCurrentCount: Object.keys(electrical.branchCurrents).length,
      branchCurrentNames: Object.keys(electrical.branchCurrents),
      pinNetMapSize: electrical.pinNetMap.size,
      pinNetMapEntries: [...electrical.pinNetMap.entries()],
      nodeVoltages: { ...electrical.nodeVoltages },
      hasTimeWaveforms: !!electrical.timeWaveforms,
      paused: electrical.paused,
      outputPinsByBoard,
    };
    (window as unknown as { __lastSpice?: unknown }).__lastSpice = snapshot;

    console.log("[__spiceDebug]", snapshot);
    return snapshot;
  };

  return () => {
    setElectricalResolveHook(null);
    unsubService();
    unsubAdc();
    unsubChipIn();
    unsubEdges();
  };
}
