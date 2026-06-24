"use client";

import "@/app/editor/velxio-styles/App.css";
import "@/app/editor/velxio-styles/index.css";

import { loader } from "@monaco-editor/react";
import { type FC, useEffect, useRef, useState } from "react";

loader.config({ paths: { vs: "/monaco/vs" } });
import type { EditorSnapshotState } from "@/lib/editor/captureState";

type SnapshotLike = EditorSnapshotState | Record<string, any>;

function normalizeSnapshot(input: SnapshotLike): EditorSnapshotState {
  if (input?.editor && input?.simulator) return input as EditorSnapshotState;
  const payload = input as Record<string, any>;

  const boards = Array.isArray(payload.boards) ? payload.boards : [];
  const activeBoardId = payload.activeBoardId ?? boards[0]?.id ?? null;
  const firstGroupId = boards[0]?.activeFileGroupId ?? "";
  const fileGroups = payload.fileGroups ?? {};
  const activeGroupFileId: Record<string, string> = {};
  const openGroupFileIds: Record<string, string[]> = {};
  for (const [groupId, files] of Object.entries(fileGroups)) {
    if (!Array.isArray(files)) continue;
    const firstFile = files[0] as { id?: string; name?: string } | undefined;
    const fileId = firstFile?.id ?? firstFile?.name ?? "";
    if (fileId) activeGroupFileId[groupId] = fileId;
    openGroupFileIds[groupId] = files
      .map((file: any) => file.id ?? file.name)
      .filter(Boolean);
  }

  return {
    editor: {
      viewMode: "both",
      theme: "vs-dark",
      fontSize: 14,
      fileGroups,
      activeGroupId: firstGroupId,
      activeGroupFileId,
      openGroupFileIds,
      codeChangedSinceLastCompile: false,
    },
    simulator: {
      boards: boards.map((board: any) => ({
        ...board,
        running: false,
        serialMonitorOpen: false,
      })),
      activeBoardId,
      components: Array.isArray(payload.components) ? payload.components : [],
      wires: Array.isArray(payload.wires) ? payload.wires : [],
      selectedWireId: null,
      serialOutput: "",
      serialBaudRate: 115200,
      running: false,
      compiledHex: null,
      hexEpoch: 0,
      esp32CrashBoardId: null,
      canvasPan: { x: 0, y: 0 },
      canvasZoom: 1,
    },
    project: { id: null, slug: payload.name ?? "Snapshot" },
    compileLogs: [],
    oscilloscope: {
      open: false,
      running: false,
      timeDivMs: 1,
      channels: [],
      triggerMode: "auto",
      triggerChannelId: null,
      triggerEdge: "rising",
      triggerStatus: "idle",
    },
    electrical: {
      nodeVoltages: null,
      analysisMode: null,
      converged: null,
      error: null,
      paused: false,
    },
    vfs: { boards: {} },
    monaco: null,
    ui: {
      editorWidthPct: 45,
      explorerOpen: true,
      explorerWidth: 165,
      consoleOpen: false,
      bottomPanelHeight: 200,
      serialMonitorOpen: false,
      oscilloscopeOpen: false,
      canvasZoom: 1,
      canvasScrollX: 0,
      canvasScrollY: 0,
      openModals: [],
    },
  };
}

function loadModules() {
  return Promise.all([
    import("@/lib/velxio/i18n"),
    import("@/services/velxio/store/useEditorStore"),
    import("@/services/velxio/store/useSimulatorStore"),
    import("@/services/velxio/store/useProjectStore"),
    import("@/services/velxio/store/useCompileLogsStore"),
    import("@/services/velxio/store/useOscilloscopeStore"),
    import("@/services/velxio/store/useElectricalStore"),
    import("@/services/velxio/store/useVfsStore"),
    import("@/components/velxio/pages/EditorPage"),
    import("@/components/velxio/components/velxio-components/IC74HC595"),
    import("@/components/velxio/components/velxio-components/LogicGateElements"),
    import("@/components/velxio/components/velxio-components/TransistorElements"),
    import("@/components/velxio/components/velxio-components/OpAmpElements"),
    import("@/components/velxio/components/velxio-components/PowerElements"),
    import("@/components/velxio/components/velxio-components/DiodeElements"),
    import("@/components/velxio/components/velxio-components/RelayElements"),
    import("@/components/velxio/components/velxio-components/LogicICElements"),
    import("@/components/velxio/components/velxio-components/MotorDriverElements"),
    import("@/components/velxio/components/velxio-components/FlipFlopElements"),
    import("@/components/velxio/components/velxio-components/RaspberryPi3Element"),
    import("@/components/velxio/components/velxio-components/Bmp280Element"),
    import("@/components/velxio/components/velxio-components/EPaperElement"),
    import("@/components/velxio/components/velxio-components/BreadboardElements"),
    import("@/components/velxio/components/velxio-components/KitElements"),
  ]).then(([_, editorMod, simMod, projectMod, compileLogsMod, oscilloscopeMod, electricalMod, vfsMod, pageMod]) => {
    const EditorPage = (pageMod as any).EditorPage as FC<{
      readOnly?: boolean;
      shareMode?: boolean;
    }>;
    const editorStore = (editorMod as any).useEditorStore;
    const simStore = (simMod as any).useSimulatorStore;
    const projectStore = (projectMod as any).useProjectStore;
    const compileLogsStore = (compileLogsMod as any).useCompileLogsStore;
    const oscilloscopeStore = (oscilloscopeMod as any).useOscilloscopeStore;
    const electricalStore = (electricalMod as any).useElectricalStore;
    const vfsStore = (vfsMod as any).useVfsStore;
    return { EditorPage, editorStore, simStore, projectStore, compileLogsStore, oscilloscopeStore, electricalStore, vfsStore };
  });
}

function injectState(
  editorStore: any,
  simStore: any,
  projectStore: any,
  compileLogsStore: any,
  oscilloscopeStore: any,
  electricalStore: any,
  vfsStore: any,
  state: SnapshotLike,
) {
  const snapshot = normalizeSnapshot(state);
  projectStore.getState().setCurrentProject({
    id: snapshot.project?.id ?? "snapshot",
    slug: snapshot.project?.slug ?? "Snapshot",
    ownerUsername: "",
    isPublic: false,
    visibility: "private" as any,
  });

  editorStore.setState({
    viewMode: snapshot.editor.viewMode as any,
    theme: snapshot.editor.theme as any,
    fontSize: snapshot.editor.fontSize,
    fileGroups: snapshot.editor.fileGroups,
    activeGroupId: snapshot.editor.activeGroupId,
    activeGroupFileId: snapshot.editor.activeGroupFileId,
    openGroupFileIds: snapshot.editor.openGroupFileIds,
    codeChangedSinceLastCompile: snapshot.editor.codeChangedSinceLastCompile,
  });

  editorStore.getState().setActiveGroup(snapshot.editor.activeGroupId);

  simStore.setState({
    boards: snapshot.simulator.boards,
    activeBoardId: snapshot.simulator.activeBoardId,
    components: snapshot.simulator.components,
    wires: snapshot.simulator.wires,
    serialOutput: snapshot.simulator.serialOutput,
    serialBaudRate: snapshot.simulator.serialBaudRate,
    running: false,
    compiledHex: snapshot.simulator.compiledHex,
    hexEpoch: snapshot.simulator.hexEpoch,
    esp32CrashBoardId: snapshot.simulator.esp32CrashBoardId,
    canvasPan: snapshot.simulator?.canvasPan ?? { x: 0, y: 0 },
    canvasZoom: snapshot.simulator?.canvasZoom ?? 1,
    _timelapseReplay: true,
    selectedWireId: snapshot.simulator.selectedWireId,
    wireInProgress: null,
    history: [],
    historyIndex: -1,
  });

  compileLogsStore.setState({ logs: snapshot.compileLogs ?? [] });
  oscilloscopeStore.setState({
    open: snapshot.oscilloscope?.open ?? false,
    running: snapshot.oscilloscope?.running ?? false,
    timeDivMs: snapshot.oscilloscope?.timeDivMs ?? 1,
    channels: snapshot.oscilloscope?.channels ?? [],
    triggerMode: snapshot.oscilloscope?.triggerMode ?? "auto",
    triggerChannelId: snapshot.oscilloscope?.triggerChannelId ?? null,
    triggerEdge: snapshot.oscilloscope?.triggerEdge ?? "rising",
    triggerStatus: snapshot.oscilloscope?.triggerStatus ?? "idle",
  });

  if (snapshot.electrical?.nodeVoltages) {
    electricalStore.setState({
      nodeVoltages: snapshot.electrical.nodeVoltages,
      analysisMode: snapshot.electrical.analysisMode,
      converged: snapshot.electrical.converged,
      error: snapshot.electrical.error,
      paused: snapshot.electrical.paused,
    });
  }

  if (snapshot.vfs?.boards) {
    vfsStore.setState({ boards: snapshot.vfs.boards });
  }

  setTimeout(() => {
    if (!snapshot.monaco) return;
    const monaco = (window as any).monaco;
    const ed = monaco?.editor?.getEditors?.()?.[0];
    if (!ed) return;
    ed.setPosition({
      lineNumber: snapshot.monaco.cursorLine,
      column: snapshot.monaco.cursorColumn,
    });
    ed.setScrollTop(snapshot.monaco.scrollTop);
    ed.setScrollLeft(snapshot.monaco.scrollLeft);
  }, 600);
}

export function VelxioSnapshotViewer({
  snapshot,
  interactive = false,
  shareMode = false,
}: {
  snapshot: SnapshotLike;
  interactive?: boolean;
  shareMode?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const editorPageRef = useRef<FC<{ readOnly?: boolean; shareMode?: boolean }> | null>(null);
  const storesRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadModules().then(({ EditorPage: EP, ...stores }) => {
      if (cancelled) return;
      editorPageRef.current = EP;
      storesRef.current = stores;
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []); // preload once

  useEffect(() => {
    if (!ready || !storesRef.current) return;
    const { editorStore, simStore, projectStore, compileLogsStore, oscilloscopeStore, electricalStore, vfsStore } = storesRef.current;
    injectState(editorStore, simStore, projectStore, compileLogsStore, oscilloscopeStore, electricalStore, vfsStore, snapshot);
  }, [snapshot, ready]);

  const EP = editorPageRef.current;
  if (!EP) return null;

  return (
    <div className="relative h-full">
      {!interactive ? (
        <div
          className="absolute inset-0 z-50"
          style={{ pointerEvents: "all" }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      ) : null}
      <EP readOnly shareMode={shareMode} />
    </div>
  );
}
