import { eq } from "drizzle-orm";
import Image from "next/image";
import { LoginButton } from "@/components/shared/auth-buttons";
import { PageHero } from "@/components/shared/docs-frame";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";
import { AddToCartButton, ShopCart } from "@/components/platform/shop-cart";
import { ShopTabs } from "./_nav";
import { BreadAmount } from "@/components/shared/bread-amount";
import { shopOpen } from "@/flags";

export default async function PlatformShopPage() {
  const session = await getSession();

  if (!session) {
    return (
      <>
        <PageHero title="Breadboard Store">
          <p className="mt-2 text-base text-black/80">
            The docs are public. The shop needs Hack Club login so bread and
            orders attach to your account.
          </p>
        </PageHero>
        <section className="rounded-[12px] border-[1.1px] border-black bg-[#f4f4f4] p-8 text-center shadow-[4px_4px_0_#000]">
          <h2 className="text-2xl font-bold text-black">
            Log in to open the shop
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-black/70">
            Breadboard rewards are tied to your Hack Club identity.
          </p>
          <div className="mt-5 flex justify-center">
            <LoginButton callbackURL="/platform/shop" />
          </div>
        </section>
      </>
    );
  }

  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true));
  const isShopOpen = await shopOpen();

  return (
    <>
      <PageHero title="The Store">
        <div className="mt-3 flex flex-wrap items-center justify-between gap-5">
          <ShopTabs active="shop" />
          <p className="rounded-full border border-black bg-white px-4 py-2 text-sm font-bold text-black/70 shadow-[3px_3px_0_#000]">
            {isShopOpen
              ? "Spend bread you earned from building projects"
              : "Shop orders are closed for now. Project kits still work."}
          </p>
        </div>
      </PageHero>

      <section className="mx-auto max-w-[1440px] px-2 py-8 sm:px-6 sm:py-10">
        {allProducts.length === 0 && (
          <div className="rounded-[10px] border border-black/15 bg-white p-10 text-center shadow-sm">
            <p className="text-2xl font-black text-black">Shop is empty</p>
            <p className="mt-2 text-black/55">
              Products will appear here once they are added in admin.
            </p>
          </div>
        )}
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-black/15 pb-4">
          <div>
            <h2 className="mt-1 text-2xl font-black text-black">In stock</h2>
          </div>
          <p className="text-sm text-black/55">
            {allProducts.length} item{allProducts.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {allProducts.map((product) => (
            <div
              key={product.id}
              data-product-card
              className="group flex min-h-full flex-col overflow-hidden rounded-[12px] border border-black bg-white shadow-[4px_4px_0_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#BD0F32]"
            >
              <div
                data-product-image
                className="relative h-56 border-b border-black bg-[#f4f4f4]"
              >
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  sizes="(min-width:1536px) 25vw, (min-width:1280px) 33vw, (min-width:640px) 50vw, 100vw"
                  className="object-contain p-5 transition duration-300 group-hover:scale-[1.04]"
                />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-2 text-lg font-black leading-tight text-black">
                  {product.name}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-black/60">
                  {product.description}
                </p>
                <div className="mt-4 border-t border-black/10 pt-4">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <p className="text-2xl font-black text-black">
                      <BreadAmount amount={product.price} size="md" />
                    </p>
                    <p
                      className={`text-sm font-black ${
                        product.stock === null
                          ? "text-black/50"
                          : product.stock <= 5
                            ? "text-[#BD0F32]"
                            : "text-black/60"
                      }`}
                    >
                      {product.stock === null
                        ? "In stock"
                        : product.stock > 0
                          ? `Only ${product.stock} left`
                          : "Out of stock"}
                    </p>
                  </div>
                  <AddToCartButton
                    productId={product.id}
                    name={product.name}
                    imageUrl={product.imageUrl}
                    price={product.price}
                    stock={product.stock}
                    shopOpen={isShopOpen}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <ShopCart shopOpen={isShopOpen} />
    </>
  );
}
