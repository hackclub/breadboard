"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import {
  archiveProjectForUser,
  confirmKitReceivedForUser,
  createProjectForUser,
  shipProjectForUser,
  submitDemoForUser,
  updateProjectBasicsForUser,
} from "@/lib/projects/mutations";
import type { DemoInput, ProjectFormState, ShipInput } from "@/types";

const projectBasicsSchema = z.object({
  title: z.string().trim().min(1, "Project title is required"),
  description: z.string().trim().max(2000).default(""),
  screenshotUrl: z.string().trim().max(2048).default(""),
});

const createProjectSchema = projectBasicsSchema
  .pick({ title: true, description: true })
  .extend({ kitType: z.enum(["arduino", "esp32"]).default("arduino") });

const shipProjectSchema = z.object({
  email: z.email("A valid email is required").trim(),
  codeUrl: z.url("Published GitHub repo URL is required").trim().max(2048),
  screenshotUrl: z
    .string()
    .trim()
    .min(1, "Screenshot URL is required")
    .max(2048),
  addressLine1: z.string().trim().min(1, "Address line 1 is required").max(200),
  addressLine2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1, "City is required").max(120),
  region: z.string().trim().min(1, "State / Province is required").max(120),
  country: z.string().trim().min(1, "Country is required").max(120),
  postalCode: z.string().trim().min(1, "ZIP / Postal Code is required").max(40),
  birthday: z.string().trim().min(1, "Birthday is required").max(40),
  firstName: z.string().trim().min(1, "First name is required").max(120),
  lastName: z.string().trim().min(1, "Last name is required").max(120),
});

const demoSubmissionSchema = z.object({
  playableUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) => value === "" || value.startsWith("/share/"),
      "Demo link must be the Breadboard read-only share link.",
    ),
  demoVideoUrl: z.url("Upload a working demo video first").trim().max(2048),
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
  const firmware = await fetchGitHubText(owner, repo, "firmware/sketch.ino");
  if (!firmware.trim())
    throw new Error("Publish a firmware file before submitting.");
}

async function assertDemoRepoReady(codeUrl: string, demoVideoUrl: string) {
  await assertMaterialsRepoReady(codeUrl);
  const { owner, repo } = parseGitHubRepoUrl(codeUrl);
  const readme = await fetchGitHubText(owner, repo, "README.md");
  const lower = readme.toLowerCase();
  if (!lower.includes("build journal")) {
    throw new Error("README needs build journal evidence before demo review.");
  }
  if (!readme.includes(demoVideoUrl)) {
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

    const data: ShipInput = shipProjectSchema.parse({
      email: formData.get("email"),
      codeUrl: formData.get("codeUrl"),
      screenshotUrl: formData.get("screenshotUrl"),
      addressLine1: formData.get("addressLine1"),
      addressLine2: formData.get("addressLine2") ?? "",
      city: formData.get("city"),
      region: formData.get("region"),
      country: formData.get("country"),
      postalCode: formData.get("postalCode"),
      birthday: formData.get("birthday"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
    });
    await assertMaterialsRepoReady(data.codeUrl);

    const session = await requireSession();
    const tracked = await shipProjectForUser(
      { userId: session.user.id, email: session.user.email },
      projectId,
      data,
    );
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
    const codeUrl = String(formData.get("codeUrl") ?? "");
    await assertDemoRepoReady(codeUrl, data.demoVideoUrl);
    await submitDemoForUser(
      { userId: session.user.id, email: session.user.email },
      projectId,
      data,
    );
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
