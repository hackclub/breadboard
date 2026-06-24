"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { canWriteEditorProject, getEditorProject } from "@/lib/editor/access";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  editorTimelapseSnapshots,
  projectJournals,
} from "@/lib/db/schema";

const INACTIVITY_TIMEOUT_SECONDS = 60;
const HEARTBEAT_INTERVAL_SECONDS = 20;
const MIN_HEARTBEAT_GAP_SECONDS = 10;
const JOURNAL_MIN_SECONDS = 10 * 60;
const JOURNAL_REMINDER_SECONDS = 60 * 60;
const JOURNAL_BLOCK_SECONDS = 90 * 60;

async function getUnjournaledSeconds(projectId: number, userId: string) {
  const latestJournal = await db
    .select({ createdAt: projectJournals.createdAt })
    .from(projectJournals)
    .where(
      and(
        eq(projectJournals.projectId, projectId),
        eq(projectJournals.userId, userId),
      ),
    )
    .orderBy(desc(projectJournals.createdAt))
    .limit(1);
  const since = latestJournal[0]?.createdAt ?? new Date(0);
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int` })
    .from(editorActivitySessions)
    .where(
      and(
        eq(editorActivitySessions.projectId, projectId),
        eq(editorActivitySessions.userId, userId),
        sql`${editorActivitySessions.startedAt} > ${since}`,
      ),
    );
  return rows[0]?.total ?? 0;
}

export async function sendHeartbeat(projectId: number) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session) return null;
  if (!canWriteEditorProject(project, session)) return null;
  const trackingBlocked =
    [
      "materials_review",
      "shipped",
      "reviewed",
      "approved",
      "paid_out",
      "fulfilled",
      "kit_approved",
      "kit_fulfillment",
      "kit_sent",
      "building",
      "demo_review",
      "done",
    ].includes(project.status);
  if (trackingBlocked) {
    return {
      blocked: true,
      reason: "No extra time here will be tracked.",
      needsJournal: false,
      activeSeconds: 0,
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

  if (
    existing[0] &&
    !existing[0].endedAt &&
    now.getTime() - existing[0].lastActivityAt.getTime() <
      INACTIVITY_TIMEOUT_SECONDS * 1000
  ) {
    const elapsedSeconds = Math.floor(
      (now.getTime() - existing[0].lastActivityAt.getTime()) / 1000,
    );
    activeSecondsAdded =
      elapsedSeconds >= MIN_HEARTBEAT_GAP_SECONDS
        ? Math.min(elapsedSeconds, HEARTBEAT_INTERVAL_SECONDS)
        : 0;
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
      return {
        sessionId: existing[0].id,
        activeSeconds: existing[0].activeSeconds,
        needsJournal: unjournaledSeconds >= JOURNAL_REMINDER_SECONDS,
        unjournaledSeconds,
        startedAt: existing[0].startedAt,
      };
    }
    activeSession = updated;
  } else {
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
        activeSeconds: HEARTBEAT_INTERVAL_SECONDS,
        lastActivityAt: now,
      })
      .returning();
    activeSession = inserted;
    activeSecondsAdded = HEARTBEAT_INTERVAL_SECONDS;
  }

  const nextUnjournaledSeconds = unjournaledSeconds + activeSecondsAdded;

  return {
    sessionId: activeSession.id,
    activeSeconds: activeSession.activeSeconds,
    needsJournal: nextUnjournaledSeconds >= JOURNAL_REMINDER_SECONDS,
    unjournaledSeconds: nextUnjournaledSeconds,
    startedAt: activeSession.startedAt,
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
    throw new Error("You need at least 10 minutes of tracked work before journaling.");
  }
  await db.insert(projectJournals).values({
    projectId,
    userId: session.user.id,
    content: text,
    activeSecondsCovered,
  });
  return { ok: true };
}

export async function storeSnapshot(
  projectId: number,
  sessionId: number,
  stateData: string,
) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session) return { stored: false };
  if (!canWriteEditorProject(project, session)) return { stored: false };

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
