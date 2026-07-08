import { useElectricalStore } from "@/services/velxio/store/useElectricalStore";

/**
 * isCircuitPowered — the one definition of "the circuit is energized" that
 * every part sim and every solve-time detector must agree on.
 *
 * A board-backed circuit is powered while any board is running; a board-less
 * analog/digital circuit is powered while the electrical solver isn't paused
 * (the Run/Stop toggle). This is deliberately stricter than "is the solver
 * running": the analog solver also runs during plain editing to keep wire
 * previews live, and parts must stay inert (dark, un-burnable) until Run.
 *
 * Keeping this in one place stops LED glow, chip ticking, burnout detection,
 * and wiring diagnosis from drifting apart when the powered rule changes.
 */
export function isCircuitPowered(
  boards: ReadonlyArray<{ running: boolean }>,
): boolean {
  return boards.length === 0
    ? !useElectricalStore.getState().paused
    : boards.some((b) => b.running);
}
