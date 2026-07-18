/**
 * Adds the "$10 Dollar Bread Grant" to the shop: a $10 grant toward real,
 * edible bread. Priced at the shop rates so it never sells below its $10 value
 * (5 bread = $2 -> 25 bread = $10; 5 gold = $8 -> 7 gold = $11.20, since 6
 * would be $9.60, under cost). Image is a CC BY 2.0 loaf photo vendored into
 * public/assets/shop.
 *
 * Idempotent: skips if a product with this name already exists.
 *
 * Runs against whatever DATABASE_URL is set, with the server-only stub preload:
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/add-bread-grant.ts [--dry-run]
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

const NAME = "$10 Dollar Bread Grant";

const row = {
  name: NAME,
  description:
    "Ten dollars toward real, actual bread. The edible, carb-loaded kind, not the currency you spend here. Stack it with the bread you earned.",
  imageUrl: "/assets/shop/bread-grant.jpg",
  price: 25, // 25 bread = $10.00 at $0.40/bread
  goldPrice: 7, // ceil($10 / $1.60) = 7 gold, so it stays >= $10
  estimatedPriceCents: 1000, // the grant is worth $10
  stock: null,
  active: true,
  sku: "",
  metadata: {
    grant: { valueUsd: 10, kind: "bread" },
    imageCredit: {
      author: "muffinn from Worcester, UK",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      source:
        "https://commons.wikimedia.org/wiki/File:Wholemeal_tin_loaf_(8371640548).jpg",
    },
  },
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
    `${dryRun ? "[dry-run] " : ""}insert "${NAME}": ${row.price} bread / ${row.goldPrice} gold, $${(row.estimatedPriceCents / 100).toFixed(2)}, image ${row.imageUrl}`,
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
