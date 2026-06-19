"use client";

import { loader } from "@monaco-editor/react";
import { LoadingCard } from "@/components/shared/loading-card";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VlxPayload } from "@/lib/velxio/utils/vlxFile";
import {
  emitEditorSaveState,
  registerManualSave,
} from "@/lib/editor/saveState";
import {
  startActivityTracking,
  stopActivityTracking,
  markRealActivity,
} from "@/lib/editor/activityTracker";

loader.config({ paths: { vs: "/monaco/vs" } });

import {
  captureEditorState,
} from "@/lib/editor/captureState";

type EditorProjectMeta = {
  id: number;
  title: string;
  description: string;
  status: string;
  editable: boolean;
  lastSavedAt?: string | null;
};

type LoadResponse = {
  project: EditorProjectMeta;
  version: number | null;
  editorData: VlxPayload | null;
};

type VelxioModules = {
  EditorPage: React.ComponentType;
  installAutoSaveImpl: (impl: any) => void;
  useProjectStore: { getState: () => any };
  useSimulatorStore: { getState: () => any };
  useEditorStore: { getState: () => any };
  useCompileLogsStore: { getState: () => any };
  useOscilloscopeStore: { getState: () => any };
  useElectricalStore: { getState: () => any };
  useVfsStore: { getState: () => any };
  buildVlxPayload: (opts?: { name?: string }) => VlxPayload;
};

async function loadVelxioModules(
  onProgress?: (pct: number) => void,
  onLabel?: (label: string, done: boolean) => void,
): Promise<VelxioModules> {
  let done = 0;
  const total = 27;
  const step = (label: string) => {
    onProgress?.(Math.round((++done / total) * 100));
    onLabel?.(label, true);
  };
  const loading = (label: string) => onLabel?.(label, false);

  loading("i18n");
  await import("@/lib/velxio/i18n"); step("i18n");
  loading("Custom elements");
  await import("@/components/velxio/components/velxio-components/IC74HC595"); step("74HC595");
  await import("@/components/velxio/components/velxio-components/LogicGateElements"); step("Logic gates");
  await import("@/components/velxio/components/velxio-components/TransistorElements"); step("Transistors");
  await import("@/components/velxio/components/velxio-components/OpAmpElements"); step("Op-amps");
  await import("@/components/velxio/components/velxio-components/PowerElements"); step("Power");
  await import("@/components/velxio/components/velxio-components/DiodeElements"); step("Diodes");
  await import("@/components/velxio/components/velxio-components/RelayElements"); step("Relays");
  await import("@/components/velxio/components/velxio-components/LogicICElements"); step("Logic ICs");
  await import("@/components/velxio/components/velxio-components/MotorDriverElements"); step("Motor drivers");
  await import("@/components/velxio/components/velxio-components/FlipFlopElements"); step("Flip-flops");
  await import("@/components/velxio/components/velxio-components/RaspberryPi3Element"); step("Raspberry Pi");
  await import("@/components/velxio/components/velxio-components/Bmp280Element"); step("BMP280");
  await import("@/components/velxio/components/velxio-components/EPaperElement"); step("e-Paper");
  await import("@/components/velxio/components/velxio-components/BreadboardElements"); step("Breadboard");

  loading("Editor page");
  const page = await import("@/components/velxio/pages/EditorPage"); step("Editor page");
  loading("Autosave");
  const autosave = await import("@/services/velxio/hooks/useAutoSaveProject"); step("Autosave");
  loading("Project store");
  const projectStore = await import("@/services/velxio/store/useProjectStore"); step("Project store");
  loading("Simulator store");
  const simulatorStore = await import("@/services/velxio/store/useSimulatorStore"); step("Simulator store");
  loading("Editor store");
  const editorStore = await import("@/services/velxio/store/useEditorStore"); step("Editor store");
  loading("Compile log store");
  const compileLogsStore = await import("@/services/velxio/store/useCompileLogsStore"); step("Compile log store");
  loading("Oscilloscope store");
  const oscilloscopeStore = await import("@/services/velxio/store/useOscilloscopeStore"); step("Oscilloscope store");
  loading("Electrical store");
  const electricalStore = await import("@/services/velxio/store/useElectricalStore"); step("Electrical store");
  loading("VFS store");
  const vfsStore = await import("@/services/velxio/store/useVfsStore"); step("VFS store");
  loading("VLX file utils");
  const vlx = await import("@/lib/velxio/utils/vlxFile"); step("VLX file utils");

  return {
    EditorPage: page.EditorPage,
    installAutoSaveImpl: autosave.installAutoSaveImpl,
    useProjectStore: projectStore.useProjectStore,
    useSimulatorStore: simulatorStore.useSimulatorStore,
    useEditorStore: editorStore.useEditorStore,
    useCompileLogsStore: compileLogsStore.useCompileLogsStore,
    useOscilloscopeStore: oscilloscopeStore.useOscilloscopeStore,
    useElectricalStore: electricalStore.useElectricalStore,
    useVfsStore: vfsStore.useVfsStore,
    buildVlxPayload: vlx.buildVlxPayload,
  };
}

function installBreadboardAutosave(
  projectId: number,
  editable: boolean,
  modules: VelxioModules,
) {
  modules.installAutoSaveImpl((emit: (state: unknown) => void) => {
    if (!editable) return () => undefined;
    let lastSerialized = "";
    let rebaselineAfter = false;
    let stopped = false;

    const report = (state: { status: string; lastSavedAt: number | null; errorMessage: string | null }) => {
      emit(state);
      emitEditorSaveState({
        status: state.status as
          | "idle"
          | "dirty"
          | "saving"
          | "saved"
          | "error",
        lastSavedAt: state.lastSavedAt,
        errorMessage: state.errorMessage,
      });
    };

    const serializedData = () => {
      const raw = modules.buildVlxPayload({ name: `project-${projectId}` });
      const { exportedAt, name, ...data } = raw;
      void name;
      return JSON.stringify(data);
    };

    const save = async (reason: string) => {
      const serialized = serializedData();
      if (serialized === lastSerialized && reason !== "before-unload") return;
      report({ status: "saving", lastSavedAt: null, errorMessage: null });
      try {
        const editorData = JSON.parse(serialized) as VlxPayload;
        const res = await fetch(`/api/editor/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ editorData, reason }),
        });
        if (!res.ok)
          throw new Error((await res.json()).error ?? "Save failed");
        lastSerialized = serialized;
        rebaselineAfter = false;
        report({
          status: "saved",
          lastSavedAt: Date.now(),
          errorMessage: null,
        });
      } catch (err) {
        report({
          status: "error",
          lastSavedAt: null,
          errorMessage: err instanceof Error ? err.message : "Save failed",
        });
      }
    };

    const schedule = () => {
      if (stopped) return;
      const current = serializedData();
      if (rebaselineAfter) {
        lastSerialized = current;
        rebaselineAfter = false;
        return;
      }
      if (current !== lastSerialized) {
        report({ status: "dirty", lastSavedAt: null, errorMessage: null });
        void save("autosave");
      }
    };

    const interval = setInterval(schedule, 60_000);
    const beforeUnload = () => {
      const editorData = JSON.parse(serializedData()) as VlxPayload;
      navigator.sendBeacon?.(
        `/api/editor/projects/${projectId}/beacon`,
        new Blob([JSON.stringify({ editorData, reason: "before-unload" })], {
          type: "application/json",
        }),
      );
    };
    window.addEventListener("pagehide", beforeUnload);
    registerManualSave(() => save("manual"));
    void save("manual");

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("pagehide", beforeUnload);
      void save("before-unload");
    };
  });
}

export function VelxioNextEditor({
  projectId,
  version,
  readOnly: serverReadOnly = true,
}: {
  projectId: number;
  version?: number;
  readOnly?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [loadedLabels, setLoadedLabels] = useState<string[]>([]);
  const [currentLabel, setCurrentLabel] = useState("");
  const [EditorPage, setEditorPage] = useState<React.ComponentType<{ readOnly?: boolean }> | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const versionQuery = useMemo(
    () => (version ? `?version=${version}` : ""),
    [version],
  );

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [loadedLabels, currentLabel]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    async function load() {
      try {
        const modules = await loadVelxioModules(
          setProgress,
          (label, done) => {
            if (done) {
              setLoadedLabels((prev) => [...prev, label]);
              setCurrentLabel("");
            } else {
              setCurrentLabel(label);
            }
          },
        );
        const res = await fetch(
          `/api/editor/projects/${projectId}${versionQuery}`,
          {
            credentials: "include",
          },
        );
        if (!res.ok) throw new Error((await res.json()).error ?? "Load failed");
        const data = (await res.json()) as LoadResponse;
        if (cancelled) return;

        modules.useProjectStore.getState().setCurrentProject({
          id: String(data.project.id),
          slug: data.project.title,
          ownerUsername: "breadboard",
          isPublic: false,
          visibility: "private",
          editable: data.project.editable,
          readOnly: serverReadOnly || !data.project.editable || data.version !== null,
          platformStatus: data.project.status,
          platformVersion: data.version,
          platformProjectId: data.project.id,
        });
        const locked = serverReadOnly || !data.project.editable || data.version !== null;
        setReadOnly(locked);

        if (data.editorData) {
          modules.useSimulatorStore.getState().loadProjectState({
            boards: data.editorData.boards,
            fileGroups: data.editorData.fileGroups,
            components: data.editorData.components,
            wires: data.editorData.wires,
            activeBoardId: data.editorData.activeBoardId,
          });
        }

        installBreadboardAutosave(
          projectId,
          !locked,
          modules,
        );

        if (!locked) {
          startActivityTracking(projectId, () =>
            captureEditorState(
              modules.useEditorStore,
              modules.useSimulatorStore,
              modules.useProjectStore,
              modules.useCompileLogsStore,
              modules.useOscilloscopeStore,
              modules.useElectricalStore,
              modules.useVfsStore,
            ),
          );
        }

        if (!locked) {
          const unsub1 = (modules.useSimulatorStore as any).subscribe?.(
            (s: any, prev: any) => {
              if (
                !prev ||
                s.boards !== prev.boards ||
                s.components !== prev.components ||
                s.wires !== prev.wires
              ) {
                markRealActivity();
              }
            },
          );
          const unsub2 = (modules.useEditorStore as any).subscribe?.(
            (s: any, prev: any) => {
              if (!prev || s.fileGroups !== prev.fileGroups) {
                markRealActivity();
              }
            },
          );

          if (unsub1) unsubs.push(unsub1);
          if (unsub2) unsubs.push(unsub2);
        }

        setEditorPage(() => modules.EditorPage);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load editor");
        setState("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
      stopActivityTracking();
      for (const u of unsubs) u();
    };
  }, [projectId, serverReadOnly, versionQuery]);

  if (state === "loading" || !EditorPage) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[#1e1e1e]">
        <LoadingCard />
        <div className="w-80 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#888]">
            <span>Loading editor</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#333]">
            <div
              className="h-full rounded-full bg-[#BD0F32] transition-all duration-300"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>
        </div>
        <div ref={logRef} className="h-48 w-80 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#333]">
          <div className="space-y-0.5 text-xs">
            {loadedLabels.map((label) => (
              <div key={label} className="flex items-center gap-2 text-[#666]">
                <span className="text-green-500">✓</span>
                {label}
              </div>
            ))}
            {currentLabel && (
              <div className="flex items-center gap-2 text-[#888] animate-pulse">
                <span className="inline-block size-2 rounded-full bg-[#BD0F32]" />
                {currentLabel}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="grid h-screen place-items-center bg-[#1e1e1e] text-white">
        {error}
      </div>
    );
  }

  return <EditorPage readOnly={readOnly} />;
}
