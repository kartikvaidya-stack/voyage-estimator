import { calcItinerary, round } from "./itineraryCalc";
import type { FuelType } from "./ecaRegulations";

export type ScenarioResult = {
  id: string;
  label: string;
  description: string;
  accent: string;
  tceUsdPerDay: number;
  deltaTce: number;
  voyageDays: number;
  incrementalProfitUsd: number;
};

export type EmissionStats = {
  co2TotalMt: number;
  co2PerDayMt: number | null;
  intensityKgPerCargoMt: number | null;
};

type VoyageInput = any;
type CalcResult = ReturnType<typeof calcItinerary> | null | undefined;

type ScenarioBlueprint = {
  id: string;
  label: string;
  accent: string;
  description: string;
  mutate?: (voyage: VoyageInput) => void;
};

const EMISSION_FACTORS: Record<FuelType, number> = {
  HFO: 3.114,
  LSFO: 3.114,
  MGO: 3.206,
  LNG: 2.75,
};

const SCENARIO_BLUEPRINTS: ScenarioBlueprint[] = [
  {
    id: "base",
    label: "Base plan",
    accent: "#38bdf8",
    description: "Current assumptions",
  },
  {
    id: "eco",
    label: "Eco speed",
    accent: "#10b981",
    description: "-0.7 kn & -1.5 mt/day across legs",
    mutate: (voyage) => {
      adjustLegs(voyage, (leg) => {
        leg.speed_kn = Math.max(9, (leg.speed_kn || 0) - 0.7);
        leg.cons_mt_per_day = Math.max(14, (leg.cons_mt_per_day || 0) - 1.5);
      });
    },
  },
  {
    id: "express",
    label: "Express",
    accent: "#f97316",
    description: "+0.8 kn, +2.2 mt/day (faster turn)",
    mutate: (voyage) => {
      adjustLegs(voyage, (leg) => {
        leg.speed_kn = Math.max(8, (leg.speed_kn || 0) + 0.8);
        leg.cons_mt_per_day = Math.max(15, (leg.cons_mt_per_day || 0) + 2.2);
      });
      if (Array.isArray(voyage.portCalls)) {
        voyage.portCalls = voyage.portCalls.map((p: any) => ({
          ...p,
          waiting_days: Math.max(0, (p.waiting_days || 0) - 0.3),
        }));
      }
    },
  },
  {
    id: "fuelshock",
    label: "Fuel +$75",
    accent: "#f43f5e",
    description: "Stress bunker price by +75 USD/mt",
    mutate: (voyage) => {
      voyage.costs = voyage.costs || {};
      voyage.costs.bunker_price_usd_per_mt = Math.max(0, (voyage.costs.bunker_price_usd_per_mt || 0) + 75);
    },
  },
  {
    id: "freightpush",
    label: "Freight +1",
    accent: "#c084fc",
    description: "Improve rate by $1/mt (or +50k ls)",
    mutate: (voyage) => {
      voyage.revenue = voyage.revenue || {};
      if (voyage.revenue.freight_type === "per_mt") {
        voyage.revenue.freight_usd_per_mt = Math.max(0, (voyage.revenue.freight_usd_per_mt || 0) + 1);
      } else {
        voyage.revenue.freight_lumpsum_usd = Math.max(0, (voyage.revenue.freight_lumpsum_usd || 0) + 50000);
      }
    },
  },
];

export function buildScenarioDeck(voyage: VoyageInput, baseResult: CalcResult): ScenarioResult[] {
  if (!voyage || !baseResult || baseResult.status !== "ok") return [];

  const baselineTce = baseResult.tce_usd_per_day || 0;
  const baselineProfit = baseResult.voyage_profit || 0;

  return SCENARIO_BLUEPRINTS.map((blueprint) => {
    if (blueprint.id === "base") {
      return {
        id: blueprint.id,
        label: blueprint.label,
        description: blueprint.description,
        accent: blueprint.accent,
        tceUsdPerDay: round(baseResult.tce_usd_per_day, 0) || 0,
        deltaTce: 0,
        voyageDays: round(baseResult.voyage_days, 2) || 0,
        incrementalProfitUsd: 0,
      };
    }

    const candidate = deepClone(voyage);
    try {
      blueprint.mutate?.(candidate);
    } catch (error) {
      return null;
    }
    const res = calcItinerary(candidate);
    if (!res || res.status !== "ok") return null;

    return {
      id: blueprint.id,
      label: blueprint.label,
      description: blueprint.description,
      accent: blueprint.accent,
      tceUsdPerDay: round(res.tce_usd_per_day, 0) || 0,
      deltaTce: round(res.tce_usd_per_day - baselineTce, 0) || 0,
      voyageDays: round(res.voyage_days, 2) || 0,
      incrementalProfitUsd: round(res.voyage_profit - baselineProfit, 0) || 0,
    };
  }).filter((item): item is ScenarioResult => Boolean(item));
}

export function calculateEmissionStats(result: CalcResult, cargoQty: number | null | undefined, fuelType: FuelType): EmissionStats | null {
  if (!result || result.status !== "ok") return null;
  const factor = EMISSION_FACTORS[fuelType] ?? EMISSION_FACTORS.HFO;
  const bunkers = Number(result.bunkers_total || 0);
  const co2TotalMt = bunkers * factor;
  const voyageDays = Number(result.voyage_days || 0);

  return {
    co2TotalMt,
    co2PerDayMt: voyageDays > 0 ? co2TotalMt / voyageDays : null,
    intensityKgPerCargoMt: cargoQty && cargoQty > 0 ? (co2TotalMt * 1000) / cargoQty : null,
  };
}

export function collectDataQualityFlags(portCalls: any[], legs: any[], result: CalcResult): string[] {
  const flags: string[] = [];

  const missingDistances = (legs || []).filter((l) => !(Number(l?.distance_nm || 0) > 0));
  if (missingDistances.length > 0) {
    flags.push(`Missing distance on ${missingDistances.length} leg(s). Fill via map or saved routes.`);
  }

  const zeroPortCosts = (portCalls || []).filter((p) => !(Number(p?.port_cost_usd || 0) > 0));
  if (zeroPortCosts.length > Math.max(1, (portCalls || []).length - 2)) {
    flags.push("Port costs are blank for most calls. Consider estimating agency/stevedore exposure.");
  }

  const bunkerWarnings = (portCalls || []).filter((p) => Number(p?.bunker_purchase_qty_mt || 0) > 0 && !(Number(p?.bunker_purchase_price_usd_per_mt || 0) > 0));
  if (bunkerWarnings.length) {
    flags.push("Bunker purchases missing price inputs. Owner TCE will undervalue fuel exposure.");
  }

  if (result?.status === "missing_distance" && result?.message) {
    flags.push(result.message);
  }

  if (result?.bunker_warning) {
    flags.push(result.bunker_warning);
  }

  return flags.slice(0, 4);
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function adjustLegs(voyage: VoyageInput, adjuster: (leg: any) => void) {
  if (!voyage || !Array.isArray(voyage.legs)) return;
  voyage.legs = voyage.legs.map((leg: any) => {
    const next = { ...leg };
    adjuster(next);
    next.speed_kn = Number(next.speed_kn || 0);
    next.cons_mt_per_day = Number(next.cons_mt_per_day || 0);
    return next;
  });
}
