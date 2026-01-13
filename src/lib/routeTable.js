// src/lib/routeTable.js
// Route table with TWO layers:
// 1) Built-in starter distances (in code)
// 2) User-saved distances (stored in browser localStorage) — this is your "one-click save"

function norm(s) {
  return String(s || "").trim().toLowerCase();
}
function k(a, b) {
  return `${norm(a)}__${norm(b)}`;
}

const LS_KEY = "VE_ROUTE_NM";

// Built-in starter table (edit if you want, but you don’t have to anymore)
const BUILTIN_ROUTE_NM = {
  [k("singapore", "palembang")]: 450,
  [k("palembang", "vizag")]: 2500,
  [k("vizag", "kandla")]: 950,
  [k("kandla", "singapore")]: 2350,
  [k("palembang", "qingdao")]: 2600,
  [k("singapore", "fujairah")]: 3350,
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getUserRouteMap() {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function setUserRouteMap(map) {
  if (!isBrowser()) return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(map || {}));
}

// Lookup: user-saved first, then built-in. Reverse lookup allowed.
export function lookupDistanceNm(from, to) {
  const key1 = k(from, to);
  const key2 = k(to, from);

  const user = getUserRouteMap();
  if (user[key1] != null) return Number(user[key1]);
  if (user[key2] != null) return Number(user[key2]);

  if (BUILTIN_ROUTE_NM[key1] != null) return Number(BUILTIN_ROUTE_NM[key1]);
  if (BUILTIN_ROUTE_NM[key2] != null) return Number(BUILTIN_ROUTE_NM[key2]);

  return null;
}

// One-click save: stores both directions (A->B and B->A) for convenience.
export function saveDistanceNm(from, to, distanceNm) {
  const d = Number(distanceNm);
  if (!(d > 0)) {
    return { ok: false, error: "Distance must be > 0." };
  }
  const a = norm(from);
  const b = norm(to);
  if (!a || !b) {
    return { ok: false, error: "From/To port names are required." };
  }

  const user = getUserRouteMap();
  user[k(a, b)] = d;
  user[k(b, a)] = d;
  setUserRouteMap(user);

  return { ok: true };
}

export function clearUserRoutes() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(LS_KEY);
}
