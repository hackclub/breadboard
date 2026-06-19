"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { canWriteEditorProject, getEditorProject } from "@/lib/editor/access";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  editorTimelapseSnapshots,
} from "@/lib/db/schema";

const INACTIVITY_TIMEOUT_SECONDS = 60;
const HEARTBEAT_INTERVAL_SECONDS = 20;

export async function sendHeartbeat(projectId: number) {
  const { session, project } = await getEditorProject(projectId);
  if (!project || !session) return null;
  if (!canWriteEditorProject(project, session)) return null;

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

  if (
    existing[0] &&
    !existing[0].endedAt &&
    now.getTime() - existing[0].lastActivityAt.getTime() <
      INACTIVITY_TIMEOUT_SECONDS * 1000
  ) {
    await db
      .update(editorActivitySessions)
      .set({
        lastActivityAt: now,
        activeSeconds: sql`${editorActivitySessions.activeSeconds} + ${HEARTBEAT_INTERVAL_SECONDS}`,
      })
      .where(eq(editorActivitySessions.id, existing[0].id));
    activeSession = existing[0];
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
  }

  return {
    sessionId: activeSession.id,
    activeSeconds: activeSession.activeSeconds,
    startedAt: activeSession.startedAt,
  };
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
