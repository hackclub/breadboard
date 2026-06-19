import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { LoginButton } from "@/components/shared/auth-buttons";
import { DocsFrame, PageHero } from "@/components/shared/platform-docs-frame";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { orderItems, orders, products, user } from "@/lib/db/schema";
import { OrderRow } from "@/components/platform/admin-order-row";

export default async function AdminOrdersPage() {
  const session = await getSession();
  if (!session) {
    return (
      <DocsFrame sidebar={false}>
        <PageHero title="Admin Orders" />
        <div className="mt-4">
          <LoginButton callbackURL="/platform/admin/orders" />
        </div>
      </DocsFrame>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <>
        <PageHero title="Admin Orders" />
        <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-6 shadow-[4px_4px_0_#000]">
          <p className="text-xl font-black text-black">Admin access required</p>
        </div>
      </>
    );
  }

  const allOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      trackingInfo: orders.trackingInfo,
      totalCost: orders.totalCost,
      createdAt: orders.createdAt,
      userEmail: user.email,
    })
    .from(orders)
    .innerJoin(user, eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt));

  const ordersWithItems = await Promise.all(
    allOrders.map(async (o) => {
      const items = await db
        .select({
          name: products.name,
          imageUrl: products.imageUrl,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, o.id));

      return {
        ...o,
        items,
      };
    }),
  );

  return (
    <DocsFrame sidebar={false}>
      <PageHero title="Admin Orders">
        <div className="mt-3 flex gap-3">
          <Link
            href="/platform/admin"
            className="rounded border border-black px-4 py-2 text-sm transition hover:bg-black hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/platform/admin/fulfillment"
            className="rounded border border-black bg-[#BD0F32] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            Fulfillment
          </Link>
        </div>
      </PageHero>

      <section className="mx-auto max-w-[1440px] px-6 py-12">
        <div className="space-y-4">
          {ordersWithItems.map((o) => (
            <OrderRow
              key={o.id}
              orderId={o.id}
              currentStatus={o.status}
              currentTracking={o.trackingInfo}
              userEmail={o.userEmail}
              totalCost={o.totalCost}
              items={o.items}
              createdAt={new Date(o.createdAt).toLocaleDateString()}
            />
          ))}
        </div>
      </section>
    </DocsFrame>
  );
}
