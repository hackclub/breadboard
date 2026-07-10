import {
  Cable,
  Check,
  Copy,
  Eye,
  EyeOff,
  LocateFixed,
  Plug,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComponentRegistry } from "@/services/velxio/services/ComponentRegistry";
import type { BoardInstance } from "@/lib/velxio/types/board";
import { boardDisplayName } from "@/lib/velxio/types/board";
import type { Wire } from "@/lib/velxio/types/wire";
import "@/components/velxio/components/simulator/ConnectionInspector.css";

type CanvasComponent = {
  id: string;
  metadataId: string;
  x: number;
  y: number;
  properties: Record<string, unknown>;
  attachedTo?: {
    breadboardId: string;
    pinMap: Record<string, string>;
  };
};

type EndpointDescription = {
  component: string;
  pin: string;
  rawId: string;
  missing: boolean;
};

type WireConnection = {
  kind: "wire";
  id: string;
  wire: Wire;
  start: EndpointDescription;
  end: EndpointDescription;
  searchText: string;
};

type PlugConnection = {
  kind: "plug";
  id: string;
  componentId: string;
  start: EndpointDescription;
  end: EndpointDescription;
  searchText: string;
};

type ConnectionInspectorProps = {
  wires: Wire[];
  boards: BoardInstance[];
  components: CanvasComponent[];
  selectedWireId: string | null;
  isolatedWireId: string | null;
  canEdit: boolean;
  onClose: () => void;
  onFocusWire: (wireId: string) => void;
  onFocusComponent: (componentId: string) => void;
  onHoverWire: (wireId: string | null) => void;
  onIsolateWire: (wireId: string | null) => void;
  onDeleteWire: (wireId: string) => void;
};

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareEndpoints(a: EndpointDescription, b: EndpointDescription) {
  // Missing endpoints sink to the bottom so real connections read first.
  if (a.missing !== b.missing) return a.missing ? 1 : -1;
  const byComponent = collator.compare(a.component, b.component);
  if (byComponent !== 0) return byComponent;
  return collator.compare(a.pin, b.pin);
}

function compareConnections(
  a: WireConnection | PlugConnection,
  b: WireConnection | PlugConnection,
) {
  return compareEndpoints(a.start, b.start) || compareEndpoints(a.end, b.end);
}

function customComponentName(component: CanvasComponent, fallback: string) {
  const candidate = component.properties.label ?? component.properties.name;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : fallback;
}

function makeUniqueLabels(
  boards: BoardInstance[],
  components: CanvasComponent[],
) {
  const registry = ComponentRegistry.getInstance();
  const entries = [
    ...boards.map((board) => ({ id: board.id, base: boardDisplayName(board) })),
    ...components.map((component) => ({
      id: component.id,
      base: customComponentName(
        component,
        registry.getById(component.metadataId)?.name ?? component.metadataId,
      ),
    })),
  ];
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.base, (totals.get(entry.base) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const entry of entries) {
    const index = (seen.get(entry.base) ?? 0) + 1;
    seen.set(entry.base, index);
    labels.set(
      entry.id,
      (totals.get(entry.base) ?? 0) > 1 ? `${entry.base} ${index}` : entry.base,
    );
  }
  return labels;
}

function displayPin(
  componentId: string,
  pinName: string,
  boardById: Map<string, BoardInstance>,
) {
  const board = boardById.get(componentId);
  if (board?.boardKind.includes("esp32") && /^\d+$/.test(pinName)) {
    return `D${pinName}`;
  }
  return pinName;
}

function endpointDescription(
  componentId: string,
  pinName: string,
  labels: Map<string, string>,
  boardById: Map<string, BoardInstance>,
): EndpointDescription {
  const label = labels.get(componentId);
  return {
    component: label ?? `Missing component`,
    pin: displayPin(componentId, pinName, boardById),
    rawId: componentId,
    missing: !label,
  };
}

function Endpoint({ value }: { value: EndpointDescription }) {
  return (
    <span className="connection-endpoint" title={value.rawId}>
      <span
        className={
          value.missing ? "connection-name missing" : "connection-name"
        }
      >
        {value.component}
      </span>
      <span className="connection-pin">{value.pin}</span>
    </span>
  );
}

export function ConnectionInspector({
  wires,
  boards,
  components,
  selectedWireId,
  isolatedWireId,
  canEdit,
  onClose,
  onFocusWire,
  onFocusComponent,
  onHoverWire,
  onIsolateWire,
  onDeleteWire,
}: ConnectionInspectorProps) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const { wireConnections, plugConnections } = useMemo(() => {
    const labels = makeUniqueLabels(boards, components);
    const boardById = new Map(boards.map((board) => [board.id, board]));
    const describe = (componentId: string, pinName: string) =>
      endpointDescription(componentId, pinName, labels, boardById);

    const describedWires: WireConnection[] = wires.map((wire) => {
      const rawStart = describe(wire.start.componentId, wire.start.pinName);
      const rawEnd = describe(wire.end.componentId, wire.end.pinName);
      // Order endpoints so the alphabetically-lower one always reads first;
      // wire direction isn't electrically meaningful, so this groups every
      // connection touching a component together no matter how it was drawn.
      const [start, end] =
        compareEndpoints(rawStart, rawEnd) <= 0
          ? [rawStart, rawEnd]
          : [rawEnd, rawStart];
      return {
        kind: "wire",
        id: wire.id,
        wire,
        start,
        end,
        searchText: [
          start.component,
          start.pin,
          start.rawId,
          end.component,
          end.pin,
          end.rawId,
          wire.signalType ?? "wire",
        ]
          .join(" ")
          .toLocaleLowerCase(),
      };
    });

    const describedPlugs: PlugConnection[] = [];
    for (const component of components) {
      if (!component.attachedTo) continue;
      for (const [pinName, holeName] of Object.entries(
        component.attachedTo.pinMap,
      )) {
        const start = describe(component.id, pinName);
        const end = describe(component.attachedTo.breadboardId, holeName);
        describedPlugs.push({
          kind: "plug",
          id: `${component.id}:${pinName}:${component.attachedTo.breadboardId}:${holeName}`,
          componentId: component.id,
          start,
          end,
          searchText: [
            start.component,
            start.pin,
            start.rawId,
            end.component,
            end.pin,
            end.rawId,
            "plugged breadboard",
          ]
            .join(" ")
            .toLocaleLowerCase(),
        });
      }
    }

    return {
      wireConnections: describedWires.sort(compareConnections),
      plugConnections: describedPlugs.sort(compareConnections),
    };
  }, [boards, components, wires]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleWires = normalizedQuery
    ? wireConnections.filter((connection) =>
        connection.searchText.includes(normalizedQuery),
      )
    : wireConnections;
  const visiblePlugs = normalizedQuery
    ? plugConnections.filter((connection) =>
        connection.searchText.includes(normalizedQuery),
      )
    : plugConnections;
  const resultCount = visibleWires.length + visiblePlugs.length;

  const copyConnections = async () => {
    const lines = [
      `Wires (${visibleWires.length})`,
      ...visibleWires.map(
        (connection, index) =>
          `${index + 1}. ${connection.start.component} · ${connection.start.pin} -> ${connection.end.component} · ${connection.end.pin}${connection.wire.signalType ? ` [${connection.wire.signalType}]` : ""}`,
      ),
    ];
    if (visiblePlugs.length > 0) {
      lines.push(
        "",
        `Breadboard plugs (${visiblePlugs.length})`,
        ...visiblePlugs.map(
          (connection, index) =>
            `${index + 1}. ${connection.start.component} · ${connection.start.pin} -> ${connection.end.component} · ${connection.end.pin}`,
        ),
      );
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside
      className="connection-inspector"
      aria-label="Circuit connections"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="connection-inspector-header">
        <div className="connection-inspector-title">
          <Cable size={17} aria-hidden="true" />
          <div>
            <h2>Connections</h2>
            <p>
              {wires.length} wire{wires.length === 1 ? "" : "s"}
              {plugConnections.length > 0
                ? ` · ${plugConnections.length} plugged`
                : ""}
            </p>
          </div>
        </div>
        <div className="connection-inspector-header-actions">
          <button
            type="button"
            className="connection-icon-button"
            onClick={copyConnections}
            disabled={resultCount === 0}
            title="Copy visible connections"
            aria-label="Copy visible connections"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button
            type="button"
            className="connection-icon-button"
            onClick={onClose}
            title="Close connections"
            aria-label="Close connections"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <label className="connection-search">
        <Search size={15} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a component or pin"
          aria-label="Find a component or pin"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            title="Clear search"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>

      {isolatedWireId ? (
        <button
          type="button"
          className="connection-spotlight-banner"
          onClick={() => onIsolateWire(null)}
        >
          <Eye size={14} aria-hidden="true" />
          One wire spotlighted
          <span>Show all</span>
        </button>
      ) : null}

      <div className="connection-inspector-body">
        {resultCount === 0 ? (
          <div className="connection-empty">
            <Cable size={24} strokeWidth={1.5} aria-hidden="true" />
            <p>{query ? "No matching connections" : "No wires yet"}</p>
            <span>
              {query
                ? "Try a component name or pin number."
                : "Connections will appear here as you wire the circuit."}
            </span>
          </div>
        ) : (
          <>
            {visibleWires.length > 0 ? (
              <section className="connection-section" aria-label="Wires">
                <div className="connection-section-label">
                  <span>Wires</span>
                  <span>{visibleWires.length}</span>
                </div>
                <ul className="connection-list">
                  {visibleWires.map((connection) => {
                    const selected = selectedWireId === connection.id;
                    const isolated = isolatedWireId === connection.id;
                    const missing =
                      connection.start.missing || connection.end.missing;
                    return (
                      <li
                        key={connection.id}
                        className={`connection-row${selected ? " selected" : ""}${missing ? " warning" : ""}`}
                        onMouseEnter={() => onHoverWire(connection.id)}
                        onMouseLeave={() => onHoverWire(null)}
                      >
                        <button
                          type="button"
                          className="connection-row-main"
                          onClick={() => onFocusWire(connection.id)}
                          title="Select and center this wire"
                        >
                          <span
                            className="connection-color"
                            style={{ backgroundColor: connection.wire.color }}
                            aria-label={`Wire color ${connection.wire.color}`}
                          />
                          <span className="connection-route">
                            <Endpoint value={connection.start} />
                            <span
                              className="connection-arrow"
                              aria-hidden="true"
                            >
                              →
                            </span>
                            <Endpoint value={connection.end} />
                          </span>
                          <LocateFixed
                            className="connection-locate"
                            size={14}
                            aria-hidden="true"
                          />
                        </button>
                        <div className="connection-row-meta">
                          <span>{connection.wire.signalType ?? "wire"}</span>
                          <div className="connection-row-actions">
                            <button
                              type="button"
                              className={isolated ? "active" : ""}
                              onClick={() =>
                                onIsolateWire(isolated ? null : connection.id)
                              }
                              title={
                                isolated
                                  ? "Show every wire"
                                  : "Spotlight only this wire"
                              }
                              aria-label={
                                isolated
                                  ? "Show every wire"
                                  : "Spotlight only this wire"
                              }
                            >
                              {isolated ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                            {canEdit ? (
                              <button
                                type="button"
                                className="danger"
                                onClick={() => onDeleteWire(connection.id)}
                                title="Delete wire"
                                aria-label={`Delete wire from ${connection.start.component} ${connection.start.pin} to ${connection.end.component} ${connection.end.pin}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {visiblePlugs.length > 0 ? (
              <section
                className="connection-section"
                aria-label="Breadboard plugs"
              >
                <div className="connection-section-label">
                  <span>Plugged into breadboard</span>
                  <span>{visiblePlugs.length}</span>
                </div>
                <ul className="connection-list">
                  {visiblePlugs.map((connection) => (
                    <li key={connection.id} className="connection-row plugged">
                      <button
                        type="button"
                        className="connection-row-main"
                        onClick={() => onFocusComponent(connection.componentId)}
                        title="Center this plugged component"
                      >
                        <span className="connection-plug-icon">
                          <Plug size={13} aria-hidden="true" />
                        </span>
                        <span className="connection-route">
                          <Endpoint value={connection.start} />
                          <span className="connection-arrow" aria-hidden="true">
                            →
                          </span>
                          <Endpoint value={connection.end} />
                        </span>
                        <LocateFixed
                          className="connection-locate"
                          size={14}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
