import "server-only";

import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectEditorVersions,
  projectSubmissions,
  projects,
} from "@/lib/db/schema";
import { after } from "next/server";
import {
  refreshGitHubReadme,
  resolvePublicOrigin,
} from "@/lib/projects/githubReadme";
import { roundHours } from "@/lib/constants";
import { clean } from "@/lib/utils";
import type {
  CustomShipInput,
  DemoInput,
  PlatformProject,
  ShipInput,
} from "@/types";

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
  if (!cleanDemoVideoUrl)
    throw new Error("Upload a demo video before submitting");

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

    const demoTracked = await tx
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
    const demoHours = project.overrideHoursSpent ?? project.hoursSpent;
    const demoTrackedSeconds = project.overrideHoursSpent
      ? Math.round(project.overrideHoursSpent * 3600)
      : (demoTracked[0]?.activeSeconds ??
        Math.round(project.hoursSpent * 3600));

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
      hoursSpent: demoHours,
      trackedSeconds: demoTrackedSeconds,
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
  const [existing] = await db
    .select({ codeUrl: projects.codeUrl })
    .from(projects)
    .where(
      and(eq(projects.id, input.projectId), eq(projects.userId, owner.userId)),
    )
    .limit(1);
  if (!existing) throw new Error("Project not found");

  const title = clean(input.title) || "Untitled project";
  const description = clean(input.description);
  const screenshotUrl = clean(input.screenshotUrl);

  await db
    .update(projects)
    .set({
      title,
      description,
      screenshotUrl,
      updatedAt: new Date(),
    })
    .where(
      and(eq(projects.id, input.projectId), eq(projects.userId, owner.userId)),
    );

  // The published GitHub README mirrors these fields, so re-sync it on every
  // save, not just when a field changed: the repo can be stale even when the
  // stored values are not (e.g. published before any screenshot existed).
  // putFile skips the write when the repo already matches, and
  // refreshGitHubReadme never throws. Scheduled with after() so the save
  // doesn't wait on GitHub round-trips; the origin has to be resolved here
  // because headers() is gone once the response is sent.
  if (existing.codeUrl) {
    const origin = await resolvePublicOrigin();
    after(() => refreshGitHubReadme(input.projectId, owner.userId, origin));
  }
}

// Every submission stores the cumulative measured total at ship time in
// trackedSeconds, so the highest approved value is the accounting floor: an
// update ship claims only the time beyond it. Docked hours stay docked (the
// floor is what was measured at the approved ship, not what was paid), and
// hours from rejected or needs_changes ships stay claimable.
async function approvedShipFloor(tx: typeof db, projectId: number) {
  const [row] = await tx
    .select({
      countedSeconds: sql<number>`coalesce(max(${projectSubmissions.trackedSeconds}), 0)::int`,
      approvedShips: sql<number>`count(*)::int`,
    })
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, "materials"),
        inArray(projectSubmissions.status, ["approved", "fulfilled"]),
      ),
    );
  return {
    countedSeconds: row?.countedSeconds ?? 0,
    hasApprovedShip: (row?.approvedShips ?? 0) > 0,
  };
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
    const now = new Date();
    // Closing the session before reading its total makes submission a hard
    // accounting boundary. Any heartbeat that began before this transaction
    // will fail its open-session compare-and-set instead of adding time after
    // the submitted snapshot. What closes it is endedAt going non-null, so it
    // can carry the last heartbeat rather than now: a project shipped days
    // after the last edit shouldn't leave a session spanning the whole gap.
    await tx
      .update(editorActivitySessions)
      .set({ endedAt: sql`${editorActivitySessions.lastActivityAt}` })
      .where(
        and(
          eq(editorActivitySessions.projectId, projectId),
          eq(editorActivitySessions.userId, owner.userId),
          isNull(editorActivitySessions.endedAt),
        ),
      );
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
    const { countedSeconds, hasApprovedShip } = await approvedShipFloor(
      tx,
      projectId,
    );
    const newSeconds = Math.max(0, activeSeconds - countedSeconds);
    if (hasApprovedShip && newSeconds <= 0) {
      throw new Error(
        "Track new time in the editor before shipping an update.",
      );
    }
    // The submission claims only the new hours; the project keeps the
    // cumulative total.
    const hoursSpent = roundHours(newSeconds / 3600);
    const totalHours = roundHours(activeSeconds / 3600);
    const projectRows = await tx
      .select({ editorData: projects.editorData, codeUrl: projects.codeUrl })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, owner.userId)))
      .limit(1);
    const editorData = projectRows[0]?.editorData ?? "";
    const codeUrl = clean(projectRows[0]?.codeUrl ?? "");
    if (!codeUrl)
      throw new Error("Publish to GitHub before submitting your design.");
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
      codeUrl,
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
      trackedSeconds: activeSeconds,
      editorVersionNumber,
      breadOnly: data.breadOnly ?? false,
      status: "pending_review",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(projects)
      .set({
        email: clean(data.email),
        codeUrl,
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
        hoursSpent: totalHours,
        // A first ship enters design review; an update is reviewed in place, so
        // the project stays wherever it was (building, kit_sent, done, ...) and
        // its demo phase is never interrupted.
        ...(hasApprovedShip ? {} : { status: "materials_review" as const }),
        reviewNote: "",
        updatedAt: now,
      })
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, owner.userId)),
      );

    return { hoursSpent, totalHours, activeSeconds };
  });
}

export async function shipCustomProjectForUser(
  owner: ProjectOwner,
  projectId: number,
  data: CustomShipInput,
) {
  await assertProjectCanShip(owner.userId, projectId);

  return await db.transaction(async (tx) => {
    const latest = await tx
      .select({ submissionNumber: max(projectSubmissions.submissionNumber) })
      .from(projectSubmissions)
      .where(eq(projectSubmissions.projectId, projectId));
    const submissionNumber = (latest[0]?.submissionNumber ?? 0) + 1;
    const now = new Date();
    // Closes the accounting boundary the same way the editor ship does, ending
    // each session at its last heartbeat rather than at submission time.
    await tx
      .update(editorActivitySessions)
      .set({ endedAt: sql`${editorActivitySessions.lastActivityAt}` })
      .where(
        and(
          eq(editorActivitySessions.projectId, projectId),
          eq(editorActivitySessions.userId, owner.userId),
          isNull(editorActivitySessions.endedAt),
        ),
      );
    // data.hoursSpent is the cumulative measured total; the submission claims
    // only what earlier approved ships haven't already covered.
    const totalHours = roundHours(data.hoursSpent || 0);
    const totalSeconds = Math.round(totalHours * 3600);
    const { countedSeconds, hasApprovedShip } = await approvedShipFloor(
      tx,
      projectId,
    );
    const newSeconds = Math.max(0, totalSeconds - countedSeconds);
    if (hasApprovedShip && newSeconds <= 0) {
      throw new Error("Track new time before shipping an update.");
    }
    const hoursSpent = roundHours(newSeconds / 3600);
    const codeUrl = clean(data.gitUrl);
    if (!codeUrl)
      throw new Error("Git URL is required for custom submissions.");

    await tx.insert(projectSubmissions).values({
      projectId,
      userId: owner.userId,
      submissionNumber,
      email: clean(data.email),
      codeUrl,
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
      trackedSeconds: totalSeconds,
      submissionSource: "manual",
      breadOnly: data.breadOnly ?? false,
      status: "pending_review",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(projects)
      .set({
        email: clean(data.email),
        codeUrl,
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
        hoursSpent: totalHours,
        submissionSource: "manual",
        // This legacy path is a build ship: the modal promises gold bread and
        // no kit, and review requires build evidence (photos + demo video).
        // Without this write, the project would keep projectType "design" and
        // approval would pay regular bread and ship a kit, contradicting the
        // promise. Off-platform *designs* go through createExternalDraftFromForm
        // instead. Builders use their own parts, so kitType follows suit.
        // Update ships must not reclassify: the currency decision happened at
        // the first approval, so the type stays whatever it was paid as.
        ...(hasApprovedShip ? {} : { projectType: "build", kitType: "own" }),
        // First ship enters design review; an update is reviewed in place and
        // leaves the project's status untouched.
        ...(hasApprovedShip ? {} : { status: "materials_review" as const }),
        reviewNote: "",
        updatedAt: now,
      })
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, owner.userId)),
      );

    return { hoursSpent, totalHours };
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
  // A pending demo owns the project's review lane, so the maker finishes it
  // before shipping a design update.
  if (existing[0].status === "demo_review")
    throw new Error(
      "Your demo is in review. Wait for that decision before shipping again.",
    );
  // An update ship is reviewed in place, so the project stays wherever it was
  // (building, kit_sent, done, ...) instead of moving into design review. The
  // real guard is therefore not the status but whether a design submission is
  // already pending: two at once would leave both in the queue with the older
  // one orphaned. This also covers a project sitting in first-ship review.
  const [pending] = await db
    .select({ id: projectSubmissions.id })
    .from(projectSubmissions)
    .where(
      and(
        eq(projectSubmissions.projectId, projectId),
        eq(projectSubmissions.type, "materials"),
        eq(projectSubmissions.status, "pending_review"),
      ),
    )
    .limit(1);
  if (pending)
    throw new Error(
      "This project already has a design submission in review. Wait for that decision before shipping again.",
    );
}

export async function archiveProjectForUser(
  owner: { userId: string; email: string | null | undefined },
  projectId: number,
) {
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: projects.id, userId: projects.userId })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, owner.userId)))
      .limit(1);

    if (!existing) throw new Error("Project not found.");

    await tx
      .update(projects)
      .set({
        archived: true,
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  });
}
