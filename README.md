## Voyage Estimator

Modern voyage war-room for operators who need to price, narrate, and defend fixtures in minutes. The app couples a deterministic itinerary engine with map-derived routing, ECA compliance modeling, AI-assisted drafting, scenario analysis, and emission stats.

### Features
- Hero workspace with live TCE, profit, and duration metrics
- AI itinerary drafting with bunker blending rules
- Leaflet-based routing with sea-lane snapping + ECA overlays
- Scenario desk (eco, express, bunker shock, freight push) + sensitivity table
- Emission lens (CO₂ totals, intensity) + data hygiene warnings
- Device-aware layout (summary / ports / legs tabs on mobile)
  
### Local development

```bash
npm install
npm run dev
```

Environment variables:

```
OPENAI_API_KEY=sk-...
```

### Project layout

- `src/app/page.tsx` — core planner UI + intelligence deck
- `src/components/VoyageMap.tsx` — map, routing, and ECA overlays
- `src/lib/itineraryCalc.js` — deterministic voyage math
- `src/lib/analytics.ts` — scenario + emissions + validation helpers
- `src/app/api/itinerary/route.js` — AI drafting endpoint (JSON-only)

### External data sources to evaluate next

**Sea distance & routing APIs**
- **Datalastic Sea Route API** — REST endpoint that snaps voyages to commercial sea lanes and returns great-circle distance, ETA, and intermediate waypoints; requires API key and credits but integrates cleanly with `libs/seaRouting` as a fallback when user ports are off-network.
- **MarineTraffic Voyage Planner API** — paid tier exposes bunker-optimized routing and distance matrices; useful for validating our Leaflet-derived distances and augmenting ECA exposure data.
- **AtoBviaC Web Service** — long-standing industry calculator that exposes SOAP/REST routes with mandatory-waypoint controls; ideal for sanity-checking polar or canal-heavy passages.

**Port cost & DA intelligence**
- **PortLog API (Marcura)** — JSON API for historical disbursement accounts, tariffs, and turnaround benchmarks; can drive the `port_cost_usd` defaults per port call.
- **DIABOS / DA-Desk API** — provides pro-forma DA estimates, agency fees, and live cost updates; helpful for automatically populating towage/pilotage components in the planner.
- **SeaRates Port Charges API** — commercial REST feed with published dues (port, canal, storage) structured by port and vessel class; lightweight enough to surface indicative costs when users add a new port.

Plan: wrap each provider inside `src/lib/dataProviders` with caching + graceful degradation so the estimator falls back to manual inputs whenever an external API quota is hit.

### Testing checklist

1. `npm run lint` — Next.js eslint config
2. Manual: ensure map loads (Leaflet CSS imported via globals)
3. Manual: verify OpenAI API key present before AI drafting

