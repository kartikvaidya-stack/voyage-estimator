/**
 * ECA (Emission Control Area) Regulations and Fuel Types
 * Defines maritime environmental zones requiring compliant fuel
 */

export type FuelType = "HFO" | "MGO" | "LSFO" | "LNG";

export interface FuelSpecs {
  name: string;
  sulfurContent: number; // % by mass
  priceMultiplier: number; // relative to HFO baseline
  applicable: string[];
}

export interface ECAZone {
  id: string;
  name: string;
  type: "sea" | "inland_waterway";
  // Approximate bounding box [minLat, minLon, maxLat, maxLon]
  bounds: [number, number, number, number];
  requiredFuel: FuelType[];
  sulfurLimitPct: number;
}

/**
 * Global fuel specifications
 */
export const FUEL_SPECS: Record<FuelType, FuelSpecs> = {
  HFO: {
    name: "Heavy Fuel Oil",
    sulfurContent: 3.5,
    priceMultiplier: 1.0,
    applicable: ["Open Ocean"],
  },
  LSFO: {
    name: "Low Sulfur Fuel Oil",
    sulfurContent: 0.5,
    priceMultiplier: 1.15, // ~15% premium
    applicable: ["ECA Zones"],
  },
  MGO: {
    name: "Marine Gas Oil",
    sulfurContent: 0.1,
    priceMultiplier: 1.4, // ~40% premium
    applicable: ["ECA Zones", "Strict Areas"],
  },
  LNG: {
    name: "Liquefied Natural Gas",
    sulfurContent: 0.0,
    priceMultiplier: 1.3, // ~30% premium (varies greatly)
    applicable: ["Future Compliance"],
  },
};

/**
 * Major ECA Zones as of 2026
 * - North American ECA (NECA): US Atlantic coast + Great Lakes
 * - US Caribbean ECA: Around Puerto Rico
 * - Baltic ECA: Baltic Sea
 * - North Sea ECA: North Sea
 * - English Channel ECA: English Channel + Southern North Sea
 */
export const ECA_ZONES: ECAZone[] = [
  {
    id: "neca",
    name: "North American ECA (NECA)",
    type: "sea",
    bounds: [25, -91, 50, -66], // US Atlantic coast
    requiredFuel: ["LSFO", "MGO", "LNG"],
    sulfurLimitPct: 0.1,
  },
  {
    id: "caribbean_eca",
    name: "US Caribbean ECA",
    type: "sea",
    bounds: [17, -68, 19, -64], // Puerto Rico area
    requiredFuel: ["LSFO", "MGO", "LNG"],
    sulfurLimitPct: 0.1,
  },
  {
    id: "baltic",
    name: "Baltic Sea ECA",
    type: "sea",
    bounds: [54, 10, 66, 30], // Baltic region
    requiredFuel: ["LSFO", "MGO", "LNG"],
    sulfurLimitPct: 0.1,
  },
  {
    id: "north_sea",
    name: "North Sea ECA",
    type: "sea",
    bounds: [50, -3, 62, 12], // North Sea
    requiredFuel: ["LSFO", "MGO", "LNG"],
    sulfurLimitPct: 0.1,
  },
  {
    id: "english_channel",
    name: "English Channel & Dover Strait",
    type: "sea",
    bounds: [48.5, -5, 51.5, 2],
    requiredFuel: ["LSFO", "MGO", "LNG"],
    sulfurLimitPct: 0.1,
  },
  {
    id: "mediterranean_proposed",
    name: "Mediterranean (Proposed ECA 2026)",
    type: "sea",
    bounds: [30, -6, 46, 42],
    requiredFuel: ["LSFO", "MGO", "LNG"],
    sulfurLimitPct: 0.1,
  },
];

/**
 * Check if a point [lat, lon] is within an ECA zone
 */
export function isPointInECA(lat: number, lon: number): ECAZone[] {
  return ECA_ZONES.filter((zone) => {
    const [minLat, minLon, maxLat, maxLon] = zone.bounds;
    return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  });
}

/**
 * Check if a route (sequence of points) passes through ECA zones
 */
export function checkRouteECAs(
  waypoints: Array<{ lat: number; lon: number }>
): {
  zonesEncountered: ECAZone[];
  ecaPercentage: number;
  recommendedFuel: FuelType;
} {
  const zonesSet = new Set<string>();
  let ecaSegments = 0;

  // Check each segment
  for (let i = 0; i < waypoints.length - 1; i++) {
    const current = waypoints[i];
    const next = waypoints[i + 1];

    // Sample the segment (simple approach: check start and end)
    const currentECAs = isPointInECA(current.lat, current.lon);
    const nextECAs = isPointInECA(next.lat, next.lon);

    [...currentECAs, ...nextECAs].forEach((z) => zonesSet.add(z.id));

    if (currentECAs.length > 0 || nextECAs.length > 0) {
      ecaSegments++;
    }
  }

  const zonesEncountered = ECA_ZONES.filter((z) => zonesSet.has(z.id));
  const ecaPercentage = waypoints.length > 1 ? (ecaSegments / (waypoints.length - 1)) * 100 : 0;

  // Determine most restrictive fuel requirement
  let recommendedFuel: FuelType = "HFO";
  if (ecaPercentage >= 5) {
    recommendedFuel = "LSFO";
  }
  if (ecaPercentage >= 50) {
    recommendedFuel = "MGO";
  }

  return {
    zonesEncountered,
    ecaPercentage: Math.round(ecaPercentage),
    recommendedFuel,
  };
}

/**
 * Calculate fuel cost adjustment based on ECA exposure
 * Returns additional cost per MT as fraction of baseline HFO price
 */
export function calculateECAFuelSurcharge(
  baselineBunkerPrice: number,
  ecaPercentage: number,
  recommendedFuel: FuelType
): {
  surchargePerMt: number;
  effectivePrice: number;
  fuelType: FuelType;
} {
  const fuelMultiplier = FUEL_SPECS[recommendedFuel]?.priceMultiplier || 1.0;

  // Blended cost: portion in ECA uses premium fuel, rest uses standard
  const ecaFraction = ecaPercentage / 100;
  const blendedMultiplier = 1 + (fuelMultiplier - 1) * ecaFraction;

  const surchargePerMt = baselineBunkerPrice * (blendedMultiplier - 1);
  const effectivePrice = baselineBunkerPrice * blendedMultiplier;

  return {
    surchargePerMt,
    effectivePrice,
    fuelType: recommendedFuel,
  };
}

/**
 * Major port coordinates (lat, lon) for quick reference
 */
export const PORT_COORDINATES: Record<string, { lat: number; lon: number }> = {
  Singapore: { lat: 1.2553, lon: 103.8677 },
  Rotterdam: { lat: 51.9289, lon: 4.1083 },
  Shanghai: { lat: 31.4043, lon: 121.5439 },
  Dubai: { lat: 25.2708, lon: 55.2703 },
  HongKong: { lat: 22.3193, lon: 114.1694 },
  LosAngeles: { lat: 33.7491, lon: -118.1937 },
  NewYork: { lat: 40.6892, lon: -74.0445 },
  Antwerp: { lat: 51.2393, lon: 4.4029 },
  Hamburg: { lat: 53.5511, lon: 9.9937 },
  Palembang: { lat: -2.9181, lon: 104.7461 },
  Vizag: { lat: 17.6869, lon: 83.2185 },
  Kandla: { lat: 23.0225, lon: 70.2069 },
  Santos: { lat: -23.9616, lon: -46.3034 },
  Melbourne: { lat: -37.8136, lon: 144.963 },
  Busan: { lat: 35.0796, lon: 129.0231 },
  Tokyo: { lat: 35.3873, lon: 139.7658 },
  Mumbai: { lat: 19.0176, lon: 72.8479 },
  Jeddah: { lat: 21.6296, lon: 39.1567 },
  "Port Said": { lat: 31.2604, lon: 32.2943 },
  Suez: { lat: 29.9668, lon: 32.5498 },
};
