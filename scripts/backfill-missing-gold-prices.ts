/**
 * Gives any bread-only product a gold price so it can be bought with either
 * currency. Gold is set at parity with the item's existing bread price using
 * the shop's exchange rates (5 bread = $2 -> $0.40/bread; 5 gold = $8 ->
 * $1.60/gold), i.e. gold = ceil(bread * 0.40 / 1.60) = ceil(bread / 4). That
 * charges the same dollar value whichever way you pay, and is always >= the
 * cost floor because bread already covers cost.
 *
 * Only products with a null goldPrice are touched, so it's safe to re-run.
 *
 * Runs against whatever DATABASE_URL is set, with the server-only stub preload:
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-missing-gold-prices.ts [--dry-run]
 */

import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

const BREAD_CENTS = 40; // 5 bread = $2
const GOLD_CENTS = 160; // 5 gold = $8

async function main() {
  const rows = await db
    .select()
    .from(products)
    .where(isNull(products.goldPrice));

  let updated = 0;
  for (const p of rows) {
    const gold = Math.ceil((p.price * BREAD_CENTS) / GOLD_CENTS);
    console.log(
      `${dryRun ? "[dry-run] " : ""}"${p.name}" (#${p.id}): bread ${p.price} -> gold ${gold}`,
    );
    if (!dryRun) {
      await db
        .update(products)
        .set({ goldPrice: gold })
        .where(eq(products.id, p.id));
    }
    updated++;
  }

  console.log(`\n${updated} bread-only product(s) given a gold price.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
