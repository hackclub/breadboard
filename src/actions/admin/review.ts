"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { BREAD_PER_HOUR } from "@/lib/constants";
import { db } from "@/lib/db/db";
import {
  orderItems,
  orders,
  products,
  projectReviewChecks,
  projectReviews,
  projectSubmissions,
  projects,
  userBread,
} from "@/lib/db/schema";
import { notifyProjectStatus, notifyReviewDecision } from "@/lib/slack/tookle";

const REVIEW_TEXT_LIMIT = 2000;

type ReviewCheckInput = {
  key: string;
  label: string;
  passed: boolean;
  note?: string;
};

const MATERIALS_CHECKS: ReviewCheckInput[] = [
  {
    key: "readme_scope",
    label: "README explains what the project is and why it is interesting",
    passed: false,
  },
  {
    key: "readme_usage",
    label: "README explains how it works and how to use it",
    passed: false,
  },
  {
    key: "schematic",
    label: "Clear wiring diagram/schematic is present",
    passed: false,
  },
  { key: "bom", label: "Bill of materials is present", passed: false },
  { key: "firmware", label: "Firmware code file is present", passed: false },
  {
    key: "public_code",
    label: "GitHub repo/code is public and original",
    passed: false,
  },
];

const DEMO_CHECKS: ReviewCheckInput[] = [
  {
    key: "video",
    label: "Photo/video shows the physical project working",
    passed: false,
  },
  {
    key: "readme_video",
    label: "README includes final photo/video evidence",
    passed: false,
  },
  {
    key: "journal",
    label: "Build journaling shows incremental progress",
    passed: false,
  },
  { key: "kit_build", label: "Built with the shipped kit", passed: false },
];

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

function normalizeChecks(
  checks: ReviewCheckInput[] | undefined,
  phase: "materials" | "demo",
) {
  const defaults = phase === "demo" ? DEMO_CHECKS : MATERIALS_CHECKS;
  const byKey = new Map((checks ?? []).map((check) => [check.key, check]));
  return defaults.map((check) => ({
    ...check,
    passed: Boolean(byKey.get(check.key)?.passed),
    note: normalizeReviewText(byKey.get(check.key)?.note ?? "", "Check note"),
  }));
}

async function createReviewRecord(
  tx: typeof db,
  input: {
    projectId: number;
    submissionId: number;
    reviewerId: string;
    phase: "materials" | "demo";
    decision: "approved" | "needs_changes" | "rejected";
    approvedHours: number;
    bread: number;
    internalComment: string;
    publicComment: string;
    checks?: ReviewCheckInput[];
  },
) {
  const checks = normalizeChecks(input.checks, input.phase);
  const [review] = await tx
    .insert(projectReviews)
    .values({
      projectId: input.projectId,
      submissionId: input.submissionId,
      reviewerId: input.reviewerId,
      decision:
        input.decision === "needs_changes"
          ? "changes_requested"
          : input.decision,
      approvedSeconds: input.approvedHours * 3600,
      breadAmount: input.bread,
      publicComment: input.publicComment,
      internalComment: input.internalComment,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: projectReviews.id });
  await tx.insert(projectReviewChecks).values(
    checks.map((check) => ({
      reviewId: review.id,
      key: check.key,
      label: check.label,
      passed: check.passed,
      note: check.note ?? "",
    })),
  );
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

async function getPendingSubmissionOrThrow(
  projectId: number,
  type: "materials" | "demo",
) {
  const row = await db
    .select()
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, type),
        eq(projectSubmissions.status, "pending_review"),
      ),
    )
    .orderBy(desc(projectSubmissions.submittedAt))
    .limit(1);
  const submission = row[0];
  if (!submission)
    throw new Error(`This project has no pending ${type} submission`);
  return submission;
}

async function getOrCreateKitProduct(tx: typeof db, kitType: string) {
  const name = kitType === "esp32" ? "Kit B" : "Kit A";
  const imageUrl =
    kitType === "esp32" ? "/assets/esp32.png" : "/assets/arduino.png";
  const existing = await tx
    .select({ id: products.id, imageUrl: products.imageUrl })
    .from(products)
    .where(eq(products.name, name))
    .limit(1);
  if (existing[0]) {
    if (existing[0].imageUrl !== imageUrl) {
      await tx
        .update(products)
        .set({ imageUrl })
        .where(eq(products.id, existing[0].id));
    }
    return existing[0].id;
  }
  const [created] = await tx
    .insert(products)
    .values({
      name,
      description: `${name} project kit`,
      imageUrl,
      price: 0,
      active: false,
    })
    .returning({ id: products.id });
  return created.id;
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
  const submission = await getPendingSubmissionOrThrow(id, "materials");
  const hours = normalizeHours(overrideHours, submission.hoursSpent);
  const reviewJustification = normalizeReviewText(
    justification,
    "Justification",
  );

  await db.transaction(async (tx) => {
    const [updatedSubmission] = await tx
      .update(projectSubmissions)
      .set({
        status: "approved",
        approvedHours: hours,
        internalNote: reviewJustification,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectSubmissions.id, submission.id),
          eq(projectSubmissions.status, "pending_review"),
        ),
      )
      .returning({ id: projectSubmissions.id });
    if (!updatedSubmission)
      throw new Error("Only pending snapshots can be reviewed");

    await tx
      .update(projects)
      .set({
        status: "reviewed",
        overrideHoursSpent: hours,
        overrideHoursSpentJustification: reviewJustification,
        reviewNote: "",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));
  });
  await audit("admin.review.mark_reviewed", "project", String(id), {
    hours,
    justification: reviewJustification,
  });
  revalidateReviewViews(id);
  await notifyProjectStatus(id, "reviewed", { note: reviewJustification });
}

export async function approveProject(
  projectId: number,
  approvedHours: number,
  justification: string,
  userComment: string,
  checks?: ReviewCheckInput[],
) {
  const session = await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const hours = normalizeHours(approvedHours);
  const bread = hours * BREAD_PER_HOUR;
  const reviewJustification = normalizeReviewText(
    justification,
    "Justification",
  );
  const reviewComment = normalizeReviewText(userComment, "User comment");

  const project = await getProjectOrThrow(id);
  if (project.status === "demo_review") {
    const submission = await getPendingSubmissionOrThrow(id, "demo");
    const creditedUser = await db.transaction(async (tx) => {
      await createReviewRecord(tx, {
        projectId: id,
        submissionId: submission.id,
        reviewerId: session.user.id,
        phase: "demo",
        decision: "approved",
        approvedHours: hours,
        bread,
        internalComment: reviewJustification,
        publicComment: reviewComment,
        checks,
      });
      const [updatedSubmission] = await tx
        .update(projectSubmissions)
        .set({
          status: "approved",
          approvedHours: hours,
          internalNote: reviewJustification,
          userComment: reviewComment,
          breadAmount: bread,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectSubmissions.id, submission.id),
            eq(projectSubmissions.status, "pending_review"),
          ),
        )
        .returning({ userId: projectSubmissions.userId });
      if (!updatedSubmission)
        throw new Error("Only pending demos can be approved");
      await tx
        .update(projects)
        .set({
          status: "done",
          overrideHoursSpent: hours,
          overrideHoursSpentJustification: reviewJustification,
          reviewNote: reviewComment,
          breadAmount: bread,
          approvedAt: new Date(),
          doneAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
      await tx
        .insert(userBread)
        .values({ userId: updatedSubmission.userId, balance: bread })
        .onConflictDoUpdate({
          target: userBread.userId,
          set: {
            balance: sql`${userBread.balance} + ${bread}`,
            updatedAt: new Date(),
          },
        });
      return updatedSubmission.userId;
    });
    await audit("admin.user.bread_add", "user", creditedUser, {
      amount: bread,
    });
    await audit("admin.review.demo_approve", "project", String(id), {
      hours,
      bread,
    });
    revalidateReviewViews(id);
    await notifyReviewDecision(id, "demo", "accepted", {
      bread,
      note: reviewComment,
    });
    return;
  }

  const submission = await getPendingSubmissionOrThrow(id, "materials");
  const creditedUser = await db.transaction(async (tx) => {
    await createReviewRecord(tx, {
      projectId: id,
      submissionId: submission.id,
      reviewerId: session.user.id,
      phase: "materials",
      decision: "approved",
      approvedHours: hours,
      bread: 0,
      internalComment: reviewJustification,
      publicComment: reviewComment,
      checks,
    });
    const [updatedSubmission] = await tx
      .update(projectSubmissions)
      .set({
        status: "approved",
        approvedHours: hours,
        internalNote: reviewJustification,
        userComment: reviewComment,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectSubmissions.id, submission.id),
          eq(projectSubmissions.status, "pending_review"),
        ),
      )
      .returning({ userId: projectSubmissions.userId });

    if (!updatedSubmission)
      throw new Error("Only pending snapshots can be approved");

    await tx
      .update(projects)
      .set({
        status: "kit_fulfillment",
        overrideHoursSpent: hours,
        overrideHoursSpentJustification: reviewJustification,
        reviewNote: reviewComment,
        kitApprovedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    const kitProductId = await getOrCreateKitProduct(tx, project.kitType);
    const [kitOrder] = await tx
      .insert(orders)
      .values({
        userId: project.userId,
        totalCost: 0,
        shippingName: `${project.firstName} ${project.lastName}`.trim(),
        shippingLine1: project.addressLine1,
        shippingLine2: project.addressLine2,
        shippingCity: project.city,
        shippingRegion: project.region,
        shippingPostalCode: project.postalCode,
        shippingCountry: project.country,
        source: "project_kit",
        projectId: id,
      })
      .returning({ id: orders.id });
    await tx.insert(orderItems).values({
      orderId: kitOrder.id,
      productId: kitProductId,
      quantity: 1,
      unitPrice: 0,
    });
    await tx
      .update(projects)
      .set({ kitOrderId: kitOrder.id, updatedAt: new Date() })
      .where(eq(projects.id, id));

    return updatedSubmission.userId;
  });

  await audit("admin.review.materials_approve", "project", String(id), {
    hours,
    userId: creditedUser,
  });
  revalidateReviewViews(id);
  await notifyReviewDecision(id, "materials", "accepted", {
    note: reviewComment,
  });
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
  await notifyProjectStatus(id, "paid_out", { bread });
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
  await notifyProjectStatus(id, "fulfilled");
}

export async function requestChanges(
  projectId: number,
  note: string,
  checks?: ReviewCheckInput[],
) {
  const session = await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const project = await getProjectOrThrow(id);
  const submission = await getPendingSubmissionOrThrow(
    id,
    project.status === "demo_review" ? "demo" : "materials",
  );
  const reviewNote = normalizeReviewText(note, "Note");
  await db.transaction(async (tx) => {
    await createReviewRecord(tx, {
      projectId: id,
      submissionId: submission.id,
      reviewerId: session.user.id,
      phase: project.status === "demo_review" ? "demo" : "materials",
      decision: "needs_changes",
      approvedHours: 0,
      bread: 0,
      internalComment: "",
      publicComment: reviewNote,
      checks,
    });
    const [updatedSubmission] = await tx
      .update(projectSubmissions)
      .set({
        status: "needs_changes",
        userComment: reviewNote,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectSubmissions.id, submission.id),
          eq(projectSubmissions.status, "pending_review"),
        ),
      )
      .returning({ id: projectSubmissions.id });
    if (!updatedSubmission)
      throw new Error("This snapshot cannot request changes");
    await tx
      .update(projects)
      .set({ status: "needs_changes", reviewNote, updatedAt: new Date() })
      .where(eq(projects.id, id));
  });
  await audit("admin.review.request_changes", "project", String(id), {
    note: reviewNote,
  });
  revalidateReviewViews(id);
  await notifyReviewDecision(
    id,
    project.status === "demo_review" ? "demo" : "materials",
    "needs_changes",
    { note: reviewNote },
  );
}

export async function rejectProject(
  projectId: number,
  note: string,
  checks?: ReviewCheckInput[],
) {
  const session = await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const project = await getProjectOrThrow(id);
  const submission = await getPendingSubmissionOrThrow(
    id,
    project.status === "demo_review" ? "demo" : "materials",
  );
  const reviewNote = normalizeReviewText(note, "Note");
  await db.transaction(async (tx) => {
    await createReviewRecord(tx, {
      projectId: id,
      submissionId: submission.id,
      reviewerId: session.user.id,
      phase: project.status === "demo_review" ? "demo" : "materials",
      decision: "rejected",
      approvedHours: 0,
      bread: 0,
      internalComment: "",
      publicComment: reviewNote,
      checks,
    });
    const [updatedSubmission] = await tx
      .update(projectSubmissions)
      .set({
        status: "rejected",
        userComment: reviewNote,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectSubmissions.id, submission.id),
          eq(projectSubmissions.status, "pending_review"),
        ),
      )
      .returning({ id: projectSubmissions.id });
    if (!updatedSubmission) throw new Error("This snapshot cannot be rejected");
    await tx
      .update(projects)
      .set({ status: "rejected", reviewNote, updatedAt: new Date() })
      .where(eq(projects.id, id));
  });
  await audit("admin.review.reject", "project", String(id), {
    note: reviewNote,
  });
  revalidateReviewViews(id);
  await notifyReviewDecision(
    id,
    project.status === "demo_review" ? "demo" : "materials",
    "rejected",
    { note: reviewNote },
  );
}
