import OpenAI from "openai";
import { detectVesselClassFromText } from "../../../lib/vesselProfiles";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ----- Small helpers (deterministic parsing) -----
function toNumberFromText(s) {
  if (!s) return null;
  const cleaned = String(s)
    .replace(/,/g, "")
    .trim()
    .toLowerCase();

  // Handles "8k", "8.5k", "8000"
  const m = cleaned.match(/^(\d+(\.\d+)?)(k)?$/);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  return m[3] ? base * 1000 : base;
}

function extractCargoQtyMt(text) {
  const t = (text || "").toLowerCase().replace(/,/g, " ");

  // Patterns like "55000 mt", "55,000 mts", "55k mt", "about 55k"
  const m =
    t.match(/(\d+(\.\d+)?)(\s*k)?\s*(mt|mts|ton|tons|tonnes)\b/) ||
    t.match(/(\d+(\.\d+)?)(\s*k)\b/);

  if (!m) return null;

  const n = toNumberFromText((m[1] || "") + (m[3] ? "k" : ""));
  if (!n) return null;

  // If "tons" etc. assume metric tons for simplicity (industry typical)
  return Math.round(n);
}

function extractRateMtPerDay(text, mode) {
  const t = (text || "").toLowerCase().replace(/,/g, " ");

  // Look for "8k shinc", "8000 shinc", "10k pwwd", "12000 tpd"
  // mode: "load" or "discharge"
  const re = /(\d+(\.\d+)?)(\s*k)?\s*(shinc|pwwd|pdpr|tpd|t\/d|mt\/day|mt per day|t per day)\b/g;

  let best = null;
  let match;
  while ((match = re.exec(t))) {
    const n = toNumberFromText((match[1] || "") + (match[3] ? "k" : ""));
    if (!n) continue;
    // choose the largest reasonable number found (often rate)
    if (!best || n > best) best = n;
  }

  // If user wrote “load at 8k shinc” and also “disch at 10k”, AI will help assign.
  // Here we just return one number; UI can still override.
  return best ? Math.round(best) : null;
}

export async function POST(req) {
  try {
    const { text } = await req.json();
    const inputText = String(text || "").trim();
    if (!inputText) {
      return Response.json({ error: "Missing input text." }, { status: 400 });
    }

    // Deterministic extraction
    const vesselClass = detectVesselClassFromText(inputText);
    const cargoQtyMt = extractCargoQtyMt(inputText);
    const anyRate = extractRateMtPerDay(inputText); // single best rate found
    // We'll also try to guess load/disch from keywords (very light heuristic)
    const hasLoadRate = /(load|loading|shinc)/i.test(inputText) ? anyRate : null;
    const hasDischRate = /(disch|discharge|pwwd|pdpr)/i.test(inputText) ? anyRate : null;

    // AI prompt: keep strict JSON output for our UI
    const system = `
You are a senior shipping/chartering operator. Convert free-text voyage idea into a STRUCTURED itinerary draft.

Return ONLY valid JSON (no markdown). Schema:
{
  "vesselClass": "ultramax|supramax|panamax|kamsarmax|capesize|handysize|handymax|mr|lr1|lr2|aframax|suezmax|vlcc|unknown",
  "derived": {
    "cargo_qty_mt": number|null,
    "load_rate_mt_per_day": number|null,
    "discharge_rate_mt_per_day": number|null
  },
  "portCalls": [
    {
      "name": string,
      "type": "start|load|discharge|bunker|canal|other|end",
      "port_days": number|null,
      "waiting_days": number|null,
      "port_cons_mt_per_day": number|null,
      "port_cost_usd": number|null,
      "bunker_purchase_qty_mt": number|null,
      "bunker_purchase_price_usd_per_mt": number|null
    }
  ],
  "legs": [
    {
      "from": string,
      "to": string,
      "distance_nm": null,
      "speed_kn": number|null,
      "cons_mt_per_day": number|null
    }
  ],
  "revenue": {
    "cargo_qty_mt": number|null,
    "freight_type": "per_mt",
    "freight_usd_per_mt": number|null,
    "freight_lumpsum_usd": null,
    "commission_pct": number|null
  },
  "costs": {
    "bunker_price_usd_per_mt": number|null,
    "canal_tolls_usd": number|null,
    "other_costs_usd": number|null
  }
}

Rules:
- Distances must be null (left blank intentionally).
- Use sensible defaults for missing values but prefer null if unknown.
- Include start and end ports if implied (open area, return).
`;

    const user = `
Voyage text:
${inputText}

Hints (deterministic extraction you may use, but you can override if clearly wrong):
- vesselClass: ${vesselClass}
- cargo_qty_mt: ${cargoQtyMt ?? "null"}
- load_rate_mt_per_day: ${hasLoadRate ?? "null"}
- discharge_rate_mt_per_day: ${hasDischRate ?? "null"}

Return only JSON.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "AI returned non-JSON output.", raw },
        { status: 200 }
      );
    }

    // Ensure derived exists; fill with deterministic extraction if AI left null
    data.vesselClass = data.vesselClass || vesselClass || "unknown";
    data.derived = data.derived || {};
    if (data.derived.cargo_qty_mt == null && cargoQtyMt != null)
      data.derived.cargo_qty_mt = cargoQtyMt;
    if (data.derived.load_rate_mt_per_day == null && hasLoadRate != null)
      data.derived.load_rate_mt_per_day = hasLoadRate;
    if (data.derived.discharge_rate_mt_per_day == null && hasDischRate != null)
      data.derived.discharge_rate_mt_per_day = hasDischRate;

    // Keep revenue cargo aligned if missing
    if (data.revenue && data.revenue.cargo_qty_mt == null && data.derived.cargo_qty_mt != null) {
      data.revenue.cargo_qty_mt = data.derived.cargo_qty_mt;
    }

    return Response.json({ data }, { status: 200 });
  } catch (e) {
    return Response.json(
      { error: "Server error in itinerary route.", raw: String(e?.message || e) },
      { status: 200 }
    );
  }
}
