"use server";

import { db } from "@/lib/db/db";
import { emailSignups, user } from "@/lib/db/schema";
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
        existingUser: true,
      };
    }

    await db.insert(emailSignups).values({ email }).onConflictDoNothing();
    return {
      success: true,
      message: "Thanks! We'll email you with more details soon.",
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
