"use server";

import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  canTrackEditorProject,
  canWriteEditorProject,
  getEditorProject,
} from "@/lib/editor/access";
import {
  getUnjournaledSeconds,
  JOURNAL_MIN_SECONDS,
} from "@/lib/editor/journal-time";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  editorScreenEvidenceFrames,
  editorTimelapseSnapshots,
  projectJournals,
} from "@/lib/db/schema";
import { putStorageObject } from "@/lib/storage/s3";

const INACTIVITY_TIMEOUT_SECONDS = 120;
const MIN_HEARTBEAT_GAP_SECONDS = 10;
const MAX_HEARTBEAT_CREDIT_SECONDS = 120;
// Screen sharing is deliberately more generous than normal editor activity:
// someone can be reading or inspecting a static external tool for two minutes.
const SCREEN_SHARE_INACTIVITY_TIMEOUT_SECONDS = 120;
const SCREEN_SHARE_MAX_HEARTBEAT_CREDIT_SECONDS = 120;
const JOURNAL_REMINDER_SECONDS = 50 * 60;
const JOURNAL_BLOCK_SECONDS = 60 * 60;

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}h ${minutes}m ${remainder}s`
    : `${minutes}m ${remainder}s`;
}

async function trackedSecondsFor(projectId: number, userId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
    })
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.projectId, projectId),
        eq(editorActivitySessions.userId, userId),
      ),
    );
  return row?.total ?? 0;
}

async function hasFreshScreenEvidence(sessionId: number, now: Date) {
  const [frame] = await db
    .select({ id: editorScreenEvidenceFrames.id })
    .from(editorScreenEvidenceFrames)
    .where(
      and(
        eq(editorScreenEvidenceFrames.sessionId, sessionId),
        gte(
          editorScreenEvidenceFrames.receivedAt,
          new Date(
            now.getTime() - SCREEN_SHARE_INACTIVITY_TIMEOUT_SECONDS * 1000,
          ),
        ),
        ne(editorScreenEvidenceFrames.imageKey, ""),
        eq(editorScreenEvidenceFrames.pixelChanged, true),
        eq(editorScreenEvidenceFrames.paused, false),
      ),
    )
    .orderBy(desc(editorScreenEvidenceFrames.receivedAt))
    .limit(1);
  return Boolean(frame);
}

async function screenImageChangedSinceLastFrame(
  sessionId: number,
  imageDigest: string,
) {
  const [previous] = await db
    .select({ imageKey: editorScreenEvidenceFrames.imageKey })
    .from(editorScreenEvidenceFrames)
    .where(
      and(
        eq(editorScreenEvidenceFrames.sessionId, sessionId),
        ne(editorScreenEvidenceFrames.imageKey, ""),
      ),
    )
    .orderBy(desc(editorScreenEvidenceFrames.receivedAt))
    .limit(1);
  if (!previous) return true;
  const previousDigest = /-([a-f0-9]{64})\.jpg$/.exec(previous.imageKey)?.[1];
  return previousDigest !== imageDigest;
}

function boundedInteger(value: number, maximum: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.round(value)));
}

export async function sendHeartbeat(
  projectId: number,
  options: { screenShare?: boolean; externalTracking?: boolean } = {},
) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session) return null;
  if (!canWriteEditorProject(project, session)) return null;
  const screenShare = options.screenShare === true;
  const screenEvidenceRequired =
    screenShare || options.externalTracking === true;
  const totalTrackedSeconds = await trackedSecondsFor(
    projectId,
    session.user.id,
  );
  if (!canTrackEditorProject(project, session)) {
    await db
      .update(editorActivitySessions)
      .set({ endedAt: new Date() })
      .where(
        and(
          eq(editorActivitySessions.projectId, projectId),
          eq(editorActivitySessions.userId, session.user.id),
          isNull(editorActivitySessions.endedAt),
        ),
      );
    return {
      blocked: true,
      reason: "No extra time here will be tracked.",
      needsJournal: false,
      activeSeconds: 0,
      unjournaledSeconds: 0,
      totalTrackedSeconds,
    };
  }

  const unjournaledSeconds = await getUnjournaledSeconds(
    projectId,
    session.user.id,
  );
  if (unjournaledSeconds >= JOURNAL_BLOCK_SECONDS) {
    return {
      blocked: true,
      reason: "Write a journal entry before tracking more time.",
      needsJournal: true,
      unjournaledSeconds,
      activeSeconds: unjournaledSeconds,
      totalTrackedSeconds,
    };
  }

  const now = new Date();
  const existing = await db
    .select()
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.projectId, projectId),
        eq(editorActivitySessions.userId, session.user.id),
      ),
    )
    .orderBy(sql`${editorActivitySessions.startedAt} DESC`)
    .limit(1);

  let activeSession: {
    id: number;
    activeSeconds: number;
    startedAt: Date;
  } | null = null;
  let activeSecondsAdded = 0;
  let trackingWarning: string | undefined;
  const canUseScreenShareGrace =
    screenEvidenceRequired &&
    Boolean(existing[0] && !existing[0].endedAt) &&
    (existing[0] ? await hasFreshScreenEvidence(existing[0].id, now) : false);
  const elapsedSinceLastHeartbeat =
    existing[0] && !existing[0].endedAt
      ? Math.floor(
          (now.getTime() - existing[0].lastActivityAt.getTime()) / 1000,
        )
      : 0;
  const allowedHeartbeatGapSeconds = canUseScreenShareGrace
    ? SCREEN_SHARE_INACTIVITY_TIMEOUT_SECONDS
    : INACTIVITY_TIMEOUT_SECONDS;
  const canRecoverScreenShareGap =
    screenEvidenceRequired &&
    canUseScreenShareGrace &&
    elapsedSinceLastHeartbeat > allowedHeartbeatGapSeconds;

  if (
    screenEvidenceRequired &&
    existing[0] &&
    !existing[0].endedAt &&
    !canUseScreenShareGrace
  ) {
    const [touched] = await db
      .update(editorActivitySessions)
      .set({ lastActivityAt: now })
      .where(
        and(
          eq(editorActivitySessions.id, existing[0].id),
          eq(editorActivitySessions.lastActivityAt, existing[0].lastActivityAt),
          isNull(editorActivitySessions.endedAt),
        ),
      )
      .returning({ activeSeconds: editorActivitySessions.activeSeconds });
    // The client needs this id to upload the evidence frame that clears the
    // block. Without it, a page reload (or browser crash) that comes back to
    // an open session with stale evidence can never recover: frames need a
    // session id, and only this response can supply it.
    return {
      blocked: true,
      sessionId: existing[0].id,
      reason:
        "Screen activity has not been verified recently. No new time is being saved until a changed screen frame reaches Breadboard.",
      needsJournal: false,
      activeSeconds: touched?.activeSeconds ?? existing[0].activeSeconds,
      unjournaledSeconds,
      totalTrackedSeconds,
    };
  }

  if (
    existing[0] &&
    !existing[0].endedAt &&
    (elapsedSinceLastHeartbeat <= allowedHeartbeatGapSeconds ||
      canRecoverScreenShareGap)
  ) {
    const elapsedSeconds = elapsedSinceLastHeartbeat;
    if (elapsedSeconds < MIN_HEARTBEAT_GAP_SECONDS) {
      return {
        sessionId: existing[0].id,
        activeSeconds: existing[0].activeSeconds,
        needsJournal: unjournaledSeconds >= JOURNAL_REMINDER_SECONDS,
        unjournaledSeconds,
        startedAt: existing[0].startedAt,
        totalTrackedSeconds,
      };
    }
    activeSecondsAdded = Math.min(
      elapsedSeconds,
      canUseScreenShareGrace
        ? SCREEN_SHARE_MAX_HEARTBEAT_CREDIT_SECONDS
        : MAX_HEARTBEAT_CREDIT_SECONDS,
    );
    if (screenEvidenceRequired && elapsedSeconds > activeSecondsAdded) {
      trackingWarning = `A ${formatDuration(elapsedSeconds)} screen-share gap was detected. ${formatDuration(elapsedSeconds - activeSecondsAdded)} could not be confirmed.`;
    }
    const [updated] = await db
      .update(editorActivitySessions)
      .set({
        lastActivityAt: now,
        activeSeconds: sql`${editorActivitySessions.activeSeconds} + ${activeSecondsAdded}`,
      })
      .where(
        and(
          eq(editorActivitySessions.id, existing[0].id),
          eq(editorActivitySessions.lastActivityAt, existing[0].lastActivityAt),
          isNull(editorActivitySessions.endedAt),
        ),
      )
      .returning({
        id: editorActivitySessions.id,
        activeSeconds: editorActivitySessions.activeSeconds,
        startedAt: editorActivitySessions.startedAt,
      });
    if (!updated) {
      const currentTrackedSeconds = await trackedSecondsFor(
        projectId,
        session.user.id,
      );
      return {
        sessionId: existing[0].id,
        activeSeconds: existing[0].activeSeconds,
        needsJournal: unjournaledSeconds >= JOURNAL_REMINDER_SECONDS,
        unjournaledSeconds,
        startedAt: existing[0].startedAt,
        totalTrackedSeconds: currentTrackedSeconds,
        trackingWarning,
      };
    }
    activeSession = updated;
  } else {
    if (screenEvidenceRequired && elapsedSinceLastHeartbeat > 0) {
      trackingWarning = `A ${formatDuration(elapsedSinceLastHeartbeat)} screen-share gap could not be confirmed, so that time was not added.`;
    }
    if (existing[0] && !existing[0].endedAt) {
      await db
        .update(editorActivitySessions)
        .set({ endedAt: now })
        .where(eq(editorActivitySessions.id, existing[0].id));
    }

    const [inserted] = await db
      .insert(editorActivitySessions)
      .values({
        projectId,
        userId: session.user.id,
        startedAt: now,
        activeSeconds: 0,
        lastActivityAt: now,
      })
      .returning();
    activeSession = inserted;
    activeSecondsAdded = 0;
  }

  const nextUnjournaledSeconds = unjournaledSeconds + activeSecondsAdded;
  const persistedTrackedSeconds = totalTrackedSeconds + activeSecondsAdded;

  return {
    sessionId: activeSession.id,
    activeSeconds: activeSession.activeSeconds,
    needsJournal: nextUnjournaledSeconds >= JOURNAL_REMINDER_SECONDS,
    unjournaledSeconds: nextUnjournaledSeconds,
    startedAt: activeSession.startedAt,
    totalTrackedSeconds: persistedTrackedSeconds,
    trackingWarning,
  };
}

export async function addProjectJournal(projectId: number, content: string) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session || project.userId !== session.user.id) return null;
  const text = content.trim();
  if (text.length < 10) throw new Error("Journal entry is too short.");
  if (text.length > 4000) throw new Error("Journal entry is too long.");
  const activeSecondsCovered = await getUnjournaledSeconds(
    projectId,
    session.user.id,
  );
  if (activeSecondsCovered < JOURNAL_MIN_SECONDS) {
    throw new Error(
      "You need at least 10 minutes of tracked work before journaling.",
    );
  }
  const [inserted] = await db
    .insert(projectJournals)
    .values({
      projectId,
      userId: session.user.id,
      content: text,
      activeSecondsCovered,
    })
    .returning({ id: projectJournals.id });
  return { ok: true, journalId: inserted.id };
}

export async function listProjectJournals(projectId: number) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session || project.userId !== session.user.id) return null;
  const [entries, unjournaledSeconds] = await Promise.all([
    db
      .select({
        id: projectJournals.id,
        content: projectJournals.content,
        createdAt: projectJournals.createdAt,
        updatedAt: projectJournals.updatedAt,
      })
      .from(projectJournals)
      .where(
        and(
          eq(projectJournals.projectId, projectId),
          eq(projectJournals.userId, session.user.id),
        ),
      )
      .orderBy(desc(projectJournals.createdAt)),
    getUnjournaledSeconds(projectId, session.user.id),
  ]);
  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      content: entry.content,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : null,
    })),
    unjournaledSeconds,
    // Mirrors the off-platform draft-only rule: once the project is submitted
    // a reviewer may be reading these entries, so they freeze.
    editable: project.status === "draft",
  };
}

export async function updateProjectJournal(
  projectId: number,
  journalId: number,
  content: string,
) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session || project.userId !== session.user.id) return null;
  if (project.status !== "draft") {
    throw new Error(
      "This project has been submitted, so its journal can no longer be changed.",
    );
  }
  const text = content.trim();
  if (text.length < 10) throw new Error("Journal entry is too short.");
  if (text.length > 4000) throw new Error("Journal entry is too long.");
  if (!Number.isInteger(journalId)) throw new Error("Invalid entry.");
  const [updated] = await db
    .update(projectJournals)
    .set({ content: text, updatedAt: new Date() })
    .where(
      and(
        eq(projectJournals.id, journalId),
        eq(projectJournals.projectId, projectId),
        eq(projectJournals.userId, session.user.id),
      ),
    )
    .returning({ id: projectJournals.id });
  if (!updated) throw new Error("Entry not found.");
  return { ok: true };
}

export async function storeSnapshot(
  projectId: number,
  sessionId: number,
  stateData: string,
) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session) return { stored: false };
  if (!canTrackEditorProject(project, session)) {
    return { stored: false, reason: "tracking_closed" };
  }

  if (!stateData || typeof stateData !== "string") return { stored: false };
  if (!Number.isInteger(sessionId) || sessionId < 1) return { stored: false };
  if (stateData.length > 256_000) return { stored: false };

  try {
    const parsed = JSON.parse(stateData);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.editor ||
      !parsed.simulator
    ) {
      return { stored: false, reason: "invalid_shape" };
    }
  } catch {
    return { stored: false, reason: "invalid_json" };
  }

  const [activitySession] = await db
    .select({ id: editorActivitySessions.id })
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.id, sessionId),
        eq(editorActivitySessions.projectId, projectId),
        eq(editorActivitySessions.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!activitySession) return { stored: false, reason: "invalid_session" };

  const last = await db
    .select({ stateData: editorTimelapseSnapshots.stateData })
    .from(editorTimelapseSnapshots)
    .where(eq(editorTimelapseSnapshots.sessionId, sessionId))
    .orderBy(desc(editorTimelapseSnapshots.createdAt))
    .limit(1);

  if (last[0] && last[0].stateData === stateData) {
    return { stored: false, reason: "duplicate" };
  }

  await db.insert(editorTimelapseSnapshots).values({
    sessionId,
    stateData,
  });

  return { stored: true };
}

export async function storeScreenEvidenceFrame(
  projectId: number,
  sessionId: number,
  input: {
    capturedAt: string;
    imageData: string;
    pixelChanged: boolean;
    diffScore: number;
    screenWidth: number;
    screenHeight: number;
    paused: boolean;
  },
) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session) return { stored: false };
  if (!canTrackEditorProject(project, session)) {
    return { stored: false, reason: "tracking_closed" };
  }
  if (!Number.isInteger(sessionId) || sessionId < 1) return { stored: false };

  const capturedAt = new Date(input.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    return { stored: false, reason: "invalid_captured_at" };
  }
  if (typeof input.imageData !== "string") {
    return { stored: false, reason: "invalid_image" };
  }
  const [activitySession] = await db
    .select({ id: editorActivitySessions.id })
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.id, sessionId),
        eq(editorActivitySessions.projectId, projectId),
        eq(editorActivitySessions.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!activitySession) return { stored: false, reason: "invalid_session" };

  const [duplicate] = await db
    .select({ id: editorScreenEvidenceFrames.id })
    .from(editorScreenEvidenceFrames)
    .where(
      and(
        eq(editorScreenEvidenceFrames.sessionId, sessionId),
        eq(editorScreenEvidenceFrames.capturedAt, capturedAt),
      ),
    )
    .limit(1);
  if (duplicate) return { stored: true, duplicate: true };

  let imageKey = "";
  let serverDetectedPixelChange = false;
  if (input.imageData) {
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(
      input.imageData,
    );
    if (!match) return { stored: false, reason: "invalid_image" };
    const imageBody = Buffer.from(match[1], "base64");
    if (
      imageBody.length < 100 ||
      imageBody.length > 700_000 ||
      imageBody[0] !== 0xff ||
      imageBody[1] !== 0xd8 ||
      imageBody.at(-2) !== 0xff ||
      imageBody.at(-1) !== 0xd9
    ) {
      return { stored: false, reason: "invalid_image_size" };
    }
    const imageDigest = createHash("sha256").update(imageBody).digest("hex");
    serverDetectedPixelChange = await screenImageChangedSinceLastFrame(
      sessionId,
      imageDigest,
    );
    imageKey = `editor-screen-evidence/project-${projectId}/session-${sessionId}/${Date.now()}-${randomUUID()}-${imageDigest}.jpg`;
    await putStorageObject({
      key: imageKey,
      contentType: "image/jpeg",
      body: imageBody,
    });
  }

  await db.insert(editorScreenEvidenceFrames).values({
    sessionId,
    projectId,
    userId: session.user.id,
    capturedAt,
    imageKey,
    pixelChanged: serverDetectedPixelChange,
    diffScore: boundedInteger(input.diffScore, 1_000_000),
    screenWidth: boundedInteger(input.screenWidth, 16_000),
    screenHeight: boundedInteger(input.screenHeight, 16_000),
    paused: Boolean(input.paused),
  });

  return { stored: true };
}
