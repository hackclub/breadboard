"use client";

export interface EditorSnapshotState {
  editor: {
    viewMode: string;
    theme: string;
    fontSize: number;
    fileGroups: Record<
      string,
      Array<{ id: string; name: string; content: string; modified: boolean }>
    >;
    activeGroupId: string;
    activeGroupFileId: Record<string, string>;
    openGroupFileIds: Record<string, string[]>;
    codeChangedSinceLastCompile: boolean;
  };
  simulator: {
    boards: Array<{
      id: string;
      name?: string;
      boardKind: string;
      x: number;
      y: number;
      running: boolean;
      serialMonitorOpen: boolean;
      languageMode?: string;
      activeFileGroupId: string;
      boardOptions?: Record<string, unknown>;
      spiffsFiles?: Array<{ name: string; content_b64: string }>;
    }>;
    activeBoardId: string | null;
    components: Array<{
      id: string;
      metadataId: string;
      x: number;
      y: number;
      properties: Record<string, unknown>;
    }>;
    wires: Array<{
      id: string;
      start: { componentId: string; pinName: string; x: number; y: number };
      end: { componentId: string; pinName: string; x: number; y: number };
      waypoints: Array<{ x: number; y: number }>;
      color: string;
    }>;
    selectedWireId: string | null;
    serialOutput: string;
    serialBaudRate: number;
    running: boolean;
    compiledHex: string | null;
    hexEpoch: number;
    esp32CrashBoardId: string | null;
    canvasPan: { x: number; y: number };
    canvasZoom: number;
  };
  project: { id: string | null; slug: string | null };
  compileLogs: Array<{
    timestamp: number;
    type: string;
    message: string;
    boardId?: string;
  }>;
  oscilloscope: {
    open: boolean;
    running: boolean;
    timeDivMs: number;
    channels: Array<{
      id: string;
      boardId: string;
      pin: number;
      label: string;
      color: string;
    }>;
    triggerMode: string;
    triggerChannelId: string | null;
    triggerEdge: string;
    triggerStatus: string;
  };
  electrical: {
    nodeVoltages: Record<string, number> | null;
    analysisMode: string | null;
    converged: boolean | null;
    error: string | null;
    paused: boolean;
  };
  vfs: {
    boards: Record<string, { rootId: string; selectedNodeId: string | null }>;
  };
  monaco: {
    cursorLine: number;
    cursorColumn: number;
    scrollTop: number;
    scrollLeft: number;
    selectionStartLine: number;
    selectionStartColumn: number;
    selectionEndLine: number;
    selectionEndColumn: number;
  } | null;
  ui: {
    editorWidthPct: number;
    explorerOpen: boolean;
    explorerWidth: number;
    consoleOpen: boolean;
    bottomPanelHeight: number;
    serialMonitorOpen: boolean;
    oscilloscopeOpen: boolean;
    canvasZoom: number;
    canvasScrollX: number;
    canvasScrollY: number;
    openModals: string[];
  };
}

function readUIState(): EditorSnapshotState["ui"] {
  if (typeof document === "undefined") {
    return {
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
    };
  }

  const editorPanel = document.querySelector(
    "div.editor-panel",
  ) as HTMLElement | null;
  const container = document.querySelector(
    "div.app-container",
  ) as HTMLElement | null;
  let editorWidthPct = 45;
  if (editorPanel && container) {
    editorWidthPct = (editorPanel.offsetWidth / container.offsetWidth) * 100;
  }

  const explorerToggle = document.querySelector(
    "button.explorer-toggle-btn",
  ) as HTMLElement | null;
  const explorerOpen = explorerToggle !== null;

  const explorerEl = document.querySelector(
    "div.explorer-resize-handle",
  ) as HTMLElement | null;
  const explorerWidth = explorerEl
    ? Math.max(explorerEl.offsetWidth, 110)
    : 165;

  const worldEl = document.querySelector(
    "div.canvas-world",
  ) as HTMLElement | null;
  let canvasZoom = 1;
  let canvasScrollX = 0;
  let canvasScrollY = 0;
  if (worldEl) {
    const t = worldEl.style.transform || "";
    const m = t.match(/scale\(([\d.]+)\)/);
    const tx = t.match(/translate\(([\d.-]+)px,\s*([\d.-]+)px\)/);
    if (m) canvasZoom = parseFloat(m[1]);
    if (tx) {
      canvasScrollX = parseFloat(tx[1]);
      canvasScrollY = parseFloat(tx[2]);
    }
  }

  const consoleOpen = false;
  const bottomPanelHeight = 200;

  const serialEl = document.querySelector(
    "div[data-serial-monitor]",
  ) as HTMLElement | null;
  const serialOpen = serialEl !== null && serialEl.offsetHeight > 0;

  const scopeEl = document.querySelector(
    "div[data-oscilloscope]",
  ) as HTMLElement | null;
  const oscOpen = scopeEl !== null && scopeEl.offsetHeight > 0;

  const modals: string[] = [];
  const picker = document.querySelector(
    "div.component-picker-overlay",
  ) as HTMLElement | null;
  if (picker && picker.offsetHeight > 0) modals.push("component-picker");
  for (const sel of [
    "div.modal-overlay",
    "div.dialog-overlay",
    '[role="dialog"]',
  ]) {
    document.querySelectorAll(sel).forEach((el) => {
      if ((el as HTMLElement).offsetHeight > 0) modals.push(sel);
    });
  }

  return {
    editorWidthPct,
    explorerOpen,
    explorerWidth,
    consoleOpen,
    bottomPanelHeight,
    serialMonitorOpen: serialOpen,
    oscilloscopeOpen: oscOpen,
    canvasZoom,
    canvasScrollX,
    canvasScrollY,
    openModals: [...new Set(modals)].slice(0, 5),
  };
}

export function captureEditorState(
  editorStore: any,
  simulatorStore: any,
  projectStore: any,
  compileLogsStore: any,
  oscilloscopeStore: any,
  electricalStore: any,
  vfsStore: any,
): EditorSnapshotState {
  const editor = editorStore.getState();
  const sim = simulatorStore.getState();
  const proj = projectStore.getState();
  const logs = compileLogsStore.getState();
  const scope = oscilloscopeStore.getState();
  const elec = electricalStore.getState();
  const vfs = vfsStore.getState();

  const monaco = (window as any).monaco;
  const monacoEditor = monaco?.editor?.getEditors?.()?.[0];
  const cursor = monacoEditor?.getPosition?.();
  const selection = monacoEditor?.getSelection?.();

  return {
    editor: {
      viewMode: editor.viewMode ?? "both",
      theme: editor.theme ?? "vs-dark",
      fontSize: editor.fontSize ?? 14,
      fileGroups: editor.fileGroups ?? {},
      activeGroupId: editor.activeGroupId ?? "",
      activeGroupFileId: editor.activeGroupFileId ?? {},
      openGroupFileIds: editor.openGroupFileIds ?? {},
      codeChangedSinceLastCompile: editor.codeChangedSinceLastCompile ?? true,
    },
    simulator: {
      boards: (sim.boards ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        boardKind: b.boardKind,
        x: b.x,
        y: b.y,
        running: b.running ?? false,
        serialMonitorOpen: b.serialMonitorOpen ?? false,
        languageMode: b.languageMode,
        activeFileGroupId: b.activeFileGroupId,
        boardOptions: b.boardOptions
          ? JSON.parse(JSON.stringify(b.boardOptions))
          : undefined,
        spiffsFiles: b.spiffsFiles
          ? b.spiffsFiles.map((f: any) => ({
              name: f.name,
              content_b64: f.content_b64,
            }))
          : undefined,
      })),
      activeBoardId: sim.activeBoardId ?? null,
      components: (sim.components ?? []).map((c: any) => ({
        id: c.id,
        metadataId: c.metadataId,
        x: c.x,
        y: c.y,
        properties: c.properties ?? {},
      })),
      wires: (sim.wires ?? []).map((w: any) => ({
        id: w.id,
        start: w.start,
        end: w.end,
        waypoints: w.waypoints ?? [],
        color: w.color ?? "#00ff00",
      })),
      selectedWireId: sim.selectedWireId ?? null,
      serialOutput: sim.serialOutput ?? "",
      serialBaudRate: sim.serialBaudRate ?? 0,
      running: sim.running ?? false,
      compiledHex: sim.compiledHex ?? null,
      hexEpoch: sim.hexEpoch ?? 0,
      esp32CrashBoardId: sim.esp32CrashBoardId ?? null,
      canvasPan: sim.canvasPan ?? { x: 0, y: 0 },
      canvasZoom: sim.canvasZoom ?? 1,
    },
    project: {
      id: proj.currentProject?.id ?? null,
      slug: proj.currentProject?.slug ?? null,
    },
    compileLogs: (logs.logs ?? []).map((l: any) => ({
      timestamp: l.timestamp ?? Date.now(),
      type: l.type ?? "info",
      message: l.message ?? "",
      boardId: l.boardId,
    })),
    oscilloscope: {
      open: scope.open ?? false,
      running: scope.running ?? false,
      timeDivMs: scope.timeDivMs ?? 1,
      channels: (scope.channels ?? []).map((c: any) => ({
        id: c.id,
        boardId: c.boardId,
        pin: c.pin,
        label: c.label,
        color: c.color,
      })),
      triggerMode: scope.triggerMode ?? "auto",
      triggerChannelId: scope.triggerChannelId ?? null,
      triggerEdge: scope.triggerEdge ?? "rising",
      triggerStatus: scope.triggerStatus ?? "idle",
    },
    electrical: {
      nodeVoltages: elec.nodeVoltages ?? null,
      analysisMode: elec.analysisMode ?? null,
      converged: elec.converged ?? null,
      error: elec.error ?? null,
      paused: elec.paused ?? false,
    },
    vfs: {
      boards: Object.fromEntries(
        Object.entries((vfs.boards ?? {}) as Record<string, any>).map(
          ([id, b]) => [
            id,
            { rootId: b.rootId, selectedNodeId: b.selectedNodeId ?? null },
          ],
        ),
      ),
    },
    monaco: cursor
      ? {
          cursorLine: cursor.lineNumber,
          cursorColumn: cursor.column,
          scrollTop: monacoEditor?.getScrollTop?.() ?? 0,
          scrollLeft: monacoEditor?.getScrollLeft?.() ?? 0,
          selectionStartLine: selection?.startLineNumber ?? cursor.lineNumber,
          selectionStartColumn: selection?.startColumn ?? cursor.column,
          selectionEndLine: selection?.endLineNumber ?? cursor.lineNumber,
          selectionEndColumn: selection?.endColumn ?? cursor.column,
        }
      : null,
    ui: readUIState(),
  };
}
