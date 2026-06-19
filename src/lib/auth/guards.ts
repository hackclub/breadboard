import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Session } from "@/lib/auth/config";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

export async function isAdminSession(session: Session | null | undefined) {
  if (!session?.user.id) return false;
  const rows = await db
    .select({ admin: user.admin })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  return rows[0]?.admin === true;
}

export async function requireAdminSession() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!(await isAdminSession(session))) {
    throw new Error("Admin access required");
  }
  return session;
}
