// src/lib/vesselProfiles.ts
export type VesselClass =
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
  | "vlcc"
  | "aframax"
  | "suezmax"
  | "unknown";

export type VesselProfile = {
  vesselClass: VesselClass;
  label: string;

  // Typical commercial defaults (editable in UI)
  ladenSpeedKn: number;
  ballastSpeedKn: number;

  ladenConsMtPerDay: number;
  ballastConsMtPerDay: number;

  // Typical port consumption (editable in UI)
  portConsMtPerDay: number;
};

// IMPORTANT: These are "starter defaults" to make the tool feel shipping-native.
// Users can override anytime. We will show in UI later as "assumed from profile".
export const VESSEL_PROFILES: Record<VesselClass, VesselProfile> = {
  handysize: {
    vesselClass: "handysize",
    label: "Handysize (std)",
    ladenSpeedKn: 12.0,
    ballastSpeedKn: 12.5,
    ladenConsMtPerDay: 22,
    ballastConsMtPerDay: 20,
    portConsMtPerDay: 3.5,
  },
  handymax: {
    vesselClass: "handymax",
    label: "Handymax (std)",
    ladenSpeedKn: 12.0,
    ballastSpeedKn: 12.5,
    ladenConsMtPerDay: 24,
    ballastConsMtPerDay: 22,
    portConsMtPerDay: 3.8,
  },
  supramax: {
    vesselClass: "supramax",
    label: "Supramax (std)",
    ladenSpeedKn: 12.5,
    ballastSpeedKn: 13.0,
    ladenConsMtPerDay: 26,
    ballastConsMtPerDay: 24,
    portConsMtPerDay: 4.0,
  },
  ultramax: {
    vesselClass: "ultramax",
    label: "Ultramax (std)",
    ladenSpeedKn: 12.5,
    ballastSpeedKn: 13.0,
    ladenConsMtPerDay: 28,
    ballastConsMtPerDay: 26,
    portConsMtPerDay: 4.0,
  },
  panamax: {
    vesselClass: "panamax",
    label: "Panamax (std)",
    ladenSpeedKn: 12.5,
    ballastSpeedKn: 13.0,
    ladenConsMtPerDay: 32,
    ballastConsMtPerDay: 30,
    portConsMtPerDay: 5.0,
  },
  kamsarmax: {
    vesselClass: "kamsarmax",
    label: "Kamsarmax (std)",
    ladenSpeedKn: 12.5,
    ballastSpeedKn: 13.0,
    ladenConsMtPerDay: 33,
    ballastConsMtPerDay: 31,
    portConsMtPerDay: 5.0,
  },
  capesize: {
    vesselClass: "capesize",
    label: "Capesize (std)",
    ladenSpeedKn: 12.0,
    ballastSpeedKn: 12.5,
    ladenConsMtPerDay: 45,
    ballastConsMtPerDay: 42,
    portConsMtPerDay: 6.5,
  },

  // Tankers (starter defaults)
  mr: {
    vesselClass: "mr",
    label: "MR (std)",
    ladenSpeedKn: 13.0,
    ballastSpeedKn: 13.5,
    ladenConsMtPerDay: 24,
    ballastConsMtPerDay: 22,
    portConsMtPerDay: 5.5,
  },
  lr1: {
    vesselClass: "lr1",
    label: "LR1 (std)",
    ladenSpeedKn: 13.0,
    ballastSpeedKn: 13.5,
    ladenConsMtPerDay: 30,
    ballastConsMtPerDay: 28,
    portConsMtPerDay: 6.0,
  },
  lr2: {
    vesselClass: "lr2",
    label: "LR2 (std)",
    ladenSpeedKn: 13.0,
    ballastSpeedKn: 13.5,
    ladenConsMtPerDay: 38,
    ballastConsMtPerDay: 35,
    portConsMtPerDay: 6.5,
  },
  aframax: {
    vesselClass: "aframax",
    label: "Aframax (std)",
    ladenSpeedKn: 12.5,
    ballastSpeedKn: 13.0,
    ladenConsMtPerDay: 40,
    ballastConsMtPerDay: 37,
    portConsMtPerDay: 7.0,
  },
  suezmax: {
    vesselClass: "suezmax",
    label: "Suezmax (std)",
    ladenSpeedKn: 12.5,
    ballastSpeedKn: 13.0,
    ladenConsMtPerDay: 48,
    ballastConsMtPerDay: 45,
    portConsMtPerDay: 7.5,
  },
  vlcc: {
    vesselClass: "vlcc",
    label: "VLCC (std)",
    ladenSpeedKn: 12.0,
    ballastSpeedKn: 12.5,
    ladenConsMtPerDay: 58,
    ballastConsMtPerDay: 55,
    portConsMtPerDay: 8.0,
  },

  unknown: {
    vesselClass: "unknown",
    label: "Unknown (leave current)",
    ladenSpeedKn: 12.5,
    ballastSpeedKn: 13.0,
    ladenConsMtPerDay: 28,
    ballastConsMtPerDay: 26,
    portConsMtPerDay: 4.0,
  },
};

const KEYWORDS: Array<{ k: string[]; v: VesselClass }> = [
  { k: ["ultramax", "u-max", "umax"], v: "ultramax" },
  { k: ["supramax", "supra"], v: "supramax" },
  { k: ["handysize"], v: "handysize" },
  { k: ["handymax"], v: "handymax" },
  { k: ["panamax", "pmx"], v: "panamax" },
  { k: ["kamsarmax", "kmax"], v: "kamsarmax" },
  { k: ["cape", "capesize"], v: "capesize" },

  { k: ["mr"], v: "mr" },
  { k: ["lr1"], v: "lr1" },
  { k: ["lr2"], v: "lr2" },
  { k: ["aframax"], v: "aframax" },
  { k: ["suezmax"], v: "suezmax" },
  { k: ["vlcc"], v: "vlcc" },
];

export function detectVesselClassFromText(text: string): VesselClass {
  const t = (text || "").toLowerCase();
  for (const row of KEYWORDS) {
    for (const kw of row.k) {
      if (t.includes(kw)) return row.v;
    }
  }
  return "unknown";
}

export function getProfile(vesselClass: VesselClass): VesselProfile {
  return VESSEL_PROFILES[vesselClass] || VESSEL_PROFILES.unknown;
}
