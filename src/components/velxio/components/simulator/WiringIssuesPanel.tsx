// @ts-nocheck
/**
 * WiringIssuesPanel — the one place the simulator surfaces circuit problems
 * while it runs. It aggregates three sources into a single list so the user
 * has a single spot to look instead of hunting across banners and badges:
 *
 *   1. Short circuits (a supply rail wired to ground) from useElectricalStore.
 *   2. Burnt-out parts (over-current) from useSimulatorStore.damagedComponents.
 *   3. Wiring faults (LED backwards, missing power/bus pins) from
 *      useWiringIssuesStore, reported live by the part sims and the solver.
 *
 * The parent (SimulatorCanvas) only mounts this while the simulation is
 * running, so these only appear when they're actionable.
 */

import React, { useState } from "react";
import { ComponentRegistry } from "@/services/velxio/services/ComponentRegistry";
import { useWiringIssuesStore } from "@/services/velxio/store/useWiringIssuesStore";
import { useElectricalStore } from "@/services/velxio/store/useElectricalStore";
import { useSimulatorStore } from "@/services/velxio/store/useSimulatorStore";
import "@/components/velxio/components/simulator/WiringIssuesPanel.css";

interface PanelIssue {
  key: string;
  severity: "error" | "warning";
  /** Part name shown in bold, when the issue belongs to one component. */
  part: string;
  /** The plain-English description. */
  text: string;
}

export const WiringIssuesPanel: React.FC = () => {
  const wiringIssues = useWiringIssuesStore((s) => s.issues);
  const railShorts = useElectricalStore((s) => s.railShorts ?? []);
  const damaged = useSimulatorStore((s) => s.damagedComponents);
  const [collapsed, setCollapsed] = useState(false);

  const registry = ComponentRegistry.getInstance();
  const nameOf = (metadataId: string) =>
    registry.getById(metadataId)?.name ?? metadataId;

  const issues: PanelIssue[] = [];

  // Short circuit: the most serious, list it first.
  if (railShorts.length > 0) {
    issues.push({
      key: "rail-short",
      severity: "error",
      part: "Short circuit",
      text: "A power rail (+) is wired straight to ground (−). Every part on it sees 0 V, so nothing works. Remove the wire connecting + to −.",
    });
  }

  // Burnt-out parts.
  for (const [id, info] of Object.entries(damaged)) {
    const comp = useSimulatorStore
      .getState()
      .components.find((c) => c.id === id);
    issues.push({
      key: `damage-${id}`,
      severity: "error",
      part: comp ? nameOf(comp.metadataId) : "Component",
      text: info.reason,
    });
  }

  // Live wiring faults (LED backwards, missing power, etc.).
  for (const issue of Object.values(wiringIssues)) {
    issues.push({
      key: `wiring-${issue.componentId}`,
      severity: "warning",
      part: nameOf(issue.metadataId),
      text: issue.missing.join(", "),
    });
  }

  if (issues.length === 0) return null;

  const errorCount = issues.filter((i) => i.severity === "error").length;

  return (
    <div className="wiring-issues-panel">
      <button
        type="button"
        className="wiring-issues-header"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="wiring-issues-icon">{errorCount > 0 ? "⚡" : "⚠"}</span>
        <span>
          {issues.length} circuit issue{issues.length !== 1 ? "s" : ""}
        </span>
        <span className="wiring-issues-chevron">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <ul className="wiring-issues-list">
          {issues.map((issue) => (
            <li
              key={issue.key}
              className="wiring-issues-row"
              data-severity={issue.severity}
            >
              <span className="wiring-issues-part">{issue.part}</span>
              <span className="wiring-issues-missing">{issue.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
