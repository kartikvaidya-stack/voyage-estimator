export type VesselClass =
  | "unknown"
  | "handysize"
  | "handymax"
  | "supramax"
  | "ultramax"
  | "panamax"
  | "kamsarmax"
  | "capesize"
  | "mr"
  | "lr1"
  | "lr2"
  | "aframax"
  | "suezmax"
  | "vlcc";

export type VesselProfile = {
  vesselClass: VesselClass;
  label: string;
  ladenSpeedKn: number;
  ladenConsMtPerDay: number;
  portConsMtPerDay: number;
};

const PROFILES: Record<VesselClass, VesselProfile> = {
  unknown: { vesselClass: "unknown", label: "Unknown (no defaults)", ladenSpeedKn: 0, ladenConsMtPerDay: 0, portConsMtPerDay: 0 },

  // Dry bulk (typical ballpark “standard ship” assumptions for early estimate)
  handysize: { vesselClass: "handysize", label: "Handysize", ladenSpeedKn: 12.0, ladenConsMtPerDay: 20, portConsMtPerDay: 3.5 },
  handymax: { vesselClass: "handymax", label: "Handymax", ladenSpeedKn: 12.5, ladenConsMtPerDay: 23, portConsMtPerDay: 3.8 },
  supramax: { vesselClass: "supramax", label: "Supramax", ladenSpeedKn: 12.5, ladenConsMtPerDay: 26, portConsMtPerDay: 4.0 },
  ultramax: { vesselClass: "ultramax", label: "Ultramax", ladenSpeedKn: 13.0, ladenConsMtPerDay: 28, portCons_mt_per_day: undefined } as any, // patched below
  panamax: { vesselClass: "panamax", label: "Panamax", ladenSpeedKn: 13.0, ladenConsMtPerDay: 32, portConsMtPerDay: 4.8 },
  kamsarmax: { vesselClass: "kamsarmax", label: "Kamsarmax", ladenSpeedKn: 13.0, ladenConsMtPerDay: 33, portConsMtPerDay: 5.0 },
  capesize: { vesselClass: "capesize", label: "Capesize", ladenSpeedKn: 13.5, ladenConsMtPerDay: 50, portConsMtPerDay: 7.0 },

  // Tankers (very rough, intended for quick TCE sanity checks)
  mr: { vesselClass: "mr", label: "MR (Products)", ladenSpeedKn: 13.5, ladenConsMtPerDay: 28, portConsMtPerDay: 6.0 },
  lr1: { vesselClass: "lr1", label: "LR1 (Products)", ladenSpeedKn: 14.0, ladenConsMtPerDay: 36, portConsMtPerDay: 7.5 },
  lr2: { vesselClass: "lr2", label: "LR2 (Products)", ladenSpeedKn: 14.0, ladenConsMtPerDay: 40, portConsMtPerDay: 8.0 },
  aframax: { vesselClass: "aframax", label: "Aframax", ladenSpeedKn: 13.0, ladenConsMtPerDay: 45, portConsMtPerDay: 10.0 },
  suezmax: { vesselClass: "suezmax", label: "Suezmax", ladenSpeedKn: 13.5, ladenConsMtPerDay: 55, portConsMtPerDay: 12.0 },
  vlcc: { vesselClass: "vlcc", label: "VLCC", ladenSpeedKn: 13.0, ladenConsMtPerDay: 75, portConsMtPerDay: 15.0 },
};

// Patch typo safely (keeps TS happy in strict mode without rewriting above block)
(PROFILES.ultramax as any).portConsMtPerDay = 4.2;

export function getProfile(vesselClass: VesselClass): VesselProfile {
  return PROFILES[vesselClass] || PROFILES.unknown;
}

/**
 * Detect vessel class from free text.
 * We intentionally use broad, shipping-native aliases.
 */
export function detectVesselClass(text: string): VesselClass {
  const t = String(text || "").toLowerCase();

  // Tankers first (MR/LR etc can appear in other contexts)
  if (matchesAny(t, ["vlcc"])) return "vlcc";
  if (matchesAny(t, ["suezmax", "suez max", "suez"])) return "suezmax";
  if (matchesAny(t, ["aframax", "afra max", "afra"])) return "aframax";
  if (matchesAny(t, ["lr2", "lr-2", "long range 2", "lr 2"])) return "lr2";
  if (matchesAny(t, ["lr1", "lr-1", "long range 1", "lr 1"])) return "lr1";
  // MR: guard against false matches (e.g., "mr smith")
  if (matchesRegex(t, /\bmr\b/) || matchesAny(t, ["m/r", "m r", "medium range"])) return "mr";

  // Dry bulk
  if (matchesAny(t, ["capesize", "cape size", "cape"])) return "capesize";
  if (matchesAny(t, ["kamsarmax", "kamsar max", "kmax", "k-max"])) return "kamsarmax";
  if (matchesAny(t, ["panamax", "pmax", "pmx", "p/mx"])) return "panamax";
  if (matchesAny(t, ["ultramax", "ultra max", "umax", "u/max", "u-max"])) return "ultramax";
  if (matchesAny(t, ["supramax", "supra max", "supra", "smax", "s/max"])) return "supramax";
  if (matchesAny(t, ["handymax", "handy max", "hmax", "h/max"])) return "handymax";
  if (matchesAny(t, ["handysize", "handy size", "hsize", "h/size"])) return "handysize";

  return "unknown";
}

function matchesAny(text: string, needles: string[]): boolean {
  for (const n of needles) {
    if (text.includes(n)) return true;
  }
  return false;
}
function matchesRegex(text: string, re: RegExp): boolean {
  return re.test(text);
}
