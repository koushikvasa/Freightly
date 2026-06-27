// Shared types for Freightly.
// Shipment is the request shape; RateOption/RatesResult are produced by getRates;
// Recommendation + Quote are what we persist to Supabase and read back for history.

export interface Shipment {
  // origin (full address — Shippo needs all of these)
  originStreet: string;
  originCity: string;
  originState: string;
  originZip: string;
  originCountry?: string; // defaults to "US" in the Shippo client

  // destination
  destStreet: string;
  destCity: string;
  destState: string;
  destZip: string;
  destCountry?: string; // defaults to "US"

  // parcel
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;

  // optional context
  category?: string;
  originLat?: number; // used to compute nearest drop-off distance
  originLng?: number;
}

export type PickupType = "scheduled" | "dropoff";
export type DropoffStatus = "open" | "closing_soon" | "closed";

// A single carrier+service option: live Shippo price/ETA merged with the
// seeded value-add layer (reliability, pickup, drop-off hours).
export interface RateOption {
  carrier: string;
  service: string;
  price: number;
  currency: string;
  etaDays: number | null;

  // value-add (from CARRIER_META)
  reliability: number; // 0..10
  onTimePct: number;
  pickupType: PickupType;
  pickupCost: number;

  // drop-off, computed against current time
  dropoffStatus: DropoffStatus | null;
  dropoffClosesInMin: number | null;
  dropoffHours: string | null; // e.g. "09:00–17:00"
  nearestDropoffKm: number | null;
  dropoffLat: number | null; // for the map
  dropoffLng: number | null;
}

export interface RatesResult {
  options: RateOption[];
  cheapest: string | null; // carrier name
  mostReliable: string | null; // carrier name
}

// The agent's pick.
export interface Recommendation {
  carrier: string;
  service: string;
  price: number;
  why: string;
}

// One persisted quote row (mirrors the `quotes` table columns).
export interface Quote {
  id: string;
  origin: string;
  destination: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  category: string;
  options: RateOption[];
  recommendation: Recommendation;
  created_at: string;
}
