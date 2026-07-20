/**
 * Adds the "Custom Art by Herby" shop product: Herby (the artist behind
 * Midnight, Fallout, and Breadboard) draws the buyer an animal profile picture
 * or pet doodle. It's digital, so it ships nothing and needs no address. It's
 * flagged `noShip` in metadata, which placeOrder reads to skip the shipping
 * address (like a donation) while still booking a pending order, so it lands in
 * the orders queue for Herby to pick up and reach out for details.
 *
 * Priced at ~$5: 15 bread / 5 gold.
 *
 * Idempotent: skips if a product with this name already exists.
 *
 * Runs against whatever DATABASE_URL is set, with the server-only stub preload:
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/add-custom-art-product.ts [--dry-run]
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

const NAME = "Custom Art by Herby";

const row = {
  name: NAME,
  description:
    "Herby, the artist behind programs such as Midnight, Fallout, and Breadboard, draws you an animal pfp or pet doodle :D She will ask for further details if you buy this!",
  imageUrl:
    "https://cdn.hackclub.com/019f7e38-2ab4-792c-a73c-2d3710ec7d22/image.png",
  price: 15, // bread, ~$5 at $0.40/bread
  goldPrice: 5, // gold, ~$5 at $1.70/gold
  estimatedPriceCents: 500, // ~$5 of Herby's time; admin reference only
  stock: null,
  active: true,
  sku: "",
  metadata: { noShip: true },
};

async function main() {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.name, NAME));

  if (existing.length > 0) {
    console.log(
      `"${NAME}" already exists (#${existing[0].id}); nothing to do.`,
    );
    return;
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}insert "${NAME}": ${row.price} bread / ${row.goldPrice} gold, noShip flag set`,
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
