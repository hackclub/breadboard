"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { HackClubClaims } from "@/lib/auth/hackclub";
import { assertHackClubYswsEligible, ensureSlackId } from "@/lib/auth/hackclub";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectJournals,
  projects,
  projectTimelapses,
  user,
} from "@/lib/db/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import {
  archiveProjectForUser,
  confirmKitReceivedForUser,
  createProjectForUser,
  shipCustomProjectForUser,
  shipProjectForUser,
  submitDemoForUser,
  updateProjectBasicsForUser,
} from "@/lib/projects/mutations";
import {
  getUnjournaledSeconds,
  JOURNAL_MIN_SECONDS,
} from "@/lib/editor/journal-time";
import {
  fetchTimelapsesForUser,
  lapseProgramKeyConfigured,
  queryLapseUserByHandle,
} from "@/lib/lapse";
import { resolveLapseUserId, storeLapseIdentity } from "@/lib/lapse-identity";
import {
  parseYouTubeVideoIds,
  youtubeThumbnail,
  youtubeWatchUrl,
} from "@/lib/youtube";
import { offPlatformBuilds } from "@/flags";
import { notifyReviewSubmitted } from "@/lib/slack/tookle";
import type {
  CustomShipInput,
  DemoInput,
  ProjectFormState,
  ShipInput,
} from "@/types";

const projectBasicsSchema = z.object({
  title: z.string().trim().min(1, "Project title is required"),
  description: z.string().trim().max(2000).default(""),
  screenshotUrl: z.string().trim().max(2048).default(""),
  shipType: z.enum(["editor", "offplatform-design", "build"]).optional(),
});

const createProjectSchema = projectBasicsSchema
  .pick({ title: true, description: true })
  .extend({ kitType: z.enum(["arduino", "esp32"]).default("arduino") });

const shipProjectSchema = z.object({
  screenshotUrl: z
    .string()
    .trim()
    .min(1, "Screenshot URL is required")
    .max(2048),
});

function hasMinimumWords(value: string, minimum: number) {
  return value.trim().split(/\s+/).filter(Boolean).length >= minimum;
}

const demoSubmissionSchema = z.object({
  playableUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) => value === "" || value.startsWith("/share/"),
      "Demo link must be the Breadboard read-only share link.",
    ),
  demoVideoUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (value.startsWith("/demo/")) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Upload a demo video first"),
});

function parseGitHubRepoUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("Submit the public GitHub repo created by Publish.");
  }
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) throw new Error("GitHub repo URL is invalid.");
  return { owner, repo: repo.replace(/\.git$/, "") };
}

async function fetchGitHubText(owner: string, repo: string, path: string) {
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`,
    { cache: "no-store" },
  );
  if (!res.ok) return "";
  return await res.text();
}

async function hasPublishedFirmware(owner: string, repo: string) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/firmware`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return false;
  const entries = (await res.json()) as Array<{
    type?: string;
    name?: string;
    download_url?: string | null;
  }>;
  for (const entry of entries) {
    if (entry.type !== "file" || !entry.download_url) continue;
    const file = await fetch(entry.download_url, { cache: "no-store" });
    if (file.ok && (await file.text()).trim()) return true;
  }
  return false;
}

async function assertMaterialsRepoReady(codeUrl: string) {
  const { owner, repo } = parseGitHubRepoUrl(codeUrl);
  const readme = await fetchGitHubText(owner, repo, "README.md");
  if (!readme) throw new Error("GitHub repo must have README.md.");
  const lower = readme.toLowerCase();
  const required = [
    ["what it does", "README needs a 'What It Does' section."],
    ["how it works", "README needs a 'How It Works' section."],
    ["how to use", "README needs a 'How To Use It' section."],
    ["wiring", "README needs a wiring/schematic section."],
    ["bill of materials", "README needs a Bill of Materials section."],
    ["firmware", "README needs a Firmware section."],
  ] as const;
  for (const [needle, message] of required) {
    if (!lower.includes(needle)) throw new Error(message);
  }
  const snapshot = await fetchGitHubText(
    owner,
    repo,
    "breadboard-project.json",
  );
  if (!snapshot)
    throw new Error("Publish the schematic snapshot before submitting.");
  if (!(await hasPublishedFirmware(owner, repo))) {
    throw new Error("Publish a firmware file before submitting.");
  }
}

function shippingFromClaims(
  session: Awaited<ReturnType<typeof requireSession>>,
  claims: HackClubClaims,
): ShipInput {
  const firstName = String(
    claims.given_name ?? session.user.name?.split(" ")[0] ?? "",
  ).trim();
  const lastName = String(
    claims.family_name ??
      session.user.name?.split(" ").slice(1).join(" ") ??
      "",
  ).trim();
  const address = claims.address ?? {};
  const data = {
    email: String(claims.email ?? session.user.email ?? "").trim(),
    codeUrl: "",
    screenshotUrl: "",
    addressLine1: String(address.street_address ?? "").trim(),
    addressLine2: "",
    city: String(address.locality ?? "").trim(),
    region: String(address.region ?? "").trim(),
    country: String(address.country ?? "").trim(),
    postalCode: String(address.postal_code ?? "").trim(),
    birthday: String(claims.birthdate ?? "").trim(),
    firstName,
    lastName,
  };
  const missing = [
    [data.email, "email"],
    [data.addressLine1, "address"],
    [data.city, "city"],
    [data.region, "region"],
    [data.country, "country"],
    [data.postalCode, "postal code"],
    [data.birthday, "birthdate"],
    [data.firstName, "first name"],
    [data.lastName, "last name"],
  ].filter(([value]) => !value);
  if (missing.length) {
    throw new Error(
      `Hack Club Auth is missing ${missing.map(([, label]) => label).join(", ")}. Re-log in and approve profile/address/birthdate scopes.`,
    );
  }
  return data;
}

async function assertDemoRepoReady(codeUrl: string, demoVideoUrl: string) {
  await assertMaterialsRepoReady(codeUrl);
  const { owner, repo } = parseGitHubRepoUrl(codeUrl);
  const readme = await fetchGitHubText(owner, repo, "README.md");
  const journals = await fetchGitHubText(owner, repo, "journals.md");
  if (!journals.trim()) {
    throw new Error("GitHub repo needs journals.md before demo review.");
  }
  const demoMatch =
    readme.includes(demoVideoUrl) ||
    (demoVideoUrl.startsWith("/demo/") &&
      readme.includes(demoVideoUrl.slice("/demo/".length)));
  if (!demoMatch) {
    throw new Error("README must include the final demo video link.");
  }
}

const projectFormError = (error: unknown): ProjectFormState => ({
  success: false,
  message:
    error instanceof z.ZodError
      ? error.issues.map((issue) => issue.message).join(", ")
      : error instanceof Error
        ? error.message
        : "Something went wrong.",
});

export async function createProjectFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const { title, description, kitType } = createProjectSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      kitType: formData.get("kitType") ?? "arduino",
    });
    const session = await requireSession();
    const id = await createProjectForUser(
      { userId: session.user.id, email: session.user.email },
      { title, description, kitType },
    );
    revalidatePath("/platform/projects");

    return {
      success: true,
      project: {
        id,
        title: title || "Untitled project",
        description,
        howToUse: "",
        email: "",
        playableUrl: "",
        codeUrl: "",
        screenshotUrl: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        region: "",
        country: "",
        postalCode: "",
        birthday: "",
        firstName: "",
        lastName: "",
        hoursSpent: 0,
        status: "draft",
        reviewNote: "",
        kitType,
      },
    };
  } catch (error) {
    return projectFormError(error);
  }
}

export async function updateProjectBasicsFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const projectId = Number(formData.get("projectId"));
    const { title, description, screenshotUrl, shipType } =
      projectBasicsSchema.parse({
        title: formData.get("title"),
        description: formData.get("description") ?? "",
        screenshotUrl: formData.get("screenshotUrl") ?? "",
        shipType: formData.get("shipType") ?? undefined,
      });

    if (!Number.isInteger(projectId)) throw new Error("Invalid project.");
    const session = await requireSession();
    await updateProjectBasicsForUser(
      { userId: session.user.id, email: session.user.email },
      { projectId, title, description, screenshotUrl },
    );

    let shipPatch:
      | { submissionSource: string; projectType: "build" | "design" }
      | undefined;
    if (shipType) {
      // editor → editor/design; offplatform-design → manual/design;
      // build → manual/build. Source and type are independent columns, so
      // compare both: a design/build change with an unchanged source (e.g.
      // off-platform design → build) must still be written.
      const requestedSource = shipType === "editor" ? "editor" : "manual";
      const requestedType = shipType === "build" ? "build" : "design";
      const [current] = await db
        .select({
          status: projects.status,
          submissionSource: projects.submissionSource,
          projectType: projects.projectType,
          kitType: projects.kitType,
        })
        .from(projects)
        .where(
          and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
        )
        .limit(1);
      if (!current) throw new Error("Project not found.");
      if (
        requestedSource !== current.submissionSource ||
        requestedType !== current.projectType
      ) {
        if (current.status !== "draft") {
          throw new Error("Only drafts can switch ship type.");
        }
        if (requestedSource === "manual" && !(await offPlatformBuilds())) {
          throw new Error("Off-platform builds aren't available right now.");
        }
        await db
          .update(projects)
          .set({
            submissionSource: requestedSource,
            projectType: requestedType,
            // Builds use the builder's own parts; designs must end up with a
            // shippable kit again or approval would skip fulfillment
            // (review.ts treats kitType "own" as "builder has parts").
            ...(requestedType === "build"
              ? { kitType: "own" as const }
              : current.kitType === "own"
                ? { kitType: "arduino" as const }
                : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(projects.id, projectId),
              eq(projects.userId, session.user.id),
              eq(projects.status, "draft"),
            ),
          );
        shipPatch = {
          submissionSource: requestedSource,
          projectType: requestedType,
        };
      }
    }
    revalidatePath("/platform/projects");

    return {
      success: true,
      project: {
        id: projectId,
        title: title || "Untitled project",
        description,
        screenshotUrl,
        ...(shipPatch ?? {}),
      },
    };
  } catch (error) {
    return projectFormError(error);
  }
}

export async function shipProjectFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const projectId = Number(formData.get("projectId"));
    if (!Number.isInteger(projectId)) throw new Error("Invalid project.");

    const parsed = shipProjectSchema.parse({
      screenshotUrl: formData.get("screenshotUrl"),
    });
    const session = await requireSession();
    const claims = await assertHackClubYswsEligible(session.user.id);
    const data = shippingFromClaims(session, claims);
    data.screenshotUrl = parsed.screenshotUrl;
    const [project] = await db
      .select({ codeUrl: projects.codeUrl, howToUse: projects.howToUse })
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
      )
      .limit(1);
    if (!project?.codeUrl) {
      throw new Error("Publish to GitHub before submitting your design.");
    }
    if (!hasMinimumWords(project.howToUse, 3)) {
      throw new Error(
        "Publish step-by-step instructions for how to use your project before submitting.",
      );
    }
    const [journalCount] = await db
      .select({ count: count() })
      .from(projectJournals)
      .where(eq(projectJournals.projectId, projectId));
    if (!journalCount?.count) {
      throw new Error("Write at least one journal entry before submitting.");
    }
    data.codeUrl = project.codeUrl;
    await assertMaterialsRepoReady(data.codeUrl);
    const tracked = await shipProjectForUser(
      { userId: session.user.id, email: session.user.email },
      projectId,
      data,
    );
    await notifyReviewSubmitted(projectId, "materials");
    revalidatePath("/platform/projects");
    revalidatePath("/platform/admin/review");

    return {
      success: true,
      project: {
        id: projectId,
        ...data,
        hoursSpent: tracked.hoursSpent,
        status: "materials_review",
        reviewNote: "",
      },
    };
  } catch (error) {
    return projectFormError(error);
  }
}

const customShipSchema = z.object({
  gitUrl: z
    .string()
    .trim()
    .min(1, "Git URL is required")
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Enter a valid HTTPS git URL (e.g. https://github.com/...)."),
  hoursSpent: z.coerce
    .number()
    .int()
    .min(0, "Hours must be at least 0")
    .max(999, "Hours seems unreasonably high"),
  screenshotUrl: z.string().trim().min(1, "Screenshot is required").max(2048),
  email: z.string().trim().email().optional(),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  region: z.string().trim().optional(),
  country: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  birthday: z.string().trim().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
});

function orEmpty(value: string | undefined | null) {
  return (value ?? "").trim();
}

async function assertCustomGitRepoReady(gitUrl: string) {
  const { owner, repo } = parseGitHubRepoUrl(gitUrl);
  const readme = await fetchGitHubText(owner, repo, "README.md");
  if (!readme.trim())
    throw new Error(
      "Your repo must have a README.md file. Add one before submitting.",
    );
  const journal = await fetchGitHubText(owner, repo, "journal.md");
  if (!journal.trim())
    throw new Error(
      "Your repo must have a journal.md file with build notes. Journaling is required.",
    );
}

export async function submitCustomProjectFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const projectId = Number(formData.get("projectId"));
    if (!Number.isInteger(projectId)) throw new Error("Invalid project.");

    const parsed = customShipSchema.parse({
      gitUrl: formData.get("gitUrl"),
      hoursSpent: formData.get("hoursSpent"),
      screenshotUrl: formData.get("screenshotUrl"),
      email: formData.get("email"),
      addressLine1: formData.get("addressLine1"),
      addressLine2: formData.get("addressLine2"),
      city: formData.get("city"),
      region: formData.get("region"),
      country: formData.get("country"),
      postalCode: formData.get("postalCode"),
      birthday: formData.get("birthday"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
    });
    const session = await requireSession();
    const claims = await assertHackClubYswsEligible(session.user.id);
    const shipping = shippingFromClaims(session, claims);
    const data: CustomShipInput = {
      gitUrl: parsed.gitUrl,
      screenshotUrl: parsed.screenshotUrl,
      hoursSpent: parsed.hoursSpent,
      email: orEmpty(parsed.email) || shipping.email,
      addressLine1: orEmpty(parsed.addressLine1) || shipping.addressLine1,
      addressLine2: orEmpty(parsed.addressLine2) || shipping.addressLine2,
      city: orEmpty(parsed.city) || shipping.city,
      region: orEmpty(parsed.region) || shipping.region,
      country: orEmpty(parsed.country) || shipping.country,
      postalCode: orEmpty(parsed.postalCode) || shipping.postalCode,
      birthday: orEmpty(parsed.birthday) || shipping.birthday,
      firstName: orEmpty(parsed.firstName) || shipping.firstName,
      lastName: orEmpty(parsed.lastName) || shipping.lastName,
    };
    const [project] = await db
      .select({ title: projects.title })
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
      )
      .limit(1);
    if (!project) throw new Error("Project not found.");
    await assertCustomGitRepoReady(data.gitUrl);
    const tracked = await shipCustomProjectForUser(
      { userId: session.user.id, email: session.user.email },
      projectId,
      data,
    );
    await notifyReviewSubmitted(projectId, "materials");
    revalidatePath("/platform/projects");
    revalidatePath("/platform/admin/review");

    return {
      success: true,
      project: {
        id: projectId,
        ...data,
        hoursSpent: tracked.hoursSpent,
        status: "materials_review",
        reviewNote: "",
      },
    };
  } catch (error) {
    return projectFormError(error);
  }
}

const externalDraftSchema = z.object({
  title: z.string().trim().min(1, "Project title is required"),
  description: z.string().trim().max(2000).default(""),
  kitType: z.enum(["arduino", "esp32", "own"]).default("arduino"),
  // "build": off-platform build, gold bread, no kit. "design": off-platform
  // design, regular bread, a kit ships.
  projectType: z.enum(["build", "design"]).default("build"),
});

// Off-platform projects (both builds and off-platform designs) are created as
// ordinary drafts so they accrue tracked time, screen evidence, and journals
// through the same pipeline as the editor before they're submitted for review.
export async function createExternalDraftFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    if (!(await offPlatformBuilds())) {
      throw new Error("Off-platform builds aren't available right now.");
    }
    const { title, description, kitType, projectType } =
      externalDraftSchema.parse({
        title: formData.get("title"),
        description: formData.get("description") ?? "",
        kitType: formData.get("kitType") ?? "arduino",
        projectType: formData.get("projectType") ?? "build",
      });
    const session = await requireSession();
    // Builds ship no kit, so their kit choice is irrelevant; designs keep the
    // chosen kit so it can be fulfilled after review.
    const projectId = await createProjectForUser(
      { userId: session.user.id, email: session.user.email },
      {
        title,
        description,
        kitType: projectType === "build" ? "own" : kitType,
      },
    );
    await db
      .update(projects)
      .set({ submissionSource: "manual", projectType, updatedAt: new Date() })
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
      );
    revalidatePath("/platform/projects");
    return { success: true, project: { id: projectId } };
  } catch (error) {
    return projectFormError(error);
  }
}

// Set which kit ships for an off-platform *design* draft. Chosen on the
// tracking page rather than at creation, so builders can change their mind
// while they work. Ignored for builds, which never ship a kit.
export async function setOffPlatformDesignKit(
  projectId: number,
  kitType: "arduino" | "esp32",
): Promise<void> {
  if (!(await offPlatformBuilds())) {
    throw new Error("Off-platform builds aren't available right now.");
  }
  if (kitType !== "arduino" && kitType !== "esp32") {
    throw new Error("Pick a valid kit.");
  }
  if (!Number.isInteger(projectId)) throw new Error("Invalid project.");
  const session = await requireSession();
  const updated = await db
    .update(projects)
    .set({ kitType, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, session.user.id),
        eq(projects.status, "draft"),
        eq(projects.projectType, "design"),
      ),
    )
    .returning({ id: projects.id });
  // A zero-row match means the project was submitted (or isn't a design
  // draft) since the page loaded, e.g. from another tab. Throw so the
  // caller's optimistic selection reverts instead of showing a kit choice
  // that was never saved.
  if (updated.length === 0) {
    throw new Error(
      "The kit can't be changed anymore. This project is no longer an editable design draft.",
    );
  }
  revalidatePath(`/platform/projects/${projectId}/track`);
}

async function trackedSecondsFor(projectId: number, userId: string) {
  const rows = await db
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
  return rows[0]?.total ?? 0;
}

export type AvailableTimelapse = {
  id: string;
  name: string;
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  recordedAt: string | null;
};

async function clearLapseToken(userId: string) {
  await db
    .update(user)
    .set({ lapseAccessToken: null, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

// The user's Lapse timelapses via their OAuth token when connected, otherwise
// the program key with their resolved Lapse id. [] when neither works.
async function fetchSessionUserTimelapses(session: {
  user: { id: string; email: string };
}) {
  const [account] = await db
    .select({ token: user.lapseAccessToken })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  const token = account?.token ?? null;
  const lapseUserId = token ? null : await resolveLapseUserId(session.user);
  try {
    return await fetchTimelapsesForUser({ accessToken: token, lapseUserId });
  } catch (error) {
    if (error instanceof Error && error.message === "LAPSE_REAUTH") {
      await clearLapseToken(session.user.id);
    }
    return [];
  }
}

const lapseHandleSchema = z.object({
  handle: z.string().trim().min(1, "Enter your Lapse handle."),
});

// Fallback when email auto-match fails (Lapse account under a different
// email). Ownership is verified, not self-attested: the Lapse account's Slack
// id must match the signed-in user's Slack id from Hack Club auth, so nobody
// can link (and claim timelapses from) someone else's account.
export async function connectLapseHandleFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    if (!(await offPlatformBuilds())) {
      throw new Error("Off-platform builds aren't available right now.");
    }
    if (!lapseProgramKeyConfigured()) {
      throw new Error("Lapse isn't enabled on this deployment.");
    }
    const { handle } = lapseHandleSchema.parse({
      handle: formData.get("handle"),
    });
    const session = await requireSession();
    // Backfills from stored Hack Club auth tokens when the sign-in-time write
    // missed it, so long-lived sessions don't have to re-log in.
    const slackId = await ensureSlackId(session.user.id);
    if (!slackId) {
      throw new Error(
        "We can't verify Lapse ownership without a Slack account on your profile. Log out and back in with Hack Club, or use YouTube links instead.",
      );
    }
    const matched = await queryLapseUserByHandle(handle);
    if (!matched) {
      throw new Error(
        `No Lapse account found for handle "${handle}". Check the handle shown in your Lapse profile.`,
      );
    }
    if (!matched.slackId || matched.slackId !== slackId) {
      throw new Error(
        "That Lapse account belongs to a different Slack account, so we can't link it to you.",
      );
    }
    await storeLapseIdentity(session.user.id, matched);
    const projectId = Number(formData.get("projectId"));
    if (Number.isInteger(projectId) && projectId > 0) {
      revalidatePath(`/platform/projects/${projectId}/track`);
    }
    return { success: true };
  } catch (error) {
    return projectFormError(error);
  }
}

// Lists the user's published Lapse timelapses that aren't already attached to a
// journal entry, so the journal composer can offer them (fallout's model).
export async function listAvailableTimelapses(
  projectId: number,
): Promise<AvailableTimelapse[]> {
  if (!(await offPlatformBuilds())) return [];
  const session = await requireSession();
  const [owned] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
    .limit(1);
  if (!owned) return [];

  const all = await fetchSessionUserTimelapses(session);
  if (!all.length) return [];

  const claimed = await db
    .select({ lapseId: projectTimelapses.lapseId })
    .from(projectTimelapses)
    .where(eq(projectTimelapses.userId, session.user.id));
  const claimedIds = new Set(claimed.map((row) => row.lapseId));

  return all
    .filter((entry) => entry.playbackUrl && !claimedIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      playbackUrl: entry.playbackUrl,
      thumbnailUrl: entry.thumbnailUrl,
      durationSeconds: entry.durationSeconds,
      recordedAt: entry.recordedAt ? entry.recordedAt.toISOString() : null,
    }));
}

// Journal entries and their recordings are only editable while the project is
// a draft. The tracking page redirects once submitted, but server actions are
// invokable directly, so the invariant has to be enforced here: without it,
// journal text could be rewritten after review, and deleting a recording row
// would release the video to be re-claimed as fresh evidence on another
// project (hoursSpent is locked from recordings at submit time).
async function assertOwnedDraftProject(projectId: number, userId: string) {
  const [project] = await db
    .select({ status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) throw new Error("Project not found.");
  if (project.status !== "draft") {
    throw new Error(
      "This project has been submitted, so its journal can no longer be changed.",
    );
  }
}

// Creates a journal entry. Every entry must carry a recording, one of: 10+
// minutes of on-platform screen tracking, a Lapse timelapse, or a YouTube link.
export async function addExternalJournalFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    if (!(await offPlatformBuilds())) {
      throw new Error("Off-platform builds aren't available right now.");
    }
    const projectId = Number(formData.get("projectId"));
    if (!Number.isInteger(projectId)) throw new Error("Invalid project.");
    const content = String(formData.get("content") ?? "").trim();
    if (content.length < 10) throw new Error("Journal entry is too short.");
    if (content.length > 4000) throw new Error("Journal entry is too long.");
    const timelapseIds = formData
      .getAll("timelapseIds")
      .map((value) => String(value))
      .filter(Boolean);
    const youtubeIds = parseYouTubeVideoIds(
      String(formData.get("youtubeUrls") ?? ""),
    );

    const session = await requireSession();
    await assertOwnedDraftProject(projectId, session.user.id);

    const { lapseToInsert, youtubeFresh } = await resolveFreshRecordings(
      session,
      timelapseIds,
      youtubeIds,
    );

    // On-platform screen recording backs the entry once 10+ minutes are tracked
    // since the last entry (same gate as the editor's journaling rule).
    const unjournaledSeconds = await getUnjournaledSeconds(
      projectId,
      session.user.id,
    );
    const hasScreenRecording = unjournaledSeconds >= JOURNAL_MIN_SECONDS;

    if (!hasScreenRecording && !lapseToInsert.length && !youtubeFresh.length) {
      throw new Error(
        "Add a recording to this entry: 10+ minutes of screen tracking, a Lapse timelapse, or a YouTube link.",
      );
    }

    const [journal] = await db
      .insert(projectJournals)
      .values({
        projectId,
        userId: session.user.id,
        content,
        activeSecondsCovered: unjournaledSeconds,
      })
      .returning({ id: projectJournals.id });

    await insertRecordings(
      session,
      projectId,
      journal.id,
      lapseToInsert,
      youtubeFresh,
    );

    revalidatePath(`/platform/projects/${projectId}/track`);
    return { success: true, project: { id: projectId } };
  } catch (error) {
    return projectFormError(error);
  }
}

// Resolves the recordings a user picked into ones we can actually attach:
// Lapse timelapses they own and haven't claimed yet, and YouTube videos not
// already claimed by any entry (a video belongs to one entry globally).
async function resolveFreshRecordings(
  session: { user: { id: string; email: string } },
  timelapseIds: string[],
  youtubeIds: string[],
) {
  let lapseToInsert: Awaited<ReturnType<typeof fetchSessionUserTimelapses>> = [];
  if (timelapseIds.length) {
    const all = await fetchSessionUserTimelapses(session);
    const claimed = await db
      .select({ lapseId: projectTimelapses.lapseId })
      .from(projectTimelapses)
      .where(eq(projectTimelapses.userId, session.user.id));
    const claimedIds = new Set(claimed.map((row) => row.lapseId));
    lapseToInsert = all.filter(
      (entry) =>
        timelapseIds.includes(entry.id) &&
        entry.playbackUrl &&
        !claimedIds.has(entry.id),
    );
  }

  let youtubeFresh: string[] = [];
  if (youtubeIds.length) {
    const existing = await db
      .select({ lapseId: projectTimelapses.lapseId })
      .from(projectTimelapses)
      .where(inArray(projectTimelapses.lapseId, youtubeIds));
    const takenGlobally = new Set(existing.map((row) => row.lapseId));
    youtubeFresh = youtubeIds.filter((id) => !takenGlobally.has(id));
  }

  return { lapseToInsert, youtubeFresh };
}

// Attaches resolved recordings to a journal entry.
async function insertRecordings(
  session: { user: { id: string } },
  projectId: number,
  journalEntryId: number,
  lapseToInsert: Awaited<ReturnType<typeof fetchSessionUserTimelapses>>,
  youtubeFresh: string[],
) {
  if (lapseToInsert.length) {
    await db
      .insert(projectTimelapses)
      .values(
        lapseToInsert.map((entry) => ({
          projectId,
          journalEntryId,
          userId: session.user.id,
          lapseId: entry.id,
          name: entry.name,
          playbackUrl: entry.playbackUrl,
          thumbnailUrl: entry.thumbnailUrl,
          durationSeconds: entry.durationSeconds,
          hackatimeProject: entry.hackatimeProject,
          recordedAt: entry.recordedAt,
          syncedAt: new Date(),
        })),
      )
      .onConflictDoNothing();
  }

  if (youtubeFresh.length) {
    await db
      .insert(projectTimelapses)
      .values(
        youtubeFresh.map((videoId) => ({
          projectId,
          journalEntryId,
          userId: session.user.id,
          lapseId: videoId,
          name: "YouTube video",
          playbackUrl: youtubeWatchUrl(videoId),
          thumbnailUrl: youtubeThumbnail(videoId),
          durationSeconds: 0,
          hackatimeProject: "",
          recordedAt: null,
          syncedAt: new Date(),
        })),
      )
      .onConflictDoNothing();
  }
}

// Edit an existing journal entry: update its text and optionally attach more
// recordings. Owner-only and draft-only (assertOwnedDraftProject).
export async function updateExternalJournalFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    if (!(await offPlatformBuilds())) {
      throw new Error("Off-platform builds aren't available right now.");
    }
    const projectId = Number(formData.get("projectId"));
    const journalId = Number(formData.get("journalId"));
    if (!Number.isInteger(projectId) || !Number.isInteger(journalId)) {
      throw new Error("Invalid entry.");
    }
    const content = String(formData.get("content") ?? "").trim();
    if (content.length < 10) throw new Error("Journal entry is too short.");
    if (content.length > 4000) throw new Error("Journal entry is too long.");
    const timelapseIds = formData
      .getAll("timelapseIds")
      .map((value) => String(value))
      .filter(Boolean);
    const youtubeIds = parseYouTubeVideoIds(
      String(formData.get("youtubeUrls") ?? ""),
    );

    const session = await requireSession();
    await assertOwnedDraftProject(projectId, session.user.id);
    const [entry] = await db
      .select({ id: projectJournals.id })
      .from(projectJournals)
      .where(
        and(
          eq(projectJournals.id, journalId),
          eq(projectJournals.projectId, projectId),
          eq(projectJournals.userId, session.user.id),
        ),
      )
      .limit(1);
    if (!entry) throw new Error("Entry not found.");

    await db
      .update(projectJournals)
      .set({ content, updatedAt: new Date() })
      .where(eq(projectJournals.id, journalId));

    if (timelapseIds.length || youtubeIds.length) {
      const { lapseToInsert, youtubeFresh } = await resolveFreshRecordings(
        session,
        timelapseIds,
        youtubeIds,
      );
      await insertRecordings(
        session,
        projectId,
        journalId,
        lapseToInsert,
        youtubeFresh,
      );
    }

    revalidatePath(`/platform/projects/${projectId}/track`);
    return { success: true, project: { id: projectId } };
  } catch (error) {
    return projectFormError(error);
  }
}

// Detach a recording (Lapse timelapse or YouTube video) from its journal entry.
// Deleting the row releases the video so it can be attached elsewhere again.
export async function removeJournalRecording(
  timelapseId: number,
): Promise<void> {
  if (!(await offPlatformBuilds())) {
    throw new Error("Off-platform builds aren't available right now.");
  }
  if (!Number.isInteger(timelapseId)) throw new Error("Invalid recording.");
  const session = await requireSession();
  const [row] = await db
    .select({
      projectId: projectTimelapses.projectId,
      projectStatus: projects.status,
    })
    .from(projectTimelapses)
    .innerJoin(projects, eq(projects.id, projectTimelapses.projectId))
    .where(
      and(
        eq(projectTimelapses.id, timelapseId),
        eq(projectTimelapses.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!row) return;
  if (row.projectStatus !== "draft") {
    throw new Error(
      "This project has been submitted, so its recordings can no longer be removed.",
    );
  }
  await db
    .delete(projectTimelapses)
    .where(
      and(
        eq(projectTimelapses.id, timelapseId),
        eq(projectTimelapses.userId, session.user.id),
      ),
    );
  revalidatePath(`/platform/projects/${row.projectId}/track`);
}

const externalSubmitSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  gitUrl: customShipSchema.shape.gitUrl,
  screenshotUrl: customShipSchema.shape.screenshotUrl,
});

export async function submitExternalProjectFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    if (!(await offPlatformBuilds())) {
      throw new Error("Off-platform builds aren't available right now.");
    }
    const parsed = externalSubmitSchema.parse({
      projectId: formData.get("projectId"),
      gitUrl: formData.get("gitUrl"),
      screenshotUrl: formData.get("screenshotUrl"),
    });
    const session = await requireSession();
    const claims = await assertHackClubYswsEligible(session.user.id);
    const shipping = shippingFromClaims(session, claims);

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, parsed.projectId),
          eq(projects.userId, session.user.id),
        ),
      )
      .limit(1);
    if (!project) throw new Error("Project not found.");

    await assertCustomGitRepoReady(parsed.gitUrl);

    // Hours are measured, not self-reported: on-platform tracked time plus the
    // durations of the recordings attached to this build.
    const tracked = await trackedSecondsFor(parsed.projectId, session.user.id);
    const [recordingRow] = await db
      .select({
        total: sql<number>`coalesce(sum(${projectTimelapses.durationSeconds}), 0)::int`,
      })
      .from(projectTimelapses)
      .where(eq(projectTimelapses.projectId, parsed.projectId));
    const totalSeconds = tracked + (recordingRow?.total ?? 0);
    const hoursSpent = Math.max(0, Math.ceil(totalSeconds / 3600));

    const owner = { userId: session.user.id, email: session.user.email };
    const data: CustomShipInput = {
      gitUrl: parsed.gitUrl,
      screenshotUrl: parsed.screenshotUrl,
      hoursSpent,
      email: shipping.email,
      addressLine1: shipping.addressLine1,
      addressLine2: shipping.addressLine2,
      city: shipping.city,
      region: shipping.region,
      country: shipping.country,
      postalCode: shipping.postalCode,
      birthday: shipping.birthday,
      firstName: shipping.firstName,
      lastName: shipping.lastName,
    };
    await shipCustomProjectForUser(owner, parsed.projectId, data);
    await notifyReviewSubmitted(parsed.projectId, "materials");
    revalidatePath("/platform/projects");
    revalidatePath("/platform/admin/review");

    return { success: true, project: { id: parsed.projectId } };
  } catch (error) {
    return projectFormError(error);
  }
}

export async function confirmKitReceivedFromForm(formData: FormData) {
  const projectId = Number(formData.get("projectId"));
  if (!Number.isInteger(projectId)) throw new Error("Invalid project.");
  const session = await requireSession();
  await confirmKitReceivedForUser(
    { userId: session.user.id, email: session.user.email },
    projectId,
  );
  revalidatePath("/platform/projects");
}

export async function submitDemoFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    const projectId = Number(formData.get("projectId"));
    if (!Number.isInteger(projectId)) throw new Error("Invalid project.");
    const data: DemoInput = demoSubmissionSchema.parse({
      playableUrl: formData.get("playableUrl") ?? "",
      demoVideoUrl: formData.get("demoVideoUrl"),
    });
    const session = await requireSession();
    const [project] = await db
      .select({ codeUrl: projects.codeUrl })
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
      )
      .limit(1);
    if (!project) throw new Error("Project not found.");
    await assertDemoRepoReady(project.codeUrl, data.demoVideoUrl);
    await submitDemoForUser(
      { userId: session.user.id, email: session.user.email },
      projectId,
      data,
    );
    await notifyReviewSubmitted(projectId, "demo");
    revalidatePath("/platform/projects");
    revalidatePath("/platform/admin/review");
    return {
      success: true,
      project: { id: projectId, ...data, status: "demo_review" },
    };
  } catch (error) {
    return projectFormError(error);
  }
}

export async function archiveProjectFromForm(formData: FormData) {
  const projectId = Number(formData.get("projectId"));
  if (!Number.isInteger(projectId)) throw new Error("Invalid project.");
  const session = await requireSession();
  await archiveProjectForUser(
    { userId: session.user.id, email: session.user.email },
    projectId,
  );
  revalidatePath("/platform/projects");
}
