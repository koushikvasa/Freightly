// Acceptance check for Part B.
// Run from the repo root:
//   NODE_OPTIONS=--use-system-ca npx tsx --env-file=.env.local scripts/test-rates.ts
//
// Calls getRates() with a real NY -> MA, light-but-bulky parcel (demo box) and
// prints the merged options. Expect multiple carriers, each with a live price
// plus seeded reliability / pickup / drop-off fields.

import { getRates } from "../lib/getRates";
import type { Shipment } from "../lib/types";

const shipment: Shipment = {
  originStreet: "350 5th Ave",
  originCity: "New York",
  originState: "NY",
  originZip: "10001",
  originCountry: "US",
  originLat: 40.748,
  originLng: -73.9857,

  destStreet: "1 City Hall Sq",
  destCity: "Boston",
  destState: "MA",
  destZip: "02108",
  destCountry: "US",

  weightKg: 3,
  lengthCm: 90,
  widthCm: 60,
  heightCm: 50,
  category: "general",
};

async function main() {
  const result = await getRates(shipment);

  console.log(`Got ${result.options.length} options.`);
  console.log(`cheapest: ${result.cheapest} | mostReliable: ${result.mostReliable}\n`);
  for (const o of result.options) {
    console.log(
      `${o.carrier.padEnd(12)} ${o.service.padEnd(28)} ` +
        `$${o.price.toFixed(2).padStart(7)} ${o.currency}  ` +
        `ETA ${o.etaDays ?? "n/a"}d  rel ${o.reliability}/${o.onTimePct}%  ` +
        `${o.pickupType}${o.pickupCost ? " +$" + o.pickupCost : ""}  ` +
        `drop ${o.dropoffStatus ?? "n/a"}${o.dropoffHours ? " " + o.dropoffHours : ""}` +
        `${o.dropoffStatus === "closing_soon" ? " (closes in " + o.dropoffClosesInMin + "m)" : ""}` +
        `${o.nearestDropoffKm != null ? "  " + o.nearestDropoffKm + "km" : ""}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
