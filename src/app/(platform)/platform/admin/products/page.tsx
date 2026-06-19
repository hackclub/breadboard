import Link from "next/link";
import { LoginButton } from "@/components/shared/auth-buttons";
import { DocsFrame, PageHero } from "@/components/shared/platform-docs-frame";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";
import {
  AddProductForm,
  ProductAdminCard,
} from "@/components/platform/admin-products";

export default async function AdminProductsPage() {
  const session = await getSession();
  if (!session) {
    return (
      <DocsFrame sidebar={false}>
        <PageHero title="Admin Products" />
        <div className="mt-4">
          <LoginButton callbackURL="/platform/admin/products" />
        </div>
      </DocsFrame>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <>
        <PageHero title="Product Admin" />
        <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-6 shadow-[4px_4px_0_#000]">
          <p className="text-xl font-black text-black">Admin access required</p>
        </div>
      </>
    );
  }

  const allProducts = await db.select().from(products);

  return (
    <DocsFrame sidebar={false}>
      <PageHero title="Product Admin">
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/platform/admin"
            className="rounded border border-black px-4 py-2 text-sm transition hover:bg-black hover:text-white"
          >
            Dashboard
          </Link>
        </div>
      </PageHero>

      <section className="mx-auto max-w-[1440px] px-2 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex justify-end">
          <AddProductForm />
        </div>

        <div className="space-y-4">
          {allProducts.map((p) => (
            <ProductAdminCard
              key={p.id}
              product={{
                id: p.id,
                name: p.name,
                description: p.description,
                imageUrl: p.imageUrl,
                price: p.price,
                stock: p.stock,
                active: p.active,
              }}
            />
          ))}
          {allProducts.length === 0 ? (
            <div className="rounded-[20px] border-[1.5px] border-dashed border-black bg-white p-8 text-center shadow-[5px_5px_0_#000]">
              <p className="text-xl font-black text-black">No products yet</p>
              <p className="mt-2 text-sm text-black/55">
                Add the first product to open the shop.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </DocsFrame>
  );
}
