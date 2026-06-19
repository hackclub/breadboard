"use server";

import { db } from "@/lib/db/db";
import { emailSignups } from "@/lib/db/schema";
import { isValidEmail } from "@/lib/utils";
import type { SignupState } from "@/types";

export async function subscribe(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!isValidEmail(email)) {
    return {
      success: false,
      message: "Please enter a valid email address.",
      email,
    };
  }

  try {
    await db.insert(emailSignups).values({ email }).onConflictDoNothing();
    return {
      success: true,
      message: "Thanks! I'll email you with more details soon.",
      email: "",
    };
  } catch (error) {
    console.error("Failed to save email signup", error);
    return {
      success: false,
      message: "Unable to save your email right now. Please try again.",
      email,
    };
  }
}
