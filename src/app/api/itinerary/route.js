import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// This API takes plain English and returns a structured itinerary JSON.
// IMPORTANT: AI suggests. User can edit. Distances remain blank for manual entry (Step 6 will add distance source).
export async function POST(req) {
  try {
    const { text } = await req.json();

    if (!text || text.trim().length < 5) {
      return Response.json({ error: "Please enter a voyage description." }, { status: 400 });
    }

    const system = `
You are a senior shipowner chartering manager building a voyage estimate itinerary.

Return ONLY valid JSON. No markdown. No commentary.

Goal:
Convert a messy voyage description into a structured itinerary that a voyage calculator can use.

Rules:
- Freight is ONLY $/mt or lumpsum (NO Worldscale).
- If a field is unknown, set it to null or "" (empty string for text fields).
- Do NOT guess sea distances. Leave distances as "" (empty string).
- You may suggest reasonable defaults for: speed_kn, sea cons_mt_per_day, port_cons_mt_per_day, port_days, waiting_days IF the user did not provide them,
  but keep them conservative and clearly place them as values (user will edit).
- If multiple discharge ports are mentioned, create separate port calls and legs.
- Include bunkering stops ONLY if user mentions bunkering or known bunkering location explicitly.
- Use metric tonnes. Use USD.
- Include commission_pct default 2.5 if not specified.
- Keep the itinerary logical: portCalls ordered; legs connect consecutive ports.

Required JSON shape:
{
  "portCalls": [
    {
      "name": "",
      "type": "start|load|discharge|bunker|canal|other",
      "port_days": "",
      "waiting_days": "",
      "port_cons_mt_per_day": "",
      "port_cost_usd": "",
      "bunker_purchase_qty_mt": "",
      "bunker_purchase_price_usd_per_mt": ""
    }
  ],
  "legs": [
    {
      "from": "",
      "to": "",
      "distance_nm": "",
      "speed_kn": "",
      "cons_mt_per_day": ""
    }
  ],
  "revenue": {
    "cargo_qty_mt": "",
    "freight_type": "per_mt|lumpsum",
    "freight_usd_per_mt": "",
    "freight_lumpsum_usd": "",
    "commission_pct": ""
  },
  "costs": {
    "bunker_price_usd_per_mt": "",
    "canal_tolls_usd": "",
    "other_costs_usd": ""
  },
  "assumptions_notes": ""
}
`;

    const user = `Voyage description:\n${text}`;

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
    });

    const raw = response.choices?.[0]?.message?.content || "";

    // Try to parse. If parsing fails, return raw so UI can show it.
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return Response.json({ error: "AI returned non-JSON. Showing raw.", raw }, { status: 200 });
    }

    return Response.json({ data: parsed }, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: "Server error while calling OpenAI.", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
