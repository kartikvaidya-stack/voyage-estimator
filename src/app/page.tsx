"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { calcItinerary, round, solveFreightPerMtForTargetTCE } from "../lib/itineraryCalc";
import { lookupDistanceNm, saveDistanceNm, clearUserRoutes, getUserRouteMap, setUserRouteMap } from "../lib/routeTable";
import { getProfile, type VesselClass } from "../lib/vesselProfiles";
import { calculateEmissionStats, collectDataQualityFlags } from "../lib/analytics";
import { PORT_COORDINATES, calculateECAFuelSurcharge, checkRouteECAs, type FuelType } from "../lib/ecaRegulations";
import { computeSeaRoute } from "../lib/seaRouting";

// --- Types ---
type PortType = "start" | "load" | "discharge" | "bunker" | "canal" | "other" | "end";
type FreightType = "per_mt" | "lumpsum";
type TradeMode = "dry" | "tanker";
type VoyageMode = "oneway" | "round";
type MobileTab = "summary" | "ports" | "legs" | "edit";
type VesselBasis = "standard" | "named";

type PortCallUI = {
  name: string;
  type: PortType;
  port_days: string;
  waiting_days: string;
  laytime_term?: string;
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

type EcoLegOverride = {
  speed_kn?: string;
  cons_mt_per_day?: string;
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

type PlannerTab = "planner" | "portCosts" | "distanceMatrix";
type ViewTab = "create" | "results" | "analysis" | "ports" | "distance" | "guide" | "vessels" | "bunker" | "json";
type RouteEntry = { from: string; to: string; distance: number };

type VoyageUI = {
  name?: string;
  tradeMode: TradeMode;
  voyageMode: VoyageMode;
  roundReturnPort: string;
  preferSavedDistances: boolean;
  targetTceEnabled?: boolean;
  seaMarginPct?: number;
  vesselBasis?: VesselBasis;
  vesselClass?: VesselClass;
  namedVesselId?: string;
  portCalls: PortCallUI[];
  legs: LegUI[];
  revenue: RevenueUI;
  costs: CostsUI;
  targetTce: string;
  ecoMode?: boolean;
  ecoSpeedDeltaKn?: string;
  ecoConsDeltaPct?: string;
};

type VesselCostClass = VesselClass | "any";
type PortCostTemplate = { id: string; port: string; vesselClass: VesselCostClass; costUsd: string; note?: string };
type FuelChoice = "HSFO" | "LSFO";
type LegMode = "laden" | "ballast";
type NamedVessel = {
  id: string;
  name: string;
  vesselClass: VesselClass;
  fuelType: FuelChoice;
  scrubberFitted: boolean;
  ladenSpeedKn: number;
  ballastSpeedKn: number;
  ladenConsMtPerDay: number;
  ballastConsMtPerDay: number;
  ecoLadenSpeedKn?: number;
  ecoBallastSpeedKn?: number;
  ecoLadenConsMtPerDay?: number;
  ecoBallastConsMtPerDay?: number;
  portIdleConsMtPerDay: number;
  portWorkingConsMtPerDay: number;
  note?: string;
};

// --- Constants ---
const MOBILE_BREAKPOINT = 900;
const LS_VOYAGES_KEY = "VE_SAVED_VOYAGES_V1";
const LS_PORT_COSTS_KEY = "VE_PORT_COSTS_V1";
const LS_NAMED_VESSELS_KEY = "VE_NAMED_VESSELS_V1";

const VESSEL_CLASS_OPTIONS: { value: VesselCostClass; label: string }[] = [
  { value: "any", label: "Any class" },
  { value: "unknown", label: "Unknown / misc" },
  { value: "handysize", label: "Handysize" },
  { value: "handymax", label: "Handymax" },
  { value: "supramax", label: "Supramax" },
  { value: "ultramax", label: "Ultramax" },
  { value: "panamax", label: "Panamax" },
  { value: "kamsarmax", label: "Kamsarmax" },
  { value: "capesize", label: "Capesize" },
  { value: "mr", label: "MR" },
  { value: "lr1", label: "LR1" },
  { value: "lr2", label: "LR2" },
  { value: "aframax", label: "Aframax" },
  { value: "suezmax", label: "Suezmax" },
  { value: "vlcc", label: "VLCC" },
];

// --- Styling ---
const styles: Record<string, React.CSSProperties> = {
  page: { padding: 22, fontFamily: "Arial, sans-serif", maxWidth: 1180, margin: "0 auto", background: "#eef3fb", minHeight: "100vh", color: "#0c1f3a", colorScheme: "light" },
  hero: { display: "flex", flexWrap: "wrap", gap: 14, background: "linear-gradient(135deg, #63a4ff, #4a90e2)", color: "#0c1f3a", borderRadius: 18, padding: 18, boxShadow: "0 14px 40px rgba(74, 144, 226, 0.25)", marginBottom: 16, justifyContent: "space-between", alignItems: "center", position: "relative" },
  heroLeft: { display: "flex", flexDirection: "column", gap: 8, minWidth: 280 },
  heroRight: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, justifyItems: "end", minWidth: 420, flex: 1 },
  heroPill: { alignSelf: "flex-start", padding: "6px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.35)", color: "#0c1f3a", fontWeight: 800, fontSize: 11, letterSpacing: 0.5 },
  heroTitle: { margin: 0, fontSize: 26, color: "#0c1f3a", fontWeight: 900 },
  heroSubtitle: { margin: 0, color: "#0f2f63", lineHeight: 1.35 },
  heroActions: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  heroButtonPrimary: { padding: "10px 12px", borderRadius: 12, border: "1px solid #1d4ed8", background: "#1d4ed8", color: "#f8fbff", fontWeight: 900, cursor: "pointer" },
  heroButtonGhost: { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.12)", color: "#e8f2ff", fontWeight: 800, cursor: "pointer" },
  heroMetricLabel: { fontSize: 12, color: "#d9e7ff", letterSpacing: 0.4 },
  heroMetricWrap: { display: "flex", gap: 6, alignItems: "baseline" },
  heroMetricValue: { fontSize: 30, fontWeight: 900, color: "#f2f7ff" },
  heroMetricFoot: { fontSize: 12, color: "#d9e7ff" },
  heroCornerLabel: { position: "absolute", top: 10, right: 12, color: "#e8f2ff", fontWeight: 900, fontSize: 12, letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 },
  heroCompass: { width: 18, height: 18, borderRadius: "50%", border: "2px solid #e8f2ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#e8f2ff", transform: "rotate(-10deg)" },

  grid: { display: "flex", flexDirection: "column", gap: 14 },
  card: { background: "#f8fbff", border: "1px solid #c6d7f5", padding: 14, borderRadius: 14, boxShadow: "0 8px 22px rgba(29, 78, 216, 0.12)" },
  controlColumn: { alignSelf: "stretch" },
  intelColumn: { alignSelf: "stretch" },
  sectionTitle: { margin: "12px 0 6px", fontSize: 15, color: "#0f2f63" },
  panelSubtitle: { margin: "4px 0 8px", color: "#1a3d7a", fontSize: 13, lineHeight: 1.35 },
  small: { color: "#324b73", fontSize: 12, lineHeight: 1.35 },
  btnRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  btn: { padding: "10px 12px", borderRadius: 12, border: "1px solid #7aa2e8", background: "#e7efff", cursor: "pointer", fontWeight: 800, color: "#0f2f63" },
  btnDark: { padding: "10px 12px", borderRadius: 12, border: "1px solid #1d4ed8", background: "#1d4ed8", cursor: "pointer", fontWeight: 900, color: "#f8fbff" },
  btnDanger: { padding: "10px 12px", borderRadius: 12, border: "1px solid #f59e9e", background: "#fee2e2", cursor: "pointer", fontWeight: 800, color: "#9f1239" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: "0 8px", minWidth: 720 },
  th: { textAlign: "left", fontSize: 12, color: "#324b73", padding: "0 8px" },
  td: { padding: "0 8px", verticalAlign: "top" },
  input: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #c6d7f5", outline: "none", background: "#ffffff", color: "#0c1f3a" },
  inputTouch: { width: "100%", padding: 14, borderRadius: 12, border: "1px solid #c6d7f5", outline: "none", background: "#ffffff", color: "#0c1f3a", fontSize: 16 },
  select: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #c6d7f5", background: "#ffffff", color: "#0c1f3a" },
  selectTouch: { width: "100%", padding: 14, borderRadius: 12, border: "1px solid #c6d7f5", background: "#ffffff", color: "#0c1f3a", fontSize: 16 },
  textarea: { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #c6d7f5", outline: "none", background: "#ffffff", color: "#0c1f3a", minHeight: 110, resize: "vertical", fontFamily: "inherit", lineHeight: 1.35 },
  warn: { padding: 12, background: "#fff7ed", borderRadius: 12, border: "1px solid #fcd9bd", color: "#9a3412", whiteSpace: "pre-wrap" },
  info: { padding: 12, background: "#e9f1ff", borderRadius: 12, border: "1px solid #c6d7f5", color: "#0f2f63", whiteSpace: "pre-wrap" },
  kv: { display: "flex", justifyContent: "space-between", padding: "5px 0" },
  kvLabel: { color: "#1f3766", fontSize: 13 },
  kvValue: { fontWeight: 800, color: "#0c1f3a" },
  tceBox: { marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #7aa2e8", background: "#e7efff" },
  tceTitle: { fontSize: 12, color: "#0f2f63", fontWeight: 900, letterSpacing: 0.3 },
  tceValue: { fontSize: 32, fontWeight: 900, marginTop: 4, color: "#0c1f3a" },
  divider: { height: 1, background: "#d7e3ff", margin: "12px 0" },
  miniBtn: { padding: "8px 10px", borderRadius: 10, border: "1px solid #7aa2e8", background: "#e7efff", cursor: "pointer", fontWeight: 900, color: "#0f2f63", width: "100%" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 },
  tabsRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  tab: { padding: "10px 12px", borderRadius: 999, border: "1px solid #7aa2e8", background: "#ffffff", cursor: "pointer", fontWeight: 900, color: "#0f2f63" },
  tabActive: { padding: "10px 12px", borderRadius: 999, border: "1px solid #1d4ed8", background: "#e7efff", cursor: "pointer", fontWeight: 900, color: "#1d4ed8" },
  hScroll: { overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 12, border: "1px solid #d7e3ff", padding: 6, background: "#f8fbff" },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 },
  kpiCard: { padding: 12, borderRadius: 12, border: "1px solid #c6d7f5", background: "#ffffff" },
  kpiValue: { fontSize: 20, fontWeight: 900, color: "#0c1f3a" },
  kpiFooter: { fontSize: 12, color: "#324b73" },
  riskBlock: { marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #fee2e2", background: "#fff1f2" },
  riskItem: { fontSize: 12, color: "#9f1239" },
};

// --- Helpers ---
function num(v: any): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isBlank(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function makeBlankEcoOverrides(count: number): EcoLegOverride[] {
  return Array.from({ length: count }, () => ({ speed_kn: "", cons_mt_per_day: "" }));
}

function defaultVoyage(): VoyageUI {
  return {
    tradeMode: "dry",
    voyageMode: "oneway",
    roundReturnPort: "",
    preferSavedDistances: true,
    targetTceEnabled: false,
    seaMarginPct: 5,
    vesselBasis: "standard",
    vesselClass: "unknown",
    namedVesselId: undefined,
    portCalls: [],
    legs: [],
    revenue: { cargo_qty_mt: "", freight_type: "per_mt", freight_usd_per_mt: "", freight_lumpsum_usd: "", commission_pct: "" },
    costs: { bunker_price_usd_per_mt: "", canal_tolls_usd: "", other_costs_usd: "" },
    targetTce: "",
    ecoMode: false,
    ecoSpeedDeltaKn: "-1.5", // default to ~11 kn on dry profiles
    ecoConsDeltaPct: "-41", // ~50% MCR vs 85% MCR baseline
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

function applyProfileToTables(
  profile: { label: string; speedKn: number; consMtPerDay: number; portConsMtPerDay: number },
  setLegs: React.Dispatch<React.SetStateAction<LegUI[]>>,
  setPortCalls: React.Dispatch<React.SetStateAction<PortCallUI[]>>
) {
  setLegs((prev) =>
    prev.map((l) => {
      const sp = num(l.speed_kn) || 0;
      const cs = num(l.cons_mt_per_day) || 0;
      return {
        ...l,
        speed_kn: sp > 0 ? l.speed_kn : String(profile.speedKn),
        cons_mt_per_day: cs > 0 ? l.cons_mt_per_day : String(profile.consMtPerDay),
      };
    })
  );

  setPortCalls((prev) =>
    prev.map((p) => {
      const pc = num(p.port_cons_mt_per_day) || 0;
      return { ...p, port_cons_mt_per_day: pc > 0 ? p.port_cons_mt_per_day : String(profile.portConsMtPerDay) };
    })
  );
}

function applySeaMarginToLegs<T extends { speed_kn: number; cons_mt_per_day: number }>(legs: T[], seaMarginPct: number): T[] {
  const margin = Math.max(0, seaMarginPct || 0);
  const speedFactor = 1 - margin / 100;
  const consFactor = 1 + margin / 100;

  return legs.map((l) => ({
    ...l,
    speed_kn: Math.max(0.1, (l.speed_kn || 0) * speedFactor),
    cons_mt_per_day: Math.max(0, (l.cons_mt_per_day || 0) * consFactor),
  }));
}

function inferLegModes(portCalls: PortCallUI[], legs: LegUI[]): LegMode[] {
  let cargoOnBoard = false;
  const modes: LegMode[] = [];

  for (let i = 0; i < legs.length; i++) {
    const port = portCalls[i];
    if (port?.type === "load") cargoOnBoard = true;
    if (port?.type === "discharge") cargoOnBoard = false;
    modes.push(cargoOnBoard ? "laden" : "ballast");
  }

  return modes;
}

function getSavedNamedVessels(): NamedVessel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_NAMED_VESSELS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((v: any) => {
        const ladenSpeed = num(v?.ladenSpeedKn) ?? num(v?.speedKn) ?? 0;
        const ballastSpeed = num(v?.ballastSpeedKn) ?? ladenSpeed;
        const ladenCons = num(v?.ladenConsMtPerDay) ?? num(v?.consMtPerDay) ?? 0;
        const ballastCons = num(v?.ballastConsMtPerDay) ?? ladenCons;
        const portWorking = num(v?.portWorkingConsMtPerDay) ?? num(v?.portConsMtPerDay) ?? 0;
        const portIdle = num(v?.portIdleConsMtPerDay) ?? portWorking;
        if (!v?.name) return null;

        const ecoLadenSpeed = num(v?.ecoLadenSpeedKn) ?? undefined;
        const ecoBallastSpeed = num(v?.ecoBallastSpeedKn) ?? undefined;
        const ecoLadenCons = num(v?.ecoLadenConsMtPerDay) ?? undefined;
        const ecoBallastCons = num(v?.ecoBallastConsMtPerDay) ?? undefined;

        const fuelType: FuelChoice = v?.fuelType === "HSFO" ? "HSFO" : "LSFO";
        const scrubberFitted = !!v?.scrubberFitted;

        const vessel: NamedVessel = {
          id: String(v?.id || Date.now()),
          name: String(v?.name),
          vesselClass: (v?.vesselClass || "unknown") as VesselClass,
          fuelType,
          scrubberFitted,
          ladenSpeedKn: Math.max(0, ladenSpeed || 0),
          ballastSpeedKn: Math.max(0, ballastSpeed || 0),
          ladenConsMtPerDay: Math.max(0, ladenCons || 0),
          ballastConsMtPerDay: Math.max(0, ballastCons || 0),
          ecoLadenSpeedKn: ecoLadenSpeed,
          ecoBallastSpeedKn: ecoBallastSpeed,
          ecoLadenConsMtPerDay: ecoLadenCons,
          ecoBallastConsMtPerDay: ecoBallastCons,
          portIdleConsMtPerDay: Math.max(0, portIdle || 0),
          portWorkingConsMtPerDay: Math.max(0, portWorking || 0),
          note: v?.note ? String(v.note) : undefined,
        };
        return vessel;
      })
      .filter(Boolean) as NamedVessel[];
  } catch {
    return [];
  }
}

function setSavedNamedVessels(list: NamedVessel[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_NAMED_VESSELS_KEY, JSON.stringify(list || []));
  } catch (err) {
    console.warn("Failed to persist named vessels", err);
  }
}

function cloneVoyage(v: VoyageUI): VoyageUI {
  return JSON.parse(JSON.stringify(v));
}

export default function Page() {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [tradeMode, setTradeMode] = useState<TradeMode>(defaultVoyage().tradeMode);
  const [voyageMode, setVoyageMode] = useState<VoyageMode>(defaultVoyage().voyageMode);
  const [roundReturnPort, setRoundReturnPort] = useState<string>(defaultVoyage().roundReturnPort);
  const [preferSavedDistances, setPreferSavedDistances] = useState<boolean>(defaultVoyage().preferSavedDistances);
  const [targetTceEnabled, setTargetTceEnabled] = useState<boolean>(defaultVoyage().targetTceEnabled || false);
  const [seaMarginPct, setSeaMarginPct] = useState<number>(defaultVoyage().seaMarginPct || 0);
  const [vesselBasis, setVesselBasis] = useState<VesselBasis>(defaultVoyage().vesselBasis || "standard");

  const [vesselClass, setVesselClass] = useState<VesselClass>(defaultVoyage().vesselClass || "unknown");
  const [namedVessels, setNamedVessels] = useState<NamedVessel[]>([]);
  const [namedVesselsHydrated, setNamedVesselsHydrated] = useState<boolean>(false);
  const [selectedNamedVesselId, setSelectedNamedVesselId] = useState<string>("");
  const [namedVesselForm, setNamedVesselForm] = useState<{
    name: string;
    vesselClass: VesselClass;
    fuelType: FuelChoice;
    scrubberFitted: boolean;
    ladenSpeedKn: string;
    ballastSpeedKn: string;
    ladenConsMtPerDay: string;
    ballastConsMtPerDay: string;
    ecoLadenSpeedKn: string;
    ecoBallastSpeedKn: string;
    ecoLadenConsMtPerDay: string;
    ecoBallastConsMtPerDay: string;
    portIdleConsMtPerDay: string;
    portWorkingConsMtPerDay: string;
    note: string;
  }>({
    name: "",
    vesselClass: "unknown",
    fuelType: "LSFO",
    scrubberFitted: false,
    ladenSpeedKn: "",
    ballastSpeedKn: "",
    ladenConsMtPerDay: "",
    ballastConsMtPerDay: "",
    ecoLadenSpeedKn: "",
    ecoBallastSpeedKn: "",
    ecoLadenConsMtPerDay: "",
    ecoBallastConsMtPerDay: "",
    portIdleConsMtPerDay: "",
    portWorkingConsMtPerDay: "",
    note: "",
  });

  const [portCalls, setPortCalls] = useState<PortCallUI[]>(defaultVoyage().portCalls);
  const [legs, setLegs] = useState<LegUI[]>(defaultVoyage().legs);
  const [revenue, setRevenue] = useState<RevenueUI>(defaultVoyage().revenue);
  const [costs, setCosts] = useState<CostsUI>(defaultVoyage().costs);
  const [targetTce, setTargetTce] = useState<string>(defaultVoyage().targetTce);

  const [msg, setMsg] = useState<string>("");
  const [summaryText, setSummaryText] = useState<string>("");
  const [itineraryStartDate, setItineraryStartDate] = useState<string>("");
  const [itineraryStartTime, setItineraryStartTime] = useState<string>("08:00");
  const [itineraryText, setItineraryText] = useState<string>("");
  const [itineraryRows, setItineraryRows] = useState<Array<{ port: string; type: PortType; eta: string; etd: string }>>([]);
  const [bunkerPort, setBunkerPort] = useState<string>("");
  const [bunkerGrade, setBunkerGrade] = useState<string>("VLSFO");
  const [bunkerResult, setBunkerResult] = useState<string>("");
  const [bunkerLoading, setBunkerLoading] = useState<boolean>(false);
  const [bunkerError, setBunkerError] = useState<string>("");

  const [savedList, setSavedList] = useState<VoyageUI[]>([]);
  const [saveName, setSaveName] = useState<string>("My Voyage");
  const [selectedSaveIdx, setSelectedSaveIdx] = useState<number>(-1);

  const [exportJson, setExportJson] = useState<string>("");
  const [importJson, setImportJson] = useState<string>("");
  const [showJsonExchange, setShowJsonExchange] = useState<boolean>(false);
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);

  const [mobileTab, setMobileTab] = useState<MobileTab>("summary");

  const [aiText, setAiText] = useState<string>("");
  const [aiDraft, setAiDraft] = useState<any>(null);
  const [aiError, setAiError] = useState<string>("");
  const [aiRaw, setAiRaw] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const [lastVesselClass, setLastVesselClass] = useState<VesselClass>("unknown");
  const [lastDerived, setLastDerived] = useState<any>(null);
  const [plannerTab, setPlannerTab] = useState<PlannerTab>("planner");
  const [viewTab, setViewTab] = useState<ViewTab>("create");
  const [portCostTemplates, setPortCostTemplates] = useState<PortCostTemplate[]>([]);
  const [portCostPort, setPortCostPort] = useState<string>("");
  const [portCostVesselClass, setPortCostVesselClass] = useState<VesselCostClass>("any");
  const [portCostAmount, setPortCostAmount] = useState<string>("");
  const [portCostNote, setPortCostNote] = useState<string>("");
  const [portCostApplyClass, setPortCostApplyClass] = useState<VesselCostClass>("any");
  const [routeEntries, setRouteEntries] = useState<RouteEntry[]>([]);
  const [routeFrom, setRouteFrom] = useState<string>("");
  const [routeTo, setRouteTo] = useState<string>("");
  const [routeDistance, setRouteDistance] = useState<string>("");
  const [ecoMode, setEcoMode] = useState<boolean>(false);
  const [ecoSpeedDeltaKn, setEcoSpeedDeltaKn] = useState<string>(defaultVoyage().ecoSpeedDeltaKn!);
  const [ecoConsDeltaPct, setEcoConsDeltaPct] = useState<string>(defaultVoyage().ecoConsDeltaPct!);
  const [ecoLegOverrides, setEcoLegOverrides] = useState<EcoLegOverride[]>(makeBlankEcoOverrides(0));

  // ECA and fuel tracking
  const [selectedFuelType, setSelectedFuelType] = useState<FuelType>("LSFO");
  const [ecaSurchargeUsd, setEcaSurchargeUsd] = useState<number>(0);
  const [routeECAInfo, setRouteECAInfo] = useState<any>(null);

  const portsTableRef = useRef<HTMLDivElement | null>(null);
  const legsTableRef = useRef<HTMLDivElement | null>(null);
  const summaryModalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setSavedList(getSavedVoyages()), []);
  useEffect(() => setPortCostTemplates(getSavedPortCostBook()), []);
  useEffect(() => setSavedPortCostBook(portCostTemplates), [portCostTemplates]);
  useEffect(() => {
    const saved = getSavedNamedVessels();
    setNamedVessels(saved);
    setNamedVesselsHydrated(true);
  }, []);
  useEffect(() => {
    if (!namedVesselsHydrated) return;
    setSavedNamedVessels(namedVessels);
  }, [namedVessels, namedVesselsHydrated]);
  useEffect(() => refreshRouteEntries(), []);
  useEffect(() => {
    if (lastVesselClass === "unknown") return;
    setPortCostApplyClass((prev) => (prev === "any" || prev === "unknown" ? lastVesselClass : prev));
    setPortCostVesselClass((prev) => (prev === "any" || prev === "unknown" ? lastVesselClass : prev));
  }, [lastVesselClass]);

  // Align port cost apply class with current vessel class when user switches vessel class directly.
  useEffect(() => {
    if (!vesselClass || vesselClass === "unknown") return;
    setPortCostApplyClass((prev) => (prev === "any" || prev === "unknown" ? vesselClass : prev));
  }, [vesselClass]);

  // Auto-apply saved port cost book to ports when data is available (no manual trigger needed).
  useEffect(() => {
    if (!portCostTemplates.length || !portCalls.length) return;
    setPortCalls((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const targetClasses: VesselCostClass[] = [];
        if (portCostApplyClass) targetClasses.push(portCostApplyClass);
        if (vesselClass && !targetClasses.includes(vesselClass)) targetClasses.push(vesselClass as VesselCostClass);
        if (!targetClasses.includes("any")) targetClasses.push("any");
        if (!targetClasses.includes("unknown")) targetClasses.push("unknown");

        let template: PortCostTemplate | null = null;
        for (const cls of targetClasses) {
          template = lookupPortCostTemplate(portCostTemplates, p.name, cls);
          if (template) break;
        }
        // As a last resort, use any saved entry for this port regardless of class.
        if (!template) {
          const normalized = normalizePortName(p.name);
          template = portCostTemplates.find((t) => normalizePortName(t.port) === normalized) || null;
        }
        if (!template) return p;
        if (p.port_cost_usd === template.costUsd) return p;
        changed = true;
        return { ...p, port_cost_usd: template.costUsd };
      });
      return changed ? next : prev;
    });
  }, [portCalls, portCostTemplates, portCostApplyClass]);

  // Keep eco overrides in sync with legs length.
  useEffect(() => {
    setEcoLegOverrides((prev) => {
      const next = Array.from({ length: legs.length }, (_, i) => prev[i] || { speed_kn: "", cons_mt_per_day: "" });
      return next;
    });
  }, [legs]);

  // Ensure every port call starts with a visible waiting-time default so users do not miss idle time.
  useEffect(() => {
    setPortCalls((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const wait = num(p.waiting_days);
        if (wait != null && !Number.isNaN(wait)) return p;
        const fallback = p.type === "load" || p.type === "discharge" ? "0.5" : "0";
        changed = true;
        return { ...p, waiting_days: fallback };
      });
      return changed ? next : prev;
    });
  }, [portCalls]);

  // Auto-apply saved distances to all legs (mirrors saved port cost behavior).
  useEffect(() => {
    const distMap = getUserRouteMap();
    if (!distMap || Object.keys(distMap).length === 0) return;
    setLegs((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        const d = lookupDistanceNm(l.from, l.to);
        if (!d) return l;
        if (String(l.distance_nm) === String(d)) return l;
        changed = true;
        return { ...l, distance_nm: String(d) };
      });
      return changed ? next : prev;
    });
  }, [portCalls, legs]);

  // Auto-fill missing distances using sea routing when coordinates are known.
  useEffect(() => {
    if (!portCalls.length || !legs.length) return;

    let changed = false;
    const next = legs.map((l) => {
      const current = num(l.distance_nm);
      if (current && current > 0) return l;

      const fromCoord = PORT_COORDINATES[l.from];
      const toCoord = PORT_COORDINATES[l.to];
      if (!fromCoord || !toCoord) return l;

      const route = computeSeaRoute({ ...fromCoord, name: l.from }, { ...toCoord, name: l.to });
      const dist = Math.round(route.distanceNm * 10) / 10;
      if (dist > 0) {
        changed = true;
        return { ...l, distance_nm: String(dist) };
      }
      return l;
    });

    if (changed) {
      setLegs(next);
      setMsg((m) => (m ? `${m}\nDistances auto-filled from sea routing.` : "Distances auto-filled from sea routing."));
    }
  }, [portCalls, legs]);

  // Derive ECA exposure from port chain using sea routing (even without map UI).
  useEffect(() => {
    if (portCalls.length < 2) {
      setRouteECAInfo(null);
      return;
    }

    const segments = [] as Array<{ path: { lat: number; lon: number }[] }>;
    for (let i = 0; i < portCalls.length - 1; i++) {
      const from = PORT_COORDINATES[portCalls[i].name];
      const to = PORT_COORDINATES[portCalls[i + 1].name];
      if (!from || !to) continue;
      const route = computeSeaRoute({ ...from }, { ...to });
      segments.push({ path: route.path });
    }

    if (!segments.length) {
      setRouteECAInfo(null);
      return;
    }

    const combinedPath = segments.flatMap((s) => s.path);
    if (combinedPath.length < 2) {
      setRouteECAInfo(null);
      return;
    }

    const eca = checkRouteECAs(combinedPath);
    setRouteECAInfo(eca);
    setSelectedFuelType(eca.recommendedFuel);
  }, [portCalls]);

  // Keep legs scaffolded to match port call chain, without wiping existing distances.
  useEffect(() => {
    if (portCalls.length < 2) {
      setLegs([]);
      return;
    }

    setLegs((prev) => {
      const expected = portCalls.length - 1;
      const next: LegUI[] = [];

      for (let i = 0; i < expected; i++) {
        const from = portCalls[i]?.name || `Port ${i + 1}`;
        const to = portCalls[i + 1]?.name || `Port ${i + 2}`;
        const prior = prev[i];
        const defaultSpeed = tradeMode === "tanker" ? "13.5" : "12.5";
        const defaultCons = tradeMode === "tanker" ? "32" : "28";

        next.push({
          from,
          to,
          distance_nm: prior?.distance_nm ?? "",
          speed_kn: prior?.speed_kn ?? defaultSpeed,
          cons_mt_per_day: prior?.cons_mt_per_day ?? defaultCons,
        });
      }

      const unchanged =
        prev.length === next.length &&
        prev.every((p, idx) => p.from === next[idx].from && p.to === next[idx].to);
      return unchanged ? prev : next;
    });
  }, [portCalls, tradeMode]);

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
      eca_surcharge_usd: ecaSurchargeUsd,
    };
  }, [portCalls, legs, revenue, costs, ecaSurchargeUsd]);

  const voyageWithMargin = useMemo(() => {
    return {
      ...voyage,
      legs: applySeaMarginToLegs(voyage.legs, seaMarginPct),
    };
  }, [voyage, seaMarginPct]);

  const result: any = useMemo(() => calcItinerary(voyageWithMargin), [voyageWithMargin]);

  const ecoResult = useMemo(() => {
    if (!ecoMode) return null;
    if (!voyage || !result || result.status !== "ok") return null;

    const deltaKn = num(ecoSpeedDeltaKn) ?? 0;
    const deltaConsPct = num(ecoConsDeltaPct) ?? 0;

    const ecoLegsRaw = voyage.legs.map((l, idx) => {
      const override = ecoLegOverrides[idx] || {};
      const baseSpeed = l.speed_kn || 0;
      const baseCons = l.cons_mt_per_day || 0;
      const ecoSpeed = num(override.speed_kn) ?? baseSpeed + deltaKn;
      const ecoCons = num(override.cons_mt_per_day) ?? baseCons * (1 + deltaConsPct / 100);
      return {
        ...l,
        speed_kn: Math.max(0.5, ecoSpeed),
        cons_mt_per_day: Math.max(0, ecoCons),
      };
    });

    const ecoLegs = applySeaMarginToLegs(ecoLegsRaw, seaMarginPct);

    // Use blended bunker pricing for eco runs so consumption changes always influence TCE (purchase plans are fixed qty).
    const ecoPorts = voyage.portCalls.map((p) => ({
      ...p,
      bunker_purchase_qty_mt: 0,
      bunker_purchase_price_usd_per_mt: 0,
    }));

    const ecoVoyage = {
      ...voyage,
      portCalls: ecoPorts,
      legs: ecoLegs,
    } as any;

    const r: any = calcItinerary(ecoVoyage);
    return r?.status === "ok" ? r : null;
  }, [ecoMode, voyage, result, ecoSpeedDeltaKn, ecoConsDeltaPct, ecoLegOverrides]);

  const displayedResult = ecoMode && ecoResult ? ecoResult : result;

  const solver: any = useMemo(() => {
    if (result?.error || result?.status !== "ok") return null;
    if (revenue.freight_type !== "per_mt") return null;
    if (!targetTceEnabled) return null;
    return solveFreightPerMtForTargetTCE({
      target_tce_usd_per_day: num(targetTce),
      voyage_days: result.voyage_days,
      voyage_costs_total: result.voyage_costs_total,
      commission_pct: num(revenue.commission_pct),
      cargo_qty_mt: num(revenue.cargo_qty_mt),
    });
  }, [result, revenue, targetTce, targetTceEnabled]);

  const tceSims = useMemo(() => {
    if (!result || result.status !== "ok") return null;

    const baseTce = result.tce_usd_per_day;

    function calcWith(delta: { bunkerPrice?: number; freightPerMt?: number }) {
      const v2: any = JSON.parse(JSON.stringify(voyageWithMargin));
      if (delta.bunkerPrice != null) v2.costs.bunker_price_usd_per_mt = Math.max(0, (v2.costs.bunker_price_usd_per_mt || 0) + delta.bunkerPrice);
      if (delta.freightPerMt != null && v2.revenue.freight_type === "per_mt") v2.revenue.freight_usd_per_mt = Math.max(0, (v2.revenue.freight_usd_per_mt || 0) + delta.freightPerMt);
      const r2: any = calcItinerary(v2);
      if (!r2 || r2.status !== "ok") return null;
      return r2.tce_usd_per_day;
    }

    const rows = [
      { label: "Freight +1 USD/mt", tce: calcWith({ freightPerMt: +1 }) },
      { label: "Freight -1 USD/mt", tce: calcWith({ freightPerMt: -1 }) },
      { label: "Bunker +50 USD/mt", tce: calcWith({ bunkerPrice: +50 }) },
      { label: "Bunker -50 USD/mt", tce: calcWith({ bunkerPrice: -50 }) },
    ].map((r) => ({ ...r, delta: r.tce != null ? r.tce - baseTce : null }));

    return { baseTce, rows };
  }, [result, voyage]);

  const emissionStats = useMemo(() => calculateEmissionStats(result, num(revenue.cargo_qty_mt), selectedFuelType), [result, revenue, selectedFuelType]);
  const dataAlerts = useMemo(() => collectDataQualityFlags(portCalls, legs, result), [portCalls, legs, result]);
  const targetTceNumber = targetTceEnabled ? num(targetTce) : null;

  const kpiCards = useMemo(() => {
    const r = displayedResult;
    if (!r || r.status !== "ok") return [] as Array<{ label: string; value: string; footer: string }>;
    const portAndWait = round((r.port_days_total || 0) + (r.waiting_days_total || 0), 1);
    const targetSpread = targetTceNumber != null ? round(r.tce_usd_per_day - targetTceNumber, 0) : null;

    return [
      {
        label: "Owner TCE",
        value: formatUsd(r.tce_usd_per_day, { maximumFractionDigits: 0 }),
        footer: targetSpread != null ? `${targetSpread >= 0 ? "+" : ""}${formatNumber(targetSpread, { maximumFractionDigits: 0 })} vs target` : "Set a TCE target to track delta",
      },
      {
        label: "Voyage profit",
        value: formatUsd(r.voyage_profit, { maximumFractionDigits: 0 }),
        footer: `Net revenue ${formatUsd(r.net_revenue, { maximumFractionDigits: 0 })}`,
      },
      {
        label: "Voyage days",
        value: `${formatNumber(r.voyage_days, { maximumFractionDigits: 1 })} d`,
        footer: `${formatNumber(r.sea_days_total, { maximumFractionDigits: 1 })} sea / ${formatNumber(portAndWait, { maximumFractionDigits: 1 })} port+wait`,
      },
    ];
  }, [displayedResult, targetTceNumber]);

  const heroTce = displayedResult?.status === "ok" ? round(displayedResult.tce_usd_per_day, 0) : null;
  const heroDays = displayedResult?.status === "ok" ? round(displayedResult.voyage_days, 1) : null;
  const heroProfit = displayedResult?.status === "ok" ? round(displayedResult.voyage_profit, 0) : null;
  const heroTargetSpread = targetTceNumber != null && heroTce != null ? round(heroTce - targetTceNumber, 0) : null;
  const heroRequiredFreight = solver?.required_per_mt != null ? round(solver.required_per_mt, 2) : null;
  const baseTce = result?.status === "ok" ? round(result.tce_usd_per_day, 0) : null;
  const ecoTce = ecoResult?.tce_usd_per_day != null ? round(ecoResult.tce_usd_per_day, 0) : null;
  const portCostHintClass = portCostApplyClass !== "any" ? portCostApplyClass : lastVesselClass;
  const bunkerPrice = num(costs.bunker_price_usd_per_mt) || 0;
  const hasBunkerPurchasePlan = portCalls.some((p) => (num(p.bunker_purchase_qty_mt) || 0) > 0 && (num(p.bunker_purchase_price_usd_per_mt) || 0) > 0);
  const ecoConsumptionMuted = bunkerPrice <= 0 && !hasBunkerPurchasePlan;
  const legEcoStats = useMemo(() => {
    if (!ecoMode) return null;
    if (!legs.length) return null;
    const deltaKn = num(ecoSpeedDeltaKn) ?? 0;
    const deltaConsPct = num(ecoConsDeltaPct) ?? 0;
    let baseSpeedSum = 0;
    let ecoSpeedSum = 0;
    let speedCount = 0;
    let baseConsSum = 0;
    let ecoConsSum = 0;
    let consCount = 0;

    legs.forEach((l, idx) => {
      const override = ecoLegOverrides[idx] || {};
      const spd = num(l.speed_kn);
      const ecoSpd = num(override.speed_kn) ?? (spd ?? 0) + deltaKn;
      if (spd != null && spd > 0) {
        baseSpeedSum += spd;
        ecoSpeedSum += Math.max(0.1, ecoSpd);
        speedCount += 1;
      }
      const cons = num(l.cons_mt_per_day);
      const ecoCons = num(override.cons_mt_per_day) ?? (cons ?? 0) * (1 + deltaConsPct / 100);
      if (cons != null && cons > 0) {
        baseConsSum += cons;
        ecoConsSum += Math.max(0, ecoCons);
        consCount += 1;
      }
    });

    const baseSpeedAvg = speedCount ? baseSpeedSum / speedCount : null;
    const ecoSpeedAvg = speedCount ? ecoSpeedSum / speedCount : null;
    const baseConsAvg = consCount ? baseConsSum / consCount : null;
    const ecoConsAvg = consCount ? ecoConsSum / consCount : null;

    return { baseSpeedAvg, ecoSpeedAvg, baseConsAvg, ecoConsAvg };
  }, [ecoMode, legs, ecoSpeedDeltaKn, ecoConsDeltaPct, ecoLegOverrides]);

  const legEcoRows = useMemo(() => {
    const deltaKn = num(ecoSpeedDeltaKn) ?? 0;
    const deltaConsPct = num(ecoConsDeltaPct) ?? 0;
    return legs.map((l, idx) => {
      const override = ecoLegOverrides[idx] || {};
      const baseSpeed = num(l.speed_kn);
      const baseCons = num(l.cons_mt_per_day);
      const ecoSpeed = num(override.speed_kn) ?? ((baseSpeed ?? 0) + deltaKn);
      const ecoCons = num(override.cons_mt_per_day) ?? ((baseCons ?? 0) * (1 + deltaConsPct / 100));
      return {
        from: l.from,
        to: l.to,
        baseSpeed,
        ecoSpeed: baseSpeed != null ? Math.max(0.5, ecoSpeed) : null,
        baseCons,
        ecoCons: baseCons != null ? Math.max(0, ecoCons) : null,
      };
    });
  }, [legs, ecoLegOverrides, ecoSpeedDeltaKn, ecoConsDeltaPct]);

  const updateEcoOverride = (idx: number, key: keyof EcoLegOverride, value: string) => {
    setEcoLegOverrides((prev) => {
      const next = [...prev];
      next[idx] = { ...(next[idx] || {}), [key]: value };
      return next;
    });
  };

  // Calculate ECA surcharge when result or fuel type changes
  useEffect(() => {
    if (!result || result.status !== "ok" || !routeECAInfo) return;
    
    const baseBunkerPrice = num(costs.bunker_price_usd_per_mt) || 0;
    const totalBunkers = result.bunkers_total || 0;
    
    if (baseBunkerPrice > 0 && totalBunkers > 0) {
      const surchargeInfo = calculateECAFuelSurcharge(baseBunkerPrice, routeECAInfo.ecaPercentage, selectedFuelType);
      const totalEcaSurcharge = surchargeInfo.surchargePerMt * totalBunkers;
      setEcaSurchargeUsd(Math.round(totalEcaSurcharge));
    }
  }, [result, routeECAInfo, selectedFuelType, costs.bunker_price_usd_per_mt]);

  function refreshRouteEntries() {
    setRouteEntries(listUserRoutes());
  }

  function saveRouteEntry() {
    const dist = num(routeDistance);
    if (!routeFrom.trim() || !routeTo.trim() || dist == null || dist <= 0) {
      setMsg("Enter from/to ports and a distance > 0 nm.");
      return;
    }
    const res = saveDistanceNm(routeFrom, routeTo, dist);
    if (!res.ok) {
      setMsg(res.error || "Could not save leg.");
      return;
    }
    refreshRouteEntries();
    setRouteDistance("");
    setMsg(`Saved ${routeFrom} -> ${routeTo} = ${dist} nm to matrix.`);
  }

  function deleteRouteEntry(entry: RouteEntry) {
    dropUserRoute(entry.from, entry.to);
    refreshRouteEntries();
    setMsg(`Removed saved leg ${entry.from} -> ${entry.to}.`);
  }

  function clearRouteMatrix() {
    clearUserRoutes();
    refreshRouteEntries();
    setMsg("Cleared saved route distances (browser).");
  }

  function newVoyage() {
    const d = defaultVoyage();
    setTradeMode(d.tradeMode);
    setVoyageMode(d.voyageMode);
    setRoundReturnPort(d.roundReturnPort);
    setPreferSavedDistances(d.preferSavedDistances);
    setTargetTceEnabled(d.targetTceEnabled || false);
    setSeaMarginPct(d.seaMarginPct || 0);
    setPortCalls(d.portCalls);
    setLegs(d.legs);
    setRevenue(d.revenue);
    setCosts(d.costs);
    setTargetTce(d.targetTce);
    setRouteECAInfo(null);
    setSelectedFuelType("LSFO");
    setEcaSurchargeUsd(0);
    setVesselBasis(d.vesselBasis || "standard");
    setVesselClass(d.vesselClass || "unknown");
    setSelectedNamedVesselId(d.namedVesselId || "");
    setEcoLegOverrides(makeBlankEcoOverrides(d.legs.length));

    setAiDraft(null);
    setAiError("");
    setAiRaw("");
    setMsg("New voyage created. Tables are blank.");
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
    if (r.ok) refreshRouteEntries();
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
    if (saved > 0) refreshRouteEntries();
  }

  function clearSavedRoutesUI() {
    clearRouteMatrix();
  }

  function savePortCostEntry() {
    const portName = portCostPort.trim();
    const costValue = portCostAmount.trim();
    if (!portName || !costValue) {
      setMsg("Enter both port name and cost before saving.");
      return;
    }

    const newEntry: PortCostTemplate = {
      id: makePortCostId(),
      port: portName,
      vesselClass: portCostVesselClass,
      costUsd: costValue,
      note: portCostNote.trim() || undefined,
    };

    setPortCostTemplates((prev) => {
      const normalizedPort = normalizePortName(portName);
      const idx = prev.findIndex(
        (entry) => normalizePortName(entry.port) === normalizedPort && entry.vesselClass === portCostVesselClass
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...newEntry, id: prev[idx].id };
        return next;
      }
      return [...prev, newEntry];
    });

    setMsg(`Saved port cost for ${portName} (${portCostVesselClass}).`);
  }

  function deletePortCostEntry(id: string) {
    setPortCostTemplates((prev) => prev.filter((entry) => entry.id !== id));
    setMsg("Removed saved port cost entry.");
  }

  function applyPortCostEntries() {
    if (!portCostTemplates.length) {
      setMsg("No saved port costs yet. Add entries first.");
      return;
    }
    let applied = 0;
    const targetClass = portCostApplyClass;
    setPortCalls((prev) => {
      const next = prev.map((p) => {
        const template = lookupPortCostTemplate(portCostTemplates, p.name, targetClass);
        if (!template) return p;
        if (template.costUsd === (p.port_cost_usd || "")) return p;
        applied += 1;
        return { ...p, port_cost_usd: template.costUsd };
      });
      return next;
    });
    setMsg(applied ? `Applied costs to ${applied} port call${applied === 1 ? "" : "s"}.` : "No saved costs matched this voyage.");
  }

  function resetPortCostForm() {
    setPortCostPort("");
    setPortCostAmount("");
    setPortCostNote("");
    setPortCostVesselClass("any");
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
    applyProfileToTables(
      { label: profile.label, speedKn: profile.ladenSpeedKn, consMtPerDay: profile.ladenConsMtPerDay, portConsMtPerDay: profile.portConsMtPerDay },
      setLegs,
      setPortCalls
    );

    return { applied: true, profileLabel: profile.label };
  }

  function applyNamedVessel(vesselId: string) {
    const v = namedVessels.find((n) => n.id === vesselId);
    if (!v) {
      setMsg("Select a saved vessel first.");
      return;
    }

    const modes = inferLegModes(portCalls, legs);

    setLegs((prev) =>
      prev.map((l, idx) => {
        const mode = modes[idx] || "ballast";
        const speed = mode === "laden" ? v.ladenSpeedKn : v.ballastSpeedKn;
        const cons = mode === "laden" ? v.ladenConsMtPerDay : v.ballastConsMtPerDay;
        return {
          ...l,
          speed_kn: speed > 0 ? String(speed) : l.speed_kn,
          cons_mt_per_day: cons > 0 ? String(cons) : l.cons_mt_per_day,
        };
      })
    );

    setEcoLegOverrides((prev) => {
      const next = legs.map((_, idx) => {
        const mode = modes[idx] || "ballast";
        const ecoSpeed = mode === "laden" ? v.ecoLadenSpeedKn : v.ecoBallastSpeedKn;
        const ecoCons = mode === "laden" ? v.ecoLadenConsMtPerDay : v.ecoBallastConsMtPerDay;
        return {
          speed_kn: ecoSpeed != null && ecoSpeed > 0 ? String(ecoSpeed) : "",
          cons_mt_per_day: ecoCons != null && ecoCons > 0 ? String(ecoCons) : "",
        } as EcoLegOverride;
      });
      return next.length ? next : prev;
    });

    setPortCalls((prev) =>
      prev.map((p) => {
        const working = p.type === "load" || p.type === "discharge";
        const consValue = working ? v.portWorkingConsMtPerDay : v.portIdleConsMtPerDay;
        const current = num(p.port_cons_mt_per_day) || 0;
        return current > 0 ? p : { ...p, port_cons_mt_per_day: consValue > 0 ? String(consValue) : p.port_cons_mt_per_day };
      })
    );

    const impliedFuel = v.scrubberFitted || v.fuelType === "HSFO" ? "HFO" : "LSFO";
    setSelectedFuelType(impliedFuel as FuelType);
    setVesselBasis("named");
    setLastVesselClass(v.vesselClass || "unknown");
    setVesselClass(v.vesselClass || "unknown");
    setSelectedNamedVesselId(v.id);
    setMsg(`Applied vessel: ${v.name} (${modes.filter((m) => m === "laden").length} laden / ${modes.filter((m) => m === "ballast").length} ballast legs)`);
  }

  function saveNamedVessel() {
    const name = namedVesselForm.name.trim();
    const cls = namedVesselForm.vesselClass || "unknown";
    const ladenSpeed = num(namedVesselForm.ladenSpeedKn);
    const ballastSpeed = num(namedVesselForm.ballastSpeedKn);
    const ladenCons = num(namedVesselForm.ladenConsMtPerDay);
    const ballastCons = num(namedVesselForm.ballastConsMtPerDay);
    const portIdle = num(namedVesselForm.portIdleConsMtPerDay);
    const portWorking = num(namedVesselForm.portWorkingConsMtPerDay);

    if (!name) {
      setMsg("Name is required to save vessel.");
      return;
    }
    if (ladenSpeed == null || ladenSpeed <= 0 || ballastSpeed == null || ballastSpeed <= 0) {
      setMsg("Enter laden and ballast speeds (knots).");
      return;
    }
    if (ladenCons == null || ladenCons <= 0 || ballastCons == null || ballastCons <= 0) {
      setMsg("Enter laden and ballast sea consumption (mt/day).");
      return;
    }
    if (portIdle == null || portIdle < 0 || portWorking == null || portWorking < 0) {
      setMsg("Enter port idle and working consumption (mt/day). Zero is allowed.");
      return;
    }

    const ecoLadenSpeed = num(namedVesselForm.ecoLadenSpeedKn) ?? undefined;
    const ecoBallastSpeed = num(namedVesselForm.ecoBallastSpeedKn) ?? undefined;
    const ecoLadenCons = num(namedVesselForm.ecoLadenConsMtPerDay) ?? undefined;
    const ecoBallastCons = num(namedVesselForm.ecoBallastConsMtPerDay) ?? undefined;

    const id = `${Date.now()}`;
    const vessel: NamedVessel = {
      id,
      name,
      vesselClass: cls,
      fuelType: namedVesselForm.fuelType,
      scrubberFitted: !!namedVesselForm.scrubberFitted,
      ladenSpeedKn: ladenSpeed,
      ballastSpeedKn: ballastSpeed,
      ladenConsMtPerDay: ladenCons,
      ballastConsMtPerDay: ballastCons,
      ecoLadenSpeedKn: ecoLadenSpeed,
      ecoBallastSpeedKn: ecoBallastSpeed,
      ecoLadenConsMtPerDay: ecoLadenCons,
      ecoBallastConsMtPerDay: ecoBallastCons,
      portIdleConsMtPerDay: portIdle,
      portWorkingConsMtPerDay: portWorking,
      note: namedVesselForm.note?.trim() || undefined,
    };
    const next = [...namedVessels, vessel];
    setNamedVessels(next);
    setSelectedNamedVesselId(id);
    setVesselBasis("named");
    setNamedVesselsHydrated(true);

    try {
      setSavedNamedVessels(next);
      setMsg(`Saved vessel "${name}" with laden/ballast + eco profiles.`);
      // clear the form to make it obvious the save happened
      setNamedVesselForm({
        name: "",
        vesselClass: "unknown",
        fuelType: "LSFO",
        scrubberFitted: false,
        ladenSpeedKn: "",
        ballastSpeedKn: "",
        ladenConsMtPerDay: "",
        ballastConsMtPerDay: "",
        ecoLadenSpeedKn: "",
        ecoBallastSpeedKn: "",
        ecoLadenConsMtPerDay: "",
        ecoBallastConsMtPerDay: "",
        portIdleConsMtPerDay: "",
        portWorkingConsMtPerDay: "",
        note: "",
      });
    } catch (err: any) {
      console.error("Failed persisting named vessel:", err);
      setMsg(`Saved in session but could not persist: ${String(err?.message || err)}`);
    }
  }

  function deleteNamedVessel(id: string) {
    setNamedVessels((prev) => prev.filter((v) => v.id !== id));
    if (selectedNamedVesselId === id) setSelectedNamedVesselId("");
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

    const cargoFromDraft = Number(aiDraft?.revenue?.cargo_qty_mt || 0) || null;
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
        laytime_term: "",
        port_cons_mt_per_day: p.port_cons_mt_per_day == null ? "" : String(p.port_cons_mt_per_day),
        port_cost_usd: p.port_cost_usd == null ? "" : String(p.port_cost_usd),
        bunker_purchase_qty_mt:
          cargoFromDraft && Number(p.bunker_purchase_qty_mt) === cargoFromDraft
            ? ""
            : p.bunker_purchase_qty_mt == null
            ? ""
            : String(p.bunker_purchase_qty_mt),
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
    let pcFinal = r.changed > 0 ? r.pc : pcApplied;

    const laytimeSource = aiRaw || aiText;
    const laytimeAdjustments = inferLaytimeAllowances(laytimeSource, pcFinal);
    if (laytimeAdjustments.updated) pcFinal = laytimeAdjustments.portCalls;

    if (pcFinal !== pcApplied || r.changed > 0 || laytimeAdjustments.updated) setPortCalls(pcFinal);

    const notes = [] as string[];
    if (prof.applied) notes.push(`Vessel defaults: ${prof.profileLabel}`);
    if (r.changed > 0) notes.push(`Auto port days: ${r.changed} field(s)\n- ${r.notes.join("\n- ")}`);
    if (laytimeAdjustments.note) notes.push(laytimeAdjustments.note);

    setMsg(
      notes.length
        ? `Applied AI draft.\n${notes.join("\n")}\n\nNext: click Apply to table.`
        : "Applied AI draft. Next: click Apply to table."
    );

    if (isMobile) setMobileTab("summary");
  }

  function makeVoyageSnapshot(name?: string): VoyageUI {
    return {
      name: name || "Voyage",
      tradeMode,
      voyageMode,
      roundReturnPort,
      preferSavedDistances,
      targetTceEnabled,
      seaMarginPct,
      vesselBasis,
      vesselClass,
      namedVesselId: selectedNamedVesselId || undefined,
      portCalls,
      legs,
      revenue,
      costs,
      targetTce,
      ecoMode,
      ecoSpeedDeltaKn,
      ecoConsDeltaPct,
    };
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
    setTargetTceEnabled(!!v.targetTceEnabled);
    setSeaMarginPct(v.seaMarginPct ?? defaultVoyage().seaMarginPct ?? 0);
    setVesselBasis(v.vesselBasis || "standard");
    setVesselClass(v.vesselClass || "unknown");
    setSelectedNamedVesselId(v.namedVesselId || "");
    setPortCalls(v.portCalls || []);
    setLegs(v.legs || []);
    setEcoLegOverrides(makeBlankEcoOverrides((v.legs || []).length));
    setRevenue(v.revenue || defaultVoyage().revenue);
    setCosts(v.costs || defaultVoyage().costs);
    setTargetTce(v.targetTce || "0");
    setEcoMode(!!v.ecoMode);
    setEcoSpeedDeltaKn(v.ecoSpeedDeltaKn ?? defaultVoyage().ecoSpeedDeltaKn!);
    setEcoConsDeltaPct(v.ecoConsDeltaPct ?? defaultVoyage().ecoConsDeltaPct!);
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
    setNavTab("json");
    setMsg("Export JSON generated. Expand JSON panel to copy/share.");
  }

  function importVoyageFromJson() {
    try {
      const obj = JSON.parse(importJson);
      const v = obj as VoyageUI;
      setTradeMode(v.tradeMode || "dry");
      setVoyageMode(v.voyageMode || "oneway");
      setRoundReturnPort(v.roundReturnPort || "Singapore");
      setPreferSavedDistances(!!v.preferSavedDistances);
      setTargetTceEnabled(!!v.targetTceEnabled);
      setSeaMarginPct(v.seaMarginPct ?? defaultVoyage().seaMarginPct ?? 0);
      setVesselBasis(v.vesselBasis || "standard");
      setVesselClass(v.vesselClass || "unknown");
      setSelectedNamedVesselId(v.namedVesselId || "");
      setPortCalls(v.portCalls || []);
      setLegs(v.legs || []);
      setEcoLegOverrides(makeBlankEcoOverrides((v.legs || []).length));
      setRevenue(v.revenue || defaultVoyage().revenue);
      setCosts(v.costs || defaultVoyage().costs);
      setTargetTce(v.targetTce || "0");
      setEcoMode(!!v.ecoMode);
      setEcoSpeedDeltaKn(v.ecoSpeedDeltaKn ?? defaultVoyage().ecoSpeedDeltaKn!);
      setEcoConsDeltaPct(v.ecoConsDeltaPct ?? defaultVoyage().ecoConsDeltaPct!);
      setMsg("Imported voyage JSON.");
      if (isMobile) setMobileTab("summary");
    } catch (e: any) {
      setMsg(`Import failed: ${String(e?.message || e)}`);
    }
  }

  function generateSummary() {
    // If distances missing, still give a clear message (so button never feels “dead”)
    if (!result || result.status !== "ok") {
      setMsg("Summary needs valid Results. Please Fill Distances first (or manually enter distances).");
      return;
    }

    const portsLine = portCalls.map((p) => p.name).filter(Boolean).join(" → ");
    const avgSpeed = legs.length ? round(legs.map((l) => Number(l.speed_kn || 0)).reduce((a, b) => a + b, 0) / legs.length, 2) : "-";
    const avgCons = legs.length ? round(legs.map((l) => Number(l.cons_mt_per_day || 0)).reduce((a, b) => a + b, 0) / legs.length, 2) : "-";
    const fr = revenue.freight_type === "per_mt" ? `${revenue.freight_usd_per_mt} USD/mt` : `${revenue.freight_lumpsum_usd} USD lumpsum`;
    const vesselNote = lastVesselClass !== "unknown" ? `Vessel profile: ${getProfile(lastVesselClass).label}` : "Vessel profile: (none)";
    const seaMarginNote = seaMarginPct != null ? `Sea margin: ${seaMarginPct}% applied (speed lower, cons higher)` : "";
    const ecaNote = routeECAInfo
      ? `ECA compliance: ${routeECAInfo.ecaPercentage}% of route in ECA zones. Fuel type: ${selectedFuelType}. Surcharge: ${round(ecaSurchargeUsd, 0)} USD`
      : "ECA compliance: None";
    const targetNote = targetTceEnabled && targetTceNumber != null ? `Target TCE set at ${targetTceNumber} USD/day` : "Target TCE not enabled";

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
- ECA surcharge (USD): ${round(ecaSurchargeUsd, 0)}

Money:
- Net revenue (USD): ${round(result.net_revenue, 0)}
- Total voyage costs (USD): ${round(result.voyage_costs_total, 0)}
- Voyage profit (USD): ${round(result.voyage_profit, 0)}

OWNER TCE: ${round(result.tce_usd_per_day, 0)} USD/day

Key assumptions:
- ${seaMarginNote}
 - ${targetNote}
 - ${seaMarginNote}
- ${vesselNote}
- Avg speed: ${avgSpeed} kn
- Avg sea cons: ${avgCons} mt/day
- Blended bunker price (fallback): ${costs.bunker_price_usd_per_mt} USD/mt
- ${ecaNote}
`;
    setSummaryText(txt);
    setShowSummaryModal(true);
    if (isMobile) setMobileTab("summary");
  }

  async function fetchBunkerPrice() {
    setBunkerError("");
    setBunkerResult("");
    if (!bunkerPort.trim()) {
      setBunkerError("Enter a port to fetch bunker prices.");
      return;
    }
    setBunkerLoading(true);
    try {
      // Placeholder: Ship & Bunker API requires credentials and server-side call. Using mock data for now.
      const mockPrices: Record<string, { VLSFO: number; HSFO: number; MGO: number }> = {
        singapore: { VLSFO: 580, HSFO: 470, MGO: 820 },
        rotterdam: { VLSFO: 560, HSFO: 455, MGO: 805 },
        houston: { VLSFO: 545, HSFO: 440, MGO: 795 },
      };
      const key = bunkerPort.trim().toLowerCase();
      const gradeKey = bunkerGrade.toUpperCase();
      const entry = mockPrices[key];
      const price = entry ? (entry as any)[gradeKey] : null;
      if (price) {
        setBunkerResult(`${bunkerPort} ${gradeKey}: ${price} USD/mt (mocked Ship & Bunker)`);
      } else {
        setBunkerError("Live Ship & Bunker API not connected. Add credentials/server proxy to fetch real prices.");
      }
    } catch (e: any) {
      setBunkerError("Failed to fetch bunker price. Configure Ship & Bunker API.");
    } finally {
      setBunkerLoading(false);
    }
  }

  function buildItinerary() {
    if (!itineraryStartDate) {
      setMsg("Add an itinerary start date first.");
      return;
    }
    if (!displayedResult || displayedResult.status !== "ok") {
      setMsg("Itinerary needs valid Results. Fill distances then build again.");
      return;
    }

    const startIso = `${itineraryStartDate}T${itineraryStartTime || "00:00"}`;
    const start = parseDateInput(startIso);
    if (!start) {
      setMsg("Enter a valid start date/time.");
      return;
    }

    const ports = (voyage?.portCalls || []) as Array<{ name?: string; type?: PortType; port_days?: number; waiting_days?: number }>;
    const legsWithMargin = (voyageWithMargin?.legs || []) as Array<{ from?: string; to?: string; distance_nm: number; speed_kn: number; cons_mt_per_day: number }>;
    if (!ports.length || !legsWithMargin.length) {
      setMsg("Add ports and legs before building an itinerary.");
      return;
    }

    let cursor = start;
    const lines: string[] = [`ITINERARY (start ${formatDateTime(cursor)})`, ""];
    const rows: Array<{ port: string; type: PortType; eta: string; etd: string }> = [];

    for (let i = 0; i < ports.length; i++) {
      const p = ports[i];
      const name = p?.name || `Port ${i + 1}`;
      lines.push(`Port ${i + 1}: ${name} (${p?.type || "other"})`);
      lines.push(`- Arrive/commence: ${formatDateTime(cursor)}`);

      const stayDaysRaw = (p?.port_days || 0) + (p?.waiting_days || 0);
      const stayDays = stayDaysRaw > 0 ? stayDaysRaw : 0;
      const depart = stayDays > 0 ? addDays(cursor, stayDays) : cursor;
      rows.push({ port: name, type: (p?.type as PortType) || "other", eta: formatDateTime(cursor), etd: formatDateTime(depart) });
      if (stayDays > 0) {
        lines.push(`- Port + wait: ${round(stayDays, 2) ?? 0} days → depart ${formatDateTime(depart)}`);
        cursor = depart;
      } else {
        lines.push("- Port + wait: 0 days (depart on arrival)");
        cursor = depart;
      }

      if (i < legsWithMargin.length) {
        const leg = legsWithMargin[i];
        const dist = Math.max(0, leg?.distance_nm || 0);
        const spd = Math.max(0.1, leg?.speed_kn || 0);
        const seaDays = dist > 0 ? dist / (spd * 24) : 0;
        const arrival = addDays(cursor, seaDays);
        lines.push(
          `Sail ${leg?.from || name} → ${leg?.to || ports[i + 1]?.name || "next port"}: ${round(dist, 1) ?? dist} nm @ ${round(spd, 1) ?? spd} kn = ${round(seaDays, 2) ?? seaDays} days`
        );
        lines.push(`- ETA ${formatDateTime(arrival)}`);
        cursor = arrival;
      }

      lines.push("");
    }

    lines.push(`Voyage span: ${round(displayedResult.voyage_days, 2)} days ending ${formatDateTime(cursor)}`);

    setItineraryText(lines.join("\n"));
    setMsg("Itinerary built. Copy to share.");
    setItineraryRows(rows);
  }

  const showTceBanner = !isMobile && displayedResult?.status === "ok" && !displayedResult?.error;

  function setNavTab(tab: ViewTab) {
    setViewTab(tab);
    if (tab === "create") setPlannerTab("planner");
    if (tab === "ports") setPlannerTab("portCosts");
    if (tab === "distance") setPlannerTab("distanceMatrix");
  }

  function scrollToPortsTable() {
    portsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToLegsTable() {
    legsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const MobileTabs = () => (
    <div style={styles.tabsRow}>
      <button type="button" style={mobileTab === "summary" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("summary")}>Summary</button>
      <button type="button" style={mobileTab === "ports" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("ports")}>Ports</button>
      <button type="button" style={mobileTab === "legs" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("legs")}>Legs</button>
      <button type="button" style={mobileTab === "edit" ? styles.tabActive : styles.tab} onClick={() => setMobileTab("edit")}>Full Edit</button>
    </div>
  );

  const activeNamedVessel = namedVessels.find((v) => v.id === selectedNamedVesselId);
  return (
    <main style={styles.page}>
      {showSummaryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000 }}>
          <div ref={summaryModalRef} style={{ background: "#ffffff", padding: 18, borderRadius: 14, boxShadow: "0 18px 36px rgba(0,0,0,0.18)", width: "min(640px, 92vw)", maxHeight: "90vh", overflow: "auto", border: "1px solid #cbd5e1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: "#0f2f63" }}>Shareable summary</div>
              <button type="button" style={styles.miniBtn} onClick={() => setShowSummaryModal(false)}>Close</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                style={styles.btnDark}
                onClick={() => {
                  navigator.clipboard?.writeText(summaryText || "");
                  setMsg("Summary copied to clipboard.");
                }}
              >
                Copy summary
              </button>
              <button
                type="button"
                style={styles.btn}
                onClick={() => setShowSummaryModal(false)}
              >
                Done
              </button>
            </div>
            <textarea style={{ ...styles.textarea, minHeight: 280 }} value={summaryText} onChange={(e) => setSummaryText(e.target.value)} />
          </div>
        </div>
      )}
      <section style={styles.hero}>
        <div style={styles.heroCornerLabel}>
          <span style={styles.heroCompass}>N</span>
          <span>Powered by AI</span>
        </div>
        <div style={styles.heroLeft}>
          <h1 style={styles.heroTitle}>Voyage Estimator +</h1>
          <p style={styles.heroSubtitle}>
            Plan, stress-test, and share voyages in one blueboard. Built for operators who need answers fast.
          </p>
          <div style={styles.heroActions}>
            <button type="button" style={styles.heroButtonPrimary} onClick={generateSummary}>
              Shareable summary
            </button>
          </div>
        </div>
        <div style={styles.heroRight}>
          <div>
            <div style={styles.heroMetricLabel}>Owner TCE</div>
            <div style={styles.heroMetricWrap}>
              <div style={styles.heroMetricValue}>{heroTce != null ? formatNumber(heroTce, { maximumFractionDigits: 0 }) : "--"}</div>
              <div style={styles.heroMetricFoot}>USD / day</div>
            </div>
            <div style={styles.heroMetricFoot}>
              {heroTargetSpread != null ? `${heroTargetSpread >= 0 ? "+" : ""}${formatNumber(heroTargetSpread, { maximumFractionDigits: 0 })} vs target` : "Set target TCE for delta"}
            </div>
          </div>
          <div>
            <div style={styles.heroMetricLabel}>Voyage days</div>
            <div style={styles.heroMetricValue}>{heroDays != null ? formatNumber(heroDays, { maximumFractionDigits: 1 }) : "--"}</div>
            <div style={styles.heroMetricFoot}>Sea + port</div>
          </div>
          <div>
            <div style={styles.heroMetricLabel}>Profit outlook</div>
            <div style={styles.heroMetricValue}>{heroProfit != null ? formatUsd(heroProfit, { maximumFractionDigits: 0 }) : "--"}</div>
            <div style={styles.heroMetricFoot}>Commission net</div>
          </div>
          <div>
            <div style={styles.heroMetricLabel}>Freight for target</div>
            <div style={styles.heroMetricValue}>{heroRequiredFreight != null ? formatNumber(heroRequiredFreight, { maximumFractionDigits: 2 }) : "--"}</div>
            <div style={styles.heroMetricFoot}>{solver ? "USD/mt for target TCE" : "Enable target + $/mt"}</div>
          </div>
        </div>
      </section>

      {isMobile && <MobileTabs />}

      {!isMobile && (
        <div style={{ ...styles.tabsRow, margin: "8px 0 4px", flexWrap: "wrap" }}>
          <button type="button" style={viewTab === "create" ? styles.tabActive : styles.tab} onClick={() => setNavTab("create")}>
            Create
          </button>
          <button type="button" style={viewTab === "results" ? styles.tabActive : styles.tab} onClick={() => setNavTab("results")}>
            Results
          </button>
          <button type="button" style={viewTab === "analysis" ? styles.tabActive : styles.tab} onClick={() => setNavTab("analysis")}>
            Analysis
          </button>
          <button type="button" style={viewTab === "vessels" ? styles.tabActive : styles.tab} onClick={() => setNavTab("vessels")}>
            Vessels
          </button>
          <button type="button" style={viewTab === "json" ? styles.tabActive : styles.tab} onClick={() => setNavTab("json")}>
            JSON
          </button>
          <button type="button" style={viewTab === "bunker" ? styles.tabActive : styles.tab} onClick={() => setNavTab("bunker")}>
            Bunker
          </button>
          <button type="button" style={viewTab === "ports" ? styles.tabActive : styles.tab} onClick={() => setNavTab("ports")}>
            Port library
          </button>
          <button type="button" style={viewTab === "distance" ? styles.tabActive : styles.tab} onClick={() => setNavTab("distance")}>
            Distance library
          </button>
          <button type="button" style={viewTab === "guide" ? styles.tabActive : styles.tab} onClick={() => setNavTab("guide")}>
            Guide
          </button>
        </div>
      )}

      <div
        style={{
          ...styles.grid,
          gap: isMobile ? 12 : styles.grid.gap,
          marginTop: isMobile ? 10 : 0,
        }}
      >
        {viewTab === "guide" && (
          <section style={styles.card}>
            <h2 style={{ margin: 0 }}>Guide</h2>
            <p style={styles.panelSubtitle}>How to use Voyage Estimator +</p>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ ...styles.info }}>
                <div style={{ fontWeight: 800 }}>1) Build the voyage</div>
                <div style={styles.small}>Add ports and legs, then set speeds/cons. Sea margin applies automatically; saved distances and port costs will auto-fill.</div>
              </div>
              <div style={{ ...styles.info }}>
                <div style={{ fontWeight: 800 }}>2) Costs & tariffs</div>
                <div style={styles.small}>Saved port cost book applies instantly on load; edit entries in Port library. Distance library auto-applies saved legs.</div>
              </div>
              <div style={{ ...styles.info }}>
                <div style={{ fontWeight: 800 }}>3) Targets & solver</div>
                <div style={styles.small}>On Results, set a Target TCE; the hero shows required freight and the solver gives USD/mt to hit target.</div>
              </div>
              <div style={{ ...styles.info }}>
                <div style={{ fontWeight: 800 }}>4) Analysis tools</div>
                <div style={styles.small}>Use Analysis for eco deltas, emissions, and data hygiene. TCE scenarios compare freight and bunker sensitivities.</div>
              </div>
              <div style={{ ...styles.info }}>
                <div style={{ fontWeight: 800 }}>5) Sharing</div>
                <div style={styles.small}>Click Shareable summary (top) to open the copy-ready voyage brief. Export/import JSON in Templates if needed.</div>
              </div>
            </div>
          </section>
        )}

        {/* LEFT: Setup + Editing */}
        {(isMobile || ["create", "ports", "distance", "vessels", "bunker", "json"].includes(viewTab)) && (
        <section style={{ ...styles.card, ...(isMobile ? {} : styles.controlColumn) }}>
          
          {viewTab === "create" && (
            <>
              {isMobile && (
                <div style={styles.btnRow}>
                  <button type="button" style={styles.btn} onClick={scrollToPortsTable}>Jump to ports</button>
                  <button type="button" style={styles.btn} onClick={scrollToLegsTable}>Jump to legs</button>
                </div>
              )}

              {msg && <div style={{ ...styles.info, marginTop: 10 }}><b>{msg}</b></div>}

              <div style={styles.divider} />

              <h2 style={{ margin: 0 }}>Create with AI</h2>
              <div style={styles.small}>
                Paste voyage description. AI drafts ports/legs. Distances remain blank by design.
                <br />
                <b>Tip:</b> “Bunker at Singapore before sailing” or “Bunker enroute at Fujairah between load and discharge”.
              </div>

              <textarea style={{ ...styles.textarea, marginTop: 10 }} value={aiText} onChange={(e) => setAiText(e.target.value)} />

              <div style={styles.btnRow}>
                <button type="button" style={styles.btnDark} onClick={runAI} disabled={aiLoading}>
                  {aiLoading ? "AI Working..." : "Create with AI"}
                </button>
                <button type="button" style={styles.btn} onClick={applyAIDraft} disabled={!aiDraft}>
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

              <div style={{ ...styles.card, padding: 12, marginTop: 12 }}>
                <div style={styles.sectionTitle}>Sea margin (%)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={seaMarginPct}
                    onChange={(e) => setSeaMarginPct(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <div style={{ minWidth: 70, textAlign: "right", fontWeight: 800 }}>{seaMarginPct}%</div>
                </div>
                <div style={styles.small}>Applies to speed (lower) and consumption (higher) to reflect weather margin.</div>
              </div>

              {/* Mobile simplified views */}
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
                        </>
                      ) : (
                        <div style={styles.small}>Fill distances to compute results.</div>
                      )}
                    </>
                  )}

                  {mobileTab === "ports" && (
                    <>
                      <h2 style={{ margin: 0 }}>Ports (cards)</h2>
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        {portCalls.map((p, idx) => (
                          <div key={idx} style={{ border: "1px solid #e6eaf2", borderRadius: 14, padding: 12, background: "#ffffff" }}>
                            <div style={{ fontWeight: 900 }}>{p.name || `Port ${idx + 1}`}</div>
                            <div style={styles.small}>Type: <b>{p.type}</b> • Port days: <b>{p.port_days || "0"}</b> • Waiting: <b>{p.waiting_days || "0"}</b></div>
                              {p.laytime_term && <div style={styles.small}>Laytime: <b>{p.laytime_term}</b></div>}
                            <div style={styles.small}>Port cons: <b>{p.port_cons_mt_per_day || "0"}</b> • Port cost: <b>{p.port_cost_usd || "0"}</b></div>
                            {(p.bunker_purchase_qty_mt || p.bunker_purchase_price_usd_per_mt) && (
                              <div style={styles.small}>Bunker buy: <b>{p.bunker_purchase_qty_mt || "0"}</b> mt @ <b>{p.bunker_purchase_price_usd_per_mt || "0"}</b></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {mobileTab === "legs" && (
                    <>
                      <h2 style={{ margin: 0 }}>Legs (cards)</h2>
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        {legs.map((l, idx) => (
                          <div key={idx} style={{ border: "1px solid #e6eaf2", borderRadius: 14, padding: 12, background: "#ffffff" }}>
                            <div style={{ fontWeight: 900 }}>{l.from || "?"} → {l.to || "?"}</div>
                            <div style={styles.small}>Distance: <b>{l.distance_nm || "-"}</b> nm • Speed: <b>{l.speed_kn || "-"}</b> kn • Sea cons: <b>{l.cons_mt_per_day || "-"}</b></div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Full edit */}
              {(!isMobile || mobileTab === "edit") && (
                <>
                  <div style={styles.divider} />
                  <h2 style={{ margin: 0 }}>Or select from saved voyages</h2>

                  <div style={styles.twoCol}>
                    <Field label="Save name">
                      <input style={isMobile ? styles.inputTouch : styles.input} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                    </Field>
                    <Field label="Saved voyages">
                      <select style={isMobile ? styles.selectTouch : styles.select} value={selectedSaveIdx} onChange={(e) => setSelectedSaveIdx(Number(e.target.value))}>
                        <option value={-1}>-- select --</option>
                        {savedList.map((v, idx) => (
                          <option key={idx} value={idx}>{v.name || `Voyage ${idx + 1}`}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div style={styles.btnRow}>
                    <button type="button" style={styles.btn} onClick={saveVoyageTemplate}>Save Voyage Template</button>
                    <button type="button" style={styles.btn} onClick={loadVoyageTemplate}>Load</button>
                    <button type="button" style={styles.btnDanger} onClick={deleteSelectedVoyage}>Delete</button>
                    <button type="button" style={styles.btn} onClick={() => setNavTab("json")}>Open JSON panel</button>
                    <button type="button" style={styles.btn} onClick={exportCurrentVoyage}>Export JSON</button>
                  </div>

                  {namedVessels.length > 0 && (
                    <div style={{ ...styles.card, padding: 12, marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div style={styles.sectionTitle}>Swap to a named vessel</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            style={isMobile ? styles.selectTouch : styles.select}
                            value={selectedNamedVesselId}
                            onChange={(e) => setSelectedNamedVesselId(e.target.value)}
                          >
                            <option value="">-- select vessel --</option>
                            {namedVessels.map((v) => (
                              <option key={v.id} value={v.id}>{v.name} ({getProfile(v.vesselClass).label})</option>
                            ))}
                          </select>
                          <button type="button" style={styles.btn} onClick={() => applyNamedVessel(selectedNamedVesselId)} disabled={!selectedNamedVesselId}>
                            Swap on voyage
                          </button>
                        </div>
                      </div>
                      <div style={styles.small}>Loads speeds/cons and fuel basis from the named vessel while keeping the current voyage legs and ports.</div>
                    </div>
                  )}

                  

                  <div style={styles.divider} />

                  <div style={{ ...styles.card, background: "#f8fafc", border: "1px solid #cbd5e1", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={styles.sectionTitle}>Applied vessel</div>
                      <div style={{ ...styles.small, fontWeight: 800, color: "#0f2f63" }}>
                        {vesselBasis === "named" ? (activeNamedVessel ? activeNamedVessel.name : "Named vessel") : `Standard: ${getVesselClassLabel(vesselClass)}`}
                      </div>
                    </div>

                    {vesselBasis === "named" ? (
                      activeNamedVessel ? (
                        <div style={{ ...styles.small, color: "#0f2f63", lineHeight: 1.6 }}>
                          <div><b>{activeNamedVessel.name}</b> • {getProfile(activeNamedVessel.vesselClass).label}</div>
                          <div>
                            Fuel: {activeNamedVessel.scrubberFitted ? "HSFO (scrubber)" : activeNamedVessel.fuelType} • Port cons: {activeNamedVessel.portWorkingConsMtPerDay}/
                            {activeNamedVessel.portIdleConsMtPerDay} mt/day
                          </div>
                        </div>
                      ) : (
                        <div style={styles.small}>Select and apply a named vessel in the Vessels tab.</div>
                      )
                    ) : (
                          <div style={{ ...styles.small, color: "#0f2f63" }}>
                            Standard class: <b>{getVesselClassLabel(vesselClass)}</b>
                          </div>
                    )}
                  </div>

                  <div ref={portsTableRef} style={styles.sectionTitle}>Port calls</div>
                  <div style={styles.hScroll}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Port</th>
                          <th style={styles.th}>Type</th>
                          <th style={styles.th}>Port days</th>
                          <th style={styles.th}>Waiting</th>
                          <th style={styles.th}>Laytime</th>
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
                            <td style={styles.td}><div style={{ fontSize: 12, color: "#0f2f63", fontWeight: 700 }}>{p.laytime_term || "-"}</div></td>
                            <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.port_cons_mt_per_day} onChange={(e) => updatePort(idx, "port_cons_mt_per_day", e.target.value, setPortCalls)} /></td>
                            <td style={styles.td}>
                              <input
                                style={isMobile ? styles.inputTouch : styles.input}
                                value={p.port_cost_usd}
                                onChange={(e) => updatePort(idx, "port_cost_usd", e.target.value, setPortCalls)}
                              />
                              {(() => {
                                const hint = lookupPortCostTemplate(portCostTemplates, p.name, portCostHintClass);
                                if (!hint || !hint.costUsd) return null;
                                return (
                                  <div style={{ ...styles.small, marginTop: 4 }}>
                                    Saved: {hint.costUsd} USD ({getVesselClassLabel(hint.vesselClass)}){hint.note ? ` • ${hint.note}` : ""}
                                  </div>
                                );
                              })()}
                            </td>
                            <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.bunker_purchase_qty_mt} onChange={(e) => updatePort(idx, "bunker_purchase_qty_mt", e.target.value, setPortCalls)} /></td>
                            <td style={styles.td}><input style={isMobile ? styles.inputTouch : styles.input} value={p.bunker_purchase_price_usd_per_mt} onChange={(e) => updatePort(idx, "bunker_purchase_price_usd_per_mt", e.target.value, setPortCalls)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={styles.divider} />

                  {routeECAInfo && (
                    <div
                      style={{
                        padding: 14,
                        background: "#fffbeb",
                        borderRadius: 12,
                        border: "1px solid #fcd34d",
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#b45309", marginBottom: 8 }}>
                        ⚠️ ECA Analysis: {routeECAInfo.ecaPercentage}% of route in ECA zones
                      </div>
                      <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
                        <div><strong>Recommended Fuel:</strong> {routeECAInfo.recommendedFuel}</div>
                        {routeECAInfo.zonesEncountered.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Zones:</strong>
                            {routeECAInfo.zonesEncountered.map((zone: any) => (
                              <div key={zone.id} style={{ marginLeft: 12, marginTop: 4 }}>
                                • {zone.name} (max {zone.sulfurLimitPct}% sulfur)
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={styles.twoCol}>
                    <Field label="Fuel Type (Selected)">
                      <select
                        style={isMobile ? styles.selectTouch : styles.select}
                        value={selectedFuelType}
                        onChange={(e) => setSelectedFuelType(e.target.value as FuelType)}
                      >
                        <option value="HFO">HFO (Heavy Fuel Oil)</option>
                        <option value="LSFO">LSFO (Low Sulfur Fuel Oil)</option>
                        <option value="MGO">MGO (Marine Gas Oil)</option>
                        <option value="LNG">LNG (Liquefied Natural Gas)</option>
                      </select>
                    </Field>
                    <Field label="ECA Surcharge (USD)">
                      <input
                        style={isMobile ? styles.inputTouch : styles.input}
                        type="number"
                        value={Math.round(ecaSurchargeUsd)}
                        onChange={(e) => setEcaSurchargeUsd(num(e.target.value) || 0)}
                        placeholder="Auto-calculated from ECA exposure"
                      />
                    </Field>
                  </div>

                  <div style={{ ...styles.card, padding: 12, border: "1px dashed #d7e3ff" }}>
                    <div style={styles.sectionTitle}>Eco speed toggle</div>
                    <label style={{ ...styles.kvLabel, display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={ecoMode} onChange={(e) => setEcoMode(e.target.checked)} />
                      Compare eco profile (slower / leaner) without overwriting your inputs
                    </label>
                    {ecoMode && (
                      <div style={styles.twoCol}>
                        <div>
                          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Speed delta (kn)</div>
                          <input
                            style={isMobile ? styles.inputTouch : styles.input}
                            value={ecoSpeedDeltaKn}
                            onChange={(e) => setEcoSpeedDeltaKn(e.target.value)}
                            placeholder="e.g. -1.0"
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Consumption delta (%)</div>
                          <input
                            style={isMobile ? styles.inputTouch : styles.input}
                            value={ecoConsDeltaPct}
                            onChange={(e) => setEcoConsDeltaPct(e.target.value)}
                            placeholder="e.g. -12"
                          />
                        </div>
                      </div>
                    )}
                    {ecoMode && legEcoStats && (
                      <div style={styles.small}>
                        Eco applied: speed avg {legEcoStats.baseSpeedAvg != null ? round(legEcoStats.baseSpeedAvg, 2) : "--"} → {legEcoStats.ecoSpeedAvg != null ? round(legEcoStats.ecoSpeedAvg, 2) : "--"} kn;
                        cons avg {legEcoStats.baseConsAvg != null ? round(legEcoStats.baseConsAvg, 2) : "--"} → {legEcoStats.ecoConsAvg != null ? round(legEcoStats.ecoConsAvg, 2) : "--"} mt/day.
                      </div>
                    )}
                    {ecoMode && ecoConsumptionMuted && <div style={styles.small}>Set a bunker price or purchase plan to see TCE change when consumption shifts.</div>}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                      <KV label="Base TCE" value={baseTce != null ? formatUsd(baseTce, { maximumFractionDigits: 0 }) : "--"} />
                      <KV label="Eco TCE" value={ecoResult?.tce_usd_per_day != null ? formatUsd(ecoResult.tce_usd_per_day, { maximumFractionDigits: 0 }) : "--"} />
                      <KV
                        label="Δ vs base"
                        value={ecoResult && baseTce != null ? `${ecoResult.tce_usd_per_day - baseTce >= 0 ? "+" : ""}${round(ecoResult.tce_usd_per_day - baseTce, 0)} /day` : "--"}
                      />
                    </div>
                    {ecoResult && (
                      <div style={styles.small}>Days {round(ecoResult.voyage_days, 1)} vs {round(result?.voyage_days, 1)} • Bunkers {round(ecoResult.bunkers_total, 1)} mt</div>
                    )}
                  </div>

                  <div ref={legsTableRef} style={styles.sectionTitle}>Legs</div>
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
                            <td style={styles.td}><button type="button" style={styles.miniBtn} onClick={() => saveLeg(idx)}>Save</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {ecoMode && legEcoRows.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={styles.sectionTitle}>Eco legs (editable)</div>
                      <div style={styles.hScroll}>
                        <table style={{ ...styles.table, minWidth: 0 }}>
                          <thead>
                            <tr>
                              <th style={styles.th}>From</th>
                              <th style={styles.th}>To</th>
                              <th style={styles.th}>Base speed</th>
                              <th style={styles.th}>Eco speed</th>
                              <th style={styles.th}>Base cons</th>
                              <th style={styles.th}>Eco cons</th>
                            </tr>
                          </thead>
                          <tbody>
                            {legEcoRows.map((row, idx) => (
                              <tr key={idx}>
                                <td style={styles.td}>{row.from}</td>
                                <td style={styles.td}>{row.to}</td>
                                <td style={styles.td}>{row.baseSpeed != null ? round(row.baseSpeed, 2) : "--"}</td>
                                <td style={styles.td}>
                                  <input
                                    style={isMobile ? styles.inputTouch : styles.input}
                                    value={ecoLegOverrides[idx]?.speed_kn ?? (row.ecoSpeed != null ? String(round(row.ecoSpeed, 2)) : "")}
                                    onChange={(e) => updateEcoOverride(idx, "speed_kn", e.target.value)}
                                    placeholder={row.ecoSpeed != null ? String(round(row.ecoSpeed, 2)) : "auto"}
                                  />
                                </td>
                                <td style={styles.td}>{row.baseCons != null ? round(row.baseCons, 2) : "--"}</td>
                                <td style={styles.td}>
                                  <input
                                    style={isMobile ? styles.inputTouch : styles.input}
                                    value={ecoLegOverrides[idx]?.cons_mt_per_day ?? (row.ecoCons != null ? String(round(row.ecoCons, 2)) : "")}
                                    onChange={(e) => updateEcoOverride(idx, "cons_mt_per_day", e.target.value)}
                                    placeholder={row.ecoCons != null ? String(round(row.ecoCons, 2)) : "auto"}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={styles.small}>Edit eco speed/cons per leg. Leave blank to use the global eco deltas.</div>
                    </div>
                  )}

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
                    <div />
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
            </>
          )}

          {(viewTab === "distance" || (viewTab === "create" && plannerTab === "distanceMatrix")) && (
            <>
            
              <h2 style={{ margin: 0 }}>Distance matrix</h2>
              <p style={styles.panelSubtitle}>View and edit your saved sea legs. Auto-fill prefers these entries before defaults.</p>

              <div style={styles.twoCol}>
                <Field label="From port">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} />
                </Field>
                <Field label="To port">
                  <input style={isMobile ? styles.inputTouch : styles.input} value={routeTo} onChange={(e) => setRouteTo(e.target.value)} />
                </Field>
              </div>
              <Field label="Distance (nm)">
                <input style={isMobile ? styles.inputTouch : styles.input} value={routeDistance} onChange={(e) => setRouteDistance(e.target.value)} />
              </Field>

              <div style={styles.btnRow}>
                <button type="button" style={styles.btnDark} onClick={saveRouteEntry}>Save leg</button>
                <button type="button" style={styles.btn} onClick={fillDistances}>Auto-fill voyage</button>
                <button type="button" style={styles.btnDanger} onClick={clearRouteMatrix}>Clear saved legs</button>
              </div>

              <div style={styles.divider} />

              <div style={styles.sectionTitle}>Saved legs</div>
              {routeEntries.length ? (
                <div style={styles.hScroll}>
                  <table style={{ ...styles.table, minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th style={styles.th}>From</th>
                        <th style={styles.th}>To</th>
                        <th style={styles.th}>Distance (nm)</th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routeEntries.map((entry, idx) => (
                        <tr key={idx}>
                          <td style={styles.td}>{entry.from}</td>
                          <td style={styles.td}>{entry.to}</td>
                          <td style={styles.td}>{entry.distance}</td>
                          <td style={styles.td}>
                            <button type="button" style={styles.miniBtn} onClick={() => deleteRouteEntry(entry)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={styles.small}>No saved legs yet. Add a from/to pair with distance and click Save.</div>
              )}
            </>
          )}

          {(viewTab === "ports" || (viewTab === "create" && plannerTab === "portCosts")) && (
            <>
              <h2 style={{ margin: 0 }}>Port cost book</h2>
              <p style={styles.panelSubtitle}>Capture port tariffs by vessel size locally so you can re-use them whenever APIs are offline or unavailable.</p>

              <div style={styles.twoCol}>
                <Field label="Port name">
                  <input
                    style={isMobile ? styles.inputTouch : styles.input}
                    value={portCostPort}
                    onChange={(e) => setPortCostPort(e.target.value)}
                    placeholder="e.g. Singapore"
                  />
                </Field>
                <Field label="Vessel class">
                  <select
                    style={isMobile ? styles.selectTouch : styles.select}
                    value={portCostVesselClass}
                    onChange={(e) => setPortCostVesselClass(e.target.value as VesselCostClass)}
                  >
                    {VESSEL_CLASS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div style={styles.twoCol}>
                <Field label="Port cost (USD)">
                  <input
                    style={isMobile ? styles.inputTouch : styles.input}
                    type="number"
                    value={portCostAmount}
                    onChange={(e) => setPortCostAmount(e.target.value)}
                    placeholder="150000"
                  />
                </Field>
                <Field label="Notes (optional)">
                  <input
                    style={isMobile ? styles.inputTouch : styles.input}
                    value={portCostNote}
                    onChange={(e) => setPortCostNote(e.target.value)}
                    placeholder="Includes agency + towage"
                  />
                </Field>
              </div>

              <div style={styles.btnRow}>
                <button type="button" style={styles.btnDark} onClick={savePortCostEntry}>Save to book</button>
                <button type="button" style={styles.btn} onClick={resetPortCostForm}>Clear form</button>
              </div>

              <div style={styles.divider} />

              <div style={styles.sectionTitle}>Saved tariffs</div>
              {portCostTemplates.length ? (
                <div style={styles.hScroll}>
                  <table style={{ ...styles.table, minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Port</th>
                        <th style={styles.th}>Vessel class</th>
                        <th style={styles.th}>Cost (USD)</th>
                        <th style={styles.th}>Notes</th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portCostTemplates.map((entry) => (
                        <tr key={entry.id}>
                          <td style={styles.td}>{entry.port}</td>
                          <td style={styles.td}>{getVesselClassLabel(entry.vesselClass)}</td>
                          <td style={styles.td}>{entry.costUsd ? `${entry.costUsd} USD` : "--"}</td>
                          <td style={styles.td}>{entry.note || "--"}</td>
                          <td style={styles.td}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                style={{ ...styles.miniBtn, flex: 1 }}
                                onClick={() => {
                                  setPortCostPort(entry.port);
                                  setPortCostVesselClass(entry.vesselClass);
                                  setPortCostAmount(entry.costUsd);
                                  setPortCostNote(entry.note || "");
                                  setPortCostApplyClass(entry.vesselClass);
                                  setMsg(`Loaded ${entry.port} (${getVesselClassLabel(entry.vesselClass)}) into form for edit.`);
                                }}
                              >
                                Edit
                              </button>
                              <button type="button" style={{ ...styles.miniBtn, flex: 1 }} onClick={() => deletePortCostEntry(entry.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={styles.small}>No saved entries yet. Add at least one port + vessel combination to start your offline tariff library.</div>
              )}

              <div style={styles.divider} />

              <Field label="Apply using vessel class">
                <select
                  style={isMobile ? styles.selectTouch : styles.select}
                  value={portCostApplyClass}
                  onChange={(e) => setPortCostApplyClass(e.target.value as VesselCostClass)}
                >
                  {VESSEL_CLASS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>

              <div style={styles.btnRow}>
                <button type="button" style={styles.btnDark} onClick={applyPortCostEntries}>Apply saved costs to voyage</button>
              </div>
            </>
          )}

          {viewTab === "vessels" && (
            <>
              <h2 style={{ margin: 0 }}>Vessels</h2>
              <p style={styles.panelSubtitle}>Choose a standard class or a named profile. Applying here updates the voyage tables; you can also view saved vessel data.</p>

              <div style={{ ...styles.card, background: "#f8fafc", border: "1px solid #cbd5e1", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={styles.sectionTitle}>Applied vessel</div>
                  <div style={{ ...styles.small, fontWeight: 800, color: "#0f2f63" }}>
                    {vesselBasis === "named" ? (activeNamedVessel ? activeNamedVessel.name : "Named vessel") : `Standard: ${getVesselClassLabel(vesselClass)}`}
                  </div>
                </div>
                {vesselBasis === "named" ? (
                  activeNamedVessel ? (
                    <div style={{ ...styles.small, color: "#0f2f63", lineHeight: 1.6 }}>
                      <div><b>{activeNamedVessel.name}</b> • {getProfile(activeNamedVessel.vesselClass).label}</div>
                      <div>
                        Fuel: {activeNamedVessel.scrubberFitted ? "HSFO (scrubber)" : activeNamedVessel.fuelType} • Port cons: {activeNamedVessel.portWorkingConsMtPerDay}/{activeNamedVessel.portIdleConsMtPerDay} mt/day
                      </div>
                    </div>
                  ) : (
                    <div style={styles.small}>Select and apply a named vessel below.</div>
                  )
                ) : (
                  <div style={{ ...styles.small, color: "#0f2f63" }}>
                    Standard class: <b>{getVesselClassLabel(vesselClass)}</b>
                  </div>
                )}
              </div>

              <div style={{ ...styles.card, padding: 12, marginTop: 4 }}>
                <div style={styles.sectionTitle}>Vessel basis</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={styles.kvLabel}>
                    <input type="radio" checked={vesselBasis === "standard"} onChange={() => setVesselBasis("standard")} style={{ marginRight: 6 }} />
                    Standard profile
                  </label>
                  <label style={styles.kvLabel}>
                    <input type="radio" checked={vesselBasis === "named"} onChange={() => setVesselBasis("named")} style={{ marginRight: 6 }} />
                    Named vessel
                  </label>
                </div>

                {vesselBasis === "standard" && (
                  <div style={styles.twoCol}>
                    <Field label="Vessel class">
                      <select style={isMobile ? styles.selectTouch : styles.select} value={vesselClass} onChange={(e) => setVesselClass(e.target.value as VesselClass)}>
                        {VESSEL_CLASS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </Field>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button type="button" style={styles.btn} onClick={() => {
                        const res = applyVesselProfileToTables(vesselClass);
                        setLastVesselClass(vesselClass);
                        if (res.applied) setMsg(`Applied ${res.profileLabel} defaults to legs/ports.`);
                      }}>Apply to tables</button>
                    </div>
                  </div>
                )}

                {vesselBasis === "named" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={styles.twoCol}>
                      <Field label="Saved vessel">
                        <select style={isMobile ? styles.selectTouch : styles.select} value={selectedNamedVesselId} onChange={(e) => setSelectedNamedVesselId(e.target.value)}>
                          <option value="">-- select --</option>
                          {namedVessels.map((v) => (
                            <option key={v.id} value={v.id}>{v.name} ({getProfile(v.vesselClass).label})</option>
                          ))}
                        </select>
                      </Field>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        <button type="button" style={styles.btn} onClick={() => applyNamedVessel(selectedNamedVesselId)}>Apply vessel</button>
                        <button type="button" style={styles.btnDanger} onClick={() => selectedNamedVesselId && deleteNamedVessel(selectedNamedVesselId)} disabled={!selectedNamedVesselId}>Delete</button>
                      </div>
                    </div>

                    <div style={styles.twoCol}>
                      <Field label="Name">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.name} onChange={(e) => setNamedVesselForm((p) => ({ ...p, name: e.target.value }))} />
                      </Field>
                      <Field label="Class">
                        <select style={isMobile ? styles.selectTouch : styles.select} value={namedVesselForm.vesselClass} onChange={(e) => setNamedVesselForm((p) => ({ ...p, vesselClass: e.target.value as VesselClass }))}>
                          {VESSEL_CLASS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <div style={styles.twoCol}>
                      <Field label="Fuel type consumed">
                        <select style={isMobile ? styles.selectTouch : styles.select} value={namedVesselForm.fuelType} onChange={(e) => setNamedVesselForm((p) => ({ ...p, fuelType: e.target.value as FuelChoice }))}>
                          <option value="HSFO">HSFO</option>
                          <option value="LSFO">LSFO</option>
                        </select>
                      </Field>
                      <Field label="Scrubber fitted">
                        <label style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
                          <input type="checkbox" checked={namedVesselForm.scrubberFitted} onChange={(e) => setNamedVesselForm((p) => ({ ...p, scrubberFitted: e.target.checked }))} />
                          <span style={styles.small}>Uses HSFO if scrubber is on</span>
                        </label>
                      </Field>
                    </div>

                    <div style={styles.twoCol}>
                      <Field label="Laden speed (kn)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ladenSpeedKn} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ladenSpeedKn: e.target.value }))} />
                      </Field>
                      <Field label="Ballast speed (kn)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ballastSpeedKn} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ballastSpeedKn: e.target.value }))} />
                      </Field>
                    </div>

                    <div style={styles.twoCol}>
                      <Field label="Laden cons (mt/day)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ladenConsMtPerDay} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ladenConsMtPerDay: e.target.value }))} />
                      </Field>
                      <Field label="Ballast cons (mt/day)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ballastConsMtPerDay} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ballastConsMtPerDay: e.target.value }))} />
                      </Field>
                    </div>

                    <div style={styles.twoCol}>
                      <Field label="Eco laden speed (kn)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ecoLadenSpeedKn} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ecoLadenSpeedKn: e.target.value }))} />
                      </Field>
                      <Field label="Eco ballast speed (kn)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ecoBallastSpeedKn} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ecoBallastSpeedKn: e.target.value }))} />
                      </Field>
                    </div>

                    <div style={styles.twoCol}>
                      <Field label="Eco laden cons (mt/day)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ecoLadenConsMtPerDay} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ecoLadenConsMtPerDay: e.target.value }))} />
                      </Field>
                      <Field label="Eco ballast cons (mt/day)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.ecoBallastConsMtPerDay} onChange={(e) => setNamedVesselForm((p) => ({ ...p, ecoBallastConsMtPerDay: e.target.value }))} />
                      </Field>
                    </div>

                    <div style={styles.twoCol}>
                      <Field label="Port idle cons (mt/day)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.portIdleConsMtPerDay} onChange={(e) => setNamedVesselForm((p) => ({ ...p, portIdleConsMtPerDay: e.target.value }))} />
                      </Field>
                      <Field label="Port working cons (mt/day)">
                        <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.portWorkingConsMtPerDay} onChange={(e) => setNamedVesselForm((p) => ({ ...p, portWorkingConsMtPerDay: e.target.value }))} />
                      </Field>
                    </div>

                    <Field label="Notes (optional)">
                      <input style={isMobile ? styles.inputTouch : styles.input} value={namedVesselForm.note} onChange={(e) => setNamedVesselForm((p) => ({ ...p, note: e.target.value }))} />
                    </Field>

                    <div style={styles.btnRow}>
                      <button type="button" style={styles.btnDark} onClick={saveNamedVessel}>Save vessel</button>
                      <button
                        type="button"
                        style={styles.btn}
                        onClick={() =>
                          setNamedVesselForm({
                            name: "",
                            vesselClass: "unknown",
                            fuelType: "LSFO",
                            scrubberFitted: false,
                            ladenSpeedKn: "",
                            ballastSpeedKn: "",
                            ladenConsMtPerDay: "",
                            ballastConsMtPerDay: "",
                            ecoLadenSpeedKn: "",
                            ecoBallastSpeedKn: "",
                            ecoLadenConsMtPerDay: "",
                            ecoBallastConsMtPerDay: "",
                            portIdleConsMtPerDay: "",
                            portWorkingConsMtPerDay: "",
                            note: "",
                          })
                        }
                      >
                        Clear form
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {namedVessels.length > 0 && (
                <div style={{ ...styles.hScroll, marginTop: 12 }}>
                  <table style={{ ...styles.table, minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Class</th>
                        <th style={styles.th}>Fuel</th>
                        <th style={styles.th}>Laden kn / mt</th>
                        <th style={styles.th}>Ballast kn / mt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {namedVessels.map((v) => (
                        <tr key={v.id}>
                          <td style={styles.td}>{v.name}</td>
                          <td style={styles.td}>{getProfile(v.vesselClass).label}</td>
                          <td style={styles.td}>{v.scrubberFitted ? "HSFO (scrubber)" : v.fuelType}</td>
                          <td style={styles.td}>{v.ladenSpeedKn} kn / {v.ladenConsMtPerDay} mt/day</td>
                          <td style={styles.td}>{v.ballastSpeedKn} kn / {v.ballastConsMtPerDay} mt/day</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {viewTab === "bunker" && (
            <>
              <h2 style={{ margin: 0 }}>Bunker prices</h2>
              <p style={styles.panelSubtitle}>Quick lookup (mocked). Connect Ship & Bunker API via server to fetch live prices.</p>

              <div style={styles.twoCol}>
                <Field label="Port">
                  <input
                    style={isMobile ? styles.inputTouch : styles.input}
                    value={bunkerPort}
                    onChange={(e) => setBunkerPort(e.target.value)}
                    placeholder="e.g. Singapore"
                  />
                </Field>
                <Field label="Grade">
                  <select
                    style={isMobile ? styles.selectTouch : styles.select}
                    value={bunkerGrade}
                    onChange={(e) => setBunkerGrade(e.target.value)}
                  >
                    <option value="VLSFO">VLSFO</option>
                    <option value="HSFO">HSFO</option>
                    <option value="MGO">MGO</option>
                  </select>
                </Field>
              </div>

              <div style={styles.btnRow}>
                <button type="button" style={styles.btnDark} onClick={fetchBunkerPrice} disabled={bunkerLoading}>
                  {bunkerLoading ? "Fetching..." : "Fetch price"}
                </button>
                <button type="button" style={styles.btn} onClick={() => { setBunkerResult(""); setBunkerError(""); }}>
                  Clear
                </button>
              </div>

              {bunkerResult && <div style={{ ...styles.info, marginTop: 10 }}>{bunkerResult}</div>}
              {bunkerError && <div style={{ ...styles.warn, marginTop: 10 }}>{bunkerError}</div>}

              <div style={{ ...styles.small, marginTop: 8 }}>
                Live Ship & Bunker calls need credentials + server proxy (CORS). Wire an API route to replace this mock.
              </div>
            </>
          )}
        </section>
        )}

        {/* RIGHT: Insights */}
        {!isMobile && (viewTab === "results" || viewTab === "analysis") && (
          <section style={{ ...styles.card, ...(isMobile ? {} : styles.intelColumn) }}>
            <h2 style={{ margin: 0 }}>Intelligence</h2>
            <p style={styles.panelSubtitle}>Live execution KPIs, freight solver, eco view, sims, emissions, and data hygiene checks.</p>

            {result?.error ? (
              <div style={styles.warn}><b>Fix needed:</b> {result.error}</div>
            ) : result?.status === "missing_distance" ? (
              <div style={styles.warn}><b>{result.message}</b></div>
            ) : (
              <>
                {viewTab === "results" && displayedResult?.status === "ok" && (
                  <div>
                    <div style={styles.sectionTitle}>Voyage P&L</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={styles.kpiCard}>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Net revenue</div>
                        <div style={styles.kpiValue}>{formatUsd(displayedResult.net_revenue, { maximumFractionDigits: 0 })}</div>
                        <div style={styles.kpiFooter}>After commission</div>
                      </div>
                      <div style={styles.kpiCard}>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Voyage costs</div>
                        <div style={styles.kpiValue}>{formatUsd(displayedResult.voyage_costs_total, { maximumFractionDigits: 0 })}</div>
                        <div style={styles.kpiFooter}>Bunkers + port + others</div>
                      </div>
                      <div style={styles.kpiCard}>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Voyage profit</div>
                        <div style={styles.kpiValue}>{formatUsd(displayedResult.voyage_profit, { maximumFractionDigits: 0 })}</div>
                        <div style={styles.kpiFooter}>Net revenue – costs</div>
                      </div>
                      <div style={styles.kpiCard}>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Owner TCE</div>
                        <div style={styles.kpiValue}>{formatUsd(displayedResult.tce_usd_per_day, { maximumFractionDigits: 0 })}</div>
                        <div style={styles.kpiFooter}>Voyage days: {formatNumber(displayedResult.voyage_days, { maximumFractionDigits: 1 })}</div>
                      </div>
                    </div>
                  </div>
                )}

                {viewTab === "results" && kpiCards.length > 0 && (
                  <div>
                    <div style={styles.sectionTitle}>Execution KPIs</div>
                    <div style={styles.kpiGrid}>
                      {kpiCards.map((kpi, idx) => (
                        <div key={idx} style={styles.kpiCard}>
                          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{kpi.label}</div>
                          <div style={styles.kpiValue}>{kpi.value}</div>
                          <div style={styles.kpiFooter}>{kpi.footer}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {viewTab === "results" && (
                  <>
                    <div style={styles.divider} />
                    <div style={styles.sectionTitle}>Target TCE</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={targetTceEnabled} onChange={(e) => setTargetTceEnabled(e.target.checked)} />
                          <span style={styles.small}>Enable target solver</span>
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <input
                            type="range"
                            min={5000}
                            max={100000}
                            step={500}
                            value={num(targetTce) || 0}
                            onChange={(e) => setTargetTce(String(e.target.value))}
                            disabled={!targetTceEnabled}
                            style={{ flex: 1 }}
                          />
                          <div style={{ minWidth: 90, textAlign: "right", fontWeight: 800 }}>
                            {targetTceEnabled ? `${num(targetTce) || 0} USD` : "--"}
                          </div>
                        </div>
                        <div style={styles.small}>Move to see required freight update above. Range 5k–100k USD/day.</div>
                      </div>
                    </div>

                    <div style={styles.sectionTitle}>Freight solver</div>
                    {solver ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <KV label="Required freight (USD/mt)" value={round(solver.required_per_mt, 2)} />
                        <KV label="Gross freight (USD)" value={formatUsd(solver.required_gross, { maximumFractionDigits: 0 })} />
                      </div>
                    ) : (
                      <div style={styles.small}>Set freight type to $/mt and provide cargo + target TCE to activate solver.</div>
                    )}

                    <div style={styles.divider} />
                    <div style={styles.sectionTitle}>Itinerary</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          type="date"
                          style={{ ...styles.input, maxWidth: 200 }}
                          value={itineraryStartDate}
                          onChange={(e) => setItineraryStartDate(e.target.value)}
                        />
                        <input
                          type="time"
                          style={{ ...styles.input, maxWidth: 140 }}
                          value={itineraryStartTime}
                          onChange={(e) => setItineraryStartTime(e.target.value)}
                        />
                        <button type="button" style={styles.btnDark} onClick={buildItinerary}>
                          Build itinerary
                        </button>
                        <button
                          type="button"
                          style={styles.btn}
                          onClick={() => {
                            if (!itineraryText) return;
                            navigator.clipboard?.writeText(itineraryText);
                            setMsg("Itinerary copied to clipboard.");
                          }}
                          disabled={!itineraryText}
                        >
                          Copy itinerary
                        </button>
                      </div>
                      {itineraryRows.length > 0 && (
                        <div style={styles.hScroll}>
                          <table style={{ ...styles.table, minWidth: 0 }}>
                            <thead>
                              <tr>
                                <th style={styles.th}>Port</th>
                                <th style={styles.th}>Type</th>
                                <th style={styles.th}>ETA</th>
                                <th style={styles.th}>ETD</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itineraryRows.map((row, idx) => (
                                <tr key={idx}>
                                  <td style={styles.td}>{row.port}</td>
                                  <td style={styles.td}>{row.type}</td>
                                  <td style={styles.td}>{row.eta}</td>
                                  <td style={styles.td}>{row.etd}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {itineraryText ? (
                        <textarea
                          style={{ ...styles.textarea, minHeight: 160 }}
                          value={itineraryText}
                          onChange={(e) => setItineraryText(e.target.value)}
                        />
                      ) : (
                        <div style={styles.small}>Set a start date and build to get a copy-ready itinerary.</div>
                      )}
                    </div>
                  </>
                )}

                {/* TCE scenarios removed from Results per request */}

                {viewTab === "analysis" && (
                  <>
                    <div style={styles.divider} />
                    <div style={styles.sectionTitle}>Base vs eco</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label style={styles.kvLabel}>
                          <input type="checkbox" checked={ecoMode} onChange={(e) => setEcoMode(e.target.checked)} style={{ marginRight: 6 }} />
                          Compare eco profile (slower / leaner)
                        </label>
                        <div style={styles.twoCol}>
                          <div>
                            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Speed delta (kn)</div>
                            <input
                              style={isMobile ? styles.inputTouch : styles.input}
                              value={ecoSpeedDeltaKn}
                              onChange={(e) => setEcoSpeedDeltaKn(e.target.value)}
                              placeholder="e.g. -1.0"
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Consumption delta (%)</div>
                            <input
                              style={isMobile ? styles.inputTouch : styles.input}
                              value={ecoConsDeltaPct}
                              onChange={(e) => setEcoConsDeltaPct(e.target.value)}
                              placeholder="e.g. -12"
                            />
                          </div>
                        </div>
                        <div style={styles.small}>Applies deltas to every leg without mutating your inputs. Use this to spot the more efficient speed/consumption pairing for TCE.</div>
                        {ecoMode && legEcoStats && (
                          <div style={styles.small}>
                            Eco applied: speed avg {legEcoStats.baseSpeedAvg != null ? round(legEcoStats.baseSpeedAvg, 2) : "--"} → {legEcoStats.ecoSpeedAvg != null ? round(legEcoStats.ecoSpeedAvg, 2) : "--"} kn; cons avg {legEcoStats.baseConsAvg != null ? round(legEcoStats.baseConsAvg, 2) : "--"} → {legEcoStats.ecoConsAvg != null ? round(legEcoStats.ecoConsAvg, 2) : "--"} mt/day.
                          </div>
                        )}
                        {ecoMode && ecoConsumptionMuted && (
                          <div style={styles.small}>Consumption delta won’t move TCE until you add a bunker price or purchase plan.</div>
                        )}
                      </div>
                      <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
                        <KV label="Base TCE" value={baseTce != null ? formatUsd(baseTce, { maximumFractionDigits: 0 }) : "--"} />
                        <KV label="Eco TCE" value={ecoResult?.tce_usd_per_day != null ? formatUsd(ecoResult.tce_usd_per_day, { maximumFractionDigits: 0 }) : "--"} />
                        <KV
                          label="Δ vs base"
                          value={ecoResult && baseTce != null ? `${ecoResult.tce_usd_per_day - baseTce >= 0 ? "+" : ""}${round(ecoResult.tce_usd_per_day - baseTce, 0)} /day` : "--"}
                        />
                        {ecoResult && (
                          <div style={styles.small}>
                            Days {round(ecoResult.voyage_days, 1)} vs {round(result?.voyage_days, 1)} • Bunkers {round(ecoResult.bunkers_total, 1)} mt
                          </div>
                        )}
                      </div>
                    </div>

                    {emissionStats && (
                      <>
                        <div style={styles.divider} />
                        <div style={styles.sectionTitle}>Emission lens</div>
                        <div style={styles.kpiGrid}>
                          <div style={styles.kpiCard}>
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Total CO₂</div>
                            <div style={styles.kpiValue}>{formatNumber(emissionStats.co2TotalMt, { maximumFractionDigits: 1 })} mt</div>
                          </div>
                          <div style={styles.kpiCard}>
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Per day</div>
                            <div style={styles.kpiValue}>{emissionStats.co2PerDayMt != null ? `${formatNumber(emissionStats.co2PerDayMt, { maximumFractionDigits: 2 })} mt` : "--"}</div>
                          </div>
                          <div style={styles.kpiCard}>
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Intensity</div>
                            <div style={styles.kpiValue}>{emissionStats.intensityKgPerCargoMt != null ? `${formatNumber(emissionStats.intensityKgPerCargoMt, { maximumFractionDigits: 1 })} kg/mt` : "--"}</div>
                          </div>
                        </div>
                      </>
                    )}

                    {dataAlerts.length > 0 && (
                      <div style={styles.riskBlock}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Data hygiene warnings</div>
                        {dataAlerts.map((alert, idx) => (
                          <div key={idx} style={styles.riskItem}>• {alert}</div>
                        ))}
                      </div>
                    )}
                  </>
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
  setPortCalls((prev) =>
    prev.map((p, i) => {
      if (i !== idx) return p;
      const next = { ...p, [key]: value };
      if (key === "type" && (value === "load" || value === "discharge")) {
        const currentWait = num(next.waiting_days);
        if (currentWait == null || currentWait === 0) next.waiting_days = "0.5";
      }
      return next;
    })
  );
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

function formatUsd(value: number | null | undefined, opts?: Intl.NumberFormatOptions) {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0, ...opts }).format(value);
}

function formatNumber(value: number | null | undefined, opts?: Intl.NumberFormatOptions) {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2, ...opts }).format(value);
}

function getSavedPortCostBook(): PortCostTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_PORT_COSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSavedPortCostBook(list: PortCostTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_PORT_COSTS_KEY, JSON.stringify(list || []));
}

function normalizePortName(name: string): string {
  return String(name || "").trim().toLowerCase();
}

function makeRouteKey(from: string, to: string): string {
  return `${normalizePortName(from)}__${normalizePortName(to)}`;
}

function listUserRoutes(): RouteEntry[] {
  const map = getUserRouteMap() || {};
  const seen = new Set<string>();
  const rows: RouteEntry[] = [];

  Object.entries(map).forEach(([key, dist]) => {
    const [aRaw, bRaw] = key.split("__");
    if (!aRaw || !bRaw) return;
    const a = normalizePortName(aRaw);
    const b = normalizePortName(bRaw);
    if (!a || !b) return;

    const orderedKey = a <= b ? makeRouteKey(a, b) : makeRouteKey(b, a);
    if (seen.has(orderedKey)) return;

    const distance = Number(dist);
    if (!Number.isFinite(distance)) return;

    const [from, to] = orderedKey === makeRouteKey(a, b) ? [a, b] : [b, a];
    rows.push({ from, to, distance });
    seen.add(orderedKey);
  });

  return rows.sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}

function dropUserRoute(from: string, to: string) {
  const a = normalizePortName(from);
  const b = normalizePortName(to);
  if (!a || !b) return;
  const map = getUserRouteMap() || {};
  delete map[makeRouteKey(a, b)];
  delete map[makeRouteKey(b, a)];
  setUserRouteMap(map);
}

function lookupPortCostTemplate(
  templates: PortCostTemplate[],
  portName: string,
  vesselClass: VesselCostClass
): PortCostTemplate | null {
  const normalized = normalizePortName(portName);
  if (!normalized) return null;
  const exact = templates.find(
    (t) => normalizePortName(t.port) === normalized && t.vesselClass === vesselClass
  );
  if (exact) return exact;
  const anyMatch = templates.find(
    (t) => normalizePortName(t.port) === normalized && t.vesselClass === "any"
  );
  if (anyMatch) return anyMatch;
  const unknownMatch = templates.find(
    (t) => normalizePortName(t.port) === normalized && t.vesselClass === "unknown"
  );
  return unknownMatch || null;
}

function makePortCostId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getVesselClassLabel(value: VesselCostClass): string {
  const match = VESSEL_CLASS_OPTIONS.find((opt) => opt.value === value);
  return match ? match.label : value;
}

function inferLaytimeAllowances(text: string, ports: PortCallUI[]): { portCalls: PortCallUI[]; updated: boolean; note: string } {
  const raw = String(text || "");
  const shexBump = 0.75; // more than half a day to account for weekend risk
  const sshexBump = 1.25; // slightly higher for stricter SSHEX terms

  // Only apply when the laytime term follows the specific port keyword to avoid cross-applying to both load/disch.
  const window = "[^\\n.;,]{0,80}";
  const hasTermNearby = (keywords: string[], layterm: "shex" | "sshex") =>
    keywords.some((kw) => {
      const kwEscaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // allow keyword before or after the laytime term within a short window
      const pattern = new RegExp(
        `(?:\\b${kwEscaped}\\b${window}\\b${layterm}\\b|\\b${layterm}\\b${window}\\b${kwEscaped}\\b)`,
        "i"
      );
      return pattern.test(raw);
    });

  const loadSSHEX = hasTermNearby(["load", "ldg"], "sshex");
  const loadSHEX = !loadSSHEX && hasTermNearby(["load", "ldg"], "shex");
  const dischSSHEX = hasTermNearby(["disch", "discharge", "dsch"], "sshex");
  const dischSHEX = !dischSSHEX && hasTermNearby(["disch", "discharge", "dsch"], "shex");

  // fallback: if only one load (or discharge) port exists and no directional keyword was found, allow a global SHEX/SSHEX to apply to that side only
  const hasSHEX = /\bshex\b/i.test(raw);
  const hasSSHEX = /\bsshex\b/i.test(raw);
  const loadPortsCount = ports.filter((p) => p.type === "load").length;
  const dischPortsCount = ports.filter((p) => p.type === "discharge").length;

  let loadTerm: "shex" | "sshex" | "" = loadSSHEX ? "sshex" : loadSHEX ? "shex" : "";
  let dischTerm: "shex" | "sshex" | "" = dischSSHEX ? "sshex" : dischSHEX ? "shex" : "";

  if (!loadTerm && loadPortsCount === 1) {
    loadTerm = hasSSHEX ? "sshex" : hasSHEX ? "shex" : "";
  }
  // only apply fallback to discharge if load side is not singular (to avoid double-applying ambiguous SHEX/SSHEX)
  if (!dischTerm && dischPortsCount === 1 && loadPortsCount !== 1) {
    dischTerm = hasSSHEX ? "sshex" : hasSHEX ? "shex" : "";
  }

  const loadBump = loadTerm === "sshex" ? sshexBump : loadTerm === "shex" ? shexBump : 0;
  const dischBump = dischTerm === "sshex" ? sshexBump : dischTerm === "shex" ? shexBump : 0;

  let updated = false;
  const next = ports.map((p) => {
    // clear any previous laytime term unless re-applied
    let laytimeTerm = "";
    if (p.type === "load") {
      const add = loadBump;
      laytimeTerm = loadTerm === "sshex" ? `SSHEX (+${sshexBump})` : loadTerm === "shex" ? `SHEX (+${shexBump})` : "";
      if (add > 0) {
        updated = true;
        const wait = num(p.waiting_days) || 0;
        return { ...p, waiting_days: String(round(wait + add, 2)), laytime_term: laytimeTerm };
      }
    }
    if (p.type === "discharge") {
      const add = dischBump;
      laytimeTerm = dischTerm === "sshex" ? `SSHEX (+${sshexBump})` : dischTerm === "shex" ? `SHEX (+${shexBump})` : "";
      if (add > 0) {
        updated = true;
        const wait = num(p.waiting_days) || 0;
        return { ...p, waiting_days: String(round(wait + add, 2)), laytime_term: laytimeTerm };
      }
    }
    return { ...p, laytime_term: laytimeTerm };
  });

  let note = "";
  if (loadBump > 0 || dischBump > 0) {
    const parts: string[] = [];
    if (loadBump > 0) parts.push(`Load: ${loadTerm?.toUpperCase()} (+${loadBump} day)`);
    if (dischBump > 0) parts.push(`Disch: ${dischTerm?.toUpperCase()} (+${dischBump} day)`);
    note = `Laytime term applied: ${parts.join("; ")}`;
  }

  return { portCalls: next, updated, note };
}

function parseDateInput(value: string): Date | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const dt = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function addDays(date: Date, days: number): Date {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(date.getTime() + ms);
}

function formatDateTime(dt: Date): string {
  return dt.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

