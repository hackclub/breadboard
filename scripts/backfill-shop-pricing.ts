/**
 * Syncs the shop catalog with the pricing spreadsheet
 * (breadboard_shop_pricing.xlsx, "Pricing & Bread Conversion", 2026-07-17).
 * The sheet's method: shop price = ROUNDUP(base cost + $10 shipping pad),
 * normal bread = ROUNDUP(shop$ / $0.40), gold bread = ROUNDUP(shop$ / $1.70).
 * The numbers below are copied verbatim from the computed columns, so this
 * script never re-derives them.
 *
 * Existing products are matched by name (case-insensitive), or by the item's
 * aliases when the shop already sells the thing under a different name
 * (e.g. sheet "Multimeter" is the shop's "Digital Multimeter"). Matches keep
 * their existing name and get their
 * price, goldPrice and estimatedPriceCents updated; description, image,
 * stock and active flag stay untouched. Items the shop doesn't have yet are
 * inserted INACTIVE with a placeholder image, so nothing shows up in the
 * shop until an admin adds a real photo and flips them on. Products in the
 * DB that aren't on the sheet are only reported, never changed.
 *
 * estimatedPriceCents stores the sheet's shop price (item + shipping pad),
 * since that's the real fulfillment cost the bread prices derive from. The
 * sheet's tier, base cost and sourcing notes land in metadata.pricing.
 *
 * Runs against whatever DATABASE_URL is set. Imports app modules that use
 * Next's "server-only" marker, so run it with the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-shop-pricing.ts [--dry-run]
 *
 *   --dry-run    print every planned change, write nothing
 *   --activate   make every sheet item live in the shop (new items normally
 *                land inactive so photos can be added first)
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");
const activate = process.argv.includes("--activate");

const PLACEHOLDER_IMAGE = "/assets/bred.png";

type SheetItem = {
  name: string;
  /** Existing DB product names this sheet row should update instead of
   * creating a duplicate. */
  aliases?: string[];
  tier: "Core" | "Small tool" | "Aspirational";
  baseCostUsd: number;
  shopPriceUsd: number;
  bread: number;
  gold: number;
  notes?: string;
};

// Copied from the sheet's computed columns. Oscilloscope and spot welder are
// still TBD there (no source yet) and are intentionally absent.
const SHEET: SheetItem[] = [
  {
    name: "Pinecil",
    tier: "Core",
    baseCostUsd: 53,
    shopPriceUsd: 63,
    bread: 158,
    gold: 38,
    notes:
      "Max US/IN/DE. NOT AliExpress; Pine64 says those are fake. Separate sourcing + real ship/duty.",
  },
  {
    name: "Raspberry Pi Pico",
    tier: "Core",
    baseCostUsd: 6,
    shopPriceUsd: 16,
    bread: 40,
    gold: 10,
  },
  {
    name: "Raspberry Pi Zero 2 W",
    tier: "Core",
    baseCostUsd: 9,
    shopPriceUsd: 19,
    bread: 48,
    gold: 12,
  },
  {
    name: "ESP32-CAM",
    tier: "Core",
    baseCostUsd: 13,
    shopPriceUsd: 23,
    bread: 58,
    gold: 14,
  },
  {
    name: "BME280",
    tier: "Core",
    baseCostUsd: 11,
    shopPriceUsd: 21,
    bread: 53,
    gold: 13,
  },
  {
    name: "MPU6050",
    tier: "Core",
    baseCostUsd: 5,
    shopPriceUsd: 15,
    bread: 38,
    gold: 9,
  },
  {
    name: "HC-SR04 ultrasonic",
    tier: "Core",
    baseCostUsd: 4,
    shopPriceUsd: 14,
    bread: 35,
    gold: 9,
  },
  {
    name: "DS18B20 temp sensor",
    tier: "Core",
    baseCostUsd: 6,
    shopPriceUsd: 16,
    bread: 40,
    gold: 10,
  },
  {
    name: "GPS NEO-6M",
    tier: "Core",
    baseCostUsd: 13,
    shopPriceUsd: 23,
    bread: 58,
    gold: 14,
  },
  {
    name: "AS608 fingerprint",
    tier: "Core",
    baseCostUsd: 23,
    shopPriceUsd: 33,
    bread: 83,
    gold: 20,
  },
  {
    name: "LoRa SX1276/1278",
    tier: "Core",
    baseCostUsd: 16,
    shopPriceUsd: 26,
    bread: 65,
    gold: 16,
  },
  {
    name: '2.13" EInk display',
    tier: "Core",
    baseCostUsd: 26,
    shopPriceUsd: 36,
    bread: 90,
    gold: 22,
  },
  {
    name: "WS2812B LED strip 1m",
    tier: "Core",
    baseCostUsd: 11,
    shopPriceUsd: 21,
    bread: 53,
    gold: 13,
  },
  {
    name: "microSD card module",
    tier: "Core",
    baseCostUsd: 5,
    shopPriceUsd: 15,
    bread: 38,
    gold: 9,
  },
  {
    name: "microSD 64GB",
    tier: "Core",
    baseCostUsd: 13,
    shopPriceUsd: 23,
    bread: 58,
    gold: 14,
  },
  {
    name: "USB-C to USB-C cable",
    tier: "Core",
    baseCostUsd: 9,
    shopPriceUsd: 19,
    bread: 48,
    gold: 12,
  },
  {
    name: "Multimeter",
    aliases: ["Digital Multimeter"],
    tier: "Core",
    baseCostUsd: 14,
    shopPriceUsd: 24,
    bread: 60,
    gold: 15,
  },
  {
    name: "Solder wire",
    aliases: ["Solder"],
    tier: "Core",
    baseCostUsd: 8,
    shopPriceUsd: 18,
    bread: 45,
    gold: 11,
  },
  {
    name: "Calipers",
    tier: "Core",
    baseCostUsd: 19,
    shopPriceUsd: 29,
    bread: 73,
    gold: 18,
  },
  {
    name: "PLA filament 1kg",
    aliases: ["3D Printer Filament"],
    tier: "Core",
    baseCostUsd: 20,
    shopPriceUsd: 30,
    bread: 75,
    gold: 18,
    notes: "Ships free/cheap only on a free-shipping listing.",
  },
  {
    name: "Mini label printer",
    tier: "Core",
    baseCostUsd: 45,
    shopPriceUsd: 55,
    bread: 138,
    gold: 33,
  },
  {
    name: "Safety glasses",
    tier: "Small tool",
    baseCostUsd: 0.98,
    shopPriceUsd: 11,
    bread: 28,
    gold: 7,
    notes:
      "Base from ticket sheet price, not regional. Re-cost for consistency.",
  },
  {
    name: "Flush cutters",
    tier: "Small tool",
    baseCostUsd: 2.99,
    shopPriceUsd: 13,
    bread: 33,
    gold: 8,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Needle-nose pliers",
    tier: "Small tool",
    baseCostUsd: 2.99,
    shopPriceUsd: 13,
    bread: 33,
    gold: 8,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Solder wick",
    tier: "Small tool",
    baseCostUsd: 4.65,
    shopPriceUsd: 15,
    bread: 38,
    gold: 9,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Silicone soldering mat",
    tier: "Small tool",
    baseCostUsd: 3,
    shopPriceUsd: 13,
    bread: 33,
    gold: 8,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Helping hands",
    tier: "Small tool",
    baseCostUsd: 5.99,
    shopPriceUsd: 16,
    bread: 40,
    gold: 10,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Wire strippers",
    tier: "Small tool",
    baseCostUsd: 5.99,
    shopPriceUsd: 16,
    bread: 40,
    gold: 10,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Precision screwdrivers",
    aliases: ["Precision Screwdriver Set"],
    tier: "Small tool",
    baseCostUsd: 9.99,
    shopPriceUsd: 20,
    bread: 50,
    gold: 12,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Mini hot-plate",
    aliases: ["Mini Hot Plate"],
    tier: "Small tool",
    baseCostUsd: 12,
    shopPriceUsd: 22,
    bread: 55,
    gold: 13,
    notes: "Base from ticket sheet price.",
  },
  {
    name: "Pinecil tips",
    tier: "Small tool",
    baseCostUsd: 8,
    shopPriceUsd: 18,
    bread: 45,
    gold: 11,
    notes: "Estimated base. Pine64-sourced, not AliExpress.",
  },
  {
    name: "Fume extractor",
    tier: "Aspirational",
    baseCostUsd: 28.99,
    shopPriceUsd: 39,
    bread: 98,
    gold: 23,
    notes: "Shipping is a placeholder; heavy, needs real quote + duty.",
  },
  {
    name: "Heat gun",
    tier: "Aspirational",
    baseCostUsd: 19.99,
    shopPriceUsd: 30,
    bread: 75,
    gold: 18,
    notes: "Shipping is a placeholder.",
  },
  {
    name: "Bench power supply",
    tier: "Aspirational",
    baseCostUsd: 34.26,
    shopPriceUsd: 45,
    bread: 113,
    gold: 27,
    notes: "Shipping is a placeholder.",
  },
  {
    name: "Ender 3 3D printer",
    tier: "Aspirational",
    baseCostUsd: 168.99,
    shopPriceUsd: 179,
    bread: 448,
    gold: 106,
    notes: "Shipping placeholder; big machine, needs a real quote.",
  },
  {
    name: "Bambu Lab A1 Mini",
    tier: "Aspirational",
    baseCostUsd: 249.99,
    shopPriceUsd: 260,
    bread: 650,
    gold: 153,
    notes: "Shipping placeholder; big machine, needs a real quote.",
  },
  {
    name: "CNC router",
    tier: "Aspirational",
    baseCostUsd: 449,
    shopPriceUsd: 459,
    bread: 1148,
    gold: 270,
    notes: "Shipping placeholder; big machine, needs a real quote.",
  },
  {
    name: "Bambu Lab P1S",
    tier: "Aspirational",
    baseCostUsd: 549,
    shopPriceUsd: 559,
    bread: 1398,
    gold: 329,
    notes: "Shipping placeholder; big machine, needs a real quote.",
  },
  {
    name: "Bambu Lab H2D",
    tier: "Aspirational",
    baseCostUsd: 1999,
    shopPriceUsd: 2009,
    bread: 5023,
    gold: 1182,
    notes: "Shipping placeholder; big machine, needs a real quote.",
  },
];

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  const existing = await db.select().from(products);
  const byName = new Map(existing.map((p) => [normalizeName(p.name), p]));

  let updated = 0;
  let unchanged = 0;
  const created: string[] = [];

  for (const item of SHEET) {
    const names = [item.name, ...(item.aliases ?? [])].map(normalizeName);
    const match = names.map((n) => byName.get(n)).find(Boolean);
    const estimatedPriceCents = Math.round(item.shopPriceUsd * 100);
    const pricing = {
      tier: item.tier,
      baseCostUsd: item.baseCostUsd,
      shopPriceUsd: item.shopPriceUsd,
      sheet: "breadboard_shop_pricing.xlsx 2026-07-17",
      ...(item.notes ? { notes: item.notes } : {}),
    };

    if (match) {
      const makeActive = activate && !match.active;
      const same =
        match.price === item.bread &&
        match.goldPrice === item.gold &&
        match.estimatedPriceCents === estimatedPriceCents &&
        !makeActive;
      if (same) {
        unchanged++;
        continue;
      }
      console.log(
        `${dryRun ? "[dry-run] " : ""}update "${match.name}" (#${match.id}): ` +
          `price ${match.price} -> ${item.bread}, gold ${match.goldPrice ?? "none"} -> ${item.gold}, ` +
          `est $${((match.estimatedPriceCents ?? 0) / 100).toFixed(2)} -> $${item.shopPriceUsd}` +
          (makeActive ? ", activating" : ""),
      );
      if (!dryRun) {
        await db
          .update(products)
          .set({
            price: item.bread,
            goldPrice: item.gold,
            estimatedPriceCents,
            ...(makeActive ? { active: true } : {}),
            metadata: sql`coalesce(${products.metadata}, '{}'::jsonb) || ${JSON.stringify({ pricing })}::jsonb`,
          })
          .where(eq(products.id, match.id));
      }
      updated++;
    } else {
      console.log(
        `${dryRun ? "[dry-run] " : ""}create "${item.name}" (${activate ? "active" : "inactive"}): ` +
          `${item.bread} bread / ${item.gold} gold, est $${item.shopPriceUsd}`,
      );
      if (!dryRun) {
        await db.insert(products).values({
          name: item.name,
          description: "",
          imageUrl: PLACEHOLDER_IMAGE,
          price: item.bread,
          goldPrice: item.gold,
          estimatedPriceCents,
          stock: null,
          active: activate,
          metadata: { pricing },
        });
      }
      created.push(item.name);
    }
  }

  const sheetNames = new Set(
    SHEET.flatMap((item) =>
      [item.name, ...(item.aliases ?? [])].map(normalizeName),
    ),
  );
  // Kit A / Kit B are the zero-price fulfillment products kit orders attach
  // to (getOrCreateKitProduct), not shop stock. Never suggest touching them.
  const kitProducts = new Set(["kit a", "kit b"]);
  const notOnSheet = existing.filter(
    (p) =>
      !sheetNames.has(normalizeName(p.name)) &&
      !kitProducts.has(normalizeName(p.name)),
  );

  console.log(
    `\n${updated} updated, ${created.length} created ${activate ? "active" : "inactive"}, ${unchanged} already in sync.`,
  );
  if (created.length > 0) {
    console.log(
      activate
        ? "New items are live with a placeholder image; swap in real photos:"
        : "New items need a real photo and the active flag before they appear in the shop:",
    );
    for (const name of created) console.log(`  - ${name}`);
  }
  if (notOnSheet.length > 0) {
    console.log(
      "\nIn the DB but not on the sheet (left untouched; deactivate if stale):",
    );
    for (const p of notOnSheet) {
      console.log(
        `  - "${p.name}" (#${p.id}, ${p.active ? "active" : "inactive"}, ${p.price} bread)`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
