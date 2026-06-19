"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { user, userBread } from "@/lib/db/schema";
import { isValidEmail, normalizeBread } from "@/lib/utils";
import { audit } from "@/lib/audit";

export async function updateUserProfile(
  userId: string,
  data: {
    name: string;
    email: string;
    image: string;
    emailVerified: boolean;
    admin: boolean;
  },
) {
  const session = await requireAdminSession();
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  const image = data.image.trim();

  if (!name) throw new Error("Name is required");
  if (!isValidEmail(email)) throw new Error("Valid email is required");
  if (session.user.id === userId && !data.admin) {
    throw new Error("You cannot remove your own admin access");
  }

  const [updatedUser] = await db
    .update(user)
    .set({
      name,
      email,
      image: image || null,
      emailVerified: data.emailVerified,
      admin: data.admin,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (!updatedUser) throw new Error("User not found");

  await audit("admin.user.profile_updated", "user", userId, {
    name,
    email,
    admin: data.admin,
  });
  revalidatePath("/platform/admin/users");
}

export async function addUserBread(userId: string, amount: number) {
  await requireAdminSession();
  const bread = normalizeBread(amount);
  if (bread <= 0) throw new Error("Amount must be greater than zero");

  await db
    .insert(userBread)
    .values({ userId, balance: bread, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userBread.userId,
      set: {
        balance: sql`${userBread.balance} + ${bread}`,
        updatedAt: new Date(),
      },
    });

  await audit("admin.user.bread_add", "user", userId, { amount: bread });
  revalidatePath("/platform/admin/users");
}

export async function deductUserBread(userId: string, amount: number) {
  await requireAdminSession();
  const bread = normalizeBread(amount);
  if (bread <= 0) throw new Error("Amount must be greater than zero");

  await db
    .insert(userBread)
    .values({ userId, balance: 0, updatedAt: new Date() })
    .onConflictDoNothing({ target: userBread.userId });

  await db
    .update(userBread)
    .set({
      balance: sql`greatest(${userBread.balance} - ${bread}, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(userBread.userId, userId));

  await audit("admin.user.bread_deduct", "user", userId, { amount: bread });
  revalidatePath("/platform/admin/users");
}

export async function setUserBread(userId: string, amount: number) {
  await requireAdminSession();
  const bread = normalizeBread(amount);

  await db
    .insert(userBread)
    .values({ userId, balance: bread, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userBread.userId,
      set: { balance: bread, updatedAt: new Date() },
    });

  await audit("admin.user.bread_set", "user", userId, { amount: bread });
  revalidatePath("/platform/admin/users");
}

export async function deleteUser(userId: string) {
  const session = await requireAdminSession();
  if (session.user.id === userId) throw new Error("You cannot delete yourself");

  const [deletedUser] = await db
    .delete(user)
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (!deletedUser) throw new Error("User not found");
  await audit("admin.user.deleted", "user", userId);
  revalidatePath("/platform/admin/users");
  revalidatePath("/platform/admin/orders");
  revalidatePath("/platform/admin/fulfillment");
}
