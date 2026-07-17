"use server";

import { db } from "@/lib/db/db";
import { emailSignups, user } from "@/lib/db/schema";
import { syncWaitlistEmailToLoops } from "@/lib/loops/sync";
import { isValidEmail } from "@/lib/utils";
import type { SignupState } from "@/types";
import { eq } from "drizzle-orm";

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
    const existingUser = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, email),
    });

    if (existingUser) {
      return {
        success: true,
        message: "You already have an account. Taking you to login...",
        email: "",
        promptLogin: true,
      };
    }

    await db.insert(emailSignups).values({ email }).onConflictDoNothing();
    await syncWaitlistEmailToLoops(email);
    return {
      success: true,
      message: "You're in! Taking you to login...",
      email: "",
      promptLogin: true,
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
