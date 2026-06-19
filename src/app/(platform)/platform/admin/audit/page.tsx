import { desc } from "drizzle-orm";
import type { ReactNode } from "react";
import { LoginButton } from "@/components/shared/auth-buttons";
import { AuditTable } from "@/components/platform/audit-table";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { auditLogs } from "@/lib/db/schema";

function AccessCard({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <main className="max-w-3xl rounded-[18px] border border-black bg-white p-6 shadow-[5px_5px_0_#000]">
      <p className="text-xs font-black tracking-[0.18em] text-[#BD0F32] uppercase">
        Audit
      </p>
      <h1 className="mt-2 text-3xl font-black text-black">{title}</h1>
      <p className="mt-2 text-sm text-black/60">{message}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </main>
  );
}

export default async function AdminAuditPage() {
  const session = await getSession();
  if (!session) {
    return (
      <AccessCard
        title="Audit log"
        message="Log in to inspect platform activity."
      >
        <LoginButton callbackURL="/platform/admin/audit" />
      </AccessCard>
    );
  }
  if (!(await isAdminSession(session))) {
    return <AccessCard title="Audit log" message="Admin access is required." />;
  }

  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(500);

  return (
    <main className="max-w-6xl">
      <AuditTable
        entries={rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
