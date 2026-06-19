"use client";

const HB_INTERVAL = 20_000;
const SNAP_INTERVAL = 5_000;
const MIN_ACTIVITY_MS = 60_000;

let active = false;
let sessionId = 0;
let activeSeconds = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let projectId = 0;
let onStatusChange:
  | ((s: { status: "active" | "idle"; activeSeconds: number }) => void)
  | null = null;

export function setActivityStatusListener(
  fn: (s: { status: "active" | "idle"; activeSeconds: number }) => void,
) {
  onStatusChange = fn;
}

function emit() {
  onStatusChange?.({ status: active ? "active" : "idle", activeSeconds });
}

let lastActivity = Date.now();

export function markRealActivity() {
  lastActivity = Date.now();
}

function checkRecentActivity(): boolean {
  return Date.now() - lastActivity < MIN_ACTIVITY_MS;
}

export async function startActivityTracking(
  pid: number,
  captureState: () => unknown,
) {
  if (heartbeatTimer) return;
  projectId = pid;
  lastActivity = Date.now();

  const result = await sendHeartbeat(projectId);
  if (result) {
    sessionId = result.sessionId;
    activeSeconds = result.activeSeconds;
  }
  active = true;
  emit();

  heartbeatTimer = setInterval(async () => {
    if (checkRecentActivity()) {
      const result = await sendHeartbeat(projectId);
      if (result) {
        sessionId = result.sessionId;
        activeSeconds = result.activeSeconds;
      }
      active = true;
    } else {
      active = false;
    }
    emit();
  }, HB_INTERVAL);

  snapshotTimer = setInterval(() => {
    if (active && sessionId > 0) {
      const state = captureState();
      void storeSnapshot(projectId, sessionId, JSON.stringify(state));
    }
  }, SNAP_INTERVAL);

  document.addEventListener("mousemove", markRealActivity, { passive: true });
  document.addEventListener("keydown", markRealActivity, { passive: true });
  document.addEventListener("click", markRealActivity, { passive: true });
  document.addEventListener("scroll", markRealActivity, { passive: true });
  document.addEventListener("wheel", markRealActivity, { passive: true });
}

async function sendHeartbeat(projectId: number) {
  const response = await fetch(
    `/api/editor/projects/${projectId}/activity/heartbeat`,
    { method: "POST" },
  );
  if (!response.ok) return null;
  return (await response.json()) as {
    sessionId: number;
    activeSeconds: number;
    startedAt: string;
  };
}

async function storeSnapshot(
  projectId: number,
  sessionId: number,
  stateData: string,
) {
  await fetch(`/api/editor/projects/${projectId}/activity/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, stateData }),
  });
}

export function stopActivityTracking() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  document.removeEventListener("mousemove", markRealActivity);
  document.removeEventListener("keydown", markRealActivity);
  document.removeEventListener("click", markRealActivity);
  document.removeEventListener("scroll", markRealActivity);
  document.removeEventListener("wheel", markRealActivity);
  active = false;
  lastActivity = 0;
  emit();
}
