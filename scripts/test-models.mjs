// Probe which AI Gateway model slugs work on the current tier.
//   node --use-system-ca --env-file=.env.local scripts/test-models.mjs
import { generateText } from "ai";

const models = [
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-3.5-haiku",
  "anthropic/claude-3-haiku",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash",
];

for (const model of models) {
  try {
    const { text } = await generateText({ model, prompt: "Reply with the single word OK." });
    console.log(`OK    ${model}  -> ${text.trim().slice(0, 20)}`);
  } catch (e) {
    const msg = (e?.message || String(e)).split("\n")[0].slice(0, 80);
    console.log(`FAIL  ${model}  -> ${msg}`);
  }
}
