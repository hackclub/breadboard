export type EditorSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface EditorSaveState {
  status: EditorSaveStatus;
  lastSavedAt: number | null;
  errorMessage: string | null;
}

type Listener = (state: EditorSaveState) => void;

let listeners: Array<Listener> = [];
let current: EditorSaveState = {
  status: "idle",
  lastSavedAt: null,
  errorMessage: null,
};

let manualSaveFn: (() => Promise<void>) | null = null;

export function subscribeEditorSaveState(fn: Listener): () => void {
  listeners = listeners.concat(fn);
  fn(current);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function emitEditorSaveState(state: EditorSaveState): void {
  current = state;
  for (const fn of listeners) {
    fn(state);
  }
}

export function registerManualSave(fn: () => Promise<void>): void {
  manualSaveFn = fn;
}

export async function triggerManualSave(): Promise<void> {
  if (manualSaveFn) {
    emitEditorSaveState({
      status: "saving",
      lastSavedAt: null,
      errorMessage: null,
    });
    await manualSaveFn();
  }
}
