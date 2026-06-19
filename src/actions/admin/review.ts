"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { BREAD_PER_HOUR } from "@/lib/constants";
import { db } from "@/lib/db/db";
import { projects, userBread } from "@/lib/db/schema";

const REVIEW_TEXT_LIMIT = 2000;

function requirePositiveProjectId(value: number) {
  const projectId = Math.floor(Number(value));
  if (!Number.isFinite(projectId) || projectId <= 0) {
    throw new Error("Project ID must be a positive number");
  }
  return projectId;
}

function normalizeHours(value: number, fallback = 0) {
  return Math.max(0, Math.floor(Number(value || fallback) || 0));
}

function normalizeReviewText(value: string, label: string) {
  const text = value.trim();
  if (text.length > REVIEW_TEXT_LIMIT) throw new Error(`${label} is too long`);
  return text;
}

async function getProjectOrThrow(projectId: number) {
  const row = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = row[0];
  if (!project) throw new Error("Project not found");
  return project;
}

function revalidateReviewViews(projectId?: number) {
  revalidatePath("/platform/admin/review");
  if (projectId) revalidatePath(`/platform/admin/review/${projectId}`);
  revalidatePath("/platform/projects");
}

export async function markReviewed(
  projectId: number,
  overrideHours: number,
  justification: string,
) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const project = await getProjectOrThrow(id);
  if (project.status !== "shipped")
    throw new Error("Only shipped projects can be reviewed");
  const hours = normalizeHours(overrideHours, project.hoursSpent);
  const reviewJustification = normalizeReviewText(
    justification,
    "Justification",
  );

  const [updatedProject] = await db
    .update(projects)
    .set({
      status: "reviewed",
      overrideHoursSpent: hours,
      overrideHoursSpentJustification: reviewJustification,
      reviewNote: "",
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.status, "shipped")))
    .returning({ id: projects.id });
  if (!updatedProject) throw new Error("Only shipped projects can be reviewed");
  await audit("admin.review.mark_reviewed", "project", String(id), {
    hours,
    justification: reviewJustification,
  });
  revalidateReviewViews(id);
}

export async function approveProject(
  projectId: number,
  approvedHours: number,
  justification: string,
  userComment: string,
) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const hours = normalizeHours(approvedHours);
  const bread = hours * BREAD_PER_HOUR;
  const reviewJustification = normalizeReviewText(
    justification,
    "Justification",
  );
  const reviewComment = normalizeReviewText(userComment, "User comment");

  const creditedUser = await db.transaction(async (tx) => {
    const [updatedProject] = await tx
      .update(projects)
      .set({
        status: "paid_out",
        overrideHoursSpent: hours,
        overrideHoursSpentJustification: reviewJustification,
        reviewNote: reviewComment,
        breadAmount: bread,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, id), eq(projects.status, "shipped")))
      .returning({ userId: projects.userId });

    if (!updatedProject)
      throw new Error("Only shipped projects can be approved");

    await tx
      .insert(userBread)
      .values({ userId: updatedProject.userId, balance: bread })
      .onConflictDoUpdate({
        target: userBread.userId,
        set: {
          balance: sql`${userBread.balance} + ${bread}`,
          updatedAt: new Date(),
        },
      });

    return updatedProject.userId;
  });

  await audit("admin.user.bread_add", "user", creditedUser, { amount: bread });
  await audit("admin.review.approve", "project", String(id), {
    hours,
    bread,
  });
  revalidateReviewViews(id);
}

export async function payOutProject(projectId: number) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const project = await getProjectOrThrow(id);
  if (project.status !== "reviewed")
    throw new Error("Only reviewed projects can be paid out");
  const hours = normalizeHours(
    project.overrideHoursSpent ?? project.hoursSpent,
  );
  const bread = hours * BREAD_PER_HOUR;
  const creditedUser = await db.transaction(async (tx) => {
    const [updatedProject] = await tx
      .update(projects)
      .set({
        status: "paid_out",
        breadAmount: bread,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, id), eq(projects.status, "reviewed")))
      .returning({ userId: projects.userId });

    if (!updatedProject)
      throw new Error("Only reviewed projects can be paid out");

    await tx
      .insert(userBread)
      .values({ userId: updatedProject.userId, balance: bread })
      .onConflictDoUpdate({
        target: userBread.userId,
        set: {
          balance: sql`${userBread.balance} + ${bread}`,
          updatedAt: new Date(),
        },
      });

    return updatedProject.userId;
  });

  await audit("admin.user.bread_add", "user", creditedUser, { amount: bread });
  await audit("admin.review.pay_out", "project", String(id), { hours });
  revalidateReviewViews(id);
}

export async function fulfillProject(projectId: number) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const project = await getProjectOrThrow(id);
  if (project.status !== "paid_out")
    throw new Error("Only paid out projects can be fulfilled");

  const [updatedProject] = await db
    .update(projects)
    .set({ status: "fulfilled", updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.status, "paid_out")))
    .returning({ id: projects.id });
  if (!updatedProject)
    throw new Error("Only paid out projects can be fulfilled");
  await audit("admin.review.fulfill", "project", String(id));
  revalidateReviewViews(id);
}

export async function requestChanges(projectId: number, note: string) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const reviewNote = normalizeReviewText(note, "Note");
  const [updatedProject] = await db
    .update(projects)
    .set({
      status: "needs_changes",
      reviewNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projects.id, id),
        inArray(projects.status, ["shipped", "reviewed", "needs_changes"]),
      ),
    )
    .returning({ id: projects.id });
  if (!updatedProject) throw new Error("This project cannot request changes");
  await audit("admin.review.request_changes", "project", String(id), {
    note: reviewNote,
  });
  revalidateReviewViews(id);
}

export async function rejectProject(projectId: number, note: string) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const reviewNote = normalizeReviewText(note, "Note");
  const [updatedProject] = await db
    .update(projects)
    .set({ status: "rejected", reviewNote, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, id),
        inArray(projects.status, ["shipped", "reviewed", "needs_changes"]),
      ),
    )
    .returning({ id: projects.id });
  if (!updatedProject) throw new Error("This project cannot be rejected");
  await audit("admin.review.reject", "project", String(id), {
    note: reviewNote,
  });
  revalidateReviewViews(id);
}
