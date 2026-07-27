"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { user, userBread } from "@/lib/db/schema";
import {
  isValidEmail,
  MAX_ADJUSTMENT_REASON_LENGTH,
  normalizeBread,
} from "@/lib/utils";
import { audit } from "@/lib/audit";
import { recordCurrencyTransaction } from "@/lib/projects/ledger";

// Production strips thrown Server Action messages down to an opaque digest, so
// anything the admin needs to read (validation, conflicts) comes back as data.
export type AdminUserActionResult =
  | { success: true }
  | { success: false; message: string };

const failed = (message: string): AdminUserActionResult => ({
  success: false,
  message,
});

export async function updateUserProfile(
  userId: string,
  data: {
    name: string;
    email: string;
    image: string;
    emailVerified: boolean;
    admin: boolean;
    yswsExempt: boolean;
  },
): Promise<AdminUserActionResult> {
  const session = await requireAdminSession();
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  const image = data.image.trim();

  if (!name) return failed("Name is required");
  if (!isValidEmail(email)) return failed("Valid email is required");
  if (session.user.id === userId && !data.admin) {
    return failed("You cannot remove your own admin access");
  }

  const [updatedUser] = await db
    .update(user)
    .set({
      name,
      email,
      image: image || null,
      emailVerified: data.emailVerified,
      admin: data.admin,
      yswsExempt: data.yswsExempt,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (!updatedUser) return failed("User not found");

  await audit("admin.user.profile_updated", "user", userId, {
    name,
    email,
    admin: data.admin,
    yswsExempt: data.yswsExempt,
  });
  revalidatePath("/platform/admin/users");
  return { success: true };
}

export type BalanceCurrency = "bread" | "gold";

type AdjustMode = "add" | "deduct" | "set";

const AUDIT_ACTION: Record<AdjustMode, string> = {
  add: "admin.user.bread_add",
  deduct: "admin.user.bread_deduct",
  set: "admin.user.bread_set",
};

// Every manual balance move goes through here so the reason, the currency, and
// the resulting balance always land on the same currency_transactions row. That
// ledger row is the per-user record of why an admin touched the balance.
async function adjustBalance(
  mode: AdjustMode,
  userId: string,
  amount: number,
  currency: BalanceCurrency,
  rawReason: string,
): Promise<AdminUserActionResult> {
  const session = await requireAdminSession();
  const value = normalizeBread(amount);
  const reason = String(rawReason ?? "").trim();

  if (currency !== "bread" && currency !== "gold") {
    return failed("Unknown currency");
  }
  if (!reason) return failed("A reason is required");
  if (reason.length > MAX_ADJUSTMENT_REASON_LENGTH) {
    return failed(
      `Reason must be ${MAX_ADJUSTMENT_REASON_LENGTH} characters or fewer`,
    );
  }
  if (mode !== "set" && value <= 0) {
    return failed("Amount must be greater than zero");
  }

  const gold = currency === "gold";
  const column = gold ? userBread.goldBalance : userBread.balance;

  await db.transaction(async (tx) => {
    // Lock the row for the transaction so the read-modify-write below can't
    // race another payout or purchase touching the same balance.
    const [existing] = await tx
      .select({ balance: column })
      .from(userBread)
      .where(eq(userBread.userId, userId))
      .limit(1)
      .for("update");
    const before = existing?.balance ?? 0;

    // Deducting is floored at zero, so the amount actually removed can be less
    // than what was asked for when the user had a smaller balance.
    const after =
      mode === "add"
        ? before + value
        : mode === "deduct"
          ? Math.max(before - value, 0)
          : value;

    await tx
      .insert(userBread)
      .values({
        userId,
        ...(gold ? { goldBalance: after } : { balance: after }),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userBread.userId,
        set: {
          ...(gold ? { goldBalance: after } : { balance: after }),
          updatedAt: new Date(),
        },
      });

    await recordCurrencyTransaction(tx, {
      userId,
      actorId: session.user.id,
      type: "admin_adjustment",
      currency,
      amount: after - before,
      balanceAfter: after,
      note: reason,
    });
  });

  await audit(AUDIT_ACTION[mode], "user", userId, {
    amount: value,
    currency,
    reason,
  });
  revalidatePath("/platform/admin/users");
  return { success: true };
}

export async function addUserBread(
  userId: string,
  amount: number,
  currency: BalanceCurrency,
  reason: string,
) {
  return adjustBalance("add", userId, amount, currency, reason);
}

export async function deductUserBread(
  userId: string,
  amount: number,
  currency: BalanceCurrency,
  reason: string,
) {
  return adjustBalance("deduct", userId, amount, currency, reason);
}

export async function setUserBread(
  userId: string,
  amount: number,
  currency: BalanceCurrency,
  reason: string,
) {
  return adjustBalance("set", userId, amount, currency, reason);
}

export async function deleteUser(
  userId: string,
): Promise<AdminUserActionResult> {
  const session = await requireAdminSession();
  if (session.user.id === userId) return failed("You cannot delete yourself");

  const [deletedUser] = await db
    .delete(user)
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (!deletedUser) return failed("User not found");
  await audit("admin.user.deleted", "user", userId);
  revalidatePath("/platform/admin/users");
  revalidatePath("/platform/admin/orders");
  revalidatePath("/platform/admin/fulfillment");
  return { success: true };
}
