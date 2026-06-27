// Throwaway connection check for Part A.
// Run from the repo root:
//   node --use-system-ca --env-file=.env.local scripts/test-supabase.mjs
//
// NOTE: --use-system-ca is required on this machine — a TLS-inspecting agent
// (nllMonFltProxy) MITMs HTTPS, so Node must trust the Windows cert store or
// every outbound request (Supabase, Shippo, AI Gateway) fails with "fetch failed".
//
// Inserts one dummy quote row, reads it back, prints it, then deletes it so the
// table stays clean. If this prints a row, Supabase + the service-role key work.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing env. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, " +
      "and run with: node --env-file=.env.local scripts/test-supabase.mjs"
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const sample = {
  origin: "10001",
  destination: "02108",
  weight_kg: 3,
  length_cm: 90,
  width_cm: 60,
  height_cm: 50,
  category: "general",
  options: [{ carrier: "USPS", service: "Priority Mail", price: 12.34, currency: "USD" }],
  recommendation: { carrier: "USPS", service: "Priority Mail", price: 12.34, why: "test row" },
};

console.log("Inserting test row...");
const { data: inserted, error: insertErr } = await supabase
  .from("quotes")
  .insert(sample)
  .select()
  .single();

if (insertErr) {
  console.error("Insert failed:", insertErr);
  process.exit(1);
}
console.log("Inserted row id:", inserted.id);

console.log("Reading it back...");
const { data: readBack, error: readErr } = await supabase
  .from("quotes")
  .select()
  .eq("id", inserted.id)
  .single();

if (readErr) {
  console.error("Read failed:", readErr);
  process.exit(1);
}
console.log("Read back:", JSON.stringify(readBack, null, 2));

// Clean up so the demo history starts empty.
await supabase.from("quotes").delete().eq("id", inserted.id);
console.log("Cleaned up test row. Part A connection OK ✅");
