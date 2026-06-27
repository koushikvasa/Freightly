import { fetchShippoRates } from "./shippo";
import { CARRIER_META, DEFAULT_META } from "./carrierMeta";
import type { Shipment, RateOption, RatesResult } from "./types";

// Straight-line distance between two lat/lng points, in km.
export function haversineKm(a: number, b: number, c: number, d: number) {
  const R = 6371,
    r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(c - a),
    dLon = r(d - b);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLon / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(1));
}

// Is the drop-off open right now? "closing_soon" = within 2h of close.
function dropoffStatus(open: string, close: string) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const o = oh * 60 + om,
    c = ch * 60 + cm;
  if (mins < o || mins >= c) return { status: "closed" as const, closesInMin: 0 };
  const left = c - mins;
  return {
    status: left <= 120 ? ("closing_soon" as const) : ("open" as const),
    closesInMin: left,
  };
}

// The core merge: live Shippo rates + seeded value-add layer → ranked RateOption[].
export async function getRates(s: Shipment): Promise<RatesResult> {
  const rates = await fetchShippoRates(s);

  const options: RateOption[] = rates
    .map((r) => {
      const meta = CARRIER_META[r.provider] ?? DEFAULT_META;
      const drop = meta.dropoff
        ? dropoffStatus(meta.dropoff.open, meta.dropoff.close)
        : null;
      const nearestDropoffKm =
        meta.dropoff && s.originLat != null && s.originLng != null
          ? haversineKm(s.originLat, s.originLng, meta.dropoff.lat, meta.dropoff.lng)
          : null;

      return {
        carrier: r.provider,
        service: r.service,
        price: r.price,
        currency: r.currency,
        etaDays: r.etaDays,
        reliability: meta.reliability,
        onTimePct: meta.onTimePct,
        pickupType: meta.offersScheduledPickup
          ? ("scheduled" as const)
          : ("dropoff" as const),
        pickupCost: meta.pickupCost,
        dropoffStatus: drop?.status ?? null,
        dropoffClosesInMin: drop?.closesInMin ?? null,
        dropoffHours: meta.dropoff
          ? `${meta.dropoff.open}–${meta.dropoff.close}`
          : null,
        nearestDropoffKm,
        dropoffLat: meta.dropoff?.lat ?? null,
        dropoffLng: meta.dropoff?.lng ?? null,
      };
    })
    .sort((a, b) => a.price - b.price);

  return {
    options,
    cheapest: options[0]?.carrier ?? null,
    mostReliable:
      [...options].sort((a, b) => b.reliability - a.reliability)[0]?.carrier ?? null,
  };
}
