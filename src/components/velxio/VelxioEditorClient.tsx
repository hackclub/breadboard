"use client";

import { loader } from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import type { VlxPayload } from "@/lib/velxio/utils/vlxFile";
import {
  emitEditorSaveState,
  registerManualSave,
} from "@/lib/editor/saveState";

loader.config({ paths: { vs: "/monaco/vs" } });

type EditorProjectMeta = {
  id: number;
  title: string;
  description: string;
  status: string;
  editable: boolean;
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
  buildVlxPayload: (opts?: { name?: string }) => VlxPayload;
};

async function loadVelxioModules(): Promise<VelxioModules> {
  await import("@/lib/velxio/i18n");
  await Promise.all([
    import("@/components/velxio/components/velxio-components/IC74HC595"),
    import(
      "@/components/velxio/components/velxio-components/LogicGateElements"
    ),
    import(
      "@/components/velxio/components/velxio-components/TransistorElements"
    ),
    import("@/components/velxio/components/velxio-components/OpAmpElements"),
    import("@/components/velxio/components/velxio-components/PowerElements"),
    import("@/components/velxio/components/velxio-components/DiodeElements"),
    import("@/components/velxio/components/velxio-components/RelayElements"),
    import("@/components/velxio/components/velxio-components/LogicICElements"),
    import(
      "@/components/velxio/components/velxio-components/MotorDriverElements"
    ),
    import("@/components/velxio/components/velxio-components/FlipFlopElements"),
    import(
      "@/components/velxio/components/velxio-components/RaspberryPi3Element"
    ),
    import("@/components/velxio/components/velxio-components/Bmp280Element"),
    import("@/components/velxio/components/velxio-components/EPaperElement"),
    import(
      "@/components/velxio/components/velxio-components/BreadboardElements"
    ),
  ]);

  const [page, autosave, projectStore, simulatorStore, vlx] = await Promise.all(
    [
      import("@/components/velxio/pages/EditorPage"),
      import("@/services/velxio/hooks/useAutoSaveProject"),
      import("@/services/velxio/store/useProjectStore"),
      import("@/services/velxio/store/useSimulatorStore"),
      import("@/lib/velxio/utils/vlxFile"),
    ],
  );

  return {
    EditorPage: page.EditorPage,
    installAutoSaveImpl: autosave.installAutoSaveImpl,
    useProjectStore: projectStore.useProjectStore,
    useSimulatorStore: simulatorStore.useSimulatorStore,
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
    let timer: ReturnType<typeof setTimeout> | null = null;
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

    const serialize = () =>
      JSON.stringify(modules.buildVlxPayload({ name: `project-${projectId}` }));

    const serializedData = () => {
      const raw = modules.buildVlxPayload({ name: `project-${projectId}` });
      const { exportedAt, name, ...data } = raw;
      void name;
      return JSON.stringify(data);
    };

    const save = async (reason: string) => {
      const serialized = serialize();
      if (serialized === lastSerialized && reason !== "before-unload")
        return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      report({ status: "saving", lastSavedAt: null, errorMessage: null });
      try {
        const editorData = modules.buildVlxPayload({ name: `project-${projectId}` });
        const res = await fetch(`/api/editor/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ editorData, reason }),
        });
        if (!res.ok)
          throw new Error((await res.json()).error ?? "Save failed");
        rebaselineAfter = true;
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
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void save("autosave"), 2500);
      }
    };

    const interval = setInterval(schedule, 1500);
    const beforeUnload = () => {
      const editorData = modules.buildVlxPayload({ name: `project-${projectId}` });
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
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("pagehide", beforeUnload);
      void save("before-unload");
    };
  });
}

export function VelxioNextEditor({
  projectId,
  version,
}: {
  projectId: number;
  version?: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [EditorPage, setEditorPage] = useState<React.ComponentType | null>(
    null,
  );
  const versionQuery = useMemo(
    () => (version ? `?version=${version}` : ""),
    [version],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const modules = await loadVelxioModules();
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
        });

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
          data.project.editable && !data.version,
          modules,
        );
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
    };
  }, [projectId, versionQuery]);

  if (state === "loading" || !EditorPage) {
    return (
      <div className="grid h-screen place-items-center bg-[#1e1e1e] text-white">
        Loading editor...
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

  return <EditorPage />;
}
