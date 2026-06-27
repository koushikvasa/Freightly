// Freightly's value-add layer. None of these fields exist in any rate API —
// they are SEEDED placeholders. In production, reliability/onTimePct would come
// from carrier performance data and dropoff coords from a location lookup.
// Keyed by Shippo's `provider` string.

export interface CarrierMeta {
  reliability: number; // 0..10
  onTimePct: number;
  offersScheduledPickup: boolean;
  pickupCost: number;
  dropoff: { open: string; close: string; lat: number; lng: number } | null;
}

export const CARRIER_META: Record<string, CarrierMeta> = {
  USPS: {
    reliability: 8.3,
    onTimePct: 92,
    offersScheduledPickup: true,
    pickupCost: 0,
    dropoff: { open: "09:00", close: "17:00", lat: 40.7506, lng: -73.9935 },
  },
  UPS: {
    reliability: 9.1,
    onTimePct: 96,
    offersScheduledPickup: true,
    pickupCost: 6,
    dropoff: { open: "08:00", close: "19:00", lat: 40.7411, lng: -73.9897 },
  },
  FedEx: {
    reliability: 9.0,
    onTimePct: 95,
    offersScheduledPickup: true,
    pickupCost: 5,
    dropoff: { open: "08:00", close: "20:00", lat: 40.744, lng: -73.9903 },
  },
  "DHL Express": {
    reliability: 8.8,
    onTimePct: 94,
    offersScheduledPickup: true,
    pickupCost: 8,
    dropoff: { open: "09:00", close: "18:00", lat: 40.7527, lng: -73.9772 },
  },
};

// Fallback for any carrier Shippo returns that we haven't seeded yet.
export const DEFAULT_META: CarrierMeta = {
  reliability: 7.0,
  onTimePct: 88,
  offersScheduledPickup: false,
  pickupCost: 0,
  dropoff: null,
};
