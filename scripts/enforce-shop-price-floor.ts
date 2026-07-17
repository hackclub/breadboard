/**
 * Guarantees every shop product costs at least what it costs us to fulfill,
 * in whichever currency the buyer spends. The floor is the product's stored
 * cost (estimatedPriceCents) converted at the shop's exchange rates:
 *
 *   5 bread = $2  -> $0.40 / bread  -> bread floor = ceil(cost$ / 0.40)
 *   5 gold  = $8  -> $1.60 / gold   -> gold  floor = ceil(cost$ / 1.60)
 *
 * Prices are only ever raised to the floor, never lowered, so it's safe to
 * re-run and won't undo a deliberately-high price. Products with no recorded
 * cost (estimatedPriceCents <= 0, e.g. the grants) are left alone, as is any
 * product whose gold price is null (can't be bought with gold, so no gold
 * scenario can undercut the cost).
 *
 * Runs against whatever DATABASE_URL is set. Imports app modules that use
 * Next's "server-only" marker, so run it with the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/enforce-shop-price-floor.ts [--dry-run]
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

// Cents of real cost per unit of each currency.
const BREAD_CENTS = 40; // 5 bread = $2
const GOLD_CENTS = 160; // 5 gold = $8

async function main() {
  const rows = await db.select().from(products);
  rows.sort((a, b) => a.id - b.id);

  let updated = 0;
  let ok = 0;
  const noCost: string[] = [];

  for (const p of rows) {
    const cost = p.estimatedPriceCents ?? 0;
    if (cost <= 0) {
      noCost.push(p.name);
      continue;
    }

    const breadFloor = Math.ceil(cost / BREAD_CENTS);
    const goldFloor = Math.ceil(cost / GOLD_CENTS);

    const newBread = Math.max(p.price, breadFloor);
    // Only touch gold when the product is actually sold for gold.
    const newGold =
      p.goldPrice === null ? null : Math.max(p.goldPrice, goldFloor);

    const breadChanged = newBread !== p.price;
    const goldChanged = newGold !== p.goldPrice;
    if (!breadChanged && !goldChanged) {
      ok++;
      continue;
    }

    const parts: string[] = [];
    if (breadChanged) parts.push(`bread ${p.price} -> ${newBread}`);
    if (goldChanged) parts.push(`gold ${p.goldPrice} -> ${newGold}`);
    console.log(
      `${dryRun ? "[dry-run] " : ""}"${p.name}" (#${p.id}, cost $${(cost / 100).toFixed(2)}): ${parts.join(", ")}`,
    );

    if (!dryRun) {
      await db
        .update(products)
        .set({ price: newBread, goldPrice: newGold })
        .where(eq(products.id, p.id));
    }
    updated++;
  }

  console.log(`\n${updated} raised to floor, ${ok} already at/above floor.`);
  if (noCost.length > 0) {
    console.log(
      `No recorded cost, skipped: ${noCost.map((n) => `"${n}"`).join(", ")}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
