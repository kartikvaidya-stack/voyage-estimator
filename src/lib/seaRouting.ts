import { haversineDistance } from "./distanceCalc";

export interface GeoPoint {
  lat: number;
  lon: number;
  name?: string;
}

interface SeaNode extends GeoPoint {
  id: string;
}

interface RegionalAccessPoint {
  bounds: [number, number, number, number];
  nodes: string[];
}

// Coarse global sea-lane graph. Nodes are placed in open water near major choke points
// and deep-sea waypoints to keep routes off land.
const BASE_NODES: SeaNode[] = [
  { id: "north_sea", name: "North Sea", lat: 54, lon: 3 },
  { id: "english_channel", name: "English Channel", lat: 50.5, lon: -1 },
  { id: "baltic_approach", name: "Kattegat / Baltic Gate", lat: 56.5, lon: 12 },
  { id: "north_sea_gate", name: "Norwegian Sea Gate", lat: 58, lon: 4 },
  { id: "bay_of_biscay", name: "Bay of Biscay", lat: 45, lon: -5 },
  { id: "gibraltar", name: "Strait of Gibraltar", lat: 36, lon: -5.6 },
  { id: "west_med", name: "West Mediterranean", lat: 38, lon: 10 },
  { id: "central_med", name: "Central Mediterranean", lat: 36, lon: 20 },
  { id: "east_med", name: "East Mediterranean", lat: 34, lon: 28 },
  { id: "suez", name: "Suez", lat: 29.97, lon: 32.55 },
  { id: "upper_red_sea", name: "Upper Red Sea", lat: 21, lon: 39 },
  { id: "bab_el_mandeb", name: "Bab el Mandeb", lat: 12.58, lon: 43.26 },
  { id: "arabian_sea", name: "Arabian Sea", lat: 15, lon: 64 },
  { id: "north_arabian_sea", name: "North Arabian Sea", lat: 20, lon: 66 },
  { id: "gulf_of_oman", name: "Gulf of Oman", lat: 23.5, lon: 60 },
  { id: "persian_gulf", name: "Persian Gulf Entrance", lat: 25, lon: 54 },
  { id: "west_india", name: "Off West India", lat: 12, lon: 72 },
  { id: "south_india", name: "Off South India", lat: 7, lon: 78 },
  { id: "bay_of_bengal", name: "Bay of Bengal", lat: 12, lon: 86 },
  { id: "andaman", name: "Andaman Sea", lat: 11, lon: 96 },
  { id: "gulf_of_thailand", name: "Gulf of Thailand", lat: 9, lon: 101 },
  { id: "malacca", name: "Strait of Malacca", lat: 1.3, lon: 103.6 },
  { id: "java_sea", name: "Java Sea", lat: -4, lon: 112 },
  { id: "east_indonesia", name: "Makassar Strait", lat: -2, lon: 119 },
  { id: "arafura", name: "Arafura Sea", lat: -9, lon: 135 },
  { id: "coral_sea", name: "Coral Sea", lat: -18, lon: 152 },
  { id: "tasman", name: "Tasman Sea", lat: -40, lon: 160 },
  { id: "bass_strait", name: "Bass Strait", lat: -40, lon: 145 },
  { id: "south_china_sea", name: "South China Sea", lat: 12, lon: 113 },
  { id: "south_china_coast", name: "South China Coast", lat: 20, lon: 114 },
  { id: "east_china_sea", name: "East China Sea", lat: 28, lon: 125 },
  { id: "yellow_sea", name: "Yellow Sea", lat: 34, lon: 123 },
  { id: "sea_of_japan", name: "Sea of Japan", lat: 38, lon: 135 },
  { id: "sea_of_okhotsk", name: "Sea of Okhotsk", lat: 50, lon: 150 },
  { id: "bering", name: "Bering Sea", lat: 58, lon: -170 },
  { id: "luzon", name: "Luzon Strait", lat: 20.5, lon: 121.8 },
  { id: "okinawa", name: "Philippine Sea", lat: 25.5, lon: 128 },
  { id: "bohai_gate", name: "Bohai / Yellow Sea Gate", lat: 35.5, lon: 121.5 },
  { id: "north_pacific", name: "North Pacific", lat: 30, lon: -150 },
  { id: "gulf_of_alaska", name: "Gulf of Alaska", lat: 55, lon: -145 },
  { id: "mid_pacific", name: "Central Pacific", lat: 10, lon: -150 },
  { id: "peru_current", name: "Peru Current", lat: -12, lon: -80 },
  { id: "south_pacific", name: "South Pacific Gyre", lat: -25, lon: -110 },
  { id: "panama_atlantic", name: "Panama (Atlantic)", lat: 9.26, lon: -79.92 },
  { id: "panama_pacific", name: "Panama (Pacific)", lat: 8.95, lon: -79.55 },
  { id: "caribbean", name: "Caribbean Sea", lat: 15, lon: -75 },
  { id: "gulf_of_mexico", name: "Gulf of Mexico", lat: 23, lon: -90 },
  { id: "us_east", name: "US East Coast", lat: 34, lon: -74 },
  { id: "us_west", name: "US West Coast", lat: 34, lon: -123 },
  { id: "sargasso", name: "Sargasso Sea", lat: 30, lon: -55 },
  { id: "azores", name: "Azores Gate", lat: 36, lon: -28 },
  { id: "canary", name: "Canary Gyre", lat: 27, lon: -17 },
  { id: "north_atlantic", name: "North Atlantic", lat: 35, lon: -40 },
  { id: "north_atlantic_w", name: "Northwest Atlantic", lat: 40, lon: -55 },
  { id: "north_atlantic_n", name: "Northeast Atlantic", lat: 45, lon: -30 },
  { id: "south_atlantic", name: "South Atlantic", lat: -25, lon: -20 },
  { id: "south_atlantic_w", name: "Mid South Atlantic", lat: -5, lon: -35 },
  { id: "gulf_of_guinea", name: "Gulf of Guinea", lat: 1, lon: 4 },
  { id: "somali_basin", name: "Somali Basin", lat: 6, lon: 52 },
  { id: "east_africa", name: "East Africa Offshore", lat: -5, lon: 55 },
  { id: "angola_basin", name: "Angola Basin", lat: -12, lon: 5 },
  { id: "brazil_current", name: "Brazil Current", lat: -20, lon: -40 },
  { id: "la_plata", name: "La Plata Approaches", lat: -35, lon: -53 },
  { id: "cape_good_hope", name: "Cape of Good Hope", lat: -34.8, lon: 18.4 },
  { id: "mozambique_channel", name: "Mozambique Channel", lat: -18, lon: 42 },
  { id: "gulf_of_guatemala", name: "Guatemala Rise", lat: 12, lon: -88 },
  { id: "cape_horn", name: "Cape Horn", lat: -56, lon: -67 },
];

// Bidirectional edges describing safe ocean legs between waypoints.
const BASE_EDGES: Array<[string, string]> = [
  ["north_sea", "english_channel"],
  ["north_sea_gate", "north_sea"],
  ["north_sea_gate", "north_atlantic"],
  ["baltic_approach", "north_sea"],
  ["baltic_approach", "english_channel"],
  ["english_channel", "bay_of_biscay"],
  ["bay_of_biscay", "gibraltar"],
  ["gibraltar", "west_med"],
  ["west_med", "central_med"],
  ["central_med", "east_med"],
  ["east_med", "suez"],
  ["suez", "upper_red_sea"],
  ["upper_red_sea", "bab_el_mandeb"],
  ["bab_el_mandeb", "arabian_sea"],
  ["arabian_sea", "north_arabian_sea"],
  ["north_arabian_sea", "gulf_of_oman"],
  ["gulf_of_oman", "persian_gulf"],
  ["north_arabian_sea", "west_india"],
  ["west_india", "south_india"],
  ["south_india", "bay_of_bengal"],
  ["bay_of_bengal", "andaman"],
  ["andaman", "gulf_of_thailand"],
  ["gulf_of_thailand", "malacca"],
  ["andaman", "south_china_sea"],
  ["malacca", "java_sea"],
  ["java_sea", "east_indonesia"],
  ["east_indonesia", "arafura"],
  ["arafura", "coral_sea"],
  ["coral_sea", "tasman"],
  ["coral_sea", "bass_strait"],
  ["coral_sea", "north_pacific"],
  ["south_china_sea", "south_china_coast"],
  ["bohai_gate", "yellow_sea"],
  ["bohai_gate", "south_china_sea"],
  ["south_china_coast", "east_china_sea"],
  ["east_china_sea", "yellow_sea"],
  ["yellow_sea", "sea_of_japan"],
  ["sea_of_japan", "sea_of_okhotsk"],
  ["sea_of_okhotsk", "bering"],
  ["bering", "north_pacific"],
  ["north_pacific", "gulf_of_alaska"],
  ["north_pacific", "mid_pacific"],
  ["mid_pacific", "peru_current"],
  ["peru_current", "panama_pacific"],
  ["peru_current", "cape_horn"],
  ["south_pacific", "peru_current"],
  ["south_pacific", "mid_pacific"],
  ["panama_atlantic", "panama_pacific"],
  ["panama_atlantic", "caribbean"],
  ["caribbean", "gulf_of_mexico"],
  ["gulf_of_mexico", "sargasso"],
  ["us_east", "sargasso"],
  ["us_east", "gulf_of_mexico"],
  ["us_west", "peru_current"],
  ["us_west", "north_pacific"],
  ["us_west", "gulf_of_alaska"],
  ["sargasso", "azores"],
  ["azores", "north_atlantic"],
  ["azores", "canary"],
  ["canary", "gibraltar"],
  ["canary", "gulf_of_guinea"],
  ["north_atlantic_w", "sargasso"],
  ["north_atlantic_w", "azores"],
  ["north_atlantic_w", "north_atlantic"],
  ["north_atlantic_n", "azores"],
  ["north_atlantic_n", "north_atlantic"],
  ["north_atlantic_n", "north_sea_gate"],
  ["south_atlantic_w", "brazil_current"],
  ["south_atlantic_w", "south_atlantic"],
  ["gulf_of_guinea", "angola_basin"],
  ["somali_basin", "arabian_sea"],
  ["somali_basin", "mozambique_channel"],
  ["east_africa", "mozambique_channel"],
  ["east_africa", "somali_basin"],
  ["angola_basin", "cape_good_hope"],
  ["angola_basin", "brazil_current"],
  ["brazil_current", "south_atlantic"],
  ["brazil_current", "la_plata"],
  ["south_atlantic", "cape_good_hope"],
  ["south_atlantic", "gulf_of_guinea"],
  ["south_atlantic", "north_atlantic"],
  ["south_atlantic", "bay_of_biscay"],
  ["north_atlantic", "bay_of_biscay"],
  ["north_atlantic", "gibraltar"],
  ["mozambique_channel", "cape_good_hope"],
  ["mozambique_channel", "arabian_sea"],
  ["mozambique_channel", "somali_basin"],
  ["cape_horn", "south_atlantic"],
  ["caribbean", "sargasso"],
  ["caribbean", "north_atlantic"],
  ["gulf_of_alaska", "bering"],
  ["gulf_of_guatemala", "caribbean"],
  ["gulf_of_guatemala", "panama_pacific"],
];

const REGIONAL_ACCESS_POINTS: RegionalAccessPoint[] = [
  { bounds: [18, 64, 26, 75], nodes: ["north_arabian_sea", "gulf_of_oman"] },
  { bounds: [8, 78, 23, 92], nodes: ["bay_of_bengal", "andaman"] },
  { bounds: [-6, 98, 8, 116], nodes: ["java_sea", "gulf_of_thailand"] },
  { bounds: [8, 100, 25, 124], nodes: ["south_china_sea", "south_china_coast"] },
  { bounds: [28, 120, 42, 136], nodes: ["yellow_sea", "sea_of_japan"] },
  { bounds: [45, -100, 65, -60], nodes: ["gulf_of_mexico", "sargasso"] },
  { bounds: [10, -95, 30, -60], nodes: ["caribbean", "sargasso"] },
  { bounds: [-40, -70, -15, -35], nodes: ["la_plata", "brazil_current"] },
  { bounds: [-20, -90, 5, -70], nodes: ["peru_current", "panama_pacific"] },
  { bounds: [-35, 10, -5, 50], nodes: ["angola_basin", "cape_good_hope"] },
];

interface Graph {
  nodes: Map<string, SeaNode>;
  edges: Map<string, Array<{ to: string; weight: number }>>;
}

function buildBaseGraph(): Graph {
  const nodes = new Map<string, SeaNode>();
  const edges = new Map<string, Array<{ to: string; weight: number }>>();

  for (const node of BASE_NODES) {
    nodes.set(node.id, node);
    edges.set(node.id, []);
  }

  for (const [a, b] of BASE_EDGES) {
    const na = nodes.get(a);
    const nb = nodes.get(b);
    if (!na || !nb) continue;
    const w = haversineDistance(na.lat, na.lon, nb.lat, nb.lon);
    edges.get(a)!.push({ to: b, weight: w });
    edges.get(b)!.push({ to: a, weight: w });
  }

  return { nodes, edges };
}

function connectBidirectional(graph: Graph, fromId: string, toId: string, weight: number) {
  if (!graph.edges.has(fromId) || !graph.edges.has(toId)) return;

  const fromEdges = graph.edges.get(fromId)!;
  const toEdges = graph.edges.get(toId)!;

  if (!fromEdges.some((edge) => edge.to === toId)) {
    fromEdges.push({ to: toId, weight });
  }
  if (!toEdges.some((edge) => edge.to === fromId)) {
    toEdges.push({ to: fromId, weight });
  }
}

function pointInBounds(point: GeoPoint, bounds: [number, number, number, number]) {
  const [minLat, minLon, maxLat, maxLon] = bounds;
  return point.lat >= minLat && point.lat <= maxLat && point.lon >= minLon && point.lon <= maxLon;
}

function attachEndpoint(id: string, point: GeoPoint, graph: Graph, maxLinks = 3, maxNm = 1800) {
  graph.nodes.set(id, { ...point, id });
  graph.edges.set(id, []);

  const candidates = Array.from(graph.nodes.values())
    .filter((n) => n.id !== id && !n.id.startsWith("__"))
    .map((n) => ({ node: n, dist: haversineDistance(point.lat, point.lon, n.lat, n.lon) }))
    .sort((a, b) => a.dist - b.dist);

  let links = 0;
  for (const candidate of candidates) {
    if (links >= maxLinks) break;
    if (candidate.dist > maxNm) continue;
    connectBidirectional(graph, id, candidate.node.id, candidate.dist);
    links++;
  }

  // Apply regional overrides to force chokepoint-friendly links
  for (const region of REGIONAL_ACCESS_POINTS) {
    if (!pointInBounds(point, region.bounds)) continue;
    for (const nodeId of region.nodes) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;
      const dist = haversineDistance(point.lat, point.lon, node.lat, node.lon);
      connectBidirectional(graph, id, nodeId, dist);
    }
  }

  // Ensure we always have at least one link by connecting to the absolute nearest node
  if ((graph.edges.get(id)?.length || 0) === 0 && candidates.length > 0) {
    const nearest = candidates[0];
    connectBidirectional(graph, id, nearest.node.id, nearest.dist);
  }
}

function dijkstra(graph: Graph, startId: string, targetId: string): string[] {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const id of graph.nodes.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }

  dist.set(startId, 0);
  
  // Simple priority queue: find min unvisited node
  while (visited.size < graph.nodes.size) {
    // Find unvisited node with minimum distance
    let minDist = Infinity;
    let current: string | null = null;
    
    for (const id of graph.nodes.keys()) {
      if (!visited.has(id) && dist.get(id)! < minDist) {
        minDist = dist.get(id)!;
        current = id;
      }
    }
    
    if (!current || minDist === Infinity) break;
    visited.add(current);

    if (current === targetId) break;

    const neighbors = graph.edges.get(current) || [];
    for (const { to, weight } of neighbors) {
      if (visited.has(to)) continue;
      const alt = minDist + weight;
      if (alt < (dist.get(to) || Infinity)) {
        dist.set(to, alt);
        prev.set(to, current);
      }
    }
  }

  if (!visited.has(targetId)) return [];

  const path: string[] = [];
  let u: string | null = targetId;
  while (u) {
    path.unshift(u);
    u = prev.get(u) || null;
  }

  return path;
}

function pathDistance(points: GeoPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
  }
  return total;
}

function densifyPath(points: GeoPoint[], maxSegmentNm = 140): GeoPoint[] {
  if (points.length < 2) return points;

  const nextPath: GeoPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    nextPath.push(current);

    const distance = haversineDistance(current.lat, current.lon, next.lat, next.lon);
    const steps = Math.max(1, Math.floor(distance / maxSegmentNm));

    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      nextPath.push({
        lat: current.lat + (next.lat - current.lat) * t,
        lon: current.lon + (next.lon - current.lon) * t,
      });
    }
  }

  nextPath.push(points[points.length - 1]);
  return nextPath;
}

export function computeSeaRoute(start: GeoPoint, end: GeoPoint): { path: GeoPoint[]; distanceNm: number } {
  const graph = buildBaseGraph();

  attachEndpoint("__start", start, graph, 4, 1200);
  attachEndpoint("__end", end, graph, 4, 1200);

  const pathIds = dijkstra(graph, "__start", "__end");
  const path = pathIds.map((id) => graph.nodes.get(id)!).filter(Boolean);
  const cleaned = path.filter((_, idx, arr) => idx === 0 || arr[idx - 1].id !== path[idx].id);
  if (cleaned.length === 0) {
    const fallbackDistance = haversineDistance(start.lat, start.lon, end.lat, end.lon);
    return { path: [start, end], distanceNm: fallbackDistance };
  }

  const smoothed = densifyPath(cleaned);
  const distanceNm = pathDistance(smoothed);

  // Drop synthetic ids before returning
  const returnedPath = smoothed.map((p) => ({ lat: p.lat, lon: p.lon, name: p.name }));
  return { path: returnedPath, distanceNm };
}
