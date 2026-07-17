/**
 * Gives placeholder shop products a real image from the ones vendored into
 * public/assets/shop. The tool/3D-printer photos come out of
 * hackclub/blueprint (app/assets/images/shop); the electronics photos were
 * pulled from official/reputable vendor CDNs (Adafruit, Waveshare, Pine64,
 * Seeed, Niimbot) and committed so nothing hotlinks or rots.
 *
 * Only products whose imageUrl is still the bred.png placeholder (or empty)
 * are touched, so it will never clobber a real photo (e.g. the existing
 * pine64.com Pinecil shot). Products are matched by name, with the prod
 * spellings ("Digital Multimeter", "3D Printer Filament") listed alongside
 * the sheet names. Safe to re-run anywhere.
 *
 * Runs against whatever DATABASE_URL is set. Imports app modules that use
 * Next's "server-only" marker, so run it with the stub preload:
 *
 *   bun --preload ./scripts/_stub-server-only.ts ./scripts/backfill-shop-images.ts [--dry-run]
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { products } from "@/lib/db/schema";

const dryRun = process.argv.includes("--dry-run");

const PLACEHOLDER_IMAGE = "/assets/bred.png";

// product name(s) -> file in public/assets/shop
const IMAGES: [string[], string][] = [
  [["Wire strippers"], "wire-strippers.webp"],
  [["Flush cutters"], "flush-cutters.webp"],
  [["Needle-nose pliers"], "needle-nose-pliers.webp"],
  [
    ["Precision screwdrivers", "Precision Screwdriver Set"],
    "precision-screwdrivers.webp",
  ],
  [["Safety glasses"], "safety-glasses.webp"],
  [["Multimeter", "Digital Multimeter"], "digital-multimeter.webp"],
  [["Soldering Iron"], "soldering-iron.webp"],
  [["Solder wire", "Solder"], "solder.webp"],
  [["Fume extractor"], "fume-extractor.webp"],
  [["Helping hands"], "helping-hands.webp"],
  [["Solder wick"], "solder-wick.webp"],
  [["Heat gun"], "heat-gun.webp"],
  [["Bench power supply"], "bench-power-supply.webp"],
  [["PLA filament 1kg", "3D Printer Filament"], "3d-printer-filament.webp"],
  [["Mini hot-plate", "Mini Hot Plate"], "mini-hot-plate.webp"],
  [["Silicone soldering mat"], "silicone-soldering-mat.webp"],
  [["Ender 3 3D printer"], "ender-3-3d-printer.webp"],
  [["Bambu Lab A1 Mini"], "bambu-lab-a1-mini.webp"],
  [["Bambu Lab P1S"], "bambu-lab-p1s.webp"],
  [["Bambu Lab H2D"], "bambu-lab-h2d-base.webp"],
  [["CNC router"], "cnc-router.webp"],
  // Electronics, from official/reputable vendor CDNs (see header).
  [["Raspberry Pi Pico"], "raspberry-pi-pico.jpg"],
  [["Raspberry Pi Zero 2 W"], "raspberry-pi-zero-2-w.jpg"],
  [["ESP32-CAM"], "esp32-cam.jpg"],
  [["BME280"], "bme280.jpg"],
  [["MPU6050"], "mpu6050.jpg"],
  [["HC-SR04 ultrasonic"], "hc-sr04.jpg"],
  [["DS18B20 temp sensor"], "ds18b20.jpg"],
  [["GPS NEO-6M"], "gps-neo-6m.jpg"],
  [["AS608 fingerprint"], "as608-fingerprint.jpg"],
  [["LoRa SX1276/1278"], "lora-sx1276.jpg"],
  [['2.13" EInk display'], "eink-2-13.jpg"],
  [["WS2812B LED strip 1m"], "ws2812b-led-strip.jpg"],
  [["microSD card module"], "microsd-card-module.jpg"],
  [["microSD 64GB"], "microsd-64gb.jpg"],
  [["USB-C to USB-C cable"], "usb-c-cable.jpg"],
  [["Calipers"], "calipers.jpg"],
  [["Mini label printer"], "mini-label-printer.png"],
  [["Pinecil tips"], "pinecil-tips.jpg"],
];

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  const existing = await db.select().from(products);
  const fileByName = new Map(
    IMAGES.flatMap(([names, file]) =>
      names.map((n) => [normalizeName(n), file] as const),
    ),
  );

  let updated = 0;
  let skipped = 0;
  const stillPlaceholder: string[] = [];

  for (const product of existing) {
    const file = fileByName.get(normalizeName(product.name));
    const isPlaceholder =
      !product.imageUrl || product.imageUrl === PLACEHOLDER_IMAGE;

    if (!file) {
      if (isPlaceholder) stillPlaceholder.push(product.name);
      continue;
    }
    if (!isPlaceholder) {
      skipped++;
      continue;
    }

    const imageUrl = `/assets/shop/${file}`;
    console.log(
      `${dryRun ? "[dry-run] " : ""}update "${product.name}" (#${product.id}): ${product.imageUrl} -> ${imageUrl}`,
    );
    if (!dryRun) {
      await db.update(products).set({ imageUrl }).where(eq(products.id, product.id));
    }
    updated++;
  }

  console.log(
    `\n${updated} updated, ${skipped} already have a real image, ${stillPlaceholder.length} placeholders with no blueprint image.`,
  );
  if (stillPlaceholder.length > 0) {
    console.log("Still need photos from another source:");
    for (const name of stillPlaceholder) console.log(`  - ${name}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
