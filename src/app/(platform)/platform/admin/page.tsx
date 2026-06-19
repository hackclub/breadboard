import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import {
  HiArchiveBox,
  HiArrowRight,
  HiClipboardDocumentCheck,
  HiCube,
  HiShoppingBag,
  HiUsers,
} from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { orders, products, projects, user } from "@/lib/db/schema";

const adminLinks = [
  {
    href: "/platform/admin/review",
    label: "Review",
    icon: HiClipboardDocumentCheck,
  },
  {
    href: "/platform/admin/fulfillment",
    label: "Fulfillment",
    icon: HiArchiveBox,
  },
  { href: "/platform/admin/orders", label: "Orders", icon: HiShoppingBag },
  { href: "/platform/admin/products", label: "Products", icon: HiCube },
  { href: "/platform/admin/users", label: "Users", icon: HiUsers },
];

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export default async function PlatformAdminPage() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="max-w-3xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Admin</h1>
        <p className="mt-2 text-sm text-black/60">Log in to continue.</p>
        <div className="mt-5">
          <LoginButton callbackURL="/platform/admin" />
        </div>
      </main>
    );
  }

  if (!(await isAdminSession(session))) {
    return (
      <main className="max-w-3xl rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
        <h1 className="text-3xl font-black text-black">Admin</h1>
        <p className="mt-2 text-sm text-black/60">Admin access required.</p>
      </main>
    );
  }

  const [
    pendingOrders,
    packingOrders,
    sentOrders,
    allUsers,
    allProducts,
    reviewProjects,
    recentOrders,
  ] = await Promise.all([
    db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.status, "pending")),
    db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.status, "being_fulfilled")),
    db.select({ id: orders.id }).from(orders).where(eq(orders.status, "sent")),
    db.select({ id: user.id }).from(user),
    db.select({ id: products.id }).from(products),
    db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        hoursSpent: projects.hoursSpent,
        kitType: projects.kitType,
      })
      .from(projects)
      .where(eq(projects.status, "shipped"))
      .orderBy(desc(projects.updatedAt))
      .limit(5),
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalCost: orders.totalCost,
        name: orders.shippingName,
      })
      .from(orders)
      .orderBy(desc(orders.updatedAt))
      .limit(5),
  ]);

  const stats = [
    {
      label: "Review",
      value: reviewProjects.length,
      href: "/platform/admin/review",
    },
    {
      label: "Pending",
      value: pendingOrders.length,
      href: "/platform/admin/orders",
    },
    {
      label: "Packing",
      value: packingOrders.length,
      href: "/platform/admin/fulfillment",
    },
    { label: "Sent", value: sentOrders.length, href: "/platform/admin/orders" },
    { label: "Users", value: allUsers.length, href: "/platform/admin/users" },
    {
      label: "Products",
      value: allProducts.length,
      href: "/platform/admin/products",
    },
  ];

  return (
    <main className="max-w-6xl space-y-6">
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
          <h1 className="text-4xl font-black text-black">Admin</h1>
          <p className="mt-2 text-sm text-black/60">{session.user.email}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {stats.slice(0, 3).map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="rounded-[12px] border border-black bg-[#f4f4f4] p-4 text-black no-underline transition hover:-translate-y-0.5 hover:bg-white"
              >
                <p className="text-3xl font-black leading-none">{stat.value}</p>
                <p className="mt-2 text-sm font-semibold text-black/55">
                  {stat.label}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[16px] border border-black bg-white p-6 shadow-[4px_4px_0_#000]">
          <h2 className="text-xl font-black text-black">Today</h2>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Review shipped projects, keep orders moving, and check account
            changes from the audit log when something looks off.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-black">Review queue</h2>
            <Link
              href="/platform/admin/review"
              className="text-sm font-black text-[#BD0F32] no-underline hover:text-black"
            >
              Open
            </Link>
          </div>
          <div className="divide-y divide-black/10">
            {reviewProjects.length > 0 ? (
              reviewProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/platform/admin/review/${project.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 text-black no-underline hover:bg-zinc-100"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      {project.title}
                    </p>
                    <p className="text-xs text-black/50">
                      {project.hoursSpent}h tracked
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-black/45">
                    {project.kitType === "esp32" ? "ESP32" : "Arduino"} ·
                    shipped
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-6 text-sm text-black/50">
                Nothing waiting.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[16px] border border-black bg-white p-4 shadow-[4px_4px_0_#000]">
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-black">Recent orders</h2>
            <Link
              href="/platform/admin/orders"
              className="text-sm font-black text-[#BD0F32] no-underline hover:text-black"
            >
              Open
            </Link>
          </div>
          <div className="divide-y divide-black/10">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href="/platform/admin/orders"
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 text-black no-underline hover:bg-zinc-100"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      #{order.id} {order.name || "No name"}
                    </p>
                    <p className="text-xs text-black/50">
                      {order.totalCost} bread
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-black/45">
                    {statusLabel(order.status)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-6 text-sm text-black/50">No orders yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {adminLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between rounded-[14px] border border-black bg-white p-4 text-black no-underline shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#BD0F32]"
            >
              <span className="flex items-center gap-3 text-sm font-black">
                <Icon className="size-5 text-[#BD0F32]" />
                {link.label}
              </span>
              <HiArrowRight className="size-4 text-black/40" />
            </Link>
          );
        })}
      </section>
    </main>
  );
}
