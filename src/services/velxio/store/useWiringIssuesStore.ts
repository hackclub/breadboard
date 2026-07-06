// @ts-nocheck
/**
 * useWiringIssuesStore — live "check your wiring" findings from the
 * real-life hookup enforcement in the part simulations.
 *
 * The netTrace-based checks (power pins, I2C bus, SPI bus, the LCD
 * adapter's 16-pin header) report here whenever a part refuses to attach
 * because its wiring doesn't trace to the right board pins, and clear the
 * entry once the wiring is fixed (attachEvents re-runs on wire changes).
 * WiringIssuesPanel renders the list on the canvas so students see WHY a
 * part is dead instead of hunting through the browser console.
 */

import { create } from "zustand";

export interface WiringIssue {
  componentId: string;
  metadataId: string;
  /** What failed to trace, e.g. ["VCC"] or ["SCK", "RST"]. */
  missing: string[];
}

interface WiringIssuesState {
  issues: Record<string, WiringIssue>;
  report: (issue: WiringIssue) => void;
  clear: (componentId: string) => void;
  clearAll: () => void;
}

export const useWiringIssuesStore = create<WiringIssuesState>((set) => ({
  issues: {},

  report: (issue) =>
    set((s) => {
      const prev = s.issues[issue.componentId];
      // Avoid store churn when the same issue is re-reported on re-attach.
      if (
        prev &&
        prev.metadataId === issue.metadataId &&
        prev.missing.join(",") === issue.missing.join(",")
      ) {
        return s;
      }
      return { issues: { ...s.issues, [issue.componentId]: issue } };
    }),

  clear: (componentId) =>
    set((s) => {
      if (!s.issues[componentId]) return s;
      const issues = { ...s.issues };
      delete issues[componentId];
      return { issues };
    }),

  clearAll: () => set({ issues: {} }),
}));

/** Convenience for non-React callers (part simulations). */
export function reportWiringIssue(
  componentId: string,
  metadataId: string,
  missing: string[],
): void {
  useWiringIssuesStore.getState().report({ componentId, metadataId, missing });
}

export function clearWiringIssue(componentId: string): void {
  useWiringIssuesStore.getState().clear(componentId);
}
