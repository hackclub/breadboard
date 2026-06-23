import "server-only";

import { and, eq, max, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectEditorVersions,
  projectSubmissions,
  projects,
} from "@/lib/db/schema";
import { clean } from "@/lib/utils";
import type { DemoInput, PlatformProject, ShipInput } from "@/types";

type ProjectOwner = {
  userId: string;
  email?: string | null;
};

export type CreateProjectInput = {
  title: string;
  description: string;
  kitType: PlatformProject["kitType"];
};

export type UpdateProjectBasicsInput = {
  projectId: number;
  title: string;
  description: string;
  screenshotUrl: string;
};

export async function confirmKitReceivedForUser(
  owner: ProjectOwner,
  projectId: number,
) {
  await assertProjectOwned(owner.userId, projectId);
  const now = new Date();
  await db
    .update(projects)
    .set({ status: "building", packageReceivedAt: now, updatedAt: now })
    .where(and(eq(projects.id, projectId), eq(projects.userId, owner.userId)));
}

export async function submitDemoForUser(
  owner: ProjectOwner,
  projectId: number,
  data: DemoInput,
) {
  await assertProjectOwned(owner.userId, projectId);
  const now = new Date();
  const cleanPlayableUrl = clean(data.playableUrl);
  const cleanDemoVideoUrl = clean(data.demoVideoUrl);
  if (!cleanDemoVideoUrl) throw new Error("Upload a demo video first");

  await db.transaction(async (tx) => {
    const latest = await tx
      .select({ submissionNumber: max(projectSubmissions.submissionNumber) })
      .from(projectSubmissions)
      .where(eq(projectSubmissions.projectId, projectId));
    const submissionNumber = (latest[0]?.submissionNumber ?? 0) + 1;
    const projectRows = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, owner.userId)))
      .limit(1);
    const project = projectRows[0];
    if (!project) throw new Error("Project not found.");
    if (!["building", "kit_sent"].includes(project.status)) {
      throw new Error("Demo can only be submitted after the kit is sent.");
    }

    await tx.insert(projectSubmissions).values({
      projectId,
      userId: owner.userId,
      type: "demo",
      submissionNumber,
      email: project.email,
      playableUrl: cleanPlayableUrl,
      demoVideoUrl: cleanDemoVideoUrl,
      codeUrl: project.codeUrl,
      screenshotUrl: project.screenshotUrl,
      addressLine1: project.addressLine1,
      addressLine2: project.addressLine2,
      city: project.city,
      region: project.region,
      country: project.country,
      postalCode: project.postalCode,
      birthday: project.birthday,
      firstName: project.firstName,
      lastName: project.lastName,
      hoursSpent: project.overrideHoursSpent ?? project.hoursSpent,
      status: "pending_review",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(projects)
      .set({
        status: "demo_review",
        playableUrl: cleanPlayableUrl,
        demoVideoUrl: cleanDemoVideoUrl,
        demoSubmittedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, owner.userId)),
      );
  });
}

export async function createProjectForUser(
  owner: ProjectOwner,
  input: CreateProjectInput,
) {
  const title = clean(input.title);
  if (!title) throw new Error("Project title is required");

  const [project] = await db
    .insert(projects)
    .values({
      userId: owner.userId,
      title: title || "Untitled project",
      description: clean(input.description),
      email: owner.email ?? "",
      kitType: input.kitType,
    })
    .returning({ id: projects.id });

  return project.id;
}

export async function updateProjectBasicsForUser(
  owner: ProjectOwner,
  input: UpdateProjectBasicsInput,
) {
  await assertProjectOwned(owner.userId, input.projectId);

  await db
    .update(projects)
    .set({
      title: clean(input.title) || "Untitled project",
      description: clean(input.description),
      screenshotUrl: clean(input.screenshotUrl),
      updatedAt: new Date(),
    })
    .where(
      and(eq(projects.id, input.projectId), eq(projects.userId, owner.userId)),
    );
}

export async function shipProjectForUser(
  owner: ProjectOwner,
  projectId: number,
  data: ShipInput,
) {
  await assertProjectCanShip(owner.userId, projectId);

  return await db.transaction(async (tx) => {
    const latest = await tx
      .select({ submissionNumber: max(projectSubmissions.submissionNumber) })
      .from(projectSubmissions)
      .where(eq(projectSubmissions.projectId, projectId));
    const submissionNumber = (latest[0]?.submissionNumber ?? 0) + 1;
    const tracked = await tx
      .select({
        activeSeconds: sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`,
      })
      .from(editorActivitySessions)
      .where(
        and(
          eq(editorActivitySessions.projectId, projectId),
          eq(editorActivitySessions.userId, owner.userId),
        ),
      );
    const activeSeconds = tracked[0]?.activeSeconds ?? 0;
    const hoursSpent = Math.max(0, Math.ceil(activeSeconds / 3600));
    const now = new Date();
    const projectRows = await tx
      .select({ editorData: projects.editorData })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, owner.userId)))
      .limit(1);
    const editorData = projectRows[0]?.editorData ?? "";
    const latestVersion = await tx
      .select({ versionNumber: max(projectEditorVersions.versionNumber) })
      .from(projectEditorVersions)
      .where(eq(projectEditorVersions.projectId, projectId));
    const editorVersionNumber = (latestVersion[0]?.versionNumber ?? 0) + 1;

    await tx.insert(projectEditorVersions).values({
      projectId,
      userId: owner.userId,
      versionNumber: editorVersionNumber,
      editorData,
      reason: "submission",
      createdAt: now,
    });

    await tx.insert(projectSubmissions).values({
      projectId,
      userId: owner.userId,
      submissionNumber,
      email: clean(data.email),
      codeUrl: clean(data.codeUrl),
      screenshotUrl: clean(data.screenshotUrl),
      addressLine1: clean(data.addressLine1),
      addressLine2: clean(data.addressLine2),
      city: clean(data.city),
      region: clean(data.region),
      country: clean(data.country),
      postalCode: clean(data.postalCode),
      birthday: clean(data.birthday),
      firstName: clean(data.firstName),
      lastName: clean(data.lastName),
      hoursSpent,
      editorVersionNumber,
      status: "pending_review",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(projects)
      .set({
        email: clean(data.email),
        codeUrl: clean(data.codeUrl),
        screenshotUrl: clean(data.screenshotUrl),
        addressLine1: clean(data.addressLine1),
        addressLine2: clean(data.addressLine2),
        city: clean(data.city),
        region: clean(data.region),
        country: clean(data.country),
        postalCode: clean(data.postalCode),
        birthday: clean(data.birthday),
        firstName: clean(data.firstName),
        lastName: clean(data.lastName),
        hoursSpent,
        status: "materials_review",
        reviewNote: "",
        updatedAt: now,
      })
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, owner.userId)),
      );

    return { hoursSpent, activeSeconds };
  });
}

async function assertProjectOwned(userId: string, projectId: number) {
  const existing = await db
    .select({ status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!existing[0]) throw new Error("Project not found.");
}

async function assertProjectCanShip(userId: string, projectId: number) {
  const existing = await db
    .select({ status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!existing[0]) throw new Error("Project not found.");
  if (
    [
      "materials_review",
      "kit_approved",
      "kit_fulfillment",
      "kit_sent",
      "building",
      "demo_review",
      "done",
    ].includes(existing[0].status)
  ) {
    throw new Error(
      "This project is already in the shipped flow. Continue from the current project status.",
    );
  }
}
