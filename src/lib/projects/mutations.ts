import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { clean } from "@/lib/utils";
import type { PlatformProject, ShipInput } from "@/types";

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

const editableStatuses = ["draft", "needs_changes"];

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
  await assertProjectEditable(owner.userId, input.projectId);

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
  await assertProjectEditable(owner.userId, projectId);

  await db
    .update(projects)
    .set({
      email: clean(data.email),
      playableUrl: clean(data.playableUrl),
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
      status: "shipped",
      shippedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, owner.userId)));
}

async function assertProjectEditable(userId: string, projectId: number) {
  const existing = await db
    .select({ status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!existing[0] || !editableStatuses.includes(existing[0].status)) {
    throw new Error("This project cannot be changed from its current status.");
  }
}
