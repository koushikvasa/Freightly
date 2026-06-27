// Ad-hoc: two different random US routes through getRates.
//   NODE_OPTIONS=--use-system-ca npx tsx --env-file=.env.local scripts/test-rates-random.ts

import { getRates } from "../lib/getRates";
import type { Shipment } from "../lib/types";

const shipments: { label: string; s: Shipment }[] = [
  {
    label: "Los Angeles, CA -> Seattle, WA  (small heavy box: 5kg, 30x25x20)",
    s: {
      originStreet: "1200 Getty Center Dr", originCity: "Los Angeles", originState: "CA",
      originZip: "90049", originLat: 34.0780, originLng: -118.4740,
      destStreet: "400 Broad St", destCity: "Seattle", destState: "WA", destZip: "98109",
      weightKg: 5, lengthCm: 30, widthCm: 25, heightCm: 20, category: "general",
    },
  },
  {
    label: "Miami, FL -> Chicago, IL  (light bulky box: 2kg, 70x50x40)",
    s: {
      originStreet: "1101 Biscayne Blvd", originCity: "Miami", originState: "FL",
      originZip: "33132", originLat: 25.7866, originLng: -80.1869,
      destStreet: "233 S Wacker Dr", destCity: "Chicago", destState: "IL", destZip: "60606",
      weightKg: 2, lengthCm: 70, widthCm: 50, heightCm: 40, category: "general",
    },
  },
];

async function main() {
  for (const { label, s } of shipments) {
    console.log("\n=== " + label + " ===");
    const r = await getRates(s);
    console.log(`${r.options.length} options | cheapest: ${r.cheapest} | mostReliable: ${r.mostReliable}`);
    for (const o of r.options) {
      console.log(
        `  ${o.carrier.padEnd(6)} ${o.service.padEnd(26)} $${o.price.toFixed(2).padStart(7)}  ` +
          `ETA ${(o.etaDays ?? "n/a") + "d"}  rel ${o.reliability}/${o.onTimePct}%  ` +
          `${o.pickupType}${o.pickupCost ? " +$" + o.pickupCost : ""}  ` +
          `drop ${o.dropoffStatus ?? "n/a"}${o.nearestDropoffKm != null ? "  " + o.nearestDropoffKm + "km" : ""}`
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
