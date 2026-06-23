import { desc } from "drizzle-orm";
import Link from "next/link";
import { BreadAmount } from "@/components/shared/bread-amount";
import { LoginButton } from "@/components/shared/auth-buttons";
import { DocsFrame, PageHero } from "@/components/shared/platform-docs-frame";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard, StatGrid } from "@/components/ui/stats";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { account, orders, session, user, userBread } from "@/lib/db/schema";
import { AdminUsersTable } from "@/components/platform/admin-users-table";

export default async function AdminUsersPage() {
  const currentSession = await getSession();

  if (!currentSession) {
    return (
      <DocsFrame sidebar={false}>
        <PageHero title="Admin Users" />
        <div className="mt-4">
          <LoginButton callbackURL="/platform/admin/users" />
        </div>
      </DocsFrame>
    );
  }
  if (!(await isAdminSession(currentSession))) {
    return (
      <>
        <PageHero title="User Admin" />
        <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-6 shadow-[4px_4px_0_#000]">
          <p className="text-xl font-black text-black">Admin access required</p>
        </div>
      </>
    );
  }

  const [allUsers, balances, allOrders, accounts, activeSessions] =
    await Promise.all([
      db.select().from(user).orderBy(desc(user.createdAt)),
      db.select().from(userBread),
      db.select({ userId: orders.userId, status: orders.status }).from(orders),
      db
        .select({ userId: account.userId, providerId: account.providerId })
        .from(account),
      db.select({ userId: session.userId }).from(session),
    ]);

  const balanceByUser = new Map(
    balances.map((balance) => [balance.userId, balance.balance]),
  );
  const orderStatsByUser = new Map<
    string,
    { orderCount: number; pendingOrderCount: number }
  >();
  for (const order of allOrders) {
    const stats = orderStatsByUser.get(order.userId) ?? {
      orderCount: 0,
      pendingOrderCount: 0,
    };
    stats.orderCount += 1;
    if (order.status === "pending") stats.pendingOrderCount += 1;
    orderStatsByUser.set(order.userId, stats);
  }

  const providersByUser = new Map<string, string[]>();
  for (const accountRow of accounts) {
    providersByUser.set(accountRow.userId, [
      ...(providersByUser.get(accountRow.userId) ?? []),
      accountRow.providerId,
    ]);
  }

  const sessionsByUser = new Map<string, number>();
  for (const sessionRow of activeSessions) {
    sessionsByUser.set(
      sessionRow.userId,
      (sessionsByUser.get(sessionRow.userId) ?? 0) + 1,
    );
  }

  const users = allUsers.map((row) => {
    const stats = orderStatsByUser.get(row.id) ?? {
      orderCount: 0,
      pendingOrderCount: 0,
    };

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      slackId: row.slackId,
      emailVerified: row.emailVerified,
      admin: row.admin,
      createdAt: row.createdAt.toLocaleString(),
      updatedAt: row.updatedAt.toLocaleString(),
      balance: balanceByUser.get(row.id) ?? 0,
      orderCount: stats.orderCount,
      pendingOrderCount: stats.pendingOrderCount,
      accountProviders: providersByUser.get(row.id) ?? [],
      activeSessionCount: sessionsByUser.get(row.id) ?? 0,
    };
  });

  const totalBread = users.reduce((sum, row) => sum + row.balance, 0);

  return (
    <DocsFrame sidebar={false}>
      <PageHero title="User Admin">
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/platform/admin"
            className={buttonClass({ tone: "paper", size: "sm" })}
          >
            Dashboard
          </Link>
          <Link
            href="/platform/admin/orders"
            className={buttonClass({ tone: "paper", size: "sm" })}
          >
            Orders
          </Link>
        </div>
      </PageHero>

      <section className="mx-auto max-w-[1440px] px-2 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <StatGrid>
            <StatCard label="Users" value={users.length} tone="cream" />
            <StatCard
              label="Total bread"
              value={<BreadAmount amount={totalBread} />}
              tone="green"
            />
            <StatCard
              label="Active sessions"
              value={activeSessions.length}
              tone="blue"
            />
          </StatGrid>
        </div>

        <div className="space-y-4">
          <AdminUsersTable
            users={users}
            currentUserId={currentSession.user.id}
          />
          {users.length === 0 ? (
            <EmptyState
              title="No users yet"
              description="No platform accounts have been created."
            />
          ) : null}
        </div>
      </section>
    </DocsFrame>
  );
}
