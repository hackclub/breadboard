"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import {
  createProjectForUser,
  shipProjectForUser,
  updateProjectBasicsForUser,
} from "@/lib/projects/mutations";
import type { ProjectFormState, ShipInput } from "@/types";

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
  playableUrl: z.string().trim().min(1, "Playable URL is required").max(2048),
  codeUrl: z.string().trim().min(1, "Code URL is required").max(2048),
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
      playableUrl: formData.get("playableUrl"),
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

    const session = await requireSession();
    await shipProjectForUser(
      { userId: session.user.id, email: session.user.email },
      projectId,
      data,
    );
    revalidatePath("/platform/projects");
    revalidatePath("/platform/admin/review");

    return {
      success: true,
      project: { id: projectId, ...data, status: "shipped", reviewNote: "" },
    };
  } catch (error) {
    return projectFormError(error);
  }
}
