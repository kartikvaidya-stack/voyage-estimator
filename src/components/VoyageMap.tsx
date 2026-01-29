"use client";

import React, { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { PORT_COORDINATES, checkRouteECAs, type ECAZone } from "../lib/ecaRegulations";
import { computeSeaRoute, type GeoPoint } from "../lib/seaRouting";

interface MapProps {
  portNames: string[];
  onDistanceCalculated?: (distances: number[]) => void;
  showECAZones?: boolean;
}

interface RouteSegment {
  from: string;
  to: string;
  distance: number;
  distanceNm: number;
}

type RouteLegGeometry = {
  from: string;
  to: string;
  path: GeoPoint[];
  distanceNm: number;
};

type RoutePlan = {
  ports: Array<{ name: string; lat: number; lon: number }>;
  legs: RouteLegGeometry[];
  ecaPath: Array<{ lat: number; lon: number }>;
};

export const VoyageMap: React.FC<MapProps> = ({ portNames, onDistanceCalculated, showECAZones = true }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markersGroup = useRef<L.FeatureGroup | null>(null);
  const routesGroup = useRef<L.FeatureGroup | null>(null);
  const ecaGroup = useRef<L.FeatureGroup | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const seamarkLayerRef = useRef<L.TileLayer | null>(null);
  const lastCalculatedDistances = useRef<string>("");
  const onDistanceCalculatedRef = useRef(onDistanceCalculated);

  const routePlan: RoutePlan = useMemo(() => {
    const ports = portNames
      .map((name) => ({ name, coord: PORT_COORDINATES[name] }))
      .filter((entry): entry is { name: string; coord: { lat: number; lon: number } } => Boolean(entry.coord))
      .map(({ name, coord }) => ({ name, lat: coord.lat, lon: coord.lon }));

    const legs: RouteLegGeometry[] = [];
    const ecaPath: Array<{ lat: number; lon: number }> = [];

    for (let i = 0; i < ports.length - 1; i++) {
      const from = ports[i];
      const to = ports[i + 1];
      const seaPath = computeSeaRoute(from as GeoPoint, to as GeoPoint);
      legs.push({ from: from.name, to: to.name, path: seaPath.path, distanceNm: seaPath.distanceNm });
      ecaPath.push(...seaPath.path.map((p) => ({ lat: p.lat, lon: p.lon })));
    }

    return { ports, legs, ecaPath };
  }, [portNames]);

  const routeSegments: RouteSegment[] = useMemo(
    () => routePlan.legs.map((leg) => ({ from: leg.from, to: leg.to, distance: leg.distanceNm, distanceNm: leg.distanceNm })),
    [routePlan]
  );

  const ecaAnalysis = useMemo(() => {
    const analysisPath = routePlan.ecaPath.length > 1 ? routePlan.ecaPath : routePlan.ports.map(({ lat, lon }) => ({ lat, lon }));
    if (analysisPath.length < 2) {
      return { zonesEncountered: [], ecaPercentage: 0, recommendedFuel: "HFO" } as ReturnType<typeof checkRouteECAs>;
    }
    return checkRouteECAs(analysisPath);
  }, [routePlan]);

  const ecaZonesOnRoute = ecaAnalysis.zonesEncountered;

  // Keep the callback ref up to date
  useEffect(() => {
    onDistanceCalculatedRef.current = onDistanceCalculated;
  }, [onDistanceCalculated]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = L.map(mapContainer.current, {
      center: [20, 0],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
    });

    map.current.createPane("eca");
    map.current.getPane("eca")!.style.zIndex = "450";
    map.current.createPane("routes");
    map.current.getPane("routes")!.style.zIndex = "650";
    map.current.createPane("markers");
    map.current.getPane("markers")!.style.zIndex = "700";
    map.current.createPane("labels");
    map.current.getPane("labels")!.style.zIndex = "750";

    const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors",
    });
    const seamarkLayer = L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
      opacity: 0.8,
      attribution: "© OpenSeaMap contributors",
    });

    baseLayer.addTo(map.current);
    seamarkLayer.addTo(map.current);
    baseLayerRef.current = baseLayer;
    seamarkLayerRef.current = seamarkLayer;

    L.control.zoom({ position: "bottomright" }).addTo(map.current);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map.current);
    const attribution = L.control.attribution({ position: "bottomright" });
    attribution.addAttribution("© OpenStreetMap · OpenSeaMap");
    attribution.addTo(map.current);

    // Create feature groups
    markersGroup.current = L.featureGroup().addTo(map.current);
    routesGroup.current = L.featureGroup().addTo(map.current);
    ecaGroup.current = L.featureGroup().addTo(map.current);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update markers and route when derived plan changes
  useEffect(() => {
    if (!map.current || !markersGroup.current || !routesGroup.current) return;

    markersGroup.current.clearLayers();
    routesGroup.current.clearLayers();

    for (const port of routePlan.ports) {
      const marker = L.circleMarker([port.lat, port.lon], {
        radius: 7,
        fillColor: "#22d3ee",
        color: "#0f172a",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95,
        pane: "markers",
      });

      marker.bindPopup(
        L.popup().setContent(
          `<strong>${port.name}</strong><br/>Lat: ${port.lat.toFixed(4)}<br/>Lon: ${port.lon.toFixed(4)}`
        )
      );

      marker.addTo(markersGroup.current);
    }

    if (routePlan.legs.length > 0) {
      for (const leg of routePlan.legs) {
        const latLngs = leg.path.map((p) => [p.lat, p.lon]) as [number, number][];

        L.polyline(latLngs, {
          color: "#22d3ee",
          weight: 8,
          opacity: 0.35,
          smoothFactor: 1.2,
          pane: "routes",
          lineCap: "round",
        }).addTo(routesGroup.current!);

        L.polyline(latLngs, {
          color: "#fef9c3",
          weight: 3,
          opacity: 0.95,
          smoothFactor: 1.2,
          pane: "routes",
          lineCap: "round",
          lineJoin: "round",
        }).addTo(routesGroup.current!);

        const midIndex = Math.floor(leg.path.length / 2);
        const mid = leg.path[midIndex] ?? leg.path[0];

        L.marker([mid.lat, mid.lon], {
          pane: "labels",
          icon: L.divIcon({
            html: `<div style="background: rgba(2,6,23,0.85); padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(148,163,184,0.35); font-size: 11px; letter-spacing: 0.08em; font-weight: 700; color: #fefce8; text-transform: uppercase;">${Math.round(leg.distanceNm)} nm</div>`,
            className: "",
          }),
        }).addTo(routesGroup.current!);
      }

      const distances = routePlan.legs.map((leg) => leg.distanceNm);
      const distancesKey = distances.join(',');
      if (distancesKey !== lastCalculatedDistances.current) {
        lastCalculatedDistances.current = distancesKey;
        onDistanceCalculatedRef.current?.(distances);
      }

      const boundsSource = routePlan.ecaPath.length > 1 ? routePlan.ecaPath : routePlan.ports;
      if (boundsSource.length) {
        const boundsPoints = boundsSource.map((p) => [p.lat, p.lon]) as [number, number][];
        const bounds = L.latLngBounds(boundsPoints);
        map.current.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [routePlan]);

  // Draw ECA zones
  useEffect(() => {
    if (!ecaGroup.current || !showECAZones) return;

    ecaGroup.current.clearLayers();

    for (const zone of ecaZonesOnRoute) {
      const [minLat, minLon, maxLat, maxLon] = zone.bounds;
      const bounds = L.latLngBounds([minLat, minLon], [maxLat, maxLon]);

      const rect = L.rectangle(bounds, {
        color: "#f59e0b",
        weight: 2,
        opacity: 0.4,
        fillColor: "#fcd34d",
        fillOpacity: 0.12,
        dashArray: "8, 4",
        pane: "eca",
      });

      const popup = L.popup()
        .setContent(`<strong>${zone.name}</strong><br/>Requires: ${zone.requiredFuel.join(", ")}<br/>Max sulfur: ${zone.sulfurLimitPct}%`);

      rect.bindPopup(popup);
      rect.addTo(ecaGroup.current);
    }
  }, [ecaZonesOnRoute, showECAZones]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        ref={mapContainer}
        style={{
          width: "100%",
          height: 400,
          borderRadius: 18,
          border: "1px solid rgba(59,130,246,0.35)",
          boxShadow: "0 24px 70px rgba(30, 64, 175, 0.25)",
          background: "radial-gradient(circle at 35% 25%, #e0f2fe, #bfdbfe 45%, #eff6ff 95%)",
        }}
      />

      {routeSegments.length > 0 && (
        <div
          style={{
            padding: 12,
            background: "#f0f9ff",
            borderRadius: 12,
            border: "1px solid #bfdbfe",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, color: "#1e40af", marginBottom: 8 }}>Route Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {routeSegments.map((seg, idx) => (
              <div key={idx} style={{ fontSize: 13, color: "#1e40af" }}>
                <strong>{seg.from}</strong> → <strong>{seg.to}</strong>
                <br />
                <span style={{ fontWeight: 900 }}>{Math.round(seg.distance)} nm</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #bfdbfe", fontSize: 13 }}>
            <strong>Total Distance:</strong>{" "}
            <span style={{ fontWeight: 900, color: "#1e3a8a" }}>
              {Math.round(routeSegments.reduce((sum, s) => sum + s.distance, 0))} nm
            </span>
          </div>
        </div>
      )}

      {ecaZonesOnRoute.length > 0 && (
        <div
          style={{
            padding: 12,
            background: "#fffbeb",
            borderRadius: 12,
            border: "1px solid #fcd34d",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, color: "#b45309", marginBottom: 8 }}>⚠️ ECA Zones Detected</div>
          <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
            {ecaZonesOnRoute.map((zone) => (
              <div key={zone.id} style={{ marginBottom: 6 }}>
                <strong>{zone.name}</strong> - Requires: {zone.requiredFuel.join(", ")}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoyageMap;
