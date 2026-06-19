import { revalidatePath } from "next/cache";
import { getSession, requireAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { auditLogs } from "@/lib/db/schema";

async function writeAudit(params: {
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    actorName: params.actorName,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    details: params.details ?? null,
  });
}

export async function audit(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>,
) {
  const session = await getSession();
  if (!session) return;
  await writeAudit({
    actorId: session.user.id,
    actorName: session.user.name,
    action,
    entityType,
    entityId,
    details,
  });
}

export async function revalidateAndAudit(
  action: string,
  entityType: string,
  path: string,
  entityId?: string,
  details?: Record<string, unknown>,
) {
  await audit(action, entityType, entityId, details);
  revalidatePath(path);
}
