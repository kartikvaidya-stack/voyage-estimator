import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Helpers
 */
function safeJsonParse(str) {
  try {
    return { ok: true, data: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function normName(s) {
  return String(s || "").trim().toLowerCase();
}

function isTruthyPortName(s) {
  return !!String(s || "").trim();
}

function rebuildLegsFromPortCalls(portCalls) {
  const legs = [];
  for (let i = 0; i < portCalls.length - 1; i++) {
    legs.push({
      from: portCalls[i].name,
      to: portCalls[i + 1].name,
      // distances intentionally blank
      distance_nm: null,
      speed_kn: null,
      cons_mt_per_day: null,
    });
  }
  return legs;
}

/**
 * Bunker placement post-processing rules:
 * 1) If bunker port name matches an existing port call name: merge bunker purchase into that port call, remove bunker call.
 * 2) If bunker call remains and ends up at the end, but user text indicates "before sailing" or "enroute",
 *    move bunker call between last load and first discharge (or after start if those don't exist).
 */
function applyBunkerRules(portCalls, text) {
  const t = String(text || "").toLowerCase();

  // Find duplicate names so we can merge bunker purchases into existing call
  const nameToFirstIndex = new Map();
  portCalls.forEach((p, idx) => {
    const n = normName(p?.name);
    if (!n) return;
    if (!nameToFirstIndex.has(n)) nameToFirstIndex.set(n, idx);
  });

  // Merge bunker calls into existing port calls if same name exists elsewhere
  const toRemove = new Set();
  for (let i = 0; i < portCalls.length; i++) {
    const p = portCalls[i];
    if (!p || p.type !== "bunker") continue;
    const n = normName(p.name);
    if (!n) continue;

    const firstIdx = nameToFirstIndex.get(n);
    if (firstIdx != null && firstIdx !== i) {
      // Merge bunker purchase fields
      const target = portCalls[firstIdx];
      const qty = p.bunker_purchase_qty_mt;
      const price = p.bunker_purchase_price_usd_per_mt;

      // Only overwrite if target is empty
      if (target) {
        if (target.bunker_purchase_qty_mt == null || String(target.bunker_purchase_qty_mt).trim() === "") {
          target.bunker_purchase_qty_mt = qty ?? "";
        }
        if (
          target.bunker_purchase_price_usd_per_mt == null ||
          String(target.bunker_purchase_price_usd_per_mt).trim() === ""
        ) {
          target.bunker_purchase_price_usd_per_mt = price ?? "";
        }
      }
      toRemove.add(i);
    }
  }

  let cleaned = portCalls.filter((_, idx) => !toRemove.has(idx));

  // If no bunker calls remain, we’re done
  const bunkerIdx = cleaned.findIndex((p) => p?.type === "bunker");
  if (bunkerIdx === -1) return cleaned;

  // If bunker call exists but user meant it to be early/enroute, and it is last/near last: reposition it
  const bunkerLast = bunkerIdx >= cleaned.length - 2; // last or second last (often end port repeats)
  const wantsBeforeSailing = t.includes("before sailing") || t.includes("prior to sailing");
  const wantsEnroute = t.includes("enroute") || t.includes("en route") || t.includes("on route");

  if ((wantsBeforeSailing || wantsEnroute) && bunkerLast) {
    const bunkerCall = cleaned[bunkerIdx];
    cleaned = cleaned.filter((_, idx) => idx !== bunkerIdx);

    // Find insertion point: after last load, before first discharge
    let lastLoad = -1;
    let firstDis = -1;

    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i]?.type === "load") lastLoad = i;
      if (firstDis === -1 && cleaned[i]?.type === "discharge") firstDis = i;
    }

    let insertAt = 1; // default after start
    if (lastLoad >= 0 && firstDis > lastLoad) insertAt = lastLoad + 1;
    else if (firstDis > 0) insertAt = firstDis; // before discharge if no load
    else insertAt = Math.min(1, cleaned.length);

    cleaned.splice(insertAt, 0, bunkerCall);
  }

  return cleaned;
}

/**
 * Ensure port call objects have all expected fields for UI
 */
function normalizePortCalls(portCalls) {
  return (portCalls || [])
    .filter((p) => p && isTruthyPortName(p.name))
    .map((p, idx) => ({
      name: String(p.name || "").trim(),
      type: String(p.type || (idx === 0 ? "start" : "other")),
      port_days: p.port_days ?? "",
      waiting_days: p.waiting_days ?? "",
      port_cons_mt_per_day: p.port_cons_mt_per_day ?? "",
      port_cost_usd: p.port_cost_usd ?? "",
      bunker_purchase_qty_mt: p.bunker_purchase_qty_mt ?? "",
      bunker_purchase_price_usd_per_mt: p.bunker_purchase_price_usd_per_mt ?? "",
    }));
}

function normalizeRevenue(revenue) {
  const r = revenue || {};
  return {
    cargo_qty_mt: r.cargo_qty_mt ?? null,
    freight_type: r.freight_type || "per_mt",
    freight_usd_per_mt: r.freight_usd_per_mt ?? null,
    freight_lumpsum_usd: r.freight_lumpsum_usd ?? null,
    commission_pct: r.commission_pct ?? 2.5,
  };
}

function normalizeCosts(costs) {
  const c = costs || {};
  return {
    bunker_price_usd_per_mt: c.bunker_price_usd_per_mt ?? 650,
    canal_tolls_usd: c.canal_tolls_usd ?? 0,
    other_costs_usd: c.other_costs_usd ?? 0,
  };
}

export async function POST(req) {
  try {
    const { text } = await req.json();
    const input = String(text || "").trim();
    if (!input) {
      return Response.json({ error: "No input text provided." }, { status: 400 });
    }

    /**
     * Prompt rules:
     * - Strict JSON only
     * - Bunker placement rules explained to the model
     * - Keep distances blank
     */
    const system = `
You are a shipping voyage planning assistant. Output STRICT JSON only, no markdown, no commentary.
The user writes voyage ideas in shipping language for dry bulk or tankers.

Key rules:
1) Build portCalls in the correct sequence as the ship will call.
2) If user mentions bunkering:
   - If bunker port is already in portCalls (same name), DO NOT create a new bunker call.
     Instead attach bunker_purchase_qty_mt and bunker_purchase_price_usd_per_mt to that existing port call.
   - Only create a new port call with type="bunker" if the bunker port is NOT already in the itinerary.
   - If user says "before sailing" or "enroute", bunker should appear BEFORE discharge (usually between load and discharge).
3) Distances MUST be null (blank). Do not guess distances.
4) Provide derived fields if possible:
   - cargo_qty_mt (number)
   - load_rate_mt_per_day (number) if user gave "8k shinc" etc
   - discharge_rate_mt_per_day (number) if user gave "10k pwwd" etc
5) Provide vesselClass if mentioned (e.g., ultramax, panamax, cape, handy, supramax, kamsarmax, mr, lr1, lr2, aframax, suezmax, vlcc). Otherwise "unknown".

Return JSON with keys:
{
  "vesselClass": "ultramax|panamax|...|unknown",
  "derived": { "cargo_qty_mt": number|null, "load_rate_mt_per_day": number|null, "discharge_rate_mt_per_day": number|null },
  "portCalls": [ { "name": string, "type": "start|load|discharge|bunker|canal|other|end",
                  "port_days": number|null, "waiting_days": number|null,
                  "port_cons_mt_per_day": number|null, "port_cost_usd": number|null,
                  "bunker_purchase_qty_mt": number|null, "bunker_purchase_price_usd_per_mt": number|null } ],
  "legs": [ { "from": string, "to": string, "distance_nm": null, "speed_kn": number|null, "cons_mt_per_day": number|null } ],
  "revenue": { "cargo_qty_mt": number|null, "freight_type": "per_mt|lumpsum", "freight_usd_per_mt": number|null, "freight_lumpsum_usd": number|null, "commission_pct": number|null },
  "costs": { "bunker_price_usd_per_mt": number|null, "canal_tolls_usd": number|null, "other_costs_usd": number|null }
}
    `.trim();

    const user = `User input:\n${input}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) {
      return Response.json(
        { error: "AI returned invalid JSON.", raw, parse_error: parsed.error },
        { status: 200 }
      );
    }

    let data = parsed.data || {};

    // Normalize shapes
    let portCalls = normalizePortCalls(data.portCalls || []);
    portCalls = applyBunkerRules(portCalls, input);

    // Ensure at least 2 ports
    if (portCalls.length < 2) {
      return Response.json(
        { error: "AI draft has insufficient ports. Please mention at least load and discharge.", raw },
        { status: 200 }
      );
    }

    // If model gave legs, we ignore distances and rebuild legs to match port call order
    const legs = rebuildLegsFromPortCalls(portCalls);

    const payload = {
      vesselClass: String(data.vesselClass || "unknown").toLowerCase(),
      derived: {
        cargo_qty_mt: data?.derived?.cargo_qty_mt ?? null,
        load_rate_mt_per_day: data?.derived?.load_rate_mt_per_day ?? null,
        discharge_rate_mt_per_day: data?.derived?.discharge_rate_mt_per_day ?? null,
      },
      portCalls,
      legs,
      revenue: normalizeRevenue(data.revenue),
      costs: normalizeCosts(data.costs),
    };

    return Response.json({ data: payload }, { status: 200 });
  } catch (e) {
    return Response.json(
      { error: "Server error in /api/itinerary", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
