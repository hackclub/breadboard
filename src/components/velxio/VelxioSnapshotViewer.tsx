"use client";

import "@/app/editor/velxio-styles/App.css";
import "@/app/editor/velxio-styles/index.css";

import { loader } from "@monaco-editor/react";
import { type FC, useEffect, useRef, useState } from "react";

loader.config({ paths: { vs: "/monaco/vs" } });
import type { EditorSnapshotState } from "@/lib/editor/captureState";

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
  state: EditorSnapshotState,
) {
  projectStore.getState().setCurrentProject({
    id: state.project?.id ?? "snapshot",
    slug: state.project?.slug ?? "Snapshot",
    ownerUsername: "",
    isPublic: false,
    visibility: "private" as any,
  });

  editorStore.setState({
    viewMode: state.editor.viewMode as any,
    theme: state.editor.theme as any,
    fontSize: state.editor.fontSize,
    fileGroups: state.editor.fileGroups,
    activeGroupId: state.editor.activeGroupId,
    activeGroupFileId: state.editor.activeGroupFileId,
    openGroupFileIds: state.editor.openGroupFileIds,
    codeChangedSinceLastCompile: state.editor.codeChangedSinceLastCompile,
  });

  editorStore.getState().setActiveGroup(state.editor.activeGroupId);

  simStore.setState({
    boards: state.simulator.boards,
    activeBoardId: state.simulator.activeBoardId,
    components: state.simulator.components,
    wires: state.simulator.wires,
    serialOutput: state.simulator.serialOutput,
    serialBaudRate: state.simulator.serialBaudRate,
    running: false,
    compiledHex: state.simulator.compiledHex,
    hexEpoch: state.simulator.hexEpoch,
    esp32CrashBoardId: state.simulator.esp32CrashBoardId,
    canvasPan: state.simulator?.canvasPan ?? { x: 0, y: 0 },
    canvasZoom: state.simulator?.canvasZoom ?? 1,
    _timelapseReplay: true,
    selectedWireId: state.simulator.selectedWireId,
    wireInProgress: null,
    history: [],
    historyIndex: -1,
  });

  compileLogsStore.setState({ logs: state.compileLogs ?? [] });
  oscilloscopeStore.setState({
    open: state.oscilloscope?.open ?? false,
    running: state.oscilloscope?.running ?? false,
    timeDivMs: state.oscilloscope?.timeDivMs ?? 1,
    channels: state.oscilloscope?.channels ?? [],
    triggerMode: state.oscilloscope?.triggerMode ?? "auto",
    triggerChannelId: state.oscilloscope?.triggerChannelId ?? null,
    triggerEdge: state.oscilloscope?.triggerEdge ?? "rising",
    triggerStatus: state.oscilloscope?.triggerStatus ?? "idle",
  });

  if (state.electrical?.nodeVoltages) {
    electricalStore.setState({
      nodeVoltages: state.electrical.nodeVoltages,
      analysisMode: state.electrical.analysisMode,
      converged: state.electrical.converged,
      error: state.electrical.error,
      paused: state.electrical.paused,
    });
  }

  if (state.vfs?.boards) {
    vfsStore.setState({ boards: state.vfs.boards });
  }

  setTimeout(() => {
    if (!state.monaco) return;
    const monaco = (window as any).monaco;
    const ed = monaco?.editor?.getEditors?.()?.[0];
    if (!ed) return;
    ed.setPosition({ lineNumber: state.monaco.cursorLine, column: state.monaco.cursorColumn });
    ed.setScrollTop(state.monaco.scrollTop);
    ed.setScrollLeft(state.monaco.scrollLeft);
  }, 600);
}

export function VelxioSnapshotViewer({
  snapshot,
  interactive = false,
  shareMode = false,
}: {
  snapshot: EditorSnapshotState;
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
