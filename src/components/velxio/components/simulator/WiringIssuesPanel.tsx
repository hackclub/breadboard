// @ts-nocheck
/**
 * WiringIssuesPanel — floating list of live "check your wiring" findings.
 *
 * The real-life hookup enforcement in the part simulations (power pins,
 * I2C/SPI bus tracing, the LCD adapter's 16-pin header) reports into
 * useWiringIssuesStore whenever a part refuses to attach; entries clear
 * themselves the moment the wiring is fixed. This panel makes those
 * findings visible on the canvas instead of hiding them in the console.
 */

import React, { useState } from "react";
import { ComponentRegistry } from "@/services/velxio/services/ComponentRegistry";
import { useWiringIssuesStore } from "@/services/velxio/store/useWiringIssuesStore";
import "@/components/velxio/components/simulator/WiringIssuesPanel.css";

export const WiringIssuesPanel: React.FC = () => {
  const issues = useWiringIssuesStore((s) => s.issues);
  const [collapsed, setCollapsed] = useState(false);

  const list = Object.values(issues);
  if (list.length === 0) return null;

  const registry = ComponentRegistry.getInstance();

  return (
    <div className="wiring-issues-panel">
      <button
        type="button"
        className="wiring-issues-header"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="wiring-issues-icon">⚠</span>
        <span>
          {list.length} wiring issue{list.length !== 1 ? "s" : ""}
        </span>
        <span className="wiring-issues-chevron">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <ul className="wiring-issues-list">
          {list.map((issue) => {
            const name =
              registry.getById(issue.metadataId)?.name ?? issue.metadataId;
            return (
              <li key={issue.componentId} className="wiring-issues-row">
                <span className="wiring-issues-part">{name}</span>
                <span className="wiring-issues-missing">
                  {issue.missing.join(", ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
