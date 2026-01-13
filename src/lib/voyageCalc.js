// src/lib/voyageCalc.js

export function round(n, dp = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function calcVoyage(input) {
  // Expect numeric inputs (or null). Keep deterministic.
  const {
    distance_ballast_nm,
    distance_laden_nm,
    speed_ballast_kn,
    speed_laden_kn,
    cons_ballast_mt_per_day,
    cons_laden_mt_per_day,
    cons_port_mt_per_day,
    port_days_load,
    port_days_discharge,
    waiting_days_load,
    waiting_days_discharge,
    bunker_price_usd_per_mt,
    port_cost_load_usd,
    port_cost_discharge_usd,
    canal_tolls_usd,
    other_costs_usd,
    cargo_qty_mt,
    freight_type, // "per_mt" | "lumpsum"
    freight_usd_per_mt,
    freight_lumpsum_usd,
    commission_pct
  } = input;

  // Validation (minimal guardrails)
  if (!distance_ballast_nm || !distance_laden_nm) {
    return { error: "Please enter both ballast and laden distance (nm)." };
  }
  if (!speed_ballast_kn || !speed_laden_kn) {
    return { error: "Please enter both ballast and laden speed (kn)." };
  }

  const sea_days_ballast = distance_ballast_nm / (speed_ballast_kn * 24);
  const sea_days_laden = distance_laden_nm / (speed_laden_kn * 24);
  const sea_days_total = sea_days_ballast + sea_days_laden;

  const port_days_total = (port_days_load || 0) + (port_days_discharge || 0);
  const waiting_days_total = (waiting_days_load || 0) + (waiting_days_discharge || 0);

  const voyage_days = sea_days_total + port_days_total + waiting_days_total;
  if (voyage_days <= 0) {
    return { error: "Total voyage days is 0 or negative. Check inputs." };
  }

  const bunkers_ballast = sea_days_ballast * (cons_ballast_mt_per_day || 0);
  const bunkers_laden = sea_days_laden * (cons_laden_mt_per_day || 0);
  const bunkers_port = (port_days_total + waiting_days_total) * (cons_port_mt_per_day || 0);
  const bunkers_total = bunkers_ballast + bunkers_laden + bunkers_port;

  const bunker_cost = bunkers_total * (bunker_price_usd_per_mt || 0);

  const port_cost_total = (port_cost_load_usd || 0) + (port_cost_discharge_usd || 0);
  const voyage_costs_total =
    bunker_cost + port_cost_total + (canal_tolls_usd || 0) + (other_costs_usd || 0);

  // Revenue (common for dry + tanker when priced $/mt or lumpsum)
  let gross_freight = 0;
  if (freight_type === "per_mt") {
    if (!cargo_qty_mt) return { error: "Cargo quantity is required for $/mt freight." };
    gross_freight = (cargo_qty_mt || 0) * (freight_usd_per_mt || 0);
  } else if (freight_type === "lumpsum") {
    gross_freight = freight_lumpsum_usd || 0;
  } else {
    return { error: "Please select freight type ($/mt or lumpsum)." };
  }

  const commission = gross_freight * ((commission_pct || 0) / 100);
  const net_revenue = gross_freight - commission;

  const voyage_profit = net_revenue - voyage_costs_total;
  const tce_usd_per_day = voyage_profit / voyage_days;

  return {
    sea_days_ballast,
    sea_days_laden,
    sea_days_total,
    port_days_total,
    waiting_days_total,
    voyage_days,
    bunkers_ballast,
    bunkers_laden,
    bunkers_port,
    bunkers_total,
    bunker_cost,
    port_cost_total,
    voyage_costs_total,
    gross_freight,
    commission,
    net_revenue,
    voyage_profit,
    tce_usd_per_day
  };
}

export function solveFreightPerMtForTargetTCE({
  target_tce_usd_per_day,
  voyage_days,
  voyage_costs_total,
  commission_pct,
  cargo_qty_mt
}) {
  if (!target_tce_usd_per_day || !voyage_days || !cargo_qty_mt) return null;
  const c = (commission_pct || 0) / 100;
  const required_gross =
    (target_tce_usd_per_day * voyage_days + (voyage_costs_total || 0)) / (1 - c);
  const required_per_mt = required_gross / cargo_qty_mt;
  return { required_gross, required_per_mt };
}
