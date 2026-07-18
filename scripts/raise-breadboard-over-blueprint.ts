/**
 * Makes breadboard's estimated cost at least $10 above blueprint's for every
 * item both shops carry, then re-floors bread/gold so the sell price still
 * covers the (possibly raised) cost.
 *
 * Blueprint stores usd_cost (item price, no shipping) in db/seeds/shop_items.rb.
 * Breadboard's estimatedPriceCents is item base + a shipping pad. We want
 *   breadboard.estimatedPriceCents >= blueprint.usd_cost + $10.
 *
 * After raising the cost, bread/gold are re-floored at the shop's rates
 * (5 bread = $2 -> $0.40/bread; 5 gold = $8 -> $1.60/gold), same as
 * enforce-shop-price-floor.ts. Everything is max()'d, so prices only rise and
 * the script is safe to re-run. Gold-disabled items (goldPrice null) keep null.
 *
 * Runs against whatever DATABASE_URL is set, with the server-only stub preload:
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/raise-breadboard-over-blueprint.ts [--dry-run]
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

const MARKUP_CENTS = 1000; // breadboard must be >= blueprint + $10
const BREAD_CENTS = 40; // 5 bread = $2
const GOLD_CENTS = 160; // 5 gold = $8

// blueprint db/seeds/shop_items.rb usd_cost (cents), keyed by breadboard name.
const BLUEPRINT_CENTS: Record<string, number> = {
  "Wire Strippers": 599,
  "Flush Cutters": 299,
  "Needle-Nose Pliers": 299,
  "Precision Screwdriver Set": 999,
  "Safety Glasses": 500,
  "Digital Multimeter": 799,
  "Soldering Iron": 1000,
  Solder: 429,
  "Fume Extractor": 2899,
  "Helping Hands": 599,
  "Solder Wick": 465,
  "Heat Gun": 1999,
  "Bench Power Supply": 6500,
  "3D Printer Filament": 2500,
  "Mini Hot Plate": 1200,
  "Silicone Soldering Mat": 300,
  "Ender 3 3D Printer": 16899,
  "Bambu Lab A1 Mini": 24999,
  "Bambu Lab P1S": 54900,
  "Bambu Lab H2D": 199900,
  "CNC Router": 44900,
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
  const rows = await db.select().from(products);
  const byName = new Map(rows.map((p) => [p.name, p]));

  let changed = 0;
  let ok = 0;
  const missing: string[] = [];

  for (const [name, bpCents] of Object.entries(BLUEPRINT_CENTS)) {
    const p = byName.get(name);
    if (!p) {
      missing.push(name);
      continue;
    }

    const costFloor = bpCents + MARKUP_CENTS;
    const newEst = Math.max(p.estimatedPriceCents ?? 0, costFloor);
    const newBread = Math.max(p.price, Math.ceil(newEst / BREAD_CENTS));
    const newGold =
      p.goldPrice === null
        ? null
        : Math.max(p.goldPrice, Math.ceil(newEst / GOLD_CENTS));

    const parts: string[] = [];
    if (newEst !== (p.estimatedPriceCents ?? 0))
      parts.push(`est ${usd(p.estimatedPriceCents ?? 0)} -> ${usd(newEst)}`);
    if (newBread !== p.price) parts.push(`bread ${p.price} -> ${newBread}`);
    if (newGold !== p.goldPrice) parts.push(`gold ${p.goldPrice} -> ${newGold}`);

    if (parts.length === 0) {
      ok++;
      continue;
    }

    console.log(
      `${dryRun ? "[dry-run] " : ""}"${name}" (#${p.id}, blueprint ${usd(bpCents)}): ${parts.join(", ")}`,
    );
    if (!dryRun) {
      await db
        .update(products)
        .set({ estimatedPriceCents: newEst, price: newBread, goldPrice: newGold })
        .where(eq(products.id, p.id));
    }
    changed++;
  }

  console.log(`\n${changed} changed, ${ok} already >= blueprint + $10.`);
  if (missing.length > 0) {
    console.log(`Not found in breadboard: ${missing.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
