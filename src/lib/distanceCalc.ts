/**
 * Distance and coordinate utilities for voyage planning
 */

/**
 * Haversine formula to calculate great-circle distance between two points
 * Returns distance in nautical miles
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate distance between two named ports
 */
export function distanceBetweenPorts(
  from: string,
  to: string,
  portCoordinates: Record<string, { lat: number; lon: number }>
): number | null {
  const fromCoord = portCoordinates[from];
  const toCoord = portCoordinates[to];

  if (!fromCoord || !toCoord) return null;

  return haversineDistance(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon);
}

/**
 * Calculate total distance for a route
 */
export function calculateRouteTotalDistance(
  waypoints: Array<{ name: string; lat: number; lon: number }>
): number {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const current = waypoints[i];
    const next = waypoints[i + 1];
    total += haversineDistance(current.lat, current.lon, next.lat, next.lon);
  }
  return total;
}

/**
 * Validate if coordinates are within reasonable maritime bounds
 */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Format distance for display
 */
export function formatDistance(nm: number): string {
  return `${Math.round(nm)} nm`;
}
