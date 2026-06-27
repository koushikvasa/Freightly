import type { Shipment } from "./types";

// A single live rate from Shippo, normalized to numbers.
export interface ShippoRate {
  provider: string;
  service: string;
  price: number;
  currency: string;
  etaDays: number | null;
}

function buildBody(s: Shipment) {
  return {
    address_from: {
      name: "Freightly",
      street1: s.originStreet,
      city: s.originCity,
      state: s.originState,
      zip: s.originZip,
      country: s.originCountry ?? "US",
    },
    address_to: {
      name: "Customer",
      street1: s.destStreet,
      city: s.destCity,
      state: s.destState,
      zip: s.destZip,
      country: s.destCountry ?? "US",
    },
    parcels: [
      {
        length: String(s.lengthCm),
        width: String(s.widthCm),
        height: String(s.heightCm),
        distance_unit: "cm",
        weight: String(s.weightKg),
        mass_unit: "kg",
      },
    ],
    async: false,
  };
}

// One POST → normalized rates.
async function fetchOnce(s: Shipment): Promise<ShippoRate[]> {
  const res = await fetch("https://api.goshippo.com/shipments/", {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildBody(s)),
  });

  const data = await res.json();
  if (!data.rates) {
    throw new Error("No rates from Shippo: " + JSON.stringify(data.messages ?? data));
  }

  return data.rates.map(
    (r: any): ShippoRate => ({
      provider: r.provider,
      service: r.servicelevel?.name ?? "",
      price: Number(r.amount),
      currency: r.currency,
      etaDays: r.estimated_days ?? null,
    })
  );
}

// POST a shipment to Shippo and get back live multi-carrier rates.
//
// Shippo test mode is flaky: each call returns a random SUBSET of rates (often
// just the fast USPS master account, sometimes the full UPS+USPS set), and it
// collapses *concurrent* identical requests — so parallel calls don't help.
// Instead we make sequential calls and keep the richest response (most rates),
// stopping early once a call returns a full multi-carrier set.
export async function fetchShippoRates(s: Shipment, attempts = 6): Promise<ShippoRate[]> {
  let best: ShippoRate[] = [];
  let lastErr: unknown = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const rates = await fetchOnce(s);
      if (rates.length > best.length) best = rates;
      // A full set = 2+ carriers and several services. Good enough, stop early.
      const providers = new Set(best.map((r) => r.provider));
      if (providers.size >= 2 && best.length >= 5) break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (best.length === 0 && lastErr) throw lastErr;
  return best;
}
