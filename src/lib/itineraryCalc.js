// src/lib/itineraryCalc.js
// Deterministic itinerary engine: sums legs + port calls.
// Supports: multi-port, bunkering stops, manual distances.
// IMPORTANT: If any leg distance is missing/zero, we return a friendly "missing_distance" status.

export function round(n, dp = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function calcItinerary(voyage) {
  const { legs = [], portCalls = [], revenue = {}, costs = {} } = voyage || {};

  if (!Array.isArray(portCalls) || portCalls.length < 2) {
    return { error: "Add at least 2 port calls (start + destination)." };
  }
  if (!Array.isArray(legs) || legs.length < 1) {
    return { error: "Add at least 1 leg (between ports)." };
  }

  // Check missing distances (we don't guess distances)
  const missingDistanceLegs = [];
  for (let i = 0; i < legs.length; i++) {
    const dist = Number(legs[i]?.distance_nm || 0);
    if (!(dist > 0)) missingDistanceLegs.push(i + 1);
  }
  if (missingDistanceLegs.length > 0) {
    return {
      status: "missing_distance",
      message: `Add distance (nm) for leg(s): ${missingDistanceLegs.join(", ")}. Distances are intentionally blank after AI draft.`,
      missingDistanceLegs,
    };
  }

  // --- Sum sea time & sea consumption from legs ---
  let sea_days_total = 0;
  let bunkers_sea_total = 0;

  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    const dist = Number(L.distance_nm || 0);
    const spd = Number(L.speed_kn || 0);
    const cons = Number(L.cons_mt_per_day || 0);

    if (spd <= 0) return { error: `Leg ${i + 1}: speed must be > 0.` };

    const sea_days = dist / (spd * 24);
    const bunkers = sea_days * cons;

    sea_days_total += sea_days;
    bunkers_sea_total += bunkers;
  }

  // --- Sum port time, waiting, port consumption, port costs ---
  let port_days_total = 0;
  let waiting_days_total = 0;
  let bunkers_port_total = 0;
  let port_cost_total = 0;

  for (let i = 0; i < portCalls.length; i++) {
    const P = portCalls[i];
    const portDays = Number(P.port_days || 0);
    const waitDays = Number(P.waiting_days || 0);
    const portCons = Number(P.port_cons_mt_per_day || 0);
    const portCost = Number(P.port_cost_usd || 0);

    port_days_total += portDays;
    waiting_days_total += waitDays;
    bunkers_port_total += (portDays + waitDays) * portCons;
    port_cost_total += portCost;
  }

  const voyage_days = sea_days_total + port_days_total + waiting_days_total;
  if (voyage_days <= 0) return { error: "Total voyage days is 0 or negative. Check inputs." };

  const bunkers_total = bunkers_sea_total + bunkers_port_total;

  // --- Bunkering purchases (optional): if any qty entered, cost uses purchases ---
  let bunkers_purchased_total = 0;
  let bunker_cost_from_purchases = 0;

  for (let i = 0; i < portCalls.length; i++) {
    const P = portCalls[i];
    const qty = Number(P.bunker_purchase_qty_mt || 0);
    const price = Number(P.bunker_purchase_price_usd_per_mt || 0);
    if (qty > 0) {
      bunkers_purchased_total += qty;
      bunker_cost_from_purchases += qty * price;
    }
  }

  const bunker_price_blended = Number(costs.bunker_price_usd_per_mt || 0);
  const bunker_cost_fallback = bunkers_total * bunker_price_blended;

  const bunker_cost =
    bunkers_purchased_total > 0 ? bunker_cost_from_purchases : bunker_cost_fallback;

  const canal_tolls_usd = Number(costs.canal_tolls_usd || 0);
  const other_costs_usd = Number(costs.other_costs_usd || 0);

  const voyage_costs_total = bunker_cost + port_cost_total + canal_tolls_usd + other_costs_usd;

  // --- Revenue ---
  const cargo_qty_mt = Number(revenue.cargo_qty_mt || 0);
  const freight_type = revenue.freight_type; // "per_mt" | "lumpsum"
  const freight_usd_per_mt = Number(revenue.freight_usd_per_mt || 0);
  const freight_lumpsum_usd = Number(revenue.freight_lumpsum_usd || 0);
  const commission_pct = Number(revenue.commission_pct || 0);

  let gross_freight = 0;
  if (freight_type === "per_mt") {
    if (cargo_qty_mt <= 0) return { error: "Cargo qty must be > 0 for $/mt freight." };
    gross_freight = cargo_qty_mt * freight_usd_per_mt;
  } else if (freight_type === "lumpsum") {
    gross_freight = freight_lumpsum_usd;
  } else {
    return { error: "Select freight type ($/mt or lumpsum)." };
  }

  const commission = gross_freight * (commission_pct / 100);
  const net_revenue = gross_freight - commission;

  const voyage_profit = net_revenue - voyage_costs_total;
  const tce_usd_per_day = voyage_profit / voyage_days;

  let bunker_warning = null;
  if (bunkers_purchased_total > 0) {
    const diff = bunkers_purchased_total - bunkers_total;
    bunker_warning =
      diff >= 0
        ? `Bunkers purchased exceed requirement by ~${round(diff, 1)} mt (OK if ROB build-up).`
        : `Bunkers purchased are short by ~${round(Math.abs(diff), 1)} mt (check ROB / add bunker stop).`;
  }

  return {
    status: "ok",
    sea_days_total,
    port_days_total,
    waiting_days_total,
    voyage_days,

    bunkers_sea_total,
    bunkers_port_total,
    bunkers_total,

    bunkers_purchased_total,
    bunker_cost,
    bunker_cost_method: bunkers_purchased_total > 0 ? "purchase_plan" : "blended_price",

    port_cost_total,
    canal_tolls_usd,
    other_costs_usd,
    voyage_costs_total,

    gross_freight,
    commission,
    net_revenue,
    voyage_profit,
    tce_usd_per_day,

    bunker_warning,
  };
}

export function solveFreightPerMtForTargetTCE({
  target_tce_usd_per_day,
  voyage_days,
  voyage_costs_total,
  commission_pct,
  cargo_qty_mt,
}) {
  if (!target_tce_usd_per_day || !voyage_days || !cargo_qty_mt) return null;
  const c = (commission_pct || 0) / 100;
  const required_gross =
    (target_tce_usd_per_day * voyage_days + (voyage_costs_total || 0)) / (1 - c);
  const required_per_mt = required_gross / cargo_qty_mt;
  return { required_gross, required_per_mt };
}
