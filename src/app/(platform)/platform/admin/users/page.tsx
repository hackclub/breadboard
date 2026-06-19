import { desc } from "drizzle-orm";
import Link from "next/link";
import { LoginButton } from "@/components/shared/auth-buttons";
import { DocsFrame, PageHero } from "@/components/shared/platform-docs-frame";
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
            className="rounded border border-black px-4 py-2 text-sm transition hover:bg-black hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/platform/admin/orders"
            className="rounded border border-black px-4 py-2 text-sm transition hover:bg-black hover:text-white"
          >
            Orders
          </Link>
        </div>
      </PageHero>

      <section className="mx-auto max-w-[1440px] px-2 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[12px] border-[1.1px] border-black bg-[#fffaf1] p-6 text-center shadow-[4px_4px_0_#000]">
            <p className="text-3xl font-black text-black">{users.length}</p>
            <p className="text-sm font-bold text-black/55">Users</p>
          </div>
          <div className="rounded-[12px] border-[1.1px] border-black bg-green-50 p-6 text-center shadow-[4px_4px_0_#000]">
            <p className="text-3xl font-black text-green-800">{totalBread}</p>
            <p className="text-sm font-bold text-green-700">Total bread</p>
          </div>
          <div className="rounded-[12px] border-[1.1px] border-black bg-blue-50 p-6 text-center shadow-[4px_4px_0_#000]">
            <p className="text-3xl font-black text-blue-800">
              {activeSessions.length}
            </p>
            <p className="text-sm font-bold text-blue-700">Active sessions</p>
          </div>
        </div>

        <div className="space-y-4">
          <AdminUsersTable
            users={users}
            currentUserId={currentSession.user.id}
          />
          {users.length === 0 ? (
            <div className="rounded-[20px] border-[1.5px] border-dashed border-black bg-white p-8 text-center shadow-[5px_5px_0_#000]">
              <p className="text-xl font-black text-black">No users yet</p>
            </div>
          ) : null}
        </div>
      </section>
    </DocsFrame>
  );
}
