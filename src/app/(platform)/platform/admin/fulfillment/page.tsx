import { asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { LoginButton } from "@/components/shared/auth-buttons";
import { DocsFrame, PageHero } from "@/components/shared/platform-docs-frame";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { orderItems, orders, products, user } from "@/lib/db/schema";
import { FulfillmentCard } from "@/components/platform/fulfillment-card";

export default async function FulfillmentPage() {
  const session = await getSession();
  if (!session) {
    return (
      <DocsFrame sidebar={false}>
        <PageHero title="Fulfillment" />
        <div className="mt-4">
          <LoginButton callbackURL="/platform/admin/fulfillment" />
        </div>
      </DocsFrame>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <>
        <PageHero title="Fulfillment" />
        <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-6 shadow-[4px_4px_0_#000]">
          <p className="text-xl font-black text-black">Admin access required</p>
        </div>
      </>
    );
  }

  const nextOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalCost: orders.totalCost,
      shippingName: orders.shippingName,
      shippingLine1: orders.shippingLine1,
      shippingLine2: orders.shippingLine2,
      shippingCity: orders.shippingCity,
      shippingRegion: orders.shippingRegion,
      shippingPostalCode: orders.shippingPostalCode,
      shippingCountry: orders.shippingCountry,
      userEmail: user.email,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(user, eq(orders.userId, user.id))
    .where(inArray(orders.status, ["being_fulfilled", "pending"]))
    .orderBy(asc(orders.status), asc(orders.createdAt))
    .limit(1);

  const order = nextOrders[0];
  const items = order
    ? await db
        .select({
          id: orderItems.id,
          name: products.name,
          imageUrl: products.imageUrl,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, order.id))
    : [];

  return (
    <DocsFrame sidebar={false}>
      <PageHero title="Fulfillment">
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
        {order ? (
          <FulfillmentCard order={order} items={items} />
        ) : (
          <div className="rounded-[18px] border border-black bg-white p-10 text-center shadow-[5px_5px_0_#000]">
            <p className="text-3xl font-black text-black">
              No orders to fulfill
            </p>
          </div>
        )}
      </section>
    </DocsFrame>
  );
}
