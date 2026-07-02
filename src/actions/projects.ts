"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { HackClubClaims } from "@/lib/auth/hackclub";
import { assertHackClubYswsEligible } from "@/lib/auth/hackclub";
import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectJournals,
  projects,
} from "@/lib/db/schema";
import { and, count, eq, sql } from "drizzle-orm";
import {
  archiveProjectForUser,
  confirmKitReceivedForUser,
  createProjectForUser,
  shipCustomProjectForUser,
  shipProjectForUser,
  submitDemoForUser,
  updateProjectBasicsForUser,
} from "@/lib/projects/mutations";
import { fetchHackatimeProjectSeconds } from "@/lib/hackatime";
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
    const { title, description, screenshotUrl } = projectBasicsSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      screenshotUrl: formData.get("screenshotUrl") ?? "",
    });

    if (!Number.isInteger(projectId)) throw new Error("Invalid project.");
    const session = await requireSession();
    await updateProjectBasicsForUser(
      { userId: session.user.id, email: session.user.email },
      { projectId, title, description, screenshotUrl },
    );
    revalidatePath("/platform/projects");

    return {
      success: true,
      project: {
        id: projectId,
        title: title || "Untitled project",
        description,
        screenshotUrl,
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
});

// Off-platform builds are created as ordinary drafts so they accrue tracked
// time, screen evidence, and journals through the same pipeline as the editor
// before they're submitted for review.
export async function createExternalDraftFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    if (!(await offPlatformBuilds())) {
      throw new Error("Off-platform builds aren't available right now.");
    }
    const { title, description, kitType } = externalDraftSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      kitType: formData.get("kitType") ?? "arduino",
    });
    const session = await requireSession();
    const projectId = await createProjectForUser(
      { userId: session.user.id, email: session.user.email },
      { title, description, kitType },
    );
    await db
      .update(projects)
      .set({ submissionSource: "manual", updatedAt: new Date() })
      .where(
        and(eq(projects.id, projectId), eq(projects.userId, session.user.id)),
      );
    revalidatePath("/platform/projects");
    return { success: true, project: { id: projectId } };
  } catch (error) {
    return projectFormError(error);
  }
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

const hackatimeConnectSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  apiKey: z.string().trim().min(1, "Enter your Hackatime API key."),
  username: z.string().trim().min(1, "Enter your Hackatime username."),
  projectName: z.string().trim().min(1, "Enter the Hackatime project name."),
});

// Pulls the linked Hackatime project's tracked seconds and stores them (never
// the API key). Lapse time syncs into Hackatime, so this covers both tools.
export async function connectHackatimeFromForm(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  try {
    if (!(await offPlatformBuilds())) {
      throw new Error("Off-platform builds aren't available right now.");
    }
    const parsed = hackatimeConnectSchema.parse({
      projectId: formData.get("projectId"),
      apiKey: formData.get("apiKey"),
      username: formData.get("username"),
      projectName: formData.get("projectName"),
    });
    const session = await requireSession();
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

    const pull = await fetchHackatimeProjectSeconds(
      parsed.apiKey,
      parsed.username,
      parsed.projectName,
    );
    await db
      .update(projects)
      .set({
        hackatimeUsername: pull.username,
        hackatimeProjectName: pull.projectName,
        hackatimeSeconds: pull.seconds,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, parsed.projectId),
          eq(projects.userId, session.user.id),
        ),
      );
    revalidatePath(`/platform/projects/${parsed.projectId}/track`);
    return {
      success: true,
      project: { id: parsed.projectId, hoursSpent: Math.ceil(pull.seconds / 3600) },
    };
  } catch (error) {
    return projectFormError(error);
  }
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
      .select({ hackatimeSeconds: projects.hackatimeSeconds })
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

    // Hours are measured, not self-reported: tracked editor/screen-share time
    // plus the linked Hackatime project's time.
    const tracked = await trackedSecondsFor(parsed.projectId, session.user.id);
    const totalSeconds = tracked + (project.hackatimeSeconds ?? 0);
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
