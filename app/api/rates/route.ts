import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { getRates } from "@/lib/getRates";
import { supabase } from "@/lib/supabase";
import type { RatesResult, Recommendation } from "@/lib/types";

// Tool input mirrors the Shipment type.
const shipmentSchema = z.object({
  originStreet: z.string(),
  originCity: z.string(),
  originState: z.string(),
  originZip: z.string(),
  originCountry: z.string().optional(),
  destStreet: z.string(),
  destCity: z.string(),
  destState: z.string(),
  destZip: z.string(),
  destCountry: z.string().optional(),
  weightKg: z.number(),
  lengthCm: z.number(),
  widthCm: z.number(),
  heightCm: z.number(),
  category: z.string().optional(),
  originLat: z.number().optional(),
  originLng: z.number().optional(),
});

const SYSTEM = `You advise a small e-commerce seller. Call getRates once, then recommend ONE carrier+service.
Never recommend an option whose dropoffStatus is "closed". Default to cheapest; pay a small premium
(~15%) for clearly higher reliability, or for a door pickup over a far/closing drop-off. Mention the
delivery ETA and reliability. End with ONLY JSON:
{"recommendation":{"carrier":string,"service":string,"price":number,"why":string}}`;

// Pull the recommendation JSON out of the model's final text, tolerating code
// fences or a sentence of preamble.
function extractRecommendation(text: string): Recommendation {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned).recommendation;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]).recommendation;
    throw new Error("Could not parse recommendation from model output: " + text);
  }
}

// Deterministic recommender used when the agent is unavailable. Applies the
// same rules the agent is told to follow: never pick a closed drop-off, default
// to cheapest, but pay a small premium (~15%) for clearly higher reliability.
function fallbackRecommendation(full: RatesResult): Recommendation {
  const options = full.options;
  if (options.length === 0)
    return { carrier: "—", service: "—", price: 0, why: "No rates available." };

  const openish = options.filter((o) => o.dropoffStatus !== "closed");
  const pool = openish.length ? openish : options;
  const cheapest = pool[0]; // options arrive sorted by price asc
  const mostReliable = [...pool].sort((a, b) => b.reliability - a.reliability)[0];

  let pick = cheapest;
  let why: string;

  if (
    mostReliable !== cheapest &&
    mostReliable.reliability - cheapest.reliability >= 0.5 &&
    mostReliable.price <= cheapest.price * 1.15
  ) {
    pick = mostReliable;
    const delta = (pick.price - cheapest.price).toFixed(2);
    why = `Only $${delta} more than the cheapest, but noticeably more reliable at ${pick.reliability}/10 (${pick.onTimePct}% on-time)${
      pick.etaDays != null ? `, delivering in ~${pick.etaDays} days` : ""
    } — worth the small premium.`;
  } else {
    why = `Cheapest option that actually ships: $${pick.price.toFixed(2)}${
      pick.etaDays != null ? `, ~${pick.etaDays}-day delivery` : ""
    }, ${pick.onTimePct}% on-time (${pick.reliability}/10 reliability).`;
  }

  if (pick.dropoffStatus === "closing_soon" && pick.pickupType === "scheduled") {
    why += ` Its drop-off is closing soon, but it offers scheduled pickup${
      pick.pickupCost ? ` (+$${pick.pickupCost})` : ""
    }.`;
  }

  return { carrier: pick.carrier, service: pick.service, price: pick.price, why };
}

export async function POST(req: Request) {
  try {
    const shipment = await req.json();

    // Capture the tool's result so we don't re-run getRates (and re-hit Shippo)
    // just to persist the options.
    let captured: RatesResult | null = null;

    const ratesTool = tool({
      description:
        "Get live multi-carrier rates merged with reliability, pickup, and drop-off hours.",
      inputSchema: shipmentSchema,
      execute: async (input) => {
        const result = await getRates(input as never);
        captured = result;
        return result;
      },
    });

    let recommendation: Recommendation | null = null;
    try {
      const { text } = await generateText({
        // Resolved via the Vercel AI Gateway (AI_GATEWAY_API_KEY). Haiku 4.5 is
        // available on the free tier; Sonnet/Opus need paid credits. Override
        // with FREIGHTLY_MODEL once you've topped up (e.g. anthropic/claude-sonnet-4.6).
        model: process.env.FREIGHTLY_MODEL ?? "anthropic/claude-haiku-4.5",
        system: SYSTEM,
        prompt: `Shipment: ${JSON.stringify(shipment)}`,
        tools: { getRates: ratesTool },
        stopWhen: stepCountIs(5),
      });
      recommendation = extractRecommendation(text);
    } catch (agentErr) {
      // Agent unavailable (e.g. AI Gateway not provisioned) — fall back to a
      // deterministic pick so the app still works. Agent is still primary.
      console.error("Agent step failed, using fallback recommendation:", agentErr);
    }

    const full: RatesResult = captured ?? (await getRates(shipment));

    if (!recommendation) {
      recommendation = fallbackRecommendation(full);
    }

    const { error } = await supabase.from("quotes").insert({
      origin: shipment.originZip,
      destination: shipment.destZip,
      weight_kg: shipment.weightKg,
      length_cm: shipment.lengthCm,
      width_cm: shipment.widthCm,
      height_cm: shipment.heightCm,
      category: shipment.category ?? "general",
      options: full.options,
      recommendation,
    });
    if (error) console.error("Supabase insert failed:", error);

    return Response.json({ options: full.options, recommendation });
  } catch (err) {
    console.error("/api/rates failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
