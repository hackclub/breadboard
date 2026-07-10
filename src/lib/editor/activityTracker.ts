"use client";

const HB_INTERVAL = 20_000;
const SNAP_INTERVAL = 20_000;
// Keep tracking through a short static reading/thinking period. The extra
// heartbeat interval avoids cutting the grace period short due to timer phase.
const MIN_ACTIVITY_MS = 2 * 60_000 + HB_INTERVAL;
const HEARTBEAT_STALE_MS = 70_000;
const HEALTH_CHECK_INTERVAL_MS = 5_000;
const HEARTBEAT_REQUEST_TIMEOUT_MS = 15_000;
const SNAPSHOT_REQUEST_TIMEOUT_MS = 15_000;

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}h ${minutes}m ${remainder}s`
    : `${minutes}m ${remainder}s`;
}

let active = false;
let paused = false;
let sessionId = 0;
let activeSeconds = 0;
let unjournaledSeconds = 0;
let totalTrackedSeconds = 0;
let heartbeatWarning = "";
let snapshotWarning = "";
let lastValidatedAt = 0;
let lastSnapshotValidatedAt = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;
let pageHideHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let projectId = 0;
let trackingGeneration = 0;
let heartbeatInFlightGeneration: number | null = null;
let snapshotInFlightGeneration: number | null = null;
let heartbeatStaleReported = false;
let trackingStartedAt = 0;
let hasConfirmedHeartbeat = false;
let screenShareTracking = false;
let snapshotsEnabled = false;
let externalTracking = false;
// When true, heartbeats keep firing regardless of recent input, so tracking
// never auto-pauses on inactivity. Used by off-platform tracking, where the
// builder is often working away from the computer.
let ignoreInactivity = false;
type ActivityStatus = {
  projectId?: number;
  status: "active" | "idle" | "blocked" | "error";
  activeSeconds: number;
  totalTrackedSeconds?: number;
  warning?: string;
  unjournaledSeconds?: number;
  validatedAt?: number;
  needsJournal?: boolean;
  reason?: string;
};

const statusListeners = new Set<(s: ActivityStatus) => void>();

function currentWarning() {
  return [heartbeatWarning, snapshotWarning].filter(Boolean).join(" ");
}

export function setActivityStatusListener(fn: (s: ActivityStatus) => void) {
  statusListeners.add(fn);
  fn({
    projectId: projectId || undefined,
    status: active ? "active" : "idle",
    activeSeconds,
    totalTrackedSeconds,
    warning: currentWarning() || undefined,
    unjournaledSeconds,
    validatedAt: lastValidatedAt || undefined,
  });
  return () => {
    statusListeners.delete(fn);
  };
}

function emit(statusProjectId = projectId) {
  const status = {
    projectId: statusProjectId || undefined,
    status: active ? "active" : "idle",
    activeSeconds,
    totalTrackedSeconds,
    warning: currentWarning() || undefined,
    unjournaledSeconds,
    validatedAt: lastValidatedAt || undefined,
  } satisfies ActivityStatus;
  statusListeners.forEach((listener) => {
    listener(status);
  });
}

function emitBlocked(
  reason: string,
  needsJournal: boolean,
  seconds: number,
  totalSeconds = totalTrackedSeconds,
  unjournaled = seconds,
) {
  active = false;
  activeSeconds = seconds;
  unjournaledSeconds = unjournaled;
  totalTrackedSeconds = totalSeconds;
  const status = {
    projectId: projectId || undefined,
    status: "blocked",
    activeSeconds,
    totalTrackedSeconds,
    warning: currentWarning() || undefined,
    unjournaledSeconds,
    validatedAt: lastValidatedAt || undefined,
    needsJournal,
    reason,
  } satisfies ActivityStatus;
  statusListeners.forEach((listener) => {
    listener(status);
  });
}

function emitError(reason: string) {
  active = false;
  const status = {
    projectId: projectId || undefined,
    status: "error",
    activeSeconds,
    totalTrackedSeconds,
    warning: currentWarning() || undefined,
    unjournaledSeconds,
    validatedAt: lastValidatedAt || undefined,
    needsJournal: false,
    reason,
  } satisfies ActivityStatus;
  statusListeners.forEach((listener) => {
    listener(status);
  });
}

let lastActivity = Date.now();

export function markRealActivity() {
  if (paused) return;
  lastActivity = Date.now();
}

export function setActivityTrackingPaused(value: boolean) {
  paused = value;
  if (paused) {
    active = false;
    emit();
    return;
  }
  markRealActivity();
  emit();
}

// Screen sharing is only a request for the server's longer background-tab
// tolerance. The server independently requires fresh stored evidence before it
// grants that tolerance, so this flag cannot create time on its own.
export function setScreenShareTracking(value: boolean) {
  screenShareTracking = value;
  if (value) markRealActivity();
}

export async function recordExternalActivity() {
  if (!projectId || paused) return null;
  markRealActivity();
  return runHeartbeat();
}

export function getCurrentActivitySessionId() {
  return sessionId;
}

function checkRecentActivity(): boolean {
  return Date.now() - lastActivity < MIN_ACTIVITY_MS;
}

function canCaptureEditorSnapshot() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export async function startActivityTracking(
  pid: number,
  captureState: () => unknown,
  options?: {
    ignoreInactivity?: boolean;
    screenShare?: boolean;
    captureSnapshots?: boolean;
    externalTracking?: boolean;
  },
) {
  if (heartbeatTimer) {
    if (projectId === pid) return;
    stopActivityTracking();
  }
  projectId = pid;
  ignoreInactivity = options?.ignoreInactivity ?? false;
  screenShareTracking = options?.screenShare === true;
  snapshotsEnabled = options?.captureSnapshots ?? true;
  externalTracking = options?.externalTracking === true;
  lastActivity = Date.now();
  trackingStartedAt = lastActivity;
  hasConfirmedHeartbeat = false;
  heartbeatWarning = "";
  snapshotWarning = "";
  lastSnapshotValidatedAt = 0;
  const generation = ++trackingGeneration;
  const trackedProjectId = pid;

  const heartbeat = async () => {
    if (generation !== trackingGeneration) return;
    if (!paused && (ignoreInactivity || checkRecentActivity())) {
      await runHeartbeat(generation);
    } else {
      active = false;
      emit();
    }
  };

  // Install the intervals before the first request resolves. This prevents a
  // route remount from starting a second tracker while the first heartbeat is
  // still in flight.
  heartbeatTimer = setInterval(() => void heartbeat(), HB_INTERVAL);

  if (snapshotsEnabled) {
    snapshotTimer = setInterval(() => {
      if (
        generation === trackingGeneration &&
        active &&
        sessionId > 0 &&
        canCaptureEditorSnapshot()
      ) {
        try {
          const captured = captureState();
          const state =
            typeof captured === "string" ? captured : JSON.stringify(captured);
          void storeSnapshot(trackedProjectId, sessionId, state, generation);
        } catch {
          snapshotWarning =
            "Timelapse capture could not be prepared. Time is still server-confirmed, but this work may be missing visual evidence.";
          emit();
        }
      }
    }, SNAP_INTERVAL);
  }
  healthTimer = setInterval(() => {
    const shouldBeTracking =
      !paused && (ignoreInactivity || checkRecentActivity());
    if (generation !== trackingGeneration || !shouldBeTracking) {
      return;
    }
    const now = Date.now();
    const lastHeartbeatConfirmation = lastValidatedAt || trackingStartedAt;
    if (
      !heartbeatStaleReported &&
      now - lastHeartbeatConfirmation > HEARTBEAT_STALE_MS
    ) {
      heartbeatStaleReported = true;
      emitError(
        "Time tracking has not saved for over a minute. Check your connection and retry before continuing.",
      );
    }
    if (
      snapshotsEnabled &&
      active &&
      canCaptureEditorSnapshot() &&
      !snapshotWarning &&
      now - (lastSnapshotValidatedAt || trackingStartedAt) > HEARTBEAT_STALE_MS
    ) {
      snapshotWarning =
        "Timelapse capture has not saved for over a minute. Time is still server-confirmed, but visual evidence needs attention.";
      emit();
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  document.addEventListener("mousemove", markRealActivity, { passive: true });
  document.addEventListener("keydown", markRealActivity, { passive: true });
  document.addEventListener("click", markRealActivity, { passive: true });
  document.addEventListener("scroll", markRealActivity, { passive: true });
  document.addEventListener("wheel", markRealActivity, { passive: true });
  onlineHandler = () => {
    if (!paused && (ignoreInactivity || checkRecentActivity())) {
      void runHeartbeat(generation);
    }
  };
  pageHideHandler = () => sendFinalHeartbeat();
  visibilityHandler = () => {
    if (document.visibilityState === "hidden") {
      void runHeartbeat(generation);
    }
  };
  window.addEventListener("online", onlineHandler);
  window.addEventListener("pagehide", pageHideHandler);
  document.addEventListener("visibilitychange", visibilityHandler);

  if (!navigator.onLine) {
    emitError(
      "You are offline. Time cannot save until the connection returns.",
    );
  }
  await heartbeat();
}

async function sendHeartbeat(projectId: number) {
  const requestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      screenShare: screenShareTracking,
      externalTracking,
    }),
  };
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    HEARTBEAT_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(
      `/api/editor/projects/${projectId}/activity/heartbeat`,
      { ...requestInit, signal: controller.signal },
    );
    if (!response.ok) return null;
    return (await response.json()) as
      | {
          sessionId: number;
          activeSeconds: number;
          unjournaledSeconds: number;
          needsJournal: boolean;
          startedAt: string;
          totalTrackedSeconds: number;
          trackingWarning?: string;
        }
      | {
          blocked: true;
          reason: string;
          needsJournal: boolean;
          activeSeconds: number;
          unjournaledSeconds: number;
          totalTrackedSeconds: number;
          trackingWarning?: string;
        };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function sendFinalHeartbeat() {
  if (!projectId || paused || (!ignoreInactivity && !checkRecentActivity())) {
    return;
  }
  // A page can disappear between the 20-second intervals. keepalive lets the
  // browser finish this small same-origin request during navigation/close; the
  // server still applies its normal timestamp and evidence checks.
  void fetch(`/api/editor/projects/${projectId}/activity/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      screenShare: screenShareTracking,
      externalTracking,
    }),
    keepalive: true,
  }).catch(() => {});
}

// All activity sources (editor input, screen-change capture, and the periodic
// timer) share one request at a time. The optimistic server update relies on a
// single latest timestamp, so concurrent heartbeats can otherwise return stale
// totals or start competing sessions during page transitions.
async function runHeartbeat(generation = trackingGeneration) {
  if (
    !projectId ||
    heartbeatInFlightGeneration !== null ||
    generation !== trackingGeneration
  ) {
    return null;
  }
  heartbeatInFlightGeneration = generation;
  const trackedProjectId = projectId;
  try {
    const result = await sendHeartbeat(trackedProjectId);
    if (generation !== trackingGeneration || trackedProjectId !== projectId) {
      return null;
    }
    if (!result) {
      emitError("Time tracking heartbeat failed.");
      return null;
    }
    if (!("sessionId" in result)) {
      lastValidatedAt = Date.now();
      heartbeatStaleReported = false;
      emitBlocked(
        result.reason,
        result.needsJournal,
        result.activeSeconds,
        result.totalTrackedSeconds,
        result.unjournaledSeconds,
      );
      return result;
    }
    sessionId = result.sessionId;
    activeSeconds = result.activeSeconds;
    unjournaledSeconds = result.unjournaledSeconds;
    totalTrackedSeconds = result.totalTrackedSeconds;
    const confirmedAt = Date.now();
    const delayedFirstConfirmation =
      !hasConfirmedHeartbeat &&
      trackingStartedAt > 0 &&
      confirmedAt - trackingStartedAt > HEARTBEAT_STALE_MS;
    heartbeatWarning =
      result.trackingWarning ??
      (delayedFirstConfirmation
        ? `Tracking was not confirmed for ${formatDuration((confirmedAt - trackingStartedAt) / 1000)} after it started. Time before this confirmation could not be saved.`
        : "");
    hasConfirmedHeartbeat = true;
    lastValidatedAt = confirmedAt;
    heartbeatStaleReported = false;
    active = true;
    emit();
    return result;
  } finally {
    if (heartbeatInFlightGeneration === generation) {
      heartbeatInFlightGeneration = null;
    }
  }
}

async function storeSnapshot(
  projectId: number,
  sessionId: number,
  stateData: string,
  generation: number,
) {
  if (
    snapshotInFlightGeneration !== null ||
    generation !== trackingGeneration ||
    !stateData
  ) {
    return;
  }
  snapshotInFlightGeneration = generation;
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    SNAPSHOT_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(
      `/api/editor/projects/${projectId}/activity/snapshot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, stateData }),
        signal: controller.signal,
      },
    );
    const result = (await response.json().catch(() => null)) as {
      stored?: boolean;
      reason?: string;
    } | null;
    if (!response.ok || (!result?.stored && result?.reason !== "duplicate")) {
      throw new Error("snapshot_not_saved");
    }
    if (generation !== trackingGeneration) return;
    lastSnapshotValidatedAt = Date.now();
    if (snapshotWarning) {
      snapshotWarning = "";
      emit();
    }
  } catch {
    if (generation !== trackingGeneration) return;
    snapshotWarning =
      "Timelapse capture is not saving. Time is still server-confirmed, but reviewers may be missing visual evidence.";
    emit();
  } finally {
    window.clearTimeout(timeout);
    if (snapshotInFlightGeneration === generation) {
      snapshotInFlightGeneration = null;
    }
  }
}

export function stopActivityTracking() {
  const stoppedProjectId = projectId;
  trackingGeneration += 1;
  heartbeatInFlightGeneration = null;
  snapshotInFlightGeneration = null;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  document.removeEventListener("mousemove", markRealActivity);
  document.removeEventListener("keydown", markRealActivity);
  document.removeEventListener("click", markRealActivity);
  document.removeEventListener("scroll", markRealActivity);
  document.removeEventListener("wheel", markRealActivity);
  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
  }
  if (pageHideHandler) {
    window.removeEventListener("pagehide", pageHideHandler);
    pageHideHandler = null;
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  active = false;
  paused = false;
  ignoreInactivity = false;
  screenShareTracking = false;
  snapshotsEnabled = false;
  externalTracking = false;
  projectId = 0;
  sessionId = 0;
  activeSeconds = 0;
  unjournaledSeconds = 0;
  totalTrackedSeconds = 0;
  heartbeatWarning = "";
  snapshotWarning = "";
  heartbeatStaleReported = false;
  trackingStartedAt = 0;
  hasConfirmedHeartbeat = false;
  lastValidatedAt = 0;
  lastSnapshotValidatedAt = 0;
  lastActivity = 0;
  emit(stoppedProjectId);
}

export async function refreshActivityTracking() {
  if (!projectId) return;
  markRealActivity();
  return runHeartbeat();
}
