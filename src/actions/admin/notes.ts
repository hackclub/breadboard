"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { reviewNotes } from "@/lib/db/schema";
import type { ReviewNote } from "@/types";

function revalidate(projectId?: number) {
  revalidatePath("/platform/admin/review");
  if (projectId) revalidatePath(`/platform/admin/review/${projectId}`);
}

export async function addProjectNote(projectId: number, content: string) {
  const session = await requireAdminSession();
  await db.insert(reviewNotes).values({
    projectId,
    authorId: session.user.id,
    authorName: session.user.name,
    content: content.trim(),
  });
  revalidate(projectId);
}

export async function addUserNote(targetUserId: string, content: string) {
  const session = await requireAdminSession();
  await db.insert(reviewNotes).values({
    targetUserId,
    authorId: session.user.id,
    authorName: session.user.name,
    content: content.trim(),
  });
  revalidate();
}

export async function editNote(noteId: number, content: string) {
  const session = await requireAdminSession();
  const row = await db
    .select({ authorId: reviewNotes.authorId })
    .from(reviewNotes)
    .where(eq(reviewNotes.id, noteId))
    .limit(1);
  const note = row[0];
  if (!note) throw new Error("Note not found");
  if (note.authorId !== session.user.id)
    throw new Error("Can only edit your own notes");

  await db
    .update(reviewNotes)
    .set({ content: content.trim(), updatedAt: new Date() })
    .where(eq(reviewNotes.id, noteId));
  revalidate();
}

export async function deleteNote(noteId: number) {
  const session = await requireAdminSession();
  const row = await db
    .select({
      authorId: reviewNotes.authorId,
      projectId: reviewNotes.projectId,
    })
    .from(reviewNotes)
    .where(eq(reviewNotes.id, noteId))
    .limit(1);
  const note = row[0];
  if (!note) throw new Error("Note not found");
  if (note.authorId !== session.user.id)
    throw new Error("Can only delete your own notes");

  await db.delete(reviewNotes).where(eq(reviewNotes.id, noteId));
  revalidate(note.projectId ?? undefined);
}

export async function getProjectNotes(
  projectId: number,
): Promise<ReviewNote[]> {
  await requireAdminSession();
  return db
    .select()
    .from(reviewNotes)
    .where(eq(reviewNotes.projectId, projectId))
    .orderBy(desc(reviewNotes.createdAt));
}

export async function getUserNotes(
  targetUserId: string,
): Promise<ReviewNote[]> {
  await requireAdminSession();
  return db
    .select()
    .from(reviewNotes)
    .where(eq(reviewNotes.targetUserId, targetUserId))
    .orderBy(desc(reviewNotes.createdAt));
}
