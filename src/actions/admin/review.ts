"use server";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import {
  BREAD_PER_HOUR,
  breadForHours,
  GOLD_BREAD_PER_HOUR,
  roundHours,
} from "@/lib/constants";
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
import { nextPendingReviewProjectId } from "@/lib/admin/next-review";
import { isBuildShip, type ProjectType } from "@/lib/projects/project-type";
import { recordCurrencyTransaction } from "@/lib/projects/ledger";
import { notifyProjectStatus, notifyReviewDecision } from "@/lib/slack/tookle";
import {
  pushLatestApprovedShipToUnified,
  pushShipToUnified,
} from "@/lib/ysws/unified";

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

// Hours are kept to a tenth of an hour, never rounded to whole hours.
function normalizeHours(value: number, fallback = 0) {
  return roundHours(Number(value || fallback) || 0);
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
      approvedSeconds: Math.round(input.approvedHours * 3600),
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

type ReviewPhase = "materials" | "demo";

type ReviewTarget = {
  submission: typeof projectSubmissions.$inferSelect;
  phase: ReviewPhase;
  alreadyDone: boolean;
};

// Resolves the submission a review decision should act on, tolerant of replays.
//
// Review actions get re-fired in practice: a dropped connection or a deployment
// swap while the review page is open makes the browser retry the server action
// after the first call already committed. The first call moves the submission
// out of "pending_review"; a naive retry then finds nothing pending and 500s,
// even though the review actually went through. So: if a submission is pending,
// act on it. If nothing is pending and the latest submission already sits in
// the exact state this decision produces, report an idempotent no-op. Anything
// else (decided differently, or no submission at all) is a real conflict and
// surfaces a clear message.
//
// `expectedPhase` pins resolution to one submission type (materials vs demo).
// Each review page acts on exactly one phase, so without this a stale/replayed
// materials action could land on a demo that became pending in the meantime
// (paying it out or dragging the project back a phase) and vice versa.
async function resolveReviewTarget(
  projectId: number,
  intendedStatus: "approved" | "needs_changes" | "rejected",
  expectedPhase: ReviewPhase,
): Promise<ReviewTarget> {
  const pending = await db
    .select()
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, expectedPhase),
        eq(projectSubmissions.status, "pending_review"),
      ),
    )
    .orderBy(desc(projectSubmissions.submittedAt))
    .limit(1);
  if (pending[0]) {
    return {
      submission: pending[0],
      phase: pending[0].type,
      alreadyDone: false,
    };
  }

  const latest = await db
    .select()
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, expectedPhase),
      ),
    )
    .orderBy(desc(projectSubmissions.submittedAt))
    .limit(1);
  const decided = latest[0];
  if (!decided)
    throw new Error(`This project has no pending ${expectedPhase} submission.`);
  if (decided.status === intendedStatus) {
    return { submission: decided, phase: decided.type, alreadyDone: true };
  }
  throw new Error(
    `This submission was already reviewed as "${decided.status.replace(/_/g, " ")}". Refresh to see the current state.`,
  );
}

// Reviewers can accept a project for bread only when it falls short of the
// complexity bar the maker signed up for. The flag lives on the latest
// materials submission because that's the row every reader consults (review
// queue, review workspace, fulfillment), even while a demo is under review.
async function markLatestMaterialsBreadOnly(tx: typeof db, projectId: number) {
  const latest = await tx
    .select({ id: projectSubmissions.id })
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, "materials"),
      ),
    )
    .orderBy(desc(projectSubmissions.submittedAt))
    .limit(1);
  if (!latest[0]) return;
  await tx
    .update(projectSubmissions)
    .set({ breadOnly: true, updatedAt: new Date() })
    .where(eq(projectSubmissions.id, latest[0].id));
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
  const target = await resolveReviewTarget(id, "approved", "materials");
  if (target.alreadyDone) {
    revalidateReviewViews(id);
    return;
  }
  const submission = target.submission;
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
  expectedPhase: ReviewPhase = "materials",
  breadOnly = false,
) {
  const session = await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const hours = normalizeHours(approvedHours);
  const reviewJustification = normalizeReviewText(
    justification,
    "Justification",
  );
  const reviewComment = normalizeReviewText(userComment, "User comment");

  const project = await getProjectOrThrow(id);
  const target = await resolveReviewTarget(id, "approved", expectedPhase);
  if (target.alreadyDone) {
    revalidateReviewViews(id);
    return;
  }
  const submission = target.submission;
  // Bread-only is a design-flow concept (build ships have their own bar and
  // pay gold), so ignore the flag for builds even if a stale client sends it.
  const acceptBreadOnly = breadOnly && !isBuildShip(project);

  if (target.phase === "demo") {
    const bread = breadForHours(hours, BREAD_PER_HOUR);
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
      if (acceptBreadOnly) await markLatestMaterialsBreadOnly(tx, id);
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
      const [credited] = await tx
        .insert(userBread)
        .values({ userId: updatedSubmission.userId, balance: bread })
        .onConflictDoUpdate({
          target: userBread.userId,
          set: {
            balance: sql`${userBread.balance} + ${bread}`,
            updatedAt: new Date(),
          },
        })
        .returning({ balance: userBread.balance });
      // Deterministic key: the submission moves out of pending_review inside
      // this same tx, so a retried approval can't double-credit.
      await recordCurrencyTransaction(tx, {
        userId: updatedSubmission.userId,
        actorId: session.user.id,
        type: "project_payout",
        amount: bread,
        balanceAfter: credited?.balance ?? null,
        sourceEntityType: "submission",
        sourceEntityId: String(submission.id),
        idempotencyKey: `project_payout:demo:${submission.id}`,
        note: "Demo approved",
      });
      return updatedSubmission.userId;
    });
    await audit("admin.user.bread_add", "user", creditedUser, {
      amount: bread,
    });
    await audit("admin.review.demo_approve", "project", String(id), {
      hours,
      bread,
      breadOnly: acceptBreadOnly,
    });
    revalidateReviewViews(id);
    // Hours are verified and paid at demo approval, so this ship now belongs
    // in the Unified YSWS DB (best-effort, see src/lib/ysws/unified.ts).
    await pushShipToUnified(submission.id);
    await notifyReviewDecision(id, "demo", "accepted", {
      bread,
      note: reviewComment,
    });
    return;
  }

  // Build ships are finished projects built off-platform: approval pays out
  // gold bread immediately and there's no kit to fulfill. Off-platform *design*
  // (projectType "design", submissionSource "manual") is not a build ship, so
  // it falls through to the normal design flow: a kit ships and it earns
  // regular bread.
  if (isBuildShip(project)) {
    const gold = breadForHours(hours, GOLD_BREAD_PER_HOUR);
    const creditedUser = await db.transaction(async (tx) => {
      await createReviewRecord(tx, {
        projectId: id,
        submissionId: submission.id,
        reviewerId: session.user.id,
        phase: "materials",
        decision: "approved",
        approvedHours: hours,
        bread: gold,
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
          breadAmount: gold,
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
        throw new Error("Only pending builds can be approved");
      await tx
        .update(projects)
        .set({
          status: "done",
          // Accumulate so update ships to an already-done build add to the
          // project's totals instead of replacing them.
          overrideHoursSpent: (project.overrideHoursSpent ?? 0) + hours,
          overrideHoursSpentJustification: reviewJustification,
          reviewNote: reviewComment,
          breadAmount: sql`${projects.breadAmount} + ${gold}`,
          approvedAt: new Date(),
          doneAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
      const [credited] = await tx
        .insert(userBread)
        .values({ userId: updatedSubmission.userId, goldBalance: gold })
        .onConflictDoUpdate({
          target: userBread.userId,
          set: {
            goldBalance: sql`${userBread.goldBalance} + ${gold}`,
            updatedAt: new Date(),
          },
        })
        .returning({ goldBalance: userBread.goldBalance });
      await recordCurrencyTransaction(tx, {
        userId: updatedSubmission.userId,
        actorId: session.user.id,
        type: "project_payout",
        currency: "gold",
        amount: gold,
        balanceAfter: credited?.goldBalance ?? null,
        sourceEntityType: "submission",
        sourceEntityId: String(submission.id),
        idempotencyKey: `project_payout:build:${submission.id}`,
        note: "Build approved (gold bread)",
      });
      return updatedSubmission.userId;
    });
    await audit("admin.user.gold_bread_add", "user", creditedUser, {
      amount: gold,
    });
    await audit("admin.review.build_approve", "project", String(id), {
      hours,
      gold,
    });
    revalidateReviewViews(id);
    // A build ship pays out right here, so its verified hours go to the
    // Unified YSWS DB now (best-effort).
    await pushShipToUnified(submission.id);
    await notifyReviewDecision(id, "materials", "accepted", {
      bread: gold,
      gold: true,
      note: reviewComment,
    });
    return;
  }

  // A design ship pays out at materials approval when no demo phase lies ahead
  // of it: bread-only ships (declared by the maker or accepted by the
  // reviewer), and update ships to a project that already had a ship approved.
  // The kit decision happens exactly once, on the first approval. Updates
  // never trigger fulfillment, whether the project got a kit or was bread only.
  const [priorApproved] = await db
    .select({ id: projectSubmissions.id })
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, id),
        eq(projectSubmissions.type, "materials"),
        inArray(projectSubmissions.status, ["approved", "fulfilled"]),
        ne(projectSubmissions.id, submission.id),
      ),
    )
    .limit(1);
  const isUpdateShip = Boolean(priorApproved);

  // The reviewer's toggle is authoritative: the client seeds it from the
  // maker's declared breadOnly, so an unchanged value keeps a maker-declared
  // bread-only ship bread-only, and unchecking it downgrades to the normal
  // kit-shipping design flow below.
  if (acceptBreadOnly || isUpdateShip) {
    const bread = breadForHours(hours, BREAD_PER_HOUR);
    const creditedUser = await db.transaction(async (tx) => {
      await createReviewRecord(tx, {
        projectId: id,
        submissionId: submission.id,
        reviewerId: session.user.id,
        phase: "materials",
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
          breadOnly: acceptBreadOnly,
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
          // A project that already finished the kit flow returns to done;
          // bread-only projects sit in approved. Both keep tracking time and
          // can ship further updates. overrideHoursSpent accumulates so it
          // stays the total approved hours across all ships.
          status: project.doneAt ? "done" : "approved",
          overrideHoursSpent: (project.overrideHoursSpent ?? 0) + hours,
          overrideHoursSpentJustification: reviewJustification,
          reviewNote: reviewComment,
          breadAmount: sql`${projects.breadAmount} + ${bread}`,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
      const [credited] = await tx
        .insert(userBread)
        .values({ userId: updatedSubmission.userId, balance: bread })
        .onConflictDoUpdate({
          target: userBread.userId,
          set: {
            balance: sql`${userBread.balance} + ${bread}`,
            updatedAt: new Date(),
          },
        })
        .returning({ balance: userBread.balance });
      // Deterministic key: the submission moves out of pending_review inside
      // this same tx, so a retried approval can't double-credit.
      await recordCurrencyTransaction(tx, {
        userId: updatedSubmission.userId,
        actorId: session.user.id,
        type: "project_payout",
        amount: bread,
        balanceAfter: credited?.balance ?? null,
        sourceEntityType: "submission",
        sourceEntityId: String(submission.id),
        idempotencyKey: `project_payout:materials:${submission.id}`,
        note: isUpdateShip
          ? "Project update approved"
          : "Design approved (bread only)",
      });
      return updatedSubmission.userId;
    });
    await audit("admin.user.bread_add", "user", creditedUser, {
      amount: bread,
    });
    await audit("admin.review.materials_approve", "project", String(id), {
      hours,
      bread,
      breadOnly: acceptBreadOnly,
      update: isUpdateShip,
    });
    revalidateReviewViews(id);
    // Bread-only and update ships pay out at materials approval, so the
    // verified hours go to the Unified YSWS DB now (best-effort).
    await pushShipToUnified(submission.id);
    await notifyReviewDecision(id, "materials", "accepted", {
      bread,
      note: reviewComment,
    });
    return;
  }

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
        // Reaching this branch means the reviewer left bread-only off, so clear
        // any maker-declared flag: this is a normal kit-shipping design approval.
        breadOnly: false,
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

    // "own parts" builders already have their components, so there's no kit to
    // fulfill or ship. Move them straight into building instead.
    const usesOwnParts = project.kitType === "own";

    await tx
      .update(projects)
      .set({
        status: usesOwnParts ? "building" : "kit_fulfillment",
        overrideHoursSpent: hours,
        overrideHoursSpentJustification: reviewJustification,
        reviewNote: reviewComment,
        kitApprovedAt: new Date(),
        packageReceivedAt: usesOwnParts ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    if (!usesOwnParts) {
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
    }

    return updatedSubmission.userId;
  });

  await audit("admin.review.materials_approve", "project", String(id), {
    hours,
    userId: creditedUser,
    breadOnly: acceptBreadOnly,
  });
  revalidateReviewViews(id);
  // The design ship's hours are verified and approved here, even though bread
  // pays out later at demo approval, so it becomes its own Unified YSWS record
  // now. The demo ship (and any further ships) approved after the kit is built
  // land as separate update records that reference these hours, per the Unified
  // DB's update rule (docs.hackclub.com, "Duplicate and Updated Submissions").
  await pushShipToUnified(submission.id);
  await notifyReviewDecision(id, "materials", "accepted", {
    note: reviewComment,
  });
}

// The unified record can need correcting after the decision: a typo, missing
// evidence, spot-check feedback, or a wrong approved-hours number. Editing
// updates the stored note (and, when hours are passed, the approved hours,
// with the maker's bread adjusted by the difference), then refreshes the
// ship's Airtable row when it already paid out (and therefore lives in the
// unified pipeline).
export async function updateUnifiedJustification(
  submissionId: number,
  justification: string,
  approvedHours?: number,
) {
  const session = await requireAdminSession();
  const sid = Math.floor(Number(submissionId));
  if (!Number.isFinite(sid) || sid <= 0)
    throw new Error("Submission ID must be a positive number");
  const text = normalizeReviewText(justification, "Justification");
  if (!text) throw new Error("Justification cannot be empty");
  const [submission] = await db
    .select()
    .from(projectSubmissions)
    .where(eq(projectSubmissions.id, sid))
    .limit(1);
  if (!submission) throw new Error("Submission not found");
  const decided = ["approved", "fulfilled"].includes(submission.status);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, submission.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  // Hours edits only make sense once the review is decided; before that the
  // number flows through the approval itself.
  const newHours =
    approvedHours !== undefined && decided
      ? normalizeHours(approvedHours)
      : null;

  const adjustment = await db.transaction(async (tx) => {
    // Re-read inside the transaction so the bread delta is computed against
    // committed state — a retried save recomputes a zero delta instead of
    // double-applying.
    const [fresh] = await tx
      .select()
      .from(projectSubmissions)
      .where(eq(projectSubmissions.id, sid))
      .for("update");
    if (!fresh) throw new Error("Submission not found");
    const oldHours = fresh.approvedHours ?? 0;
    if (newHours === null || newHours === oldHours) {
      await tx
        .update(projectSubmissions)
        .set({ internalNote: text, updatedAt: new Date() })
        .where(eq(projectSubmissions.id, sid));
      await tx
        .update(projects)
        .set({ overrideHoursSpentJustification: text, updatedAt: new Date() })
        .where(eq(projects.id, submission.projectId));
      return null;
    }

    // Only ships that actually paid carry bread; a kit materials approval has
    // breadAmount 0 (it pays at demo), so its hours edit moves no bread.
    const gold = isBuildShip(project);
    const rate = gold ? GOLD_BREAD_PER_HOUR : BREAD_PER_HOUR;
    const newBread =
      fresh.breadAmount > 0 ? breadForHours(newHours, rate) : fresh.breadAmount;
    const breadDelta = newBread - fresh.breadAmount;

    await tx
      .update(projectSubmissions)
      .set({
        internalNote: text,
        approvedHours: newHours,
        breadAmount: newBread,
        updatedAt: new Date(),
      })
      .where(eq(projectSubmissions.id, sid));
    await tx
      .update(projects)
      .set({
        overrideHoursSpentJustification: text,
        // overrideHoursSpent is the project's running total across ships, so
        // it moves by the same difference as this ship.
        overrideHoursSpent: sql`coalesce(${projects.overrideHoursSpent}, 0) + ${newHours - oldHours}`,
        breadAmount: sql`${projects.breadAmount} + ${breadDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, submission.projectId));

    if (breadDelta !== 0) {
      const [credited] = await tx
        .insert(userBread)
        .values({
          userId: fresh.userId,
          balance: gold ? 0 : breadDelta,
          goldBalance: gold ? breadDelta : 0,
        })
        .onConflictDoUpdate({
          target: userBread.userId,
          set: {
            ...(gold
              ? { goldBalance: sql`${userBread.goldBalance} + ${breadDelta}` }
              : { balance: sql`${userBread.balance} + ${breadDelta}` }),
            updatedAt: new Date(),
          },
        })
        .returning({
          balance: userBread.balance,
          goldBalance: userBread.goldBalance,
        });
      await recordCurrencyTransaction(tx, {
        userId: fresh.userId,
        actorId: session.user.id,
        type: "admin_adjustment",
        currency: gold ? "gold" : "bread",
        amount: breadDelta,
        balanceAfter: gold
          ? (credited?.goldBalance ?? null)
          : (credited?.balance ?? null),
        sourceEntityType: "submission",
        sourceEntityId: String(sid),
        note: `Approved hours adjusted ${oldHours}h -> ${newHours}h after review`,
      });
    }
    return { oldHours, newHours, breadDelta };
  });

  await audit(
    "admin.review.update_justification",
    "project",
    String(submission.projectId),
    { submissionId: sid, ...(adjustment ?? {}) },
  );
  // Only paid ships were pushed to the Unified YSWS DB. A kit materials
  // approval hasn't been (it pays at demo), recognizable by its zero
  // breadAmount, so editing it must not create a premature Airtable row.
  if (
    submission.breadAmount > 0 &&
    ["approved", "fulfilled"].includes(submission.status)
  ) {
    await pushShipToUnified(sid);
  }
  revalidateReviewViews(submission.projectId);
}

// The full Unified DB justification is normally composed from database facts
// (src/lib/ysws/unified.ts). Saving a non-empty override here freezes the
// exact text sent for THIS ship; saving an empty string reverts it to the
// live-composed template. Per ship, because the Unified DB treats every
// update ship as its own submission with its own hours and justification
// (docs.hackclub.com, "Duplicate and Updated Submissions") — a project-wide
// freeze would stamp one ship's hours onto every row. If the ship already
// paid out, its Airtable row is refreshed to match.
export async function saveUnifiedTemplateOverride(
  submissionId: number,
  template: string,
) {
  await requireAdminSession();
  const sid = Math.floor(Number(submissionId));
  if (!Number.isFinite(sid) || sid <= 0)
    throw new Error("Submission ID must be a positive number");
  // The composed template runs long, so allow far more than the 2k cap on
  // ordinary review text. Airtable long-text fields top out at 100k.
  const text = template.trim();
  if (text.length > 50_000) throw new Error("Template is too long");
  const [submission] = await db
    .select()
    .from(projectSubmissions)
    .where(eq(projectSubmissions.id, sid))
    .limit(1);
  if (!submission) throw new Error("Submission not found");
  await db.transaction(async (tx) => {
    await tx
      .update(projectSubmissions)
      .set({ unifiedJustificationOverride: text, updatedAt: new Date() })
      .where(eq(projectSubmissions.id, sid));
    // Any save through the per-ship path retires the legacy project-wide
    // freeze — otherwise clearing a ship's override would resurrect stale
    // project-level text through the fallback.
    await tx
      .update(projects)
      .set({ unifiedJustificationOverride: "", updatedAt: new Date() })
      .where(eq(projects.id, submission.projectId));
  });
  await audit(
    "admin.review.unified_template_override",
    "project",
    String(submission.projectId),
    { submissionId: sid, cleared: text.length === 0 },
  );
  if (
    submission.breadAmount > 0 &&
    ["approved", "fulfilled"].includes(submission.status)
  ) {
    await pushShipToUnified(sid);
  }
  revalidateReviewViews(submission.projectId);
}

// Reviewer flag for the "approved · simulator sketchy" review-queue bucket.
// It only sets a label on the project; it moves no bread, ships no kit, and
// changes no review state. Reviewers toggle it from the approve panel so
// approved projects with questionable simulator output can be grouped and
// revisited later.
export async function setProjectSimulatorSketchy(
  projectId: number,
  sketchy: boolean,
) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  await getProjectOrThrow(id);
  await db
    .update(projects)
    .set({ simulatorSketchy: Boolean(sketchy), updatedAt: new Date() })
    .where(eq(projects.id, id));
  await audit("admin.review.set_simulator_sketchy", "project", String(id), {
    sketchy: Boolean(sketchy),
  });
  revalidateReviewViews(id);
}

// Autosaves the reviewer's in-progress maker-facing comment as they type, so a
// half-written message outlives navigating away, a reload, or coming back days
// later on another device. Only pending submissions carry a draft; once a
// decision lands the comment is frozen onto the submission and the draft is
// reset (see clearReviewCommentDraft), so a stale draft can't repopulate. No
// revalidation or audit: this fires on a keystroke debounce and must stay cheap
// and invisible.
export async function saveReviewCommentDraft(
  submissionId: number,
  draft: string,
) {
  await requireAdminSession();
  const id = Math.floor(Number(submissionId));
  if (!Number.isFinite(id) || id <= 0)
    throw new Error("Submission ID must be a positive number");
  await db
    .update(projectSubmissions)
    .set({ reviewerCommentDraft: String(draft).slice(0, REVIEW_TEXT_LIMIT) })
    .where(
      and(
        eq(projectSubmissions.id, id),
        eq(projectSubmissions.status, "pending_review"),
      ),
    );
}

// Resets the comment draft after a decision so a stale message can't linger.
// Called best-effort from the client once approve/changes/reject succeeds; the
// review page also refuses to seed a draft for an already-decided submission,
// so this is hygiene, not the safety net.
export async function clearReviewCommentDraft(submissionId: number) {
  await requireAdminSession();
  const id = Math.floor(Number(submissionId));
  if (!Number.isFinite(id) || id <= 0) return;
  await db
    .update(projectSubmissions)
    .set({ reviewerCommentDraft: "" })
    .where(eq(projectSubmissions.id, id));
}

// Where auto-advance (or a skip) should send the reviewer, resolved at click
// time rather than when the page first rendered. The page's precomputed target
// can go stale: on a busy queue another reviewer may claim that submission
// first, and pushing to a decided one strands this reviewer on a locked review.
// Recomputing here guarantees the next stop is still a pending card in the same
// lane. `excludeProjectIds` is the current card plus any skipped this session,
// so a deferred card isn't served again; `carrySkipIds` is threaded onto the
// destination URL as `?skip=` so the skip set survives the navigation. Returns
// the gallery when nothing else is pending.
export async function nextPendingReviewHref(
  lane: ReviewPhase,
  excludeProjectIds: number[],
  carrySkipIds: number[] = [],
) {
  await requireAdminSession();
  const nextId = await nextPendingReviewProjectId(lane, excludeProjectIds);
  if (!nextId) return "/platform/admin/review";
  const base =
    lane === "demo"
      ? `/platform/admin/review/demo/${nextId}`
      : `/platform/admin/review/${nextId}`;
  const carry = carrySkipIds.filter((id) => Number.isInteger(id) && id > 0);
  return carry.length ? `${base}?skip=${carry.join(",")}` : base;
}

// Reviewers sometimes need to reclassify a ship: a maker picks "build" but
// actually wants a kit, or submits a finished build under "design". The type
// drives payout currency and kit fulfillment, so it can only change before the
// materials approval branches on it. Payout states are locked.
export async function setProjectShipType(
  projectId: number,
  shipType: ProjectType,
) {
  await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  if (shipType !== "build" && shipType !== "design")
    throw new Error("Ship type must be build or design");
  const project = await getProjectOrThrow(id);
  if (project.projectType === shipType) {
    revalidateReviewViews(id);
    return;
  }
  if (["done", "paid_out", "fulfilled", "approved"].includes(project.status))
    throw new Error(
      "This project was already paid out, so its ship type can't change.",
    );
  // An update ship under review keeps the project in materials_review, but the
  // currency decision already happened on the first approval, so an update must
  // not flip a bread project to gold (or vice versa).
  if (project.status === "materials_review") {
    const [prior] = await db
      .select({ id: projectSubmissions.id })
      .from(projectSubmissions)
      .where(
        and(
          eq(projectSubmissions.projectId, id),
          eq(projectSubmissions.type, "materials"),
          inArray(projectSubmissions.status, ["approved", "fulfilled"]),
        ),
      )
      .limit(1);
    if (prior)
      throw new Error(
        "This project already had a ship paid out, so its ship type can't change.",
      );
  }
  await db
    .update(projects)
    .set({ projectType: shipType, updatedAt: new Date() })
    .where(eq(projects.id, id));
  await audit("admin.review.set_ship_type", "project", String(id), {
    from: project.projectType,
    to: shipType,
  });
  revalidateReviewViews(id);
}

export async function payOutProject(projectId: number) {
  const session = await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const project = await getProjectOrThrow(id);
  if (project.status !== "reviewed")
    throw new Error("Only reviewed projects can be paid out");
  const hours = normalizeHours(
    project.overrideHoursSpent ?? project.hoursSpent,
  );
  // Build ships earn gold bread; everything else (including off-platform
  // design) earns regular bread.
  const buildShip = isBuildShip(project);
  const bread = breadForHours(
    hours,
    buildShip ? GOLD_BREAD_PER_HOUR : BREAD_PER_HOUR,
  );
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

    const [credited] = await tx
      .insert(userBread)
      .values(
        buildShip
          ? { userId: updatedProject.userId, goldBalance: bread }
          : { userId: updatedProject.userId, balance: bread },
      )
      .onConflictDoUpdate({
        target: userBread.userId,
        set: buildShip
          ? {
              goldBalance: sql`${userBread.goldBalance} + ${bread}`,
              updatedAt: new Date(),
            }
          : {
              balance: sql`${userBread.balance} + ${bread}`,
              updatedAt: new Date(),
            },
      })
      .returning({
        balance: userBread.balance,
        goldBalance: userBread.goldBalance,
      });

    // Deterministic key: the project leaves "reviewed" in this same tx, so a
    // retried payout is a no-op rather than a double-credit.
    await recordCurrencyTransaction(tx, {
      userId: updatedProject.userId,
      actorId: session.user.id,
      type: "project_payout",
      currency: buildShip ? "gold" : "bread",
      amount: bread,
      balanceAfter: buildShip
        ? (credited?.goldBalance ?? null)
        : (credited?.balance ?? null),
      sourceEntityType: "project",
      sourceEntityId: String(id),
      idempotencyKey: `project_payout:payout:${id}`,
      note: buildShip ? "Project paid out (gold bread)" : "Project paid out",
    });

    return updatedProject.userId;
  });

  await audit(
    buildShip ? "admin.user.gold_bread_add" : "admin.user.bread_add",
    "user",
    creditedUser,
    { amount: bread },
  );
  await audit("admin.review.pay_out", "project", String(id), { hours });
  revalidateReviewViews(id);
  // The legacy reviewed -> paid_out flow finalizes hours here; push the ship
  // that just got paid to the Unified YSWS DB (best-effort).
  await pushLatestApprovedShipToUnified(id);
  await notifyProjectStatus(id, "paid_out", { bread, gold: buildShip });
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
  expectedPhase: ReviewPhase = "materials",
) {
  const session = await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const target = await resolveReviewTarget(id, "needs_changes", expectedPhase);
  if (target.alreadyDone) {
    revalidateReviewViews(id);
    return;
  }
  const submission = target.submission;
  const reviewNote = normalizeReviewText(note, "Note");
  await db.transaction(async (tx) => {
    await createReviewRecord(tx, {
      projectId: id,
      submissionId: submission.id,
      reviewerId: session.user.id,
      phase: target.phase,
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
  await notifyReviewDecision(id, target.phase, "needs_changes", {
    note: reviewNote,
  });
}

export async function rejectProject(
  projectId: number,
  note: string,
  checks?: ReviewCheckInput[],
  expectedPhase: ReviewPhase = "materials",
) {
  const session = await requireAdminSession();
  const id = requirePositiveProjectId(projectId);
  const target = await resolveReviewTarget(id, "rejected", expectedPhase);
  if (target.alreadyDone) {
    revalidateReviewViews(id);
    return;
  }
  const submission = target.submission;
  const reviewNote = normalizeReviewText(note, "Note");
  await db.transaction(async (tx) => {
    await createReviewRecord(tx, {
      projectId: id,
      submissionId: submission.id,
      reviewerId: session.user.id,
      phase: target.phase,
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
  await notifyReviewDecision(id, target.phase, "rejected", {
    note: reviewNote,
  });
}
