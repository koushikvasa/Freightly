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
        // Resolved via the Vercel AI Gateway (AI_GATEWAY_API_KEY). If the gateway
        // rejects this slug, try "anthropic/claude-sonnet-4-6".
        model: "anthropic/claude-sonnet-4.6",
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
      const pick =
        full.options.find((o) => o.dropoffStatus !== "closed") ?? full.options[0];
      recommendation = pick
        ? {
            carrier: pick.carrier,
            service: pick.service,
            price: pick.price,
            why: `Cheapest available option at $${pick.price.toFixed(2)}, ${
              pick.etaDays ?? "n/a"
            }-day delivery, ${pick.onTimePct}% on-time. (Automatic pick — AI recommendation unavailable.)`,
          }
        : { carrier: "—", service: "—", price: 0, why: "No rates available." };
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
