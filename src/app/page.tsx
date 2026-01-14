"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { calcItinerary, round, solveFreightPerMtForTargetTCE } from "../lib/itineraryCalc";
import { lookupDistanceNm, saveDistanceNm, clearUserRoutes } from "../lib/routeTable";
import { getProfile, type VesselClass } from "../lib/vesselProfiles";

type PortType = "start" | "load" | "discharge" | "bunker" | "canal" | "other" | "end";
type FreightType = "per_mt" | "lumpsum";
type TradeMode = "dry" | "tanker";
type VoyageMode = "oneway" | "round";

type MobileTab = "summary" | "ports" | "legs" | "edit";

type PortCallUI = {
  name: string;
  type: PortType;
  port_days: string;
  waiting_days: string;
  port_cons_mt_per_day: string;
  port_cost_usd: string;
  bunker_purchase_qty_mt: string;
  bunker_purchase_price_usd_per_mt: string;
};

type LegUI = {
  from: string;
  to: string;
  distance_nm: string;
  speed_kn: string;
  cons_mt_per_day: string;
};

type RevenueUI = {
  cargo_qty_mt: string;
  freight_type: FreightType;
  freight_usd_per_mt: string;
  freight_lumpsum_usd: string;
  commission_pct: string;
};

type CostsUI = {
  bunker_price_usd_per_mt: string;
  canal_tolls_usd: string;
  other_costs_usd: string;
};

type VoyageUI = {
  name?: string;
  tradeMode: TradeMode;
  voyageMode: VoyageMode;
  roundReturnPort: string;
  preferSavedDistances: boolean;
  portCalls: PortCallUI[];
  legs: LegUI[];
  revenue: RevenueUI;
  costs: CostsUI;
  targetTce: string;
};

function num(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isBlank(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

const LS_VOYAGES_KEY = "VE_SAVED_VOYAGES_V1";

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 22,
    fontFamily: "Arial, sans-serif",
    maxWidth: 1250,
    margin: "0 auto",
    background: "#f7f9fc",
    minHeight: "100vh",
    color: "#0f172a",
  },
  header: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 },
  title: { margin: 0, fontSize: 26, color: "#14213d" },
  subtitle: { margin: "6px 0 0", color: "#4b5563", lineHeight: 1.35 },
  badge: { padding: "8px 10px", borderRadius: 12, background: "#eef4ff", border: "1px solid #d7e3ff", color: "#1e3a8a", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" },

  grid: { display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16 },

  card: { background: "#ffffff", border: "1px solid #e6eaf2", padding: 16, borderRadius: 14, boxShadow: "0 6px 18px rgba(20, 30, 60, 0.06)" },
  sectionTitle: { margin: "14px 0 8px", fontSize: 15, color: "#0f172a" },
  small: { color: "#64748b", fontSize: 12, lineHeight: 1.35 },

  btnRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 },
  btn: { padding: "10px 12px", borderRadius: 12, border: "1px solid #d7e3ff", background: "#eef4ff", cursor: "pointer", fontWeight: 800, color: "#1e3a8a" },
  btnDark: { padding: "10px 12px", borderRadius: 12, border: "1px solid #111827", background: "#111827", cursor: "pointer", fontWeight: 900, color: "#ffffff" },
  btnDanger: { padding: "10px 12px", borderRadius: 12, border: "1px solid #fecaca", background: "#fff1f2", cursor: "pointer", fontWeight: 800, color: "#9f1239" },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: "0 8px", minWidth: 980 },
  th: { textAlign: "left", fontSize: 12, color: "#64748b", padding: "0 8px" },
  td: { padding: "0 8px", verticalAlign: "top" },

  input: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d9e0ee", outline: "none", background: "#fbfdff" },
  inputTouch: { width: "100%", padding: 14, borderRadius: 12, border: "1px solid #d9e0ee", outline: "none", background: "#fbfdff", fontSize: 16 },
  select: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d9e0ee", background: "#fbfdff" },
  selectTouch: { width: "100%", padding: 14, borderRadius: 12, border: "1px solid #d9e0ee", background: "#fbfdff", fontSize: 16 },
  textarea: { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #d9e0ee", outline: "none", background: "#fbfdff", minHeight: 110, resize: "vertical", fontFamily: "inherit", lineHeight: 1.35 },

  warn: { padding: 12, background: "#fff7ed", borderRadius: 12, border: "1px solid #fed7aa", color: "#9a3412", whiteSpace: "pre-wrap" },
  info: { padding: 12, background: "#ecfeff", borderRadius: 12, border: "1px solid #a5f3fc", color: "#0e7490", whiteSpace: "pre-wrap" },

  kv: { display: "flex", justifyContent: "space-between", padding: "5px 0" },
  kvLabel: { color: "#334155", fontSize: 13 },
  kvValue: { fontWeight: 800, color: "#0f172a" },

  tceBox: { marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid #d7e3ff", background: "#eef4ff" },
  tceTitle: { fontSize: 12, color: "#1e3a8a", fontWeight: 900, letterSpacing: 0.3 },
  tceValue: { fontSize: 40, fontWeight: 900, marginTop: 4, color: "#0b1b4f" },

  divider: { height: 1, background: "#edf2f7", margin: "12px 0" },
  miniBtn: { padding: "8px 10px", borderRadius: 10, border: "1px solid #d7e3ff", background: "#eef4ff", cursor: "pointer", fontWeight: 900, color: "#1e3a8a", width: "100%" },

  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 },

  tabsRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  tab: { padding: "10px 12px", borderRadius: 999, border: "1px solid #d7e3ff", background: "#ffffff", cursor: "pointer", fontWeight: 900, color: "#1e3a8a" },
  tabActive: { padding: "10px 12px", borderRadius: 999, border: "1px solid #1e3a8a", background: "#eef4ff", cursor: "pointer", fontWeight: 900, color: "#1e3a8a" },

  hScroll: {
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    borderRadius: 12,
    border: "1px solid #eef2ff",
    padding: 6,
    background: "#fafcff",
  },
};

function defaultVoyage(): VoyageUI {
  return {
    tradeMode: "dry",
    voyageMode: "round",
    roundReturnPort: "Singapore",
    preferSavedDistances: true,
    portCalls: [
      { name: "Singapore", type: "start", port_days: "0", waiting_days: "0", port_cons_mt_per_day: "4", port_cost_usd: "0", bunker_purchase_qty_mt: "800", bunker_purchase_price_usd_per_mt: "650" },
      { name: "Palembang", type: "load", port_days: "4", waiting_days: "1", port_cons_mt_per_day: "4", port_cost_usd: "120000", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
      { name: "Vizag", type: "discharge", port_days: "5", waiting_days: "1", port_cons_mt_per_day: "4", port_cost_usd: "140000", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
      { name: "Kandla", type: "discharge", port_days: "4", waiting_days: "1", port_cons_mt_per_day: "4", port_cost_usd: "120000", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
      { name: "Singapore", type: "end", port_days: "0", waiting_days: "0", port_cons_mt_per_day: "4", port_cost_usd: "0", bunker_purchase_qty_mt: "", bunker_purchase_price_usd_per_mt: "" },
    ],
    legs: [
      { from: "Singapore", to: "Palembang", distance_nm: "", speed_kn: "13", cons_mt_per_day: "26" },
      { from: "Palembang", to: "Vizag", distance_nm: "", speed_kn: "12.5", cons_mt_per_day: "28" },
      { from: "Vizag", to: "Kandla", distance_nm: "", speed_kn: "12.5", cons_mt_per_day: "28" },
      { from: "Kandla", to: "Singapore", distance_nm: "", speed_kn: "13", cons_mt_per_day: "26" },
    ],
    revenue: { cargo_qty_mt: "55000", freight_type: "per_mt", freight_usd_per_mt: "35", freight_lumpsum_usd: "", commission_pct: "2.5" },
    costs: { bunker_price_usd_per_mt: "650", canal_tolls_usd: "0", other_costs_usd: "30000" },
    targetTce: "16000",
  };
}

function getSavedVoyages(): VoyageUI[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_VOYAGES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function setSavedVoyages(arr: VoyageUI[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_VOYAGES_KEY, JSON.stringify(arr || []));
}
function cloneVoyage(v: VoyageUI): VoyageUI {
  return JSON.parse(JSON.stringify(v));
}

export default function Page() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [mobileTab, setMobileTab] = useState<MobileTab>("summary");

  const [aiText, setAiText] = useState<string>(
    "Umax open Singapore. Load Palembang coal about 55,000 mt at 8k shinc. Discharge Vizag and Kandla at 10k pwwd. Target 16,000 USD/day TCE. Bunkers Singapore before sailing."
  );
  const [aiError, setAiError] = useState<string>("");
  const [aiRaw, setAiRaw] = useState<string>("");
  const [aiDraft, setAiDraft] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const [tradeMode, setTradeMode] = useState<TradeMode>("dry");
  const [voyageMode, setVoyageMode] = useState<VoyageMode>("round");
  const [roundReturnPort, setRoundReturnPort] = useState<string>("Singapore");
  const [preferSavedDistances, setPreferSavedDistances] = useState<boolean>(true);

  const [portCalls, setPortCalls] = useState<PortCallUI[]>(defaultVoyage().portCalls);
  const [legs, setLegs] = useState<LegUI[]>(defaultVoyage().legs);
  const [revenue, setRevenue] = useState<RevenueUI>(defaultVoyage().revenue);
  const [costs, setCosts] = useState<CostsUI>(defaultVoyage().costs);
  const [targetTce, setTargetTce] = useState<string>(defaultVoyage().targetTce);

  const [msg, setMsg] = useState<string>("");
  const [summaryText, setSummaryText] = useState<string>("");

  const [savedList, setSavedList] = useState<VoyageUI[]>([]);
  const [saveName, setSaveName] = useState<string>("My Voyage");
  const [selectedSaveIdx, setSelectedSaveIdx] = useState<number>(-1);

  const [exportJson, setExportJson] = useState<string>("");
  const [importJson, setImportJson] = useState<string>("");

  const [lastVesselClass, setLastVesselClass] = useState<VesselClass>("unknown");
  const [lastDerived, setLastDerived] = useState<any>(null);

  const portsTableRef = useRef<HTMLDivElement | null>(null);
  const legsTableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setSavedList(getSavedVoyages()), []);

  useEffect(() => {
    if (!preferSavedDistances) return;
    setLegs((prev) =>
      prev.map((l) => {
        const d = lookupDistanceNm(l.from, l.to);
        return d ? { ...l, distance_nm: String(d) } : l;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferSavedDistances]);

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

  const result: any = useMemo(() => calcItinerary(voyage), [voyage]);

  const solver: any = useMemo(() => {
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

  const sensitivity = useMemo(() => {
    if (!result || result.status !== "ok") return null;

    const baseTce = result.tce_usd_per_day;

    function calcWith(delta: { bunkerPrice?: number; speedKn?: number; freightPerMt?: number }) {
      const v2: any = JSON.parse(JSON.stringify(voyage));
      if (delta.bunkerPrice != null) v2.costs.bunker_price_usd_per_mt = Math.max(0, (v2.costs.bunker_price_usd_per_mt || 0) + delta.bunkerPrice);
      if (delta.speedKn != null) v2.legs = v2.legs.map((l: any) => ({ ...l, speed_kn: Math.max(0.1, (l.speed_kn || 0) + delta.speedKn) }));
      if (delta.freightPerMt != null && v2.revenue.freight_type === "per_mt") v2.revenue.freight_usd_per_mt = Math.max(0, (v2.revenue.freight_usd_per_mt || 0) + delta.freightPerMt);
      const r2: any = calcItinerary(v2);
      if (!r2 || r2.status !== "ok") return null;
      return r2.tce_usd_per_day;
    }

    const upBunker = calcWith({ bunkerPrice: +50 });
    const dnBunker = calcWith({ bunkerPrice: -50 });
    const upSpeed = calcWith({ speedKn: +1 });
    const dnSpeed = calcWith({ speedKn: -1 });
    const upFr = calcWith({ freightPerMt: +1 });
    const dnFr = calcWith({ freightPerMt: -1 });

    return {
      baseTce,
      rows: [
        { label: "Bunker price +50 USD/mt", tce: upBunker, delta: upBunker != null ? upBunker - baseTce : null },
        { label: "Bunker price -50 USD/mt", tce: dnBunker, delta: dnBunker != null ? dnBunker - baseTce : null },
        { label: "Speed +1 kn (all legs)", tce: upSpeed, delta: upSpeed != null ? upSpeed - baseTce : null },
        { label: "Speed -1 kn (all legs)", tce: dnSpeed, delta: dnSpeed != null ? dnSpeed - baseTce : null },
        { label: "Freight +1 USD/mt", tce: upFr, delta: upFr != null ? upFr - baseTce : null },
        { label: "Freight -1 USD/mt", tce: dnFr, delta: dnFr != null ? dnFr - baseTce : null },
      ],
    };
  }, [result, voyage]);

  function newVoyage() {
    const d = defaultVoyage();
    setTradeMode(d.tradeMode);
    setVoyageMode(d.voyageMode);
    setRoundReturnPort(d.roundReturnPort);
    setPreferSavedDistances(d.preferSavedDistances);
    setPortCalls(d.portCalls);
    setLegs(d.legs);
    setRevenue(d.revenue);
    setCosts(d.costs);
    setTargetTce(d.targetTce);

    setAiDraft(null);
    setAiError("");
    setAiRaw("");
    setMsg("New voyage loaded (defaults).");
    setSummaryText("");
    setExportJson("");
    setImportJson("");

    setLastVesselClass("unknown");
    setLastDerived(null);

    if (isMobile) setMobileTab("summary");
  }

  function fillDistances() {
    const missing: string[] = [];
    let updated = 0;

    const next = legs.map((l) => {
      const d = lookupDistanceNm(l.from, l.to);
      if (!d) {
        if (!(num(l.distance_nm) || 0)) missing.push(`${l.from} → ${l.to}`);
        return l;
      }

      if (preferSavedDistances) {
        const cur = num(l.distance_nm) || 0;
        if (cur !== d) updated += 1;
        return { ...l, distance_nm: String(d) };
      }

      const cur = num(l.distance_nm) || 0;
      if (cur > 0) return l;
      updated += 1;
      return { ...l, distance_nm: String(d) };
    });

    setLegs(next);
    setMsg(missing.length ? `Distances updated: ${updated}. Missing:\n- ${missing.join("\n- ")}` : `Distances updated: ${updated}. 0 missing.`);
    if (isMobile) setMobileTab("summary");
  }

  function saveLeg(idx: number) {
    const l = legs[idx];
    const d = num(l.distance_nm) || 0;
    const r = saveDistanceNm(l.from, l.to, d);
    setMsg(r.ok ? `Saved route: ${l.from} → ${l.to} = ${d} nm` : `Not saved: ${l.from} → ${l.to}. ${r.error}`);
  }

  function saveAllLegs() {
    let saved = 0,
      skipped = 0;
    for (const l of legs) {
      const d = num(l.distance_nm) || 0;
      if (d > 0 && l.from && l.to) {
        const r = saveDistanceNm(l.from, l.to, d);
        if (r.ok) saved += 1;
      } else skipped += 1;
    }
    setMsg(`Saved routes: ${saved}. Skipped: ${skipped}.`);
  }

  function clearSavedRoutesUI() {
    clearUserRoutes();
    setMsg("Cleared saved route distances (browser).");
  }

  function rebuildLegsFromPorts(pc: PortCallUI[]) {
    const newLegs: LegUI[] = [];
    for (let i = 0; i < pc.length - 1; i++) {
      newLegs.push({
        from: pc[i].name || `Port ${i + 1}`,
        to: pc[i + 1].name || `Port ${i + 2}`,
        distance_nm: "",
        speed_kn: tradeMode === "tanker" ? "13.5" : "12.5",
        cons_mt_per_day: tradeMode === "tanker" ? "32" : "28",
      });
    }
    setLegs(newLegs);
  }

  function applyRoundVoyage() {
    if (voyageMode !== "round") {
      setMsg("Voyage mode is one-way. No round legs added.");
      return;
    }
    const pc = [...portCalls];
    if (!pc.length) return;

    const first = pc[0]?.name || "";
    const ret = (roundReturnPort || first || "").trim();
    if (!ret) {
      setMsg("Set a return port (e.g., Singapore) first.");
      return;
    }

    const lastName = (pc[pc.length - 1]?.name || "").trim();
    if (lastName.toLowerCase() !== ret.toLowerCase()) {
      pc.push({
        name: ret,
        type: "end",
        port_days: "0",
        waiting_days: "0",
        port_cons_mt_per_day: tradeMode === "tanker" ? "6" : "4",
        port_cost_usd: "0",
        bunker_purchase_qty_mt: "",
        bunker_purchase_price_usd_per_mt: "",
      });
    }
    setPortCalls(pc);
    rebuildLegsFromPorts(pc);
    setMsg(`Round voyage applied. Return port: ${ret}. Now click Fill Distances.`);
    if (isMobile) setMobileTab("edit");
  }

  function applyTradePreset(mode: TradeMode) {
    setTradeMode(mode);

    setLegs((prev) =>
      prev.map((l) => ({
        ...l,
        speed_kn: l.speed_kn || (mode === "tanker" ? "13.5" : "12.5"),
        cons_mt_per_day: l.cons_mt_per_day || (mode === "tanker" ? "32" : "28"),
      }))
    );
    setPortCalls((prev) =>
      prev.map((p) => ({
        ...p,
        port_cons_mt_per_day: p.port_cons_mt_per_day || (mode === "tanker" ? "6" : "4"),
      }))
    );

    setMsg(`Applied ${mode === "tanker" ? "Tanker" : "Dry Bulk"} preset (defaults).`);
  }

  async function runAI() {
    setAiLoading(true);
    setAiError("");
    setAiRaw("");
    setAiDraft(null);
    setMsg("");

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
    } catch (e: any) {
      setAiError("Failed to call AI.");
      setAiRaw(String(e?.message || e));
    } finally {
      setAiLoading(false);
    }
  }

  function applyVesselProfileToTables(vesselClass: VesselClass) {
    const profile = getProfile(vesselClass);
    if (!profile || vesselClass === "unknown") return { applied: false, profileLabel: "" };

    setLegs((prev) =>
      prev.map((l) => {
        const sp = num(l.speed_kn) || 0;
        const cs = num(l.cons_mt_per_day) || 0;
        return {
          ...l,
          speed_kn: sp > 0 ? l.speed_kn : String(profile.ladenSpeedKn),
          cons_mt_per_day: cs > 0 ? l.cons_mt_per_day : String(profile.ladenConsMtPerDay),
        };
      })
    );

    setPortCalls((prev) =>
      prev.map((p) => {
        const pc = num(p.port_cons_mt_per_day) || 0;
        return { ...p, port_cons_mt_per_day: pc > 0 ? p.port_cons_mt_per_day : String(profile.portConsMtPerDay) };
      })
    );

    return { applied: true, profileLabel: profile.label };
  }

  function applyRatesToPortDays(derived: any, pc: PortCallUI[]) {
    const cargo = derived?.cargo_qty_mt != null ? Number(derived.cargo_qty_mt) : num(revenue.cargo_qty_mt);
    const loadRate = derived?.load_rate_mt_per_day != null ? Number(derived.load_rate_mt_per_day) : null;
    const disRate = derived?.discharge_rate_mt_per_day != null ? Number(derived.discharge_rate_mt_per_day) : null;

    if (!cargo || cargo <= 0) return { pc, changed: 0, notes: [] as string[] };

    let changed = 0;
    const notes: string[] = [];

    const next = pc.map((p) => {
      const curDays = num(p.port_days);
      const needsFill = curDays == null || curDays === 0 || isBlank(p.port_days);

      if (p.type === "load" && loadRate && loadRate > 0 && needsFill) {
        const days = cargo / loadRate;
        changed += 1;
        notes.push(`Load days = ${cargo} / ${loadRate} ≈ ${round(days, 2)}`);
        return { ...p, port_days: String(round(days, 2)) };
      }

      if (p.type === "discharge" && disRate && disRate > 0 && needsFill) {
        const days = cargo / disRate;
        changed += 1;
        notes.push(`Disch days = ${cargo} / ${disRate} ≈ ${round(days, 2)}`);
        return { ...p, port_days: String(round(days, 2)) };
      }

      return p;
    });

    return { pc: next, changed, notes };
  }

  function applyAIDraft() {
    if (!aiDraft) return;

    const vesselClass = (aiDraft?.vesselClass || "unknown") as VesselClass;
    const derived = aiDraft?.derived || null;
    setLastVesselClass(vesselClass);
    setLastDerived(derived);

    let pcApplied: PortCallUI[] = portCalls;

    if (Array.isArray(aiDraft.portCalls) && aiDraft.portCalls.length >= 2) {
      const pc: PortCallUI[] = aiDraft.portCalls.map((p: any) => ({
        name: p.name ?? "",
        type: (p.type ?? "other") as PortType,
        port_days: p.port_days == null ? "" : String(p.port_days),
        waiting_days: p.waiting_days == null ? "" : String(p.waiting_days),
        port_cons_mt_per_day: p.port_cons_mt_per_day == null ? "" : String(p.port_cons_mt_per_day),
        port_cost_usd: p.port_cost_usd == null ? "" : String(p.port_cost_usd),
        bunker_purchase_qty_mt: p.bunker_purchase_qty_mt == null ? "" : String(p.bunker_purchase_qty_mt),
        bunker_purchase_price_usd_per_mt: p.bunker_purchase_price_usd_per_mt == null ? "" : String(p.bunker_purchase_price_usd_per_mt),
      }));
      setPortCalls(pc);
      pcApplied = pc;

      if (Array.isArray(aiDraft.legs) && aiDraft.legs.length >= 1) {
        const lg: LegUI[] = aiDraft.legs.map((l: any) => ({
          from: l.from ?? "",
          to: l.to ?? "",
          distance_nm: "", // intentionally blank
          speed_kn: l.speed_kn == null ? "" : String(l.speed_kn),
          cons_mt_per_day: l.cons_mt_per_day == null ? "" : String(l.cons_mt_per_day),
        }));
        setLegs(lg);
      } else {
        rebuildLegsFromPorts(pc);
      }
    }

    if (aiDraft.revenue) {
      setRevenue((prev) => ({
        ...prev,
        cargo_qty_mt: String(aiDraft.revenue.cargo_qty_mt ?? derived?.cargo_qty_mt ?? prev.cargo_qty_mt),
        freight_type: (aiDraft.revenue.freight_type ?? prev.freight_type) as FreightType,
        freight_usd_per_mt: String(aiDraft.revenue.freight_usd_per_mt ?? prev.freight_usd_per_mt),
        freight_lumpsum_usd: String(aiDraft.revenue.freight_lumpsum_usd ?? prev.freight_lumpsum_usd),
        commission_pct: String(aiDraft.revenue.commission_pct ?? prev.commission_pct),
      }));
    } else if (derived?.cargo_qty_mt != null) {
      setRevenue((prev) => ({ ...prev, cargo_qty_mt: String(derived.cargo_qty_mt) }));
    }

    if (aiDraft.costs) {
      setCosts((prev) => ({
        ...prev,
        bunker_price_usd_per_mt: String(aiDraft.costs.bunker_price_usd_per_mt ?? prev.bunker_price_usd_per_mt),
        canal_tolls_usd: String(aiDraft.costs.canal_tolls_usd ?? prev.canal_tolls_usd),
        other_costs_usd: String(aiDraft.costs.other_costs_usd ?? prev.other_costs_usd),
      }));
    }

    const prof = applyVesselProfileToTables(vesselClass);

    const r = applyRatesToPortDays(derived, pcApplied);
    if (r.changed > 0) setPortCalls(r.pc);

    const notes = [];
    if (prof.applied) notes.push(`Vessel defaults: ${prof.profileLabel}`);
    if (r.changed > 0) notes.push(`Auto port days: ${r.changed} field(s)\n- ${r.notes.join("\n- ")}`);

    setMsg(
      notes.length
        ? `Applied AI draft.\n${notes.join("\n")}\n\nNext: click Fill Distances.`
        : "Applied AI draft. Next: click Fill Distances."
    );

    if (isMobile) setMobileTab("summary");
  }

  function makeVoyageSnapshot(name?: string): VoyageUI {
    return { name: name || "Voyage", tradeMode, voyageMode, roundReturnPort, preferSavedDistances, portCalls, legs, revenue, costs, targetTce };
  }

  function saveVoyageTemplate() {
    const v = makeVoyageSnapshot(saveName.trim() || "My Voyage");
    const list = getSavedVoyages();
    list.push(cloneVoyage(v));
    setSavedVoyages(list);
    setSavedList(list);
    setMsg(`Saved voyage template: "${v.name}"`);
  }

  function loadVoyageTemplate() {
    if (selectedSaveIdx < 0 || selectedSaveIdx >= savedList.length) {
      setMsg("Select a saved voyage first.");
      return;
    }
    const v = savedList[selectedSaveIdx];
    setTradeMode(v.tradeMode || "dry");
    setVoyageMode(v.voyageMode || "oneway");
    setRoundReturnPort(v.roundReturnPort || "Singapore");
    setPreferSavedDistances(!!v.preferSavedDistances);
    setPortCalls(v.portCalls || []);
    setLegs(v.legs || []);
    setRevenue(v.revenue || defaultVoyage().revenue);
    setCosts(v.costs || defaultVoyage().costs);
    setTargetTce(v.targetTce || "0");
    setMsg(`Loaded voyage: "${v.name || "Voyage"}"`);
    if (isMobile) setMobileTab("summary");
  }

  function deleteSelectedVoyage() {
    if (selectedSaveIdx < 0 || selectedSaveIdx >= savedList.length) {
      setMsg("Select a saved voyage to delete.");
      return;
    }
    const list = [...savedList];
    const removed = list.splice(selectedSaveIdx, 1)[0];
    setSavedVoyages(list);
    setSavedList(list);
    setSelectedSaveIdx(-1);
    setMsg(`Deleted: "${removed?.name || "Voyage"}"`);
  }

  function exportCurrentVoyage() {
    const v = makeVoyageSnapshot("Export");
    setExportJson(JSON.stringify(v, null, 2));
    setMsg("Export JSON generated below. Copy and send to colleague.");
  }

  function importVoyageFromJson() {
    try {
      const obj = JSON.parse(importJson);
      const v = obj as VoyageUI;
      setTradeMode(v.tradeMode || "dry");
      setVoyageMode(v.voyageMode || "oneway");
      setRoundReturnPort(v.roundReturnPort || "Singapore");
      setPreferSavedDistances(!!v.preferSavedDistances);
      setPortCalls(v.portCalls || []);
      setLegs(v.legs || []);
      setRevenue(v.revenue || defaultVoyage().revenue);
      setCosts(v.costs || defaultVoyage().costs);
      setTargetTce(v.targetTce || "0");
      setMsg("Imported voyage JSON.");
      if (isMobile) setMobileTab("summary");
    } catch (e: any) {
      setMsg(`Import failed: ${String(e?.message || e)}`);
    }
  }

  function generateSummary() {
    if (!result || result.status !== "ok") {
      setMsg("Fill distances first so Results are OK, then generate summary.");
      return;
    }

    const portsLine = portCalls.map((p) => p.name).filter(Boolean).join(" → ");
    const avgSpeed = legs.length ? round(legs.map((l) => Number(l.speed_kn || 0)).reduce((a, b) => a + b, 0) / legs.length, 2) : "-";
    const avgCons = legs.length ? round(legs.map((l) => Number(l.cons_mt_per_day || 0)).reduce((a, b) => a + b, 0) / legs.length, 2) : "-";
    const fr = revenue.freight_type === "per_mt" ? `${revenue.freight_usd_per_mt} USD/mt` : `${revenue.freight_lumpsum_usd} USD lumpsum`;

    const vesselNote = lastVesselClass !== "unknown" ? `Vessel profile: ${getProfile(lastVesselClass).label}` : "Vessel profile: (none)";

    const txt =
`VOYAGE ESTIMATE (Owner TCE)

Mode: ${tradeMode.toUpperCase()} | ${voyageMode === "round" ? "ROUND" : "ONE-WAY"}
Ports: ${portsLine}

Cargo: ${revenue.cargo_qty_mt} mt
Freight: ${fr}
Commission: ${revenue.commission_pct} %

Time:
- Sea days: ${round(result.sea_days_total, 2)}
- Port days: ${round(result.port_days_total, 2)}
- Waiting days: ${round(result.waiting_days_total, 2)}
- Total voyage days: ${round(result.voyage_days, 2)}

Bunkers:
- Total required (mt): ${round(result.bunkers_total, 1)}
- Purchased (mt): ${round(result.bunkers_purchased_total, 1)}
- Bunker cost (USD): ${round(result.bunker_cost, 0)}

Money:
- Net revenue (USD): ${round(result.net_revenue, 0)}
- Total voyage costs (USD): ${round(result.voyage_costs_total, 0)}
- Voyage profit (USD): ${round(result.voyage_profit, 0)}

OWNER TCE: ${round(result.tce_usd_per_day, 0)} USD/day

Key assumptions:
- ${vesselNote}
- Avg speed: ${avgSpeed} kn
- Avg sea cons: ${avgCons} mt/day
- Blended bunker price (fallback): ${costs.bunker_price_usd_per_mt} USD/mt
`;
    setSummaryText(txt);
    setMsg("Summary generated below. Copy it.");
    if (isMobile) setMobileTab("summary");
  }

  // --- v1.2: Desktop-first TCE banner (full width) ---
  const showTceBanner = !isMobile && result?.status === "ok" && !result?.error;

  function scrollToPortsTable() {
    portsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToLegsTable() {
    legsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const MobileTabs = () => (
    <div style={styles.tabsRow}>
      <button style={mobileTab === "summary" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("summary")}>Summary</button>
      <button style={mobileTab === "ports" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("ports")}>Ports</button>
      <button style={mobileTab === "legs" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("legs")}>Legs</button>
      <button style={mobileTab === "edit" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("edit")}>Full Edit</button>
    </div>
  );

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Voyage Estimator — v1.2 (UI & Mobile)</h1>
          <p style={styles.subtitle}>Owner TCE first on desktop. Mobile has Summary/Ports/Legs/Edit tabs.</p>
        </div>
        <div style={styles.badge}>v1.2</div>
      </div>

      {showTceBanner && (
        <section style={{ ...styles.card, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={styles.small}>Primary output</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a", marginTop: 2 }}>Owner TCE</div>
            </div>
            <div style={{ ...styles.tceBox, marginTop: 0, minWidth: 320 }}>
              <div style={styles.tceTitle}>OWNER TCE</div>
              <div style={styles.tceValue}>
                {round(result.tce_usd_per_day, 0)}{" "}
                <span style={{ fontSize: 14, fontWeight: 900 }}>/day</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {isMobile && <MobileTabs />}

      <div
        style={{
          ...styles.grid,
          gridTemplateColumns: isMobile ? "1fr" : "1.45fr 1fr",
          gap: isMobile ? 12 : 16,
          marginTop: isMobile ? 10 : 0,
        }}
      >
        <section style={styles.card}>
          <h2 style={{ margin: 0 }}>Setup</h2>
          <div style={styles.small}>Desktop: full edit. Mobile: use Summary/Ports/Legs, and Full Edit only when needed.</div>

          <div style={styles.btnRow}>
            <button style={styles.btnDanger} onClick={newVoyage}>New Voyage</button>
            <button style={styles.btn} onClick={generateSummary}>Generate Summary</button>
            {isMobile && (
              <>
                <button style={styles.btn} onClick={scrollToPortsTable}>Jump to Ports</button>
                <button style={styles.btn} onClick={scrollToLegsTable}>Jump to Legs</button>
              </>
            )}
          </div>

          <div style={styles.twoCol}>
            <Field label="Trade mode">
              <select style={isMobile ? styles.selectTouch : styles.select} value={tradeMode} onChange={(e) => applyTradePreset(e.target.value as TradeMode)}>
                <option value="dry">Dry bulk</option>
                <option value="tanker">Tanker</option>
              </select>
            </Field>
            <Field label="Voyage mode">
              <select style={isMobile ? styles.selectTouch : styles.select} value={voyageMode} onChange={(e) => setVoyageMode(e.target.value as VoyageMode)}>
                <option value="oneway">One-way</option>
                <option value="round">Round voyage</option>
              </select>
            </Field>
          </div>

          <div style={styles.twoCol}>
            <Field label="Round return port">
              <input style={isMobile ? styles.inputTouch : styles.input} value={roundReturnPort} onChange={(e) => setRoundReturnPort(e.target.value)} />
            </Field>
            <Field label="Prefer saved distances">
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="checkbox" checked={preferSavedDistances} onChange={(e) => setPreferSavedDistances(e.target.checked)} />
                <span style={styles.small}>Override distances from saved/built-in</span>
              </label>
            </Field>
          </div>

          <div style={styles.btnRow}>
            <button style={styles.btn} onClick={applyRoundVoyage} disabled={voyageMode !== "round"}>Apply Round Voyage</button>
            <button style={styles.btn} onClick={fillDistances}>Fill Distances</button>
            <button style={styles.btn} onClick={saveAllLegs}>Save All Routes</button>
            <button style={styles.btnDanger} onClick={clearSavedRoutesUI}>Clear Saved Routes</button>
          </div>

          {msg && <div style={{ ...styles.info, marginTop: 10 }}><b>{msg}</b></div>}

          {summaryText && (
            <div style={{ ...styles.info, marginTop: 10 }}>
              <b>Voyage Summary (copy/paste)</b>
              {"\n\n"}
              <textarea style={{ ...styles.textarea, minHeight: 220, marginTop: 10 }} value={summaryText} onChange={(e) => setSummaryText(e.target.value)} />
            </div>
          )}

          <div style={styles.divider} />

          <h2 style={{ margin: 0 }}>AI Draft</h2>
          <div style={styles.small}>
            Paste voyage description. AI drafts ports/legs. Distances remain blank by design.
            <br />
            <b>Tip:</b> “Bunker at Singapore before sailing” or “Bunker enroute at Fujairah between load and discharge”.
          </div>

          <textarea style={{ ...styles.textarea, marginTop: 10 }} value={aiText} onChange={(e) => setAiText(e.target.value)} />

          <div style={styles.btnRow}>
            <button style={styles.btnDark} onClick={runAI} disabled={aiLoading}>
              {aiLoading ? "AI Working..." : "AI Draft Itinerary"}
            </button>
            <button style={styles.btn} onClick={applyAIDraft} disabled={!aiDraft}>
              Apply to Tables
            </button>
          </div>

          {aiError && (
            <div style={{ ...styles.warn, marginTop: 10 }}>
              <b>{aiError}</b>
              {"\n\n"}
              {aiRaw}
            </div>
          )}

          {/* Mobile: show read-friendly ports/legs unless user chooses Full Edit */}
          {isMobile && mobileTab !== "edit" && (
            <>
              <div style={styles.divider} />

              {mobileTab === "summary" && (
                <>
                  <h2 style={{ margin: 0 }}>Mobile Summary</h2>
                  {result?.error ? (
                    <div style={styles.warn}><b>Fix needed:</b> {result.error}</div>
                  ) : result?.status === "missing_distance" ? (
                    <div style={styles.warn}><b>{result.message}</b></div>
                  ) : result?.status === "ok" ? (
                    <>
                      <div style={{ ...styles.tceBox, marginTop: 10 }}>
                        <div style={styles.tceTitle}>OWNER TCE</div>
                        <div style={styles.tceValue}>
                          {round(result.tce_usd_per_day, 0)} <span style={{ fontSize: 14, fontWeight: 900 }}>/day</span>
                        </div>
                      </div>

                      <div style={styles.sectionTitle}>Time</div>
                      <KV label="Sea days" value={round(result.sea_days_total, 2)} />
                      <KV label="Port days" value={round(result.port_days_total, 2)} />
                      <KV label="Waiting days" value={round(result.waiting_days_total, 2)} />
                      <KV label="Voyage days" value={round(result.voyage_days, 2)} />

                      <div style={styles.divider} />

                      <div style={styles.sectionTitle}>Bunkers</div>
                      <KV label="Total required (mt)" value={round(result.bunkers_total, 1)} />
                      <KV label="Purchased (mt)" value={round(result.bunkers_purchased_total, 1)} />
                      <KV label="Bunker cost (USD)" value={round(result.bunker_cost, 0)} />

                      {solver && (
                        <>
                          <div style={styles.divider} />
                          <div style={styles.sectionTitle}>Freight solver ($/mt)</div>
                          <KV label="Required freight (USD/mt)" value={round(solver.required_per_mt, 2)} />
                        </>
                      )}
                    </>
                  ) : (
                    <div style={styles.small}>Fill distances to compute results.</div>
                  )}
                </>
              )}

              {mobileTab === "ports" && (
                <>
                  <h2 style={{ margin: 0 }}>Ports (cards)</h2>
                  <div style={styles.small}>Use Full Edit tab to change values. This view is for quick reading.</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {portCalls.map((p, idx) => (
                      <div key={idx} style={{ border: "1px solid #e6eaf2", borderRadius: 14, padding: 12, background: "#ffffff" }}>
                        <div style={{ fontWeight: 900 }}>{p.name || `Port ${idx + 1}`}</div>
                        <div style={styles.small}>
                          Type: <b>{p.type}</b> • Port days: <b>{p.port_days || "0"}</b> • Waiting: <b>{p.waiting_days || "0"}</b>
                        </div>
                        <div style={styles.small}>
                          Port cons: <b>{p.port_cons_mt_per_day || "0"}</b> • Port cost: <b>{p.port_cost_usd || "0"}</b>
                        </div>
                        {(p.bunker_purchase_qty_mt || p.bunker_purchase_price_usd_per_mt) && (
                          <div style={styles.small}>
                            Bunker buy: <b>{p.bunker_purchase_qty_mt || "0"}</b> mt @ <b>{p.bunker_purchase_price_usd_per_mt || "0"}</b>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {mobileTab === "legs" && (
                <>
                  <h2 style={{ margin: 0 }}>Legs (cards)</h2>
                  <div style={styles.small}>Distances can be filled via Fill Distances / Full Edit.</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {legs.map((l, idx) => (
                      <div key={idx} style={{ border: "1px solid #e6eaf2", borderRadius: 14, padding: 12, background: "#ffffff" }}>
                        <div style={{ fontWeight: 900 }}>{l.from || "?"} → {l.to || "?"}</div>
                        <div style={styles.small}>
                          Distance: <b>{l.distance_nm || "-"}</b> nm • Speed: <b>{l.speed_kn || "-"}</b> kn • Sea cons: <b>{l.cons_mt_per_day || "-"}</b>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Full Edit (desktop always; mobile when chosen) */}
          {(!isMobile || mobileTab === "edit") && (
            <>
              <div style={styles.divider} />
              <h2 style={{ margin: 0 }}>Save / Load Voyages</h2>

              <div style={styles.twoCol}>
                <Field label="Save name">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                </Field>
                <Field label="Saved voyages">
                  <select style={isMobile ? styles.selectTouch : styles.select} value={selectedSaveIdx} onChange={(e) => setSelectedSaveIdx(Number(e.target.value))}>
                    <option value={-1}>-- select --</option>
                    {savedList.map((v, idx) => (
                      <option key={idx} value={idx}>
                        {v.name || `Voyage ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div style={styles.btnRow}>
                <button style={styles.btn} onClick={saveVoyageTemplate}>Save Voyage Template</button>
                <button style={styles.btn} onClick={loadVoyageTemplate}>Load</button>
                <button style={styles.btnDanger} onClick={deleteSelectedVoyage}>Delete</button>
                <button style={styles.btn} onClick={exportCurrentVoyage}>Export JSON</button>
              </div>

              <Field label="Export JSON (copy/share)">
                <textarea style={{ ...styles.textarea, minHeight: 120 }} value={exportJson} onChange={(e) => setExportJson(e.target.value)} />
              </Field>

              <div style={styles.btnRow}>
                <button style={styles.btn} onClick={importVoyageFromJson}>Import JSON</button>
              </div>

              <Field label="Import JSON (paste from colleague)">
                <textarea style={{ ...styles.textarea, minHeight: 120 }} value={importJson} onChange={(e) => setImportJson(e.target.value)} />
              </Field>

              <div style={styles.divider} />

              <div ref={portsTableRef} style={styles.sectionTitle}>Port calls</div>
              <div style={styles.small}>On mobile, you can scroll this table left/right. If you hate this, use Ports tab (cards) for reading.</div>
              <div style={styles.hScroll}>
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
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.name} onChange={(e) => updatePort(idx, "name", e.target.value, setPortCalls)} /></td>
                        <td style={styles.td}>
                          <select style={isMobile ? styles.selectTouch : styles.select} value={p.type} onChange={(e) => updatePort(idx, "type", e.target.value as PortType, setPortCalls)}>
                            <option value="start">start</option>
                            <option value="load">load</option>
                            <option value="discharge">discharge</option>
                            <option value="bunker">bunker</option>
                            <option value="canal">canal</option>
                            <option value="other">other</option>
                            <option value="end">end</option>
                          </select>
                        </td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.port_days} onChange={(e) => updatePort(idx, "port_days", e.target.value, setPortCalls)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.waiting_days} onChange={(e) => updatePort(idx, "waiting_days", e.target.value, setPortCalls)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.port_cons_mt_per_day} onChange={(e) => updatePort(idx, "port_cons_mt_per_day", e.target.value, setPortCalls)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.port_cost_usd} onChange={(e) => updatePort(idx, "port_cost_usd", e.target.value, setPortCalls)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.bunker_purchase_qty_mt} onChange={(e) => updatePort(idx, "bunker_purchase_qty_mt", e.target.value, setPortCalls)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.bunker_purchase_price_usd_per_mt} onChange={(e) => updatePort(idx, "bunker_purchase_price_usd_per_mt", e.target.value, setPortCalls)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={styles.divider} />

              <div ref={legsTableRef} style={styles.sectionTitle}>Legs</div>
              <div style={styles.small}>On mobile, scroll this table left/right. Use Legs tab for reading.</div>
              <div style={styles.hScroll}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>From</th>
                      <th style={styles.th}>To</th>
                      <th style={styles.th}>Distance (nm)</th>
                      <th style={styles.th}>Speed (kn)</th>
                      <th style={styles.th}>Sea cons</th>
                      <th style={styles.th}>Save route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((l, idx) => (
                      <tr key={idx}>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={l.from} onChange={(e) => updateLeg(idx, "from", e.target.value, setLegs)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={l.to} onChange={(e) => updateLeg(idx, "to", e.target.value, setLegs)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={l.distance_nm} onChange={(e) => updateLeg(idx, "distance_nm", e.target.value, setLegs)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={l.speed_kn} onChange={(e) => updateLeg(idx, "speed_kn", e.target.value, setLegs)} /></td>
                        <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={l.cons_mt_per_day} onChange={(e) => updateLeg(idx, "cons_mt_per_day", e.target.value, setLegs)} /></td>
                        <td style={styles.td}><button style={styles.miniBtn} onClick={() => saveLeg(idx)}>Save</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={styles.divider} />

              <div style={styles.sectionTitle}>Revenue & Costs</div>
              <div style={styles.twoCol}>
                <Field label="Cargo qty (mt)">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={revenue.cargo_qty_mt} onChange={(e) => setRevenue((p) => ({ ...p, cargo_qty_mt: e.target.value }))} />
                </Field>
                <Field label="Commission (%)">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={revenue.commission_pct} onChange={(e) => setRevenue((p) => ({ ...p, commission_pct: e.target.value }))} />
                </Field>
              </div>

              <div style={styles.twoCol}>
                <Field label="Freight type">
                  <select style={isMobile ? styles.selectTouch : styles.select} value={revenue.freight_type} onChange={(e) => setRevenue((p) => ({ ...p, freight_type: e.target.value as FreightType }))}>
                    <option value="per_mt">$/mt</option>
                    <option value="lumpsum">Lumpsum</option>
                  </select>
                </Field>
                <Field label="Target TCE (USD/day) — solver">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={targetTce} onChange={(e) => setTargetTce(e.target.value)} />
                </Field>
              </div>

              {revenue.freight_type === "per_mt" ? (
                <Field label="Freight (USD/mt)">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={revenue.freight_usd_per_mt} onChange={(e) => setRevenue((p) => ({ ...p, freight_usd_per_mt: e.target.value }))} />
                </Field>
              ) : (
                <Field label="Freight lumpsum (USD)">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={revenue.freight_lumpsum_usd} onChange={(e) => setRevenue((p) => ({ ...p, freight_lumpsum_usd: e.target.value }))} />
                </Field>
              )}

              <div style={styles.twoCol}>
                <Field label="Bunker blended price (USD/mt)">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={costs.bunker_price_usd_per_mt} onChange={(e) => setCosts((p) => ({ ...p, bunker_price_usd_per_mt: e.target.value }))} />
                </Field>
                <Field label="Canal/tolls (USD)">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={costs.canal_tolls_usd} onChange={(e) => setCosts((p) => ({ ...p, canal_tolls_usd: e.target.value }))} />
                </Field>
              </div>

              <Field label="Other costs (USD)">
                <input style={isMobile ? styles.inputTouch : styles.input} value={costs.other_costs_usd} onChange={(e) => setCosts((p) => ({ ...p, other_costs_usd: e.target.value }))} />
              </Field>
            </>
          )}
        </section>

        {/* Desktop right column Results */}
        {!isMobile && (
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
                <KV label="Total required (mt)" value={round(result.bunkers_total, 1)} />
                <KV label="Purchased (mt)" value={round(result.bunkers_purchased_total, 1)} />
                <KV label="Bunker cost (USD)" value={round(result.bunker_cost, 0)} />

                {solver && (
                  <>
                    <div style={styles.divider} />
                    <div style={styles.sectionTitle}>Freight solver ($/mt)</div>
                    <KV label="Required freight (USD/mt)" value={round(solver.required_per_mt, 2)} />
                  </>
                )}

                <div style={styles.divider} />

                <div style={styles.sectionTitle}>Sensitivity (TCE impact)</div>
                {!sensitivity ? (
                  <div style={styles.small}>Fill distances first to see sensitivity.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", fontSize: 12, color: "#64748b", padding: "6px 0" }}>Scenario</th>
                        <th style={{ textAlign: "right", fontSize: 12, color: "#64748b", padding: "6px 0" }}>TCE</th>
                        <th style={{ textAlign: "right", fontSize: 12, color: "#64748b", padding: "6px 0" }}>Δ vs base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sensitivity.rows.map((r: any, i: number) => (
                        <tr key={i}>
                          <td style={{ padding: "6px 0", fontSize: 13, color: "#0f172a" }}>{r.label}</td>
                          <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 800 }}>{r.tce != null ? round(r.tce, 0) : "-"}</td>
                          <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 800 }}>{r.delta != null ? round(r.delta, 0) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function updatePort(
  idx: number,
  key: keyof PortCallUI,
  value: any,
  setPortCalls: React.Dispatch<React.SetStateAction<PortCallUI[]>>
) {
  setPortCalls((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
}
function updateLeg(
  idx: number,
  key: keyof LegUI,
  value: any,
  setLegs: React.Dispatch<React.SetStateAction<LegUI[]>>
) {
  setLegs((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
}
function KV({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.kv}>
      <div style={styles.kvLabel}>{label}</div>
      <div style={styles.kvValue}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
