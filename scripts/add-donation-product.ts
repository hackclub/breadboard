/**
 * Adds the "Donate to Breadboard" shop product: spend bread (or gold) to give
 * back to Breadboard. Flagged `donation` in metadata, which placeOrder reads to
 * skip the shipping address and book it as an already-sent order (so it never
 * lands in fulfillment). Priced per-unit; donors scale the amount with quantity.
 *
 * Idempotent: skips if a product with this name already exists.
 *
 * Runs against whatever DATABASE_URL is set, with the server-only stub preload:
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/add-donation-product.ts [--dry-run]
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

const NAME = "Donate to Breadboard";

const row = {
  name: NAME,
  description:
    "Give some of your bread back to keep Breadboard running. It ships nothing, needs no address, and every bit helps us get more parts to more builders. Bump the quantity to give more.",
  imageUrl: "/assets/bred.png",
  price: 10, // bread per unit; scale with quantity
  goldPrice: 3, // gold per unit
  estimatedPriceCents: null, // a donation has no fulfillment cost
  stock: null,
  active: true,
  sku: "",
  metadata: { donation: true },
};

async function main() {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.name, NAME));

  if (existing.length > 0) {
    console.log(`"${NAME}" already exists (#${existing[0].id}); nothing to do.`);
    return;
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}insert "${NAME}": ${row.price} bread / ${row.goldPrice} gold per unit, donation flag set`,
  );
  if (!dryRun) {
    const [inserted] = await db
      .insert(products)
      .values(row)
      .returning({ id: products.id });
    console.log(`inserted as #${inserted.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
