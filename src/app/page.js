"use client";

import { useEffect, useMemo, useState } from "react";
import { calcItinerary, round, solveFreightPerMtForTargetTCE } from "../lib/itineraryCalc";
import { lookupDistanceNm, saveDistanceNm, clearUserRoutes } from "../lib/routeTable";

function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const styles = {
  page: { padding: 28, fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto", background: "#f7f9fc", minHeight: "100vh", color: "#0f172a" },
  header: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 },
  title: { margin: 0, fontSize: 26, color: "#14213d" },
  subtitle: { margin: "6px 0 0", color: "#4b5563", lineHeight: 1.35 },
  badge: { padding: "8px 10px", borderRadius: 12, background: "#eef4ff", border: "1px solid #d7e3ff", color: "#1e3a8a", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" },
  grid: { display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 16 },
  card: { background: "#ffffff", border: "1px solid #e6eaf2", padding: 16, borderRadius: 14, boxShadow: "0 6px 18px rgba(20, 30, 60, 0.06)" },
  sectionTitle: { margin: "14px 0 8px", fontSize: 15, color: "#0f172a" },
  small: { color: "#64748b", fontSize: 12, lineHeight: 1.35 },
  btnRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 },
  btn: { padding: "10px 12px", borderRadius: 12, border: "1px solid #d7e3ff", background: "#eef4ff", cursor: "pointer", fontWeight: 800, color: "#1e3a8a" },
  btnDark: { padding: "10px 12px", borderRadius: 12, border: "1px solid #111827", background: "#111827", cursor: "pointer", fontWeight: 900, color: "#ffffff" },
  btnDanger: { padding: "10px 12px", borderRadius: 12, border: "1px solid #fecaca", background: "#fff1f2", cursor: "pointer", fontWeight: 800, color: "#9f1239" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" },
  th: { textAlign: "left", fontSize: 12, color: "#64748b", padding: "0 8px" },
  td: { padding: "0 8px", verticalAlign: "top" },
  input: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d9e0ee", outline: "none", background: "#fbfdff" },
  select: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d9e0ee", background: "#fbfdff" },
  textarea: { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #d9e0ee", outline: "none", background: "#fbfdff", minHeight: 110, resize: "vertical", fontFamily: "inherit", lineHeight: 1.35 },
  warn: { padding: 12, background: "#fff7ed", borderRadius: 12, border: "1px solid #fed7aa", color: "#9a3412", whiteSpace: "pre-wrap" },
  info: { padding: 12, background: "#ecfeff", borderRadius: 12, border: "1px solid #a5f3fc", color: "#0e7490", whiteSpace: "pre-wrap" },
  kv: { display: "flex", justifyContent: "space-between", padding: "5px 0" },
  kvLabel: { color: "#334155", fontSize: 13 },
  kvValue: { fontWeight: 800, color: "#0f172a" },
  tceBox: { marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid #d7e3ff", background: "#eef4ff" },
  tceTitle: { fontSize: 12, color: "#1e3a8a", fontWeight: 900, letterSpacing: 0.3 },
  tceValue: { fontSize: 36, fontWeight: 900, marginTop: 4, color: "#0b1b4f" },
  divider: { height: 1, background: "#edf2f7", margin: "12px 0" },
  miniBtn: { padding: "8px 10px", borderRadius: 10, border: "1px solid #d7e3ff", background: "#eef4ff", cursor: "pointer", fontWeight: 900, color: "#1e3a8a", width: "100%" },
};

export default function Home() {
  // --- AI ---
  const [aiText, setAiText] = useState(
    "Umax open Singapore. Load Palembang coal about 55,000 mt. Discharge Vizag and Kandla. Want idea for 16,000 USD/day TCE. Bunkers Singapore."
  );
  const [aiRaw, setAiRaw] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiDraft, setAiDraft] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // --- Data ---
  const [portCalls, setPortCalls] = useState([
    { name: "Singapore", type: "start", port_days: "0", waiting_days: "0", port_cons_mt_per_day: "4", port_cost_usd: "0", bunker_purchase_qty_mt: "800", bunker_purchase_price_usd_per_mt: "650" },
    { name: "Palembang", type: "load", port_days: "4", waiting_days: "1", port_cons_mt_per_day: "4", port_cost_usd: "120000", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
    { name: "Vizag", type: "discharge", port_days: "5", waiting_days: "1", port_cons_mt_per_day: "4", port_cost_usd: "140000", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
    { name: "Kandla", type: "discharge", port_days: "4", waiting_days: "1", port_cons_mt_per_day: "4", port_cost_usd: "120000", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
    { name: "Singapore", type: "end", port_days: "0", waiting_days: "0", port_cons_mt_per_day: "4", port_cost_usd: "0", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
  ]);

  const [legs, setLegs] = useState([
    { from: "Singapore", to: "Palembang", distance_nm: "450", speed_kn: "13", cons_mt_per_day: "26" },
    { from: "Palembang", to: "Vizag", distance_nm: "2500", speed_kn: "12.5", cons_mt_per_day: "28" },
    { from: "Vizag", to: "Kandla", distance_nm: "950", speed_kn: "12.5", cons_mt_per_day: "28" },
    { from: "Kandla", to: "Singapore", distance_nm: "2350", speed_kn: "13", cons_mt_per_day: "26" },
  ]);

  const [revenue, setRevenue] = useState({
    cargo_qty_mt: "55000",
    freight_type: "per_mt",
    freight_usd_per_mt: "35",
    freight_lumpsum_usd: "",
    commission_pct: "2.5",
  });

  const [costs, setCosts] = useState({
    bunker_price_usd_per_mt: "650",
    canal_tolls_usd: "0",
    other_costs_usd: "30000",
  });

  const [targetTce, setTargetTce] = useState("16000");
  const [distMsg, setDistMsg] = useState("");
  const [preferSaved, setPreferSaved] = useState(true);

  // On page load: if saved route exists, override distances (so refresh uses saved)
  useEffect(() => {
    if (!preferSaved) return;
    setLegs((prev) =>
      prev.map((l) => {
        const d = lookupDistanceNm(l.from, l.to);
        return d ? { ...l, distance_nm: String(d) } : l;
      })
    );
  }, [preferSaved]);

  // --- Calculator input object ---
  const voyage = useMemo(() => {
    return {
      portCalls: portCalls.map((p) => ({
        ...p,
        port_days: num(p.port_days) || 0,
        waiting_days: num(p.waiting_days) || 0,
        port_cons_mt_per_day: num(p.port_cons_mt_per_day) || 0,
        port_cost_usd: num(p.port_cost_usd) || 0,
        bunker_purchase_qty_mt: num(p.bunker_purchase_qty_mt) || 0,
        bunker_purchase_price_usd_per_mt: num(p.bunker_purchase_price_usd_per_mt) || 0,
      })),
      legs: legs.map((l) => ({
        ...l,
        distance_nm: num(l.distance_nm) || 0,
        speed_kn: num(l.speed_kn) || 0,
        cons_mt_per_day: num(l.cons_mt_per_day) || 0,
      })),
      revenue: {
        cargo_qty_mt: num(revenue.cargo_qty_mt) || 0,
        freight_type: revenue.freight_type,
        freight_usd_per_mt: num(revenue.freight_usd_per_mt) || 0,
        freight_lumpsum_usd: num(revenue.freight_lumpsum_usd) || 0,
        commission_pct: num(revenue.commission_pct) || 0,
      },
      costs: {
        bunker_price_usd_per_mt: num(costs.bunker_price_usd_per_mt) || 0,
        canal_tolls_usd: num(costs.canal_tolls_usd) || 0,
        other_costs_usd: num(costs.other_costs_usd) || 0,
      },
    };
  }, [portCalls, legs, revenue, costs]);

  const result = useMemo(() => calcItinerary(voyage), [voyage]);

  const solver = useMemo(() => {
    if (result?.error || result?.status !== "ok") return null;
    if (revenue.freight_type !== "per_mt") return null;

    return solveFreightPerMtForTargetTCE({
      target_tce_usd_per_day: num(targetTce),
      voyage_days: result.voyage_days,
      voyage_costs_total: result.voyage_costs_total,
      commission_pct: num(revenue.commission_pct),
      cargo_qty_mt: num(revenue.cargo_qty_mt),
    });
  }, [result, revenue, targetTce]);

  // --- Actions ---
  function fillDistancesFromRouteTable() {
    const missingPairs = [];
    let filled = 0;
    let missing = 0;

    const next = legs.map((l) => {
      const d = lookupDistanceNm(l.from, l.to);
      // If preferSaved = true, we ALWAYS apply saved/built-in when available (even if already has a number)
      if (preferSaved && d) {
        // count only if it changes or was blank
        const current = num(l.distance_nm) || 0;
        if (current !== d) filled += 1;
        return { ...l, distance_nm: String(d) };
      }

      // if not preferSaved, only fill blanks
      const current = num(l.distance_nm) || 0;
      if (current > 0) return l;

      if (d) {
        filled += 1;
        return { ...l, distance_nm: String(d) };
      } else {
        missing += 1;
        missingPairs.push(`${l.from} → ${l.to}`);
        return l;
      }
    });

    setLegs(next);

    if (missingPairs.length > 0) {
      setDistMsg(`Route table fill: ${filled} updated, ${missing} missing.\nMissing:\n- ${missingPairs.join("\n- ")}`);
    } else {
      setDistMsg(`Route table fill: ${filled} updated, 0 missing.`);
    }
  }

  function saveOneLeg(idx) {
    const l = legs[idx];
    const d = num(l.distance_nm) || 0;
    const r = saveDistanceNm(l.from, l.to, d);
    if (r.ok) setDistMsg(`Saved: ${l.from} → ${l.to} = ${d} nm (stored on this browser).`);
    else setDistMsg(`Not saved: ${l.from} → ${l.to}. ${r.error}`);
  }

  function saveAllLegDistances() {
    let saved = 0;
    let skipped = 0;
    const problems = [];

    for (const l of legs) {
      const d = num(l.distance_nm) || 0;
      if (d > 0 && l.from && l.to) {
        const r = saveDistanceNm(l.from, l.to, d);
        if (r.ok) saved += 1;
        else problems.push(`${l.from} → ${l.to}: ${r.error}`);
      } else {
        skipped += 1;
      }
    }

    let msg = `Saved routes: ${saved}. Skipped: ${skipped}.`;
    if (problems.length) msg += `\nIssues:\n- ${problems.join("\n- ")}`;
    setDistMsg(msg);
  }

  function clearSavedRoutes() {
    clearUserRoutes();
    setDistMsg("Cleared saved routes (browser). Built-in starter routes remain.");
  }

  async function runAI() {
    setAiLoading(true);
    setAiError("");
    setAiRaw("");
    setAiDraft(null);
    setDistMsg("");

    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      const data = await res.json();

      if (data?.data) setAiDraft(data.data);
      else {
        setAiError(data?.error || "AI did not return structured data.");
        setAiRaw(data?.raw || "");
      }
    } catch (e) {
      setAiError("Failed to call AI.");
      setAiRaw(String(e?.message || e));
    } finally {
      setAiLoading(false);
    }
  }

  function applyAIDraft() {
    if (!aiDraft) return;

    // Apply ports
    if (Array.isArray(aiDraft.portCalls) && aiDraft.portCalls.length >= 2) {
      const pc = aiDraft.portCalls.map((p) => ({
        name: p.name ?? "",
        type: p.type ?? "other",
        port_days: p.port_days ?? "",
        waiting_days: p.waiting_days ?? "",
        port_cons_mt_per_day: p.port_cons_mt_per_day ?? "4",
        port_cost_usd: p.port_cost_usd ?? "",
        bunker_purchase_qty_mt: p.bunker_purchase_qty_mt ?? "",
        bunker_purchase_price_usd_per_mt: p.bunker_purchase_price_usd_per_mt ?? "",
      }));
      setPortCalls(pc);

      // Apply legs if provided, else rebuild
      if (Array.isArray(aiDraft.legs) && aiDraft.legs.length >= 1) {
        const lg = aiDraft.legs.map((l) => ({
          from: l.from ?? "",
          to: l.to ?? "",
          distance_nm: l.distance_nm ?? "",
          speed_kn: l.speed_kn ?? "12.5",
          cons_mt_per_day: l.cons_mt_per_day ?? "28",
        }));
        setLegs(lg);
      }
    }

    // Apply revenue/costs if present
    if (aiDraft.revenue) {
      setRevenue((prev) => ({
        ...prev,
        cargo_qty_mt: aiDraft.revenue.cargo_qty_mt ?? prev.cargo_qty_mt,
        freight_type: aiDraft.revenue.freight_type ?? prev.freight_type,
        freight_usd_per_mt: aiDraft.revenue.freight_usd_per_mt ?? prev.freight_usd_per_mt,
        freight_lumpsum_usd: aiDraft.revenue.freight_lumpsum_usd ?? prev.freight_lumpsum_usd,
        commission_pct: aiDraft.revenue.commission_pct ?? prev.commission_pct,
      }));
    }
    if (aiDraft.costs) {
      setCosts((prev) => ({
        ...prev,
        bunker_price_usd_per_mt: aiDraft.costs.bunker_price_usd_per_mt ?? prev.bunker_price_usd_per_mt,
        canal_tolls_usd: aiDraft.costs.canal_tolls_usd ?? prev.canal_tolls_usd,
        other_costs_usd: aiDraft.costs.other_costs_usd ?? prev.other_costs_usd,
      }));
    }

    setDistMsg("Applied AI draft. Now click Fill Distances. Then Save Routes if needed.");
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Voyage Estimator — Full View + Save Distances</h1>
          <p style={styles.subtitle}>Your saved distances will now override defaults (when available) after refresh.</p>
        </div>
        <div style={styles.badge}>v0.6</div>
      </div>

      <div style={styles.grid}>
        {/* INPUTS */}
        <section style={styles.card}>
          <h2 style={{ margin: 0 }}>AI Draft</h2>
          <div style={styles.small}>Click “AI Draft Itinerary”, then “Apply to Tables”.</div>

          <div style={{ marginTop: 10 }}>
            <textarea style={styles.textarea} value={aiText} onChange={(e) => setAiText(e.target.value)} />
          </div>

          <div style={styles.btnRow}>
            <button style={styles.btnDark} onClick={runAI} disabled={aiLoading}>
              {aiLoading ? "AI Working..." : "AI Draft Itinerary"}
            </button>
            <button style={styles.btn} onClick={applyAIDraft} disabled={!aiDraft}>
              Apply to Tables
            </button>
          </div>

          {aiError && (
            <div style={{ ...styles.warn, marginTop: 12 }}>
              <b>{aiError}</b>
              {aiRaw ? "\n\n" + aiRaw : ""}
            </div>
          )}

          <div style={styles.divider} />

          <div style={styles.sectionTitle}>Route Table Controls</div>
          <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <input type="checkbox" checked={preferSaved} onChange={(e) => setPreferSaved(e.target.checked)} />
            <span style={styles.small}><b>Prefer saved distances</b> (saved/built-in will override any number when you fill)</span>
          </label>

          <div style={styles.btnRow}>
            <button style={styles.btn} onClick={fillDistancesFromRouteTable}>Fill Distances</button>
            <button style={styles.btn} onClick={saveAllLegDistances}>Save All Leg Distances</button>
            <button style={styles.btnDanger} onClick={clearSavedRoutes}>Clear Saved Routes</button>
          </div>

          {distMsg && (
            <div style={{ ...styles.info, marginTop: 10 }}>
              <b>{distMsg}</b>
            </div>
          )}

          <div style={styles.sectionTitle}>Port calls</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Port</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Port days</th>
                <th style={styles.th}>Waiting</th>
                <th style={styles.th}>Port cons</th>
                <th style={styles.th}>Port cost</th>
                <th style={styles.th}>Bunker buy</th>
                <th style={styles.th}>Bunker price</th>
              </tr>
            </thead>
            <tbody>
              {portCalls.map((p, idx) => (
                <tr key={idx}>
                  <td style={styles.td}><input style={styles.input} value={p.name} onChange={(e) => updatePort(idx, "name", e.target.value, setPortCalls)} /></td>
                  <td style={styles.td}>
                    <select style={styles.select} value={p.type} onChange={(e) => updatePort(idx, "type", e.target.value, setPortCalls)}>
                      <option value="start">start</option>
                      <option value="load">load</option>
                      <option value="discharge">discharge</option>
                      <option value="bunker">bunker</option>
                      <option value="canal">canal</option>
                      <option value="other">other</option>
                      <option value="end">end</option>
                    </select>
                  </td>
                  <td style={styles.td}><input style={styles.input} value={p.port_days} onChange={(e) => updatePort(idx, "port_days", e.target.value, setPortCalls)} /></td>
                  <td style={styles.td}><input style={styles.input} value={p.waiting_days} onChange={(e) => updatePort(idx, "waiting_days", e.target.value, setPortCalls)} /></td>
                  <td style={styles.td}><input style={styles.input} value={p.port_cons_mt_per_day} onChange={(e) => updatePort(idx, "port_cons_mt_per_day", e.target.value, setPortCalls)} /></td>
                  <td style={styles.td}><input style={styles.input} value={p.port_cost_usd} onChange={(e) => updatePort(idx, "port_cost_usd", e.target.value, setPortCalls)} /></td>
                  <td style={styles.td}><input style={styles.input} value={p.bunker_purchase_qty_mt} onChange={(e) => updatePort(idx, "bunker_purchase_qty_mt", e.target.value, setPortCalls)} /></td>
                  <td style={styles.td}><input style={styles.input} value={p.bunker_purchase_price_usd_per_mt} onChange={(e) => updatePort(idx, "bunker_purchase_price_usd_per_mt", e.target.value, setPortCalls)} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.divider} />

          <div style={styles.sectionTitle}>Legs</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>From</th>
                <th style={styles.th}>To</th>
                <th style={styles.th}>Distance (nm)</th>
                <th style={styles.th}>Speed (kn)</th>
                <th style={styles.th}>Sea cons</th>
                <th style={styles.th}>Save</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((l, idx) => (
                <tr key={idx}>
                  <td style={styles.td}><input style={styles.input} value={l.from} onChange={(e) => updateLeg(idx, "from", e.target.value, setLegs)} /></td>
                  <td style={styles.td}><input style={styles.input} value={l.to} onChange={(e) => updateLeg(idx, "to", e.target.value, setLegs)} /></td>
                  <td style={styles.td}><input style={styles.input} value={l.distance_nm} onChange={(e) => updateLeg(idx, "distance_nm", e.target.value, setLegs)} /></td>
                  <td style={styles.td}><input style={styles.input} value={l.speed_kn} onChange={(e) => updateLeg(idx, "speed_kn", e.target.value, setLegs)} /></td>
                  <td style={styles.td}><input style={styles.input} value={l.cons_mt_per_day} onChange={(e) => updateLeg(idx, "cons_mt_per_day", e.target.value, setLegs)} /></td>
                  <td style={styles.td}><button style={styles.miniBtn} onClick={() => saveOneLeg(idx)}>Save</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.divider} />

          <div style={styles.sectionTitle}>Revenue & Costs</div>

          <TwoCol>
            <Field label="Cargo qty (mt)"><input style={styles.input} value={revenue.cargo_qty_mt} onChange={(e) => setRevenue((p) => ({ ...p, cargo_qty_mt: e.target.value }))} /></Field>
            <Field label="Commission (%)"><input style={styles.input} value={revenue.commission_pct} onChange={(e) => setRevenue((p) => ({ ...p, commission_pct: e.target.value }))} /></Field>
          </TwoCol>

          <TwoCol>
            <Field label="Freight type">
              <select style={styles.select} value={revenue.freight_type} onChange={(e) => setRevenue((p) => ({ ...p, freight_type: e.target.value }))}>
                <option value="per_mt">$/mt</option>
                <option value="lumpsum">Lumpsum</option>
              </select>
            </Field>
            <Field label="Target TCE (USD/day) — solver">
              <input style={styles.input} value={targetTce} onChange={(e) => setTargetTce(e.target.value)} />
            </Field>
          </TwoCol>

          {revenue.freight_type === "per_mt" ? (
            <Field label="Freight (USD/mt)"><input style={styles.input} value={revenue.freight_usd_per_mt} onChange={(e) => setRevenue((p) => ({ ...p, freight_usd_per_mt: e.target.value }))} /></Field>
          ) : (
            <Field label="Freight lumpsum (USD)"><input style={styles.input} value={revenue.freight_lumpsum_usd} onChange={(e) => setRevenue((p) => ({ ...p, freight_lumpsum_usd: e.target.value }))} /></Field>
          )}

          <TwoCol>
            <Field label="Bunker blended price (USD/mt) (used if no purchases)"><input style={styles.input} value={costs.bunker_price_usd_per_mt} onChange={(e) => setCosts((p) => ({ ...p, bunker_price_usd_per_mt: e.target.value }))} /></Field>
            <Field label="Canal/tolls (USD)"><input style={styles.input} value={costs.canal_tolls_usd} onChange={(e) => setCosts((p) => ({ ...p, canal_tolls_usd: e.target.value }))} /></Field>
          </TwoCol>

          <Field label="Other costs (USD)"><input style={styles.input} value={costs.other_costs_usd} onChange={(e) => setCosts((p) => ({ ...p, other_costs_usd: e.target.value }))} /></Field>
        </section>

        {/* RESULTS */}
        <section style={styles.card}>
          <h2 style={{ margin: 0 }}>Results</h2>
          <div style={styles.divider} />

          {result?.error ? (
            <div style={styles.warn}><b>Fix needed:</b> {result.error}</div>
          ) : result?.status === "missing_distance" ? (
            <div style={styles.warn}><b>{result.message}</b></div>
          ) : (
            <>
              <div style={styles.sectionTitle}>Time</div>
              <KV label="Sea days" value={round(result.sea_days_total, 2)} />
              <KV label="Port days" value={round(result.port_days_total, 2)} />
              <KV label="Waiting days" value={round(result.waiting_days_total, 2)} />
              <KV label="Voyage days" value={round(result.voyage_days, 2)} />

              <div style={styles.divider} />

              <div style={styles.sectionTitle}>Bunkers</div>
              <KV label="Sea bunkers (mt)" value={round(result.bunkers_sea_total, 1)} />
              <KV label="Port bunkers (mt)" value={round(result.bunkers_port_total, 1)} />
              <KV label="Total required (mt)" value={round(result.bunkers_total, 1)} />
              <KV label="Purchased (mt)" value={round(result.bunkers_purchased_total, 1)} />
              <KV label="Bunker cost (USD)" value={round(result.bunker_cost, 0)} />

              <div style={styles.divider} />

              <div style={styles.sectionTitle}>Money</div>
              <KV label="Gross freight (USD)" value={round(result.gross_freight, 0)} />
              <KV label="Commission (USD)" value={round(result.commission, 0)} />
              <KV label="Net revenue (USD)" value={round(result.net_revenue, 0)} />
              <KV label="Total voyage costs (USD)" value={round(result.voyage_costs_total, 0)} />
              <KV label="Voyage profit (USD)" value={round(result.voyage_profit, 0)} />

              <div style={styles.tceBox}>
                <div style={styles.tceTitle}>OWNER TCE</div>
                <div style={styles.tceValue}>
                  {round(result.tce_usd_per_day, 0)} <span style={{ fontSize: 14, fontWeight: 900 }}>/day</span>
                </div>
              </div>

              {solver && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.sectionTitle}>Freight solver ($/mt)</div>
                  <KV label="Required freight (USD/mt)" value={round(solver.required_per_mt, 2)} />
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function updatePort(idx, key, value, setPortCalls) {
  setPortCalls((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
}
function updateLeg(idx, key, value, setLegs) {
  setLegs((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
}
function KV({ label, value }) {
  return (
    <div style={styles.kv}>
      <div style={styles.kvLabel}>{label}</div>
      <div style={styles.kvValue}>{value}</div>
    </div>
  );
}
function TwoCol({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>{children}</div>;
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
