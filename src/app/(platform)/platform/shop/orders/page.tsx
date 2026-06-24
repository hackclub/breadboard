import { desc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { BreadAmount } from "@/components/shared/bread-amount";
import { ShopCart } from "@/components/platform/shop-cart";
import { ShopTabs } from "@/app/(platform)/platform/shop/_nav";
import { CancelOrderButton } from "@/components/platform/cancel-order-button";
import { LoginButton } from "@/components/shared/auth-buttons";
import { PageHero } from "@/components/shared/docs-frame";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { orderItems, orders, products } from "@/lib/db/schema";

export default async function PlatformOrdersPage() {
  const session = await getSession();

  if (!session) {
    return (
      <>
        <PageHero title="Orders" />
        <section className="rounded-[12px] border-[1.1px] border-black bg-[#f4f4f4] p-8 text-center shadow-[4px_4px_0_#000]">
          <h2 className="text-2xl font-bold text-black">
            Log in to view orders
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-black/70">
            Orders are tied to your Hack Club account.
          </p>
          <div className="mt-5 flex justify-center">
            <LoginButton callbackURL="/platform/shop/orders" />
          </div>
        </section>
      </>
    );
  }

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  return (
    <>
      <PageHero title="Breadboard Store">
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ShopTabs active="orders" />
          </div>
          <Link
            href="/platform/shop"
            prefetch
            className="rounded-full border border-black bg-white px-4 py-2 text-sm font-bold shadow-[3px_3px_0_#000] transition hover:bg-black hover:text-white"
          >
            Continue shopping
          </Link>
        </div>
      </PageHero>

      <section className="mx-auto max-w-[1440px] px-2 py-8 sm:px-6 sm:py-10">
        {userOrders.length === 0 ? (
          <div className="rounded-[10px] border border-black/15 bg-white p-10 text-center shadow-sm">
            <p className="text-2xl font-black text-black">No orders yet</p>
            <p className="mt-2 text-black/55">
              Items you order from the store will show here with images, status,
              and cancellation controls.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {userOrders.map((order) => (
              <OrderCard key={order.id} orderId={order.id} />
            ))}
          </div>
        )}
      </section>
      <ShopCart />
    </>
  );
}

const statusColors: Record<string, string> = {
  pending: "bg-[#BD0F32] text-white border-black",
  being_fulfilled: "bg-black text-white border-black",
  sent: "bg-white text-black border-black",
  cancelled: "bg-[#f4f4f4] text-black/55 border-black/30",
};

async function OrderCard({ orderId }: { orderId: number }) {
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const items = await db
    .select({
      name: products.name,
      imageUrl: products.imageUrl,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  if (!order[0]) return null;
  const o = order[0];

  return (
    <div className="overflow-hidden rounded-[12px] border border-black bg-white shadow-[4px_4px_0_#000]">
      <div className="grid gap-3 border-b border-black bg-[#f4f4f4] px-5 py-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div>
          <p className="text-xs font-semibold text-black/45">Order placed</p>
          <p className="mt-1 font-semibold text-black">
            {new Date(o.createdAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-black/45">Total</p>
          <p className="mt-1 font-black text-black">
            <BreadAmount amount={o.totalCost} />
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold text-black/45">Order #{o.id}</p>
          <span
            className={`mt-1 inline-flex rounded border px-2 py-1 text-xs font-semibold ${statusColors[o.status] ?? ""}`}
          >
            {o.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <ul className="divide-y divide-black/10">
        {items.map((item) => (
          <li
            key={item.name}
            className="grid gap-4 p-5 sm:grid-cols-[112px_1fr_auto]"
          >
            <div className="relative h-28 w-28 rounded-[10px] border border-black bg-[#f4f4f4]">
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                sizes="112px"
                className="object-contain p-3"
              />
            </div>
            <div>
              <h3 className="text-lg font-black text-black">{item.name}</h3>
              <p className="mt-1 text-sm text-black/55">
                Quantity: {item.quantity}
              </p>
              <p className="mt-1 text-sm text-black/55">
                <BreadAmount amount={item.unitPrice} /> each
              </p>
              {o.trackingInfo ? (
                <p className="mt-3 rounded-[8px] border border-black bg-[#f4f4f4] px-3 py-2 text-sm font-semibold text-black">
                  Tracking: {o.trackingInfo}
                </p>
              ) : null}
            </div>
            <p className="font-black text-black sm:text-right">
              <BreadAmount amount={item.unitPrice * item.quantity} />
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-4">
        <p className="text-sm text-black/55">
          {o.source === "project_kit"
            ? "Track your order here. Project kits cannot be cancelled."
            : o.status === "pending"
              ? "Not fulfilled yet. You can still cancel this order."
              : "This order can no longer be cancelled from the store."}
        </p>
        {o.source === "project_kit" ? (
          o.trackingInfo ? (
            <a
              href={o.trackingInfo}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-black bg-white px-4 py-2 text-sm font-bold text-black no-underline transition hover:bg-black hover:text-white"
            >
              Track your order
            </a>
          ) : (
            <span className="text-xs font-bold text-black/35">
              No tracking yet
            </span>
          )
        ) : o.status === "pending" ? (
          <CancelOrderButton orderId={o.id} />
        ) : null}
      </div>
    </div>
  );
}
