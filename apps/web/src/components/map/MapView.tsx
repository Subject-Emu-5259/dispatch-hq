// ============================================
// Dispatch HQ — Map View Component
// ============================================

import { useState, useRef, useEffect } from 'react';
import { Send, X, Clock, Zap, MapPin } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useGameStore } from '@/stores/gameStore';
import { wsClient } from '@/lib/wsClient';
import type { Station, Mission, Unit, GeoPoint } from '@dispatch-hq/shared';
import { STATION_CONFIGS, UNIT_CONFIGS, liveryFor, stationThemeFor, allianceRevealKm, difficultyTierFor, TIER_META } from '@dispatch-hq/shared';
import { getUnitServiceType, fetchDrivingRoute } from '@/utils/routing';
import { missionService } from '@/lib/rewards';
import { splitPathByProgress, haversineKm } from '@/utils/roadPathfinding';
import { formatTimer } from '@/utils/timeFormat';
import { applyTravelTech, getMaxDispatchUnits } from '@/lib/techTree';
import { dispatchUnitToMission, findNearestDispatchUnits, requiredServicesForMission, requirementGapReason, dispatchPlanParts, missingBackupServices, serviceDisplayName } from '@/lib/dispatchLogic';
import { broadcastRadioSequence, wasRadioKeyDispatched, markRadioKeyDispatched } from '@/utils/radioEvents';
import { isAirliftMission } from '@/lib/radioDialogueEngine';
import { assignmentSequence } from '@/lib/radioDialogueEngine.lazy';
import { isAirborneTransport } from '@/lib/hospital';
import { playDispatchTone, playFailure } from '@/utils/sound';
import { useNotifications } from '../NotificationCenter';
import { patrolZonesForCity, computeZoneHeat, type CityZone } from '@/lib/patrol/patrolZones';
import { hospitalOccupancy, erStaffing, effectiveBeds, erStaffFatigue, patientOutcomesForShift, HOSPITAL_BUILD_COST, HELIPAD_BUILD_COST, STAFF_OVERWORK_THRESHOLD, wardLevel, wardUpgradeCost, applyWardUpgrade, WARD_BEDS_PER_LEVEL, HOSPITAL_WARD_MAX_LEVEL } from '@/lib/hospital';
import { InlineRename } from '@/components/InlineRename';
import { poiById, POI_TYPE_META, type Poi } from '@/lib/pois';
import { RemovePoiButton } from '@/components/BuildPoiModal';
import { polygonCentroid } from '@/data/cityBoundaries';
import { gapSeverityFor } from '@/lib/coverage';
import { isNight } from '@/lib/gameClock';
import { loadSettings } from '@/utils/settings';

function rotateDashArray(pattern: number[], phase: number): number[] {
  const total = pattern.reduce((a, b) => a + b, 0);
  phase = ((phase % total) + total) % total;

  let acc = 0;
  let startIdx = 0;
  let startOffset = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (acc + pattern[i] > phase) {
      startIdx = i;
      startOffset = phase - acc;
      break;
    }
    acc += pattern[i];
  }

  const result: number[] = [];
  let i = startIdx;
  let remaining = pattern[i] - startOffset;
  result.push(Number(remaining.toFixed(3)));
  i = (i + 1) % pattern.length;

  while (result.length < 4) {
    result.push(Number(pattern[i].toFixed(3)));
    i = (i + 1) % pattern.length;
  }

  return result;
}

// Inline raster styles — tiles are served from the game's own origin
// (/tiles/* — see servers/game-server/src/routes/mapData.ts), so the map has
// zero third-party dependencies. Attribution stays per the OSM license.
const RASTER_STYLES: Record<string, any> = {
  dark: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['/tiles/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint: {
          'raster-brightness-max': 0.45,
          'raster-contrast': 0.2,
          'raster-saturation': -0.6,
        },
      },
    ],
  },
  light: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['/tiles/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
  satellite: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['/tiles/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': 0.5 } },
    ],
  },
};

// A usable city-bounds value is a 2×2 array of finite numbers. Anything else
// (NaN from a legacy/partial save, a malformed estimate, a null) must never
// reach fitBounds — a NaN pair makes MapLibre snap to a world/fallback view,
// which read as "the map shows the whole country" (v0.23.4 hardening).
function validMapBounds(b: [[number, number], [number, number]] | null | undefined): b is [[number, number], [number, number]] {
  if (!Array.isArray(b) || b.length !== 2) return false;
  const [a, c] = b;
  if (!Array.isArray(a) || !Array.isArray(c)) return false;
  return [a[0], a[1], c[0], c[1]].every((n) => typeof n === 'number' && Number.isFinite(n));
}

// Category icons for mission markers
const CATEGORY_ICONS: Record<string, string> = {
  fire: '🔥',
  traffic: '🚗',
  rescue: '🏚️',
  hazmat: '⚠️',
  police: '🚨',
  ems: '🩺',
};

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse',
};

interface MapViewProps {
  onMapClick?: (lat: number, lng: number) => void;
  onUnitClick?: (unit: Unit) => void;
  onStationClick?: (station: Station) => void;
  onZoneClick?: (zoneId: string, zoneName: string) => void;
  followTarget?: GeoPoint | null;
}

// Build heat-overlay features: covered zones render as their clipped city
// footprint (matching the real boundary line), skipped entirely when a cell has
// no city land. Falls back to the bbox rectangle when no polygon exists.
function heatFeatures(zones: CityZone[], heat: Map<string, number>) {
  return zones
    .filter((z) => z.covered !== false)
    .map((z) => {
      const ring: [number, number][] = z.polygon && z.polygon.length >= 3
        ? z.polygon.map((p) => [p.lng, p.lat] as [number, number])
        : [
            [z.bounds.lngMin, z.bounds.latMin],
            [z.bounds.lngMax, z.bounds.latMin],
            [z.bounds.lngMax, z.bounds.latMax],
            [z.bounds.lngMin, z.bounds.latMax],
            [z.bounds.lngMin, z.bounds.latMin],
          ];
      return {
        type: 'Feature' as const,
        properties: { name: z.name, heat: heat.get(z.id) ?? 0 },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      };
    });
}

function throttle<T extends (...args: any[]) => void>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(100, 116, 139, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

// One station's effective coverage circle: the live coverageRadius (which
// already carries the Response Radius perk) as a subtle service-tinted polygon.
function coverageFeature(station: Station): GeoJSON.Feature | null {
  const radiusKm = station.coverageRadius || 5;
  const latPerKm = 1 / 111.32; // ≈ km per degree of latitude
  const lngPerKm = 1 / (111.32 * Math.max(0.2, Math.cos((station.position.lat * Math.PI) / 180)));
  const segments = 48;
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    ring.push([
      station.position.lng + Math.sin(a) * radiusKm * lngPerKm,
      station.position.lat + Math.cos(a) * radiusKm * latPerKm,
    ]);
  }
  const config = STATION_CONFIGS[station.type] || STATION_CONFIGS.fire_station;
  return {
    type: 'Feature' as const,
    properties: { name: station.name, radiusKm, color: hexToRgba(config.color, 0.7) },
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}

function coverageFeatures(stations: Station[]): GeoJSON.Feature[] {
  return stations
    .map(coverageFeature)
    .filter((f): f is GeoJSON.Feature => f != null);
}

// ── Coverage-gap overlay (v0.21.1) ──
// The sampling/severity math lives in lib/coverage (unit-tested); here we only
// turn the verdict into geometry. Red = full gap (nothing in reach), amber =
// partial gap, and fully covered zones are dropped so the map reads as
// "where do I need a new station".
function gapFeature(zone: CityZone, stations: Station[]): GeoJSON.Feature | null {
  const severity = gapSeverityFor(zone, stations);
  if (!severity) return null;
  const ring: [number, number][] =
    zone.polygon && zone.polygon.length >= 3
      ? zone.polygon.map((p) => [p.lng, p.lat])
      : [
          [zone.bounds.lngMin, zone.bounds.latMin],
          [zone.bounds.lngMin, zone.bounds.latMax],
          [zone.bounds.lngMax, zone.bounds.latMax],
          [zone.bounds.lngMax, zone.bounds.latMin],
        ];
  if (ring.length < 4) return null;
  const full = severity === 'full';
  return {
    type: 'Feature' as const,
    properties: {
      name: zone.name,
      severity,
      color: full ? 'rgba(239, 68, 68, 0.20)' : 'rgba(245, 158, 11, 0.14)',
    },
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}

function gapFeatures(zones: CityZone[], stations: Station[]): GeoJSON.Feature[] {
  return zones
    .map((z) => gapFeature(z, stations))
    .filter((f): f is GeoJSON.Feature => f != null);
}

// ── Mission-marker clustering (v0.21.0) ────────────────────────────────────
// Below CLUSTER_ZOOM the map groups nearby mission pins into screen-space
// clusters (CLUSTER_PX px apart) so a packed city never renders 30+ overlapping
// markers. Cluster keys are derived from sorted member ids so they stay stable
// tick-to-tick while missions move — only position updates, no flicker.
const CLUSTER_ZOOM = 13;
const CLUSTER_PX = 60;

interface ScreenCluster {
  key: string;
  point: [number, number];
  members: Mission[];
}

function clusterMissionsOnScreen(map: maplibregl.Map, missions: Mission[], excludeIds: Set<string>): ScreenCluster[] {
  const raw: Array<{ point: [number, number]; members: Mission[] }> = [];
  for (const m of missions) {
    if (excludeIds.has(m.id)) continue;
    const p = map.project([m.location.lng, m.location.lat]);
    let placed = false;
    for (const c of raw) {
      if (Math.hypot(p.x - c.point[0], p.y - c.point[1]) < CLUSTER_PX) {
        c.members.push(m);
        placed = true;
        break;
      }
    }
    if (!placed) raw.push({ point: [p.x, p.y], members: [m] });
  }
  return raw.map((c) => {
    if (c.members.length === 1) {
      const solo = c.members[0];
      return { key: solo.id, point: [solo.location.lng, solo.location.lat], members: c.members };
    }
    // Geographic center of the group (projected average, unprojected back).
    let avgX = 0;
    let avgY = 0;
    for (const x of c.members) {
      const pt = map.project([x.location.lng, x.location.lat]);
      avgX += pt.x;
      avgY += pt.y;
    }
    avgX /= c.members.length;
    avgY /= c.members.length;
    const ll = map.unproject([avgX, avgY]);
    return {
      key: `c:${c.members.map((x) => x.id).sort().join(',')}`,
      point: [ll.lng, ll.lat],
      members: c.members,
    };
  });
}

export function MapView({ onMapClick, onUnitClick, onStationClick, onZoneClick, followTarget }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  // Bumped on every zoomend so the mission-marker effect re-runs and re-clusters
  // at the new zoom (v0.21.0).
  const [zoomBump, setZoomBump] = useState(0);

  // Mission popup: opened by clicking a mission marker, anchored to its screen
  // position, showing the incident details + one-tap nearest-unit dispatch.
  const [popupMission, setPopupMission] = useState<Mission | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  // POI popover: clicking a named place (school, park, gas station…) shows
  // what it is + any active incidents anchored there (v0.22.10).
  const [popupPoi, setPopupPoi] = useState<Poi | null>(null);
  const [poiPopupPos, setPoiPopupPos] = useState<{ x: number; y: number } | null>(null);
  // Facility popover (v0.22.13): clicking the City General Hospital or the
  // Air Ambulance Helipad puck opens a dark panel with live stats + rename.
  const [popupFacility, setPopupFacility] = useState<'hospital' | 'helipad' | null>(null);
  const [facilityPopupPos, setFacilityPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [dispatching, setDispatching] = useState(false);
  // Real OSRM driving-time ETAs per candidate (unitId:missionId). null = loading,
  // number = fetched route time, missing = not fetched (straight-line shown).
  const [popupRouteEtas, setPopupRouteEtas] = useState<Record<string, number | null>>({});
  const inFlightRoutesRef = useRef<Set<string>>(new Set());
  const { addNotification } = useNotifications();

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onUnitClickRef = useRef(onUnitClick);
  onUnitClickRef.current = onUnitClick;
  const onStationClickRef = useRef(onStationClick);
  onStationClickRef.current = onStationClick;
  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;

  const {
    stations, missions, units, selectedStationId, selectedMissionId,
    selectStation, selectMission, isDarkMode, mapStyle, mapBounds,
    patrolRoutes, nearbyStations, nearbyUnits, showPatrolHeat, showStationCoverage, showCoverageGap,
    selectedCity, gameMinutes, myAlliance, showAlliesOnMap,
    placedPois, hospital, helipad, setHospital, setHelipad,
  } = useGameStore();

  // Night styling: derived from the virtual game clock (see lib/gameClock).
  const night = isNight(gameMinutes);

  const prevStyleRef = useRef(mapStyle);
  const prevBoundsRef = useRef<string>('');

  // Stable marker refs — we only diff, never wholesale recreate
  const stationMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; station: Station }>>(new Map());
  const missionMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; mission?: Mission; memberSig: string; urgent: boolean; selected: boolean; isCluster: boolean }>>(new Map());
  const unitMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; unit: Unit; etaLabel: HTMLElement | null; nameLabel: HTMLElement | null; airLift: boolean }>>(new Map());
  const routeLeadMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; pulse: HTMLDivElement; core: HTMLDivElement }>>(new Map());
  const nearbyStationMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const nearbyUnitMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  // ── Remote (other players') units — interpolated live movement ──
  const remoteUnitMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const remoteUnitsRef = useRef<Map<string, {
    from: { lat: number; lng: number };
    target: { lat: number; lng: number };
    seq: number;
    playerId: string;
    heading: number;
    at: number;
  }>>(new Map());
  const dashPhaseRef = useRef(0);
  const nearbyUnitsRef = useRef<any[]>([]);

  // ── Initialize map ──
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const center: [number, number] = validMapBounds(mapBounds)
      ? [(mapBounds[0][1] + mapBounds[1][1]) / 2, (mapBounds[0][0] + mapBounds[1][0]) / 2]
      : [-74.006, 40.7128];

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: RASTER_STYLES[mapStyle],
      center,
      zoom: 12,
      minZoom: 3,
      pitch: 0,
      antialias: true,
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    m.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    const navControl = m.getContainer().querySelector('.maplibregl-ctrl-top-left') as HTMLElement;
    if (navControl) navControl.style.top = '56px';

    m.on('load', () => {
      setMapLoaded(true);
      // Belt-and-suspenders: fit to the city the moment the style finishes
      // loading, independent of the fly-to-city effect below. If that effect
      // was skipped for any reason (ordering, a stale guard) this still lands
      // the camera on the real city instead of the fallback/world view.
      const b = useGameStore.getState().mapBounds;
      if (validMapBounds(b)) {
        m.fitBounds([[b[0][1], b[0][0]], [b[1][1], b[1][0]]], { padding: 40, duration: 0 });
      }
    });
    m.on('click', (e) => {
      setPopupMission(null);
      setPopupPoi(null);
      setPopupFacility(null);
      if (onMapClickRef.current) {
        onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
      }
    });

    // Re-cluster mission markers on zoom change (v0.21.0).
    const onZoomEnd = () => setZoomBump((z) => z + 1);
    m.on('zoomend', onZoomEnd);

    // Zoom-responsive marker sizing so icons don't become huge blobs at low zoom.
    const markerScaleFromZoom = (zoom: number) => Math.min(1.15, Math.max(0.4, zoom / 12));
    m.on('zoom', () => {
      if (mapContainer.current) {
        mapContainer.current.style.setProperty('--marker-scale', String(markerScaleFromZoom(m.getZoom())));
      }
    });
    if (mapContainer.current) {
      mapContainer.current.style.setProperty('--marker-scale', String(markerScaleFromZoom(m.getZoom())));
    }

    map.current = m;

    const sendViewport = throttle(() => {
      if (!wsClient.isConnected() || !m) return;
      const b = m.getBounds();
      // Alliance map-reveal perk (v0.16.1): level 2+ expands the viewport the
      // server queries for nearby stations/units, so allied assets appear
      // beyond the literal screen edge.
      const allianceState = useGameStore.getState().myAlliance;
      const revealKm = allianceState ? allianceRevealKm(allianceState.xp ?? 0) : 0;
      // 1° of latitude ≈ 111 km; 1° of longitude shrinks by cos(latitude), so
      // the east/west pad must be widened by that factor to match the true km.
      const kmPerDegLat = 111;
      const midLat = (b.getNorth() + b.getSouth()) / 2;
      const kmPerDegLng = kmPerDegLat * Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
      const padLat = revealKm > 0 ? revealKm / kmPerDegLat : 0;
      const padLng = revealKm > 0 ? revealKm / kmPerDegLng : 0;
      const bounds = {
        north: b.getNorth() + padLat,
        south: b.getSouth() - padLat,
        east: b.getEast() + padLng,
        west: b.getWest() - padLng,
      };
      wsClient.send({
        type: 'viewport_update',
        bounds,
        zoom: m.getZoom(),
      });
      // Remember my own viewport (center + half-diagonal radius — the same
      // geometry the server's relay fan-out uses) so the players panel can
      // sort "near you" against other commanders' views (v0.22.18).
      useGameStore.getState().setMyViewport({
        lat: (bounds.north + bounds.south) / 2,
        lng: (bounds.east + bounds.west) / 2,
        radiusKm: haversineKm(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east },
        ) / 2,
      });
    }, 800);
    m.on('moveend', sendViewport);
    m.on('load', sendViewport);
    sendViewport();

    return () => { m.off('moveend', sendViewport); m.off('zoomend', onZoomEnd); m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly to city when bounds are first set ──
  // ── Animate route dash overlay globally ──
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const interval = setInterval(() => {
      dashPhaseRef.current = (dashPhaseRef.current + 0.25) % 12;
      const dash = rotateDashArray([0.35, 0.65, 0.35, 0.65], dashPhaseRef.current);
      const style = map.current!.getStyle();
      style?.layers?.forEach((layer: any) => {
        const id: string = layer.id;
        if (id.endsWith('-dash') && map.current!.getLayer(id)) {
          try {
            map.current!.setPaintProperty(id, 'line-dasharray', dash);
          } catch {}
        }
      });
    }, 120);
    return () => clearInterval(interval);
  }, [mapLoaded]);

  // ── Fly to city when bounds are first set ──
  useEffect(() => {
    if (!map.current || !mapLoaded || !validMapBounds(mapBounds)) return;
    const key = JSON.stringify(mapBounds);
    if (prevBoundsRef.current === key) return;
    prevBoundsRef.current = key;
    map.current.fitBounds([[mapBounds[0][1], mapBounds[0][0]], [mapBounds[1][1], mapBounds[1][0]]], { padding: 40, duration: 1500 });
  }, [mapBounds, mapLoaded]);

  // ── Remote unit live movement (multiplayer) ──
  useEffect(() => {
    if (!mapLoaded) return;
    const myId = useGameStore.getState().player?.id;

    const un = wsClient.onMessage('unit_position', (msg: any) => {
      if (!msg || msg.type !== 'unit_position') return;
      if (msg.playerId === myId) return; // ignore own broadcasts
      const existing = remoteUnitsRef.current.get(msg.unitId);
      if (existing && msg.seq < existing.seq) return; // stale
      if (existing) {
        existing.from = existing.target;
        existing.target = { lat: msg.lat, lng: msg.lng };
        existing.seq = msg.seq;
        existing.heading = msg.heading;
        existing.at = Date.now();
      } else {
        remoteUnitsRef.current.set(msg.unitId, {
          from: { lat: msg.lat, lng: msg.lng },
          target: { lat: msg.lat, lng: msg.lng },
          seq: msg.seq,
          playerId: msg.playerId,
          heading: msg.heading,
          at: Date.now(),
        });
      }
    });

    // Interpolate positions toward targets and move the ghost markers.
    const raf = () => {
      const now = Date.now();
      if (remoteUnitsRef.current.size === 0) {
        rafId = requestAnimationFrame(raf);
        return;
      }
      // Drop ghosts that stopped streaming (owner left / tab closed).
      for (const [unitId, r] of remoteUnitsRef.current) {
        if (now - r.at > 10000) {
          remoteUnitMarkersRef.current.get(unitId)?.remove();
          remoteUnitMarkersRef.current.delete(unitId);
          remoteUnitsRef.current.delete(unitId);
        }
      }
      const iconFor = (unitId: string) => {
        const nearby = nearbyUnitsRef.current?.find((u: any) => u.id === unitId);
        const cfg = nearby && UNIT_CONFIGS[nearby.type];
        return cfg?.icon || '🚨';
      };
      remoteUnitsRef.current.forEach((r, unitId) => {
        const marker = remoteUnitMarkersRef.current.get(unitId);
        if (!marker) {
          const el = document.createElement('div');
          el.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';
          const inner = document.createElement('div');
          inner.style.cssText = `
            position:absolute; left:50%; top:50%; width:22px; height:22px;
            transform:translate(-50%,-50%) scale(var(--marker-scale, 1));
            background:rgba(148,163,184,0.28); border:2px dashed rgba(255,255,255,0.75);
            border-radius:50%; display:flex; align-items:center; justify-content:center;
            font-size:10px; opacity:0.85; box-shadow:0 2px 6px rgba(0,0,0,0.3);
          `;
          inner.textContent = iconFor(unitId);
          el.appendChild(inner);
          const created = new maplibregl.Marker({ element: el })
            .setLngLat([r.target.lng, r.target.lat])
            .addTo(map.current!);
          remoteUnitMarkersRef.current.set(unitId, created);
          return;
        }
        // Lerp from → target over ~400ms.
        const t = Math.min(1, (now - r.at) / 400);
        const lat = r.from.lat + (r.target.lat - r.from.lat) * t;
        const lng = r.from.lng + (r.target.lng - r.from.lng) * t;
        marker.setLngLat([lng, lat]);
        if (t >= 1) r.from = { ...r.target };
      });
      rafId = requestAnimationFrame(raf);
    };
    let rafId = requestAnimationFrame(raf);

    return () => {
      un();
      cancelAnimationFrame(rafId);
      remoteUnitMarkersRef.current.forEach((m) => m.remove());
      remoteUnitMarkersRef.current.clear();
      remoteUnitsRef.current.clear();
    };
  }, [mapLoaded]);

  const prevFollowRef = useRef<string>('');

  // ── Mission popup: track the marker's screen position + lifecycle ──
  useEffect(() => {
    if (!map.current || !mapLoaded || !popupMission) {
      setPopupPos(null);
      return;
    }
    const update = () => {
      if (!map.current) return;
      const p = map.current.project([popupMission.location.lng, popupMission.location.lat]);
      setPopupPos({ x: p.x, y: p.y });
    };
    update();
    map.current.on('move', update);
    map.current.on('zoom', update);
    map.current.on('resize', update);
    return () => {
      map.current?.off('move', update);
      map.current?.off('zoom', update);
      map.current?.off('resize', update);
    };
  }, [popupMission, mapLoaded]);

  // Close the popup on Escape, or once its mission disappears from the board.
  useEffect(() => {
    if (!popupMission && !popupFacility) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopupMission(null);
        setPopupFacility(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popupMission, popupFacility]);

  useEffect(() => {
    if (popupMission && !missions.some((m) => m.id === popupMission.id)) setPopupMission(null);
  }, [missions, popupMission]);

  // ── Fly to selected unit / dispatch target ──
  useEffect(() => {
    if (!map.current || !mapLoaded || !followTarget) return;
    const key = `${followTarget.lat.toFixed(6)},${followTarget.lng.toFixed(6)}`;
    if (prevFollowRef.current === key) return;
    prevFollowRef.current = key;
    map.current.flyTo({ center: [followTarget.lng, followTarget.lat], zoom: 16, duration: 1000 });
  }, [followTarget, mapLoaded]);

  // ── Update map style ──
  useEffect(() => {
    if (map.current && mapLoaded && prevStyleRef.current !== mapStyle) {
      prevStyleRef.current = mapStyle;
      map.current.setStyle(RASTER_STYLES[mapStyle]);
    }
  }, [mapStyle, mapLoaded]);

  // ── Station markers — diff-based, no flickering ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const currentIds = new Set(stations.map((s) => s.id));

    // Remove deleted
    stationMarkersRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        entry.marker.remove();
        stationMarkersRef.current.delete(id);
      }
    });

    // Add or update
    stations.forEach((station) => {
      const config = STATION_CONFIGS[station.type] || STATION_CONFIGS.fire_station;
      const isSelected = station.id === selectedStationId;
      const existing = stationMarkersRef.current.get(station.id);
      const themeColor = stationThemeFor(station.themeId).markerColor;

      if (existing) {
        // Only recreate if selection/theme/level/name changed (renames refresh
        // the marker tooltip).
        if (existing.station.level !== station.level || existing.station.themeId !== station.themeId || existing.station.name !== station.name || (existing.station.id === selectedStationId) !== isSelected) {
          existing.marker.remove();
          stationMarkersRef.current.delete(station.id);
        } else {
          existing.station = station; // keep the diff snapshot fresh
          return; // No change, keep existing
        }
      }

      const el = document.createElement('div');
      el.style.cssText = `
        position:relative; width:0; height:0; cursor:pointer; pointer-events:auto;
      `;
      el.title = station.name;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setPopupMission(null);
        selectStation(isSelected ? null : station.id);
        onStationClickRef.current?.(station);
      });

      const inner = document.createElement('div');
      inner.style.cssText = `
        position:absolute; left:50%; top:50%;
        width:${isSelected ? 44 : 36}px; height:${isSelected ? 44 : 36}px;
        transform:translate(-50%,-50%) scale(calc(var(--marker-scale, 1) * ${isSelected ? 1.2 : 1}));
        background:${themeColor};
        border:3px solid ${isSelected ? '#FCD34D' : '#ffffff'};
        border-radius:50%; display:flex; align-items:center; justify-content:center;
        font-size:${isSelected ? 20 : 16}px;
        box-shadow:0 4px 12px rgba(0,0,0,0.4); transition:all 0.2s;
      `;
      inner.textContent = config.icon;
      el.appendChild(inner);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([station.position.lng, station.position.lat])
        .addTo(map.current!);
      stationMarkersRef.current.set(station.id, { marker, station });
    });
  }, [stations, selectedStationId, mapLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── City Hospital marker (v0.22.9) — the ER EMS units transport victims to ──
  // Only renders where the commander BUILT the hospital (v0.22.12).
  useEffect(() => {
    if (!map.current || !mapLoaded || !hospital) return;

    const { patients } = useGameStore.getState();
    const occupied = hospitalOccupancy(patients);

    const el = document.createElement('div');
    el.style.cssText = 'position:relative; width:0; height:0; cursor:pointer; pointer-events:auto;';
    el.title = `${hospital.name} — ${occupied}/${hospital.beds} beds occupied`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      setPopupMission(null);
      setPopupPoi(null);
      // Facility popover (v0.22.13) — ER stats + rename at the marker.
      const p = map.current!.project([hospital.position.lng, hospital.position.lat]);
      setPopupFacility('hospital');
      setFacilityPopupPos({ x: p.x, y: p.y });
    });

    const inner = document.createElement('div');
    inner.style.cssText = `
      position:absolute; left:50%; top:50%; width:38px; height:38px;
      transform:translate(-50%,-50%) scale(calc(var(--marker-scale, 1)));
      background:#065f46; border:3px solid #34d399;
      border-radius:10px; display:flex; align-items:center; justify-content:center;
      font-size:18px; box-shadow:0 4px 12px rgba(0,0,0,0.4);
    `;
    inner.textContent = '🏥';
    el.appendChild(inner);

    // Name tag under the puck so the ER reads at a glance (renamed name live).
    const tag = document.createElement('div');
    tag.style.cssText = `
      position:absolute; left:50%; top:calc(100% + 2px); transform:translateX(-50%);
      background:rgba(2,6,23,0.85); border:1px solid rgba(52,211,153,0.35); color:#a7f3d0;
      font:600 9px/1 'Inter', sans-serif; white-space:nowrap; padding:2px 6px; border-radius:6px;
      pointer-events:none;
    `;
    tag.textContent = hospital.name.length > 18 ? `${hospital.name.slice(0, 18)}…` : hospital.name;
    el.appendChild(tag);

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([hospital.position.lng, hospital.position.lat])
      .addTo(map.current!);

    return () => {
      marker.remove();
    };
  }, [mapLoaded, hospital]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helipad marker (v0.22.11) — the air-ambulance landing zone ──
  // Renders only where the commander PLACED it (v0.22.12) — the pad is a
  // separate player-placed build, not auto-derived from the ER.
  useEffect(() => {
    if (!map.current || !mapLoaded || !helipad) return;

    const el = document.createElement('div');
    el.style.cssText = 'position:relative; width:0; height:0; cursor:pointer; pointer-events:auto;';
    el.title = `${helipad.name} — air-ambulance landing zone`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      setPopupMission(null);
      setPopupPoi(null);
      // Facility popover (v0.22.13) — landing-zone stats + rename at the pad.
      const p = map.current!.project([helipad.position.lng, helipad.position.lat]);
      setPopupFacility('helipad');
      setFacilityPopupPos({ x: p.x, y: p.y });
    });

    const inner = document.createElement('div');
    inner.style.cssText = `
      position:absolute; left:50%; top:50%; width:22px; height:22px;
      transform:translate(-50%,-50%) scale(calc(var(--marker-scale, 1)));
      background:rgba(2,6,23,0.8); border:1.5px dashed #fbbf24;
      border-radius:50%; display:flex; align-items:center; justify-content:center;
      font-size:11px; box-shadow:0 0 8px rgba(251,191,36,0.25);
    `;
    inner.textContent = '🚁';
    el.appendChild(inner);

    // Small tag under the pad so the landing zone reads at a glance (renamed).
    const tag = document.createElement('div');
    tag.style.cssText = `
      position:absolute; left:50%; top:calc(100% + 2px); transform:translateX(-50%);
      background:rgba(2,6,23,0.85); border:1px solid rgba(251,191,36,0.35); color:#fde68a;
      font:600 8px/1 'Inter', sans-serif; white-space:nowrap; padding:2px 6px; border-radius:6px;
      pointer-events:none;
    `;
    tag.textContent = helipad.name.length > 18 ? `${helipad.name.slice(0, 18)}…` : helipad.name;
    el.appendChild(tag);

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([helipad.position.lng, helipad.position.lat])
      .addTo(map.current!);

    return () => {
      marker.remove();
    };
  }, [mapLoaded, helipad]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── POI markers (v0.22.10) — named places under the missions ──
  // Only PLAYER-PLACED landmarks render (v0.22.12); small, subdued pucks so
  // live calls always out-shout them; hover shows the name, click opens the
  // POI popover (what's here + active incidents).
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const pois = placedPois;
    const markers = pois.map((poi) => {
      const meta = POI_TYPE_META[poi.type];
      const el = document.createElement('div');
      el.style.cssText = 'position:relative; width:0; height:0; cursor:pointer; pointer-events:auto;';
      el.title = `${poi.name} — ${meta.label}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setPopupMission(null);
        setPopupPoi(poi);
        const p = map.current!.project([poi.position.lng, poi.position.lat]);
        setPoiPopupPos({ x: p.x, y: p.y });
      });
      const inner = document.createElement('div');
      inner.style.cssText = `
        position:absolute; left:50%; top:50%; width:26px; height:26px;
        transform:translate(-50%,-50%) scale(calc(var(--marker-scale, 1)));
        background:rgba(15,23,42,0.7); border:1.5px solid ${meta.color};
        border-radius:8px; display:flex; align-items:center; justify-content:center;
        font-size:12px; box-shadow:0 1px 4px rgba(0,0,0,0.3);
        pointer-events:auto;
      `;
      inner.textContent = meta.icon;
      el.appendChild(inner);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([poi.position.lng, poi.position.lat])
        .addTo(map.current!);
      return marker;
    });
    return () => { markers.forEach((marker) => marker.remove()); };
  }, [mapLoaded, placedPois]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mission markers — diff-based, no flickering, clustered below CLUSTER_ZOOM ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const m = map.current;
    const bounds = m.getBounds();
    const center = bounds.getCenter();
    const maxMarkers = 60;

    const sorted = [...missions]
      .map((mission) => ({
        ...mission,
        _dist: Math.hypot(mission.location.lng - center.lng, mission.location.lat - center.lat),
      }))
      .sort((a, b) => {
        if (a.timeRemaining < 120 && b.timeRemaining >= 120) return -1;
        if (b.timeRemaining < 120 && a.timeRemaining >= 120) return 1;
        return a._dist - b._dist;
      })
      .slice(0, maxMarkers);

    const visibleIds = new Set(sorted.map((mission) => mission.id));
    if (selectedMissionId) visibleIds.add(selectedMissionId);

    // Selected mission stays in the pool even when far away.
    const pool = selectedMissionId && !visibleIds.has(selectedMissionId)
      ? [...sorted, missions.find((mission) => mission.id === selectedMissionId)!].filter(Boolean)
      : sorted;

    // Below CLUSTER_ZOOM group nearby pins into screen-space clusters; the
    // selected mission is always rendered solo so a selection never vanishes.
    const zoom = m.getZoom();
    const exclude: Set<string> = selectedMissionId ? new Set([selectedMissionId]) : new Set();
    const desired = new Map<string, ScreenCluster>();
    if (zoom < CLUSTER_ZOOM) {
      for (const c of clusterMissionsOnScreen(m, pool, exclude)) desired.set(c.key, c);
    } else {
      for (const mission of pool) {
        desired.set(mission.id, { key: mission.id, point: [mission.location.lng, mission.location.lat], members: [mission] });
      }
    }
    if (selectedMissionId) {
      const sel = pool.find((mission) => mission.id === selectedMissionId);
      if (sel) desired.set(sel.id, { key: sel.id, point: [sel.location.lng, sel.location.lat], members: [sel] });
    }

    // Remove clusters/markers that disappeared (resolved, out of view, split/merged).
    missionMarkersRef.current.forEach((entry, key) => {
      if (!desired.has(key)) {
        entry.marker.remove();
        missionMarkersRef.current.delete(key);
      }
    });

    desired.forEach((cluster, key) => {
      const isCluster = cluster.members.length > 1;
      const mission = cluster.members[0];
      const isSelected = !isCluster && mission.id === selectedMissionId;
      const isUrgent = !isCluster && mission.timeRemaining < 120;
      const isAllianceShared = !isCluster && mission.allianceShared === true;
      const existing = missionMarkersRef.current.get(key);

      if (existing) {
        const sameShape =
          existing.isCluster === isCluster &&
          existing.memberSig === cluster.key &&
          existing.urgent === isUrgent &&
          existing.selected === isSelected;
        if (sameShape) {
          // Just update position if the group moved (no flicker).
          existing.marker.setLngLat(cluster.point);
          return;
        }
        existing.marker.remove();
        missionMarkersRef.current.delete(key);
      }

      const el = document.createElement('div');
      el.style.cssText = `
        position:relative; width:0; height:0; cursor:pointer; pointer-events:auto;
      `;

      if (isCluster) {
        // Cluster pill: most-urgent category icon + count; click zooms in to split.
        const mostUrgent = [...cluster.members].sort((a, b) => a.timeRemaining - b.timeRemaining)[0];
        const icon = CATEGORY_ICONS[mostUrgent.category || 'fire'] || '🚨';
        el.title = `${cluster.members.length} calls nearby: ${cluster.members.map((x) => x.name).join(', ')}`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setPopupMission(null);
          m.easeTo({ zoom: Math.max(CLUSTER_ZOOM + 0.5, m.getZoom() + 1.4), duration: 500 });
        });
        const inner = document.createElement('div');
        inner.style.cssText = `
          position:absolute; left:50%; top:50%;
          min-width:30px; height:30px; padding:0 7px;
          transform:translate(-50%,-50%) scale(calc(var(--marker-scale, 1)));
          background:#111827; color:#F9FAFB;
          border:2px solid #F59E0B; border-radius:9999px;
          display:flex; align-items:center; justify-content:center; gap:4px;
          font-size:12px; font-weight:700;
          box-shadow:0 2px 8px rgba(0,0,0,0.45);
          pointer-events:auto; white-space:nowrap;
        `;
        const iconSpan = document.createElement('span');
        iconSpan.textContent = icon;
        iconSpan.style.fontSize = '11px';
        inner.appendChild(iconSpan);
        inner.appendChild(document.createTextNode(String(cluster.members.length)));
        el.appendChild(inner);
      } else {
        // POI-anchored call: hover names the place too (v0.22.10) — only
        // player-placed landmarks (v0.22.12).
        const anchor = mission.poiId ? poiById(placedPois, mission.poiId) : null;
        el.title = anchor ? `${mission.name} — ${anchor.name}` : mission.name;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          selectMission(isSelected ? null : mission.id);
          setPopupMission(isSelected ? null : mission);
        });
        const inner = document.createElement('div');
        // Alliance-shared missions get a purple glow; urgent missions get red pulse;
        // normal missions are amber.
        const markerBg = isAllianceShared ? '#7C3AED' : isUrgent ? '#EF4444' : '#F59E0B';
        const markerBorder = isAllianceShared ? 'rgba(167,139,250,0.7)' : isSelected ? '#ffffff' : 'rgba(255,255,255,0.5)';
        const markerAnim = isAllianceShared ? 'alliancePulse 2s infinite' : isUrgent ? 'missionPulse 1.5s infinite' : 'none';
        inner.style.cssText = `
          position:absolute; left:50%; top:50%;
          width:${isSelected ? 32 : 22}px; height:${isSelected ? 32 : 22}px;
          transform:translate(-50%,-50%) scale(calc(var(--marker-scale, 1) * ${isSelected ? 1.2 : 1}));
          background:${markerBg};
          border:2px solid ${markerBorder};
          border-radius:5px; display:flex; align-items:center; justify-content:center;
          font-size:${isSelected ? 14 : 10}px;
          box-shadow:0 2px 6px rgba(0,0,0,0.3); transition:all 0.15s;
          animation:${markerAnim};
          pointer-events:auto;
        `;
        inner.textContent = CATEGORY_ICONS[mission.category || 'fire'] || '🔥';
        el.appendChild(inner);
      }

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(cluster.point)
        .addTo(m);
      missionMarkersRef.current.set(key, {
        marker,
        mission: isCluster ? undefined : mission,
        memberSig: cluster.key,
        urgent: isUrgent,
        selected: isSelected,
        isCluster,
      });
    });
  }, [missions, selectedMissionId, mapLoaded, zoomBump, placedPois]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unit markers — diff-based, no flickering ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Air-ambulance units (v0.22.11 + v0.22.18): two airborne states render as
    // helicopters with the amber flight ring + flight path — (1) a unit mid-
    // airlift carrying a critical patient, on EITHER leg of the flight (scene →
    // helipad → hospital ER; isAirborneTransport stays true across the pad
    // flip, so the second-leg hospital run renders amber like the first), and
    // (2) a unit flying OUT to an airlift-capable callout (Remote Rescue /
    // Highway Trauma) because a helipad exists: the whole call is flown, so
    // the response leg is airborne too. Computed from live missions + store.
    const airLiftUnitIds = new Set<string>();
    const helipad = useGameStore.getState().helipad;
    missions.forEach((m) => {
      if (isAirborneTransport(m) && m.status === 'en_route') {
        m.assignedUnits.forEach((id) => airLiftUnitIds.add(id));
      } else if (helipad && isAirliftMission(m) && m.status === 'en_route') {
        m.assignedUnits.forEach((id) => airLiftUnitIds.add(id));
      }
    });

    // Only show units actively in the field; available units are hidden inside their station
    const currentIds = new Set(units.filter(u => u.position && u.status !== 'available').map((u) => u.id));

    unitMarkersRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        entry.marker.remove();
        unitMarkersRef.current.delete(id);
      }
    });

    units.forEach((unit) => {
      if (!unit.position || unit.status === 'available') return;
      const pos = unit.position;
      const isEnRoute = unit.status === 'en_route';
      const isOnScene = unit.status === 'on_scene';
      const isAirlift = airLiftUnitIds.has(unit.id);

      const existing = unitMarkersRef.current.get(unit.id);
      if (existing) {
        const oldStatus = existing.unit.status;
        // Unit marker diff—update the live ETA chip and name callout without recreating.
        if (oldStatus !== unit.status || existing.unit.liveryId !== unit.liveryId || existing.airLift !== isAirlift) {
          existing.marker.remove();
          unitMarkersRef.current.delete(unit.id);
        } else {
          existing.marker.setLngLat([pos.lng, pos.lat]);
          if (existing.etaLabel) {
            // Air transports carry a ✈️ air-strike ETA chip (amber) — same
            // timer as road units, but readable as airborne at a glance.
            const etaCore = isEnRoute && unit.eta != null && unit.eta > 0
              ? formatTimer(unit.eta, { compact: true })
              : isOnScene ? 'ON SCENE' : unit.status === 'patrolling' ? 'PATROL' : '';
            const etaText = etaCore && existing.airLift ? `✈️ ${etaCore}` : etaCore;
            existing.etaLabel.textContent = etaText;
            existing.etaLabel.style.display = etaText ? 'flex' : 'none';
          }
          if (existing.nameLabel && existing.unit.name !== unit.name) {
            existing.nameLabel.textContent = unit.name;
          }
          existing.unit = unit;
          return;
        }
      }

      const unitConfig = UNIT_CONFIGS[unit.type];
      // Airlifted units render as helicopters with an amber flight ring (v0.22.11).
      const icon = isAirlift ? '🚁' : (unitConfig?.icon || '🚛');
      const ringColor = isAirlift ? '#FBBF24' : isOnScene ? '#EF4444' : isEnRoute ? '#22D3EE' : '#22C55E';
      // Livery colors the puck (status keeps its ring color for readability).
      const livery = liveryFor(getUnitServiceType(unit.type), unit.liveryId);
      const bodyColor = isAirlift ? '#92400E' : isOnScene ? '#B91C1C' : isEnRoute ? '#0EA5E9' : livery.markerColor;

      // Root marker element (MapLibre owns transform here)
      const el = document.createElement('div');
      el.style.cssText = `
        position:relative; width:0; height:0; cursor:pointer; pointer-events:auto;
      `;
      el.title = isAirlift
        ? `${unit.name} — AIR AMBULANCE (critical transport)`
        : `${unit.name} — ${unit.status.replace('_', ' ')}`;

      // Inner scaled container centered on the coordinate
      const inner = document.createElement('div');
      inner.style.cssText = `
        position:absolute; left:50%; top:50%;
        width:34px; height:34px;
        transform:translate(-50%,-50%) scale(var(--marker-scale, 1));
        display:flex; align-items:center; justify-content:center;
      `;

      // Outer pulsing glow ring (en_route / on_scene only)
      if (isEnRoute || isOnScene) {
        const ring = document.createElement('div');
        ring.style.cssText = `
          position:absolute; inset:-6px; border-radius:50%;
          border:2px solid ${ringColor};
          box-shadow:0 0 12px 2px ${ringColor}88;
          animation:${isOnScene ? 'unitPulseScene 1.1s infinite' : 'unitPulseRoute 1s infinite'};
          opacity:0.9;
        `;
        inner.appendChild(ring);
      }

      // Solid body puck
      const body = document.createElement('div');
      body.style.cssText = `
        position:relative; z-index:2;
        width:30px; height:30px; border-radius:50%;
        background:${bodyColor};
        border:3px solid #ffffff;
        display:flex; align-items:center; justify-content:center;
        font-size:15px; line-height:1;
        box-shadow:0 3px 8px rgba(0,0,0,0.55);
      `;
      body.textContent = icon;
      inner.appendChild(body);

      // Unit name callout above the puck
      const nameLabel = document.createElement('div');
      nameLabel.style.cssText = `
        position:absolute; top:-42px; left:50%; transform:translateX(-50%);
        z-index:10; padding:2px 7px; border-radius:999px;
        background:#0B1220; border:1px solid rgba(255,255,255,0.55);
        color:#ffffff; font-size:9px; font-weight:700; white-space:nowrap;
        box-shadow:0 2px 5px rgba(0,0,0,0.5); pointer-events:none;
      `;
      nameLabel.textContent = unit.name;
      inner.appendChild(nameLabel);

      // Live ETA / status chip below the puck. Air transports (v0.22.14) get
      // an amber air-strike chip with a ✈️ prefix so airborne reads differently
      // from road units at a glance — same formatTimer underneath.
      const etaLabel = document.createElement('div');
      const etaCore = isEnRoute && unit.eta != null && unit.eta > 0
        ? formatTimer(unit.eta, { compact: true })
        : isOnScene ? 'ON SCENE' : unit.status === 'patrolling' ? 'PATROL' : '';
      const etaText = etaCore && isAirlift ? `✈️ ${etaCore}` : etaCore;
      etaLabel.style.cssText = `
        position:absolute; top:34px; left:50%; transform:translateX(-50%);
        z-index:3; padding:1px 6px; border-radius:999px;
        background:${isAirlift ? '#451A03' : '#0B1220'}; border:1px solid ${isAirlift ? '#FBBF24dd' : `${ringColor}cc`};
        color:#ffffff; font-size:9px; font-weight:700; white-space:nowrap;
        box-shadow:0 2px 5px rgba(0,0,0,0.5); pointer-events:none;
        display:${etaText ? 'flex' : 'none'}; align-items:center; gap:3px;
      `;
      etaLabel.textContent = etaText;
      inner.appendChild(etaLabel);

      el.appendChild(inner);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setPopupMission(null);
        onUnitClickRef.current?.(unit);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map.current!);
      unitMarkersRef.current.set(unit.id, { marker, unit, etaLabel, nameLabel, airLift: isAirlift });
    });

    // ── GPS route line: glowing casing + cyan core + white "live" dash overlay ──
    // Two-tone: dim "traveled" behind the unit, bright "remaining" ahead, so it
    // reads like a live navigation line. Source updated in place (no flicker).
    // Both dispatched units (OSRM route) and patrolling units (their patrol loop)
    // render identically, so patrol GPS matches a unit responding to a call.
    const gpsUnits: { unit: Unit; waypoints: GeoPoint[]; progress: number }[] = [];
    units.forEach((u) => {
      if (!u.position) return;
      if (u.status === 'en_route' && u.waypoints && u.waypoints.length >= 2) {
        // Progress along the dispatch route (0..1) derived from ETA/etaTotal.
        const eta = u.eta ?? u.etaTotal ?? 0;
        const etaTotal = u.etaTotal ?? eta;
        gpsUnits.push({ unit: u, waypoints: u.waypoints, progress: etaTotal > 0 ? 1 - eta / etaTotal : 0 });
      } else if (u.status === 'patrolling' && u.patrolRouteId) {
        const patrol = patrolRoutes.find((r) => r.id === u.patrolRouteId);
        if (patrol && patrol.waypoints.length >= 2) {
          const patrolProgress = u.patrolProgress ?? ((u.patrolWaypointIndex ?? 0) / Math.max(1, patrol.waypoints.length - 1));
          gpsUnits.push({
            unit: u,
            waypoints: patrol.waypoints.map(([lat, lng]) => ({ lat, lng })),
            progress: Number.isFinite(patrolProgress) ? patrolProgress : 0,
          });
        }
      }
    });

    // ── Coalesced GPS route lines (v0.21.0) ──
    // Two shared GeoJSON sources hold one LineString feature per moving unit, so
    // a full fleet renders with exactly 5 layers instead of 5 per unit. Paint
    // styles are uniform across units, so nothing is lost by sharing. Sources
    // update in place each tick — no flicker. Patrol GPS runs through the same
    // pipeline as dispatch routes, so patrol matches a unit responding to a call.
    // Air transports (v0.22.14): airborne units fly their own route pipeline —
    // amber traveled + amber remaining + white dash — so the flight path reads
    // differently from road responses (cyan) at a glance. They are excluded
    // from the shared road sources so nothing renders twice.
    const traveledFeatures: GeoJSON.Feature[] = [];
    const remainFeatures: GeoJSON.Feature[] = [];
    const airTraveledFeatures: GeoJSON.Feature[] = [];
    const airRemainFeatures: GeoJSON.Feature[] = [];
    gpsUnits.forEach(({ unit, waypoints: unitWps, progress }) => {
      if (unitWps.length < 2) return;
      const isAir = airLiftUnitIds.has(unit.id);
      const { traveled, remaining } = splitPathByProgress(unitWps, Math.max(0, Math.min(1, progress)));
      const toCoords = (pts: GeoPoint[]): [number, number][] => pts.map((p) => [p.lng, p.lat]);
      const traveledCoords = toCoords(traveled);
      const remainCoords = toCoords(remaining);
      if (traveledCoords.length >= 2) {
        (isAir ? airTraveledFeatures : traveledFeatures).push({
          type: 'Feature',
          properties: { unitId: unit.id },
          geometry: { type: 'LineString' as const, coordinates: traveledCoords },
        });
      }
      if (remainCoords.length >= 2) {
        (isAir ? airRemainFeatures : remainFeatures).push({
          type: 'Feature',
          properties: { unitId: unit.id },
          geometry: { type: 'LineString' as const, coordinates: remainCoords },
        });
      }
    });

    const fc = (features: GeoJSON.Feature[]): any => ({ type: 'FeatureCollection', features });
    const ensureSharedSource = (id: string, features: GeoJSON.Feature[]) => {
      const existing = map.current!.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (existing) existing.setData(fc(features));
      else map.current!.addSource(id, { type: 'geojson', data: fc(features) });
    };
    const ensureSharedLayer = (id: string, sourceId: string, paint: Record<string, unknown>) => {
      if (map.current!.getLayer(id)) return;
      try {
        map.current!.addLayer({
          id,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint,
        });
      } catch {}
    };

    ensureSharedSource('route-traveled', traveledFeatures);
    ensureSharedSource('route-remain', remainFeatures);
    ensureSharedLayer('route-traveled-cased', 'route-traveled', {
      'line-color': '#64748B', 'line-width': 7, 'line-opacity': 0.28, 'line-blur': 2,
    });
    ensureSharedLayer('route-traveled-core', 'route-traveled', {
      'line-color': '#94A3B8', 'line-width': 3, 'line-opacity': 0.55,
    });
    ensureSharedLayer('route-remain-glow', 'route-remain', {
      'line-color': '#22D3EE', 'line-width': 10, 'line-opacity': 0.18, 'line-blur': 6,
    });
    ensureSharedLayer('route-remain-line', 'route-remain', {
      'line-color': '#22D3EE', 'line-width': 4.5, 'line-opacity': 0.95,
    });
    ensureSharedLayer('route-remain-dash', 'route-remain', {
      'line-color': '#ffffff', 'line-width': 4.5, 'line-opacity': 0.9,
      'line-dasharray': rotateDashArray([0.5, 0.4, 0.5, 1.6], dashPhaseRef.current),
    });

    // ── Air transport flight path (v0.22.14) — amber, above the road layers ──
    // Distinct palette for airborne EMS transports: dim amber for the traveled
    // leg, bright amber glow + white dash for the remaining flight.
    ensureSharedSource('route-air-traveled', airTraveledFeatures);
    ensureSharedSource('route-air-remain', airRemainFeatures);
    ensureSharedLayer('route-air-traveled-line', 'route-air-traveled', {
      'line-color': '#B45309', 'line-width': 3, 'line-opacity': 0.6,
    });
    ensureSharedLayer('route-air-glow', 'route-air-remain', {
      'line-color': '#FBBF24', 'line-width': 12, 'line-opacity': 0.22, 'line-blur': 6,
    });
    ensureSharedLayer('route-air-line', 'route-air-remain', {
      'line-color': '#FBBF24', 'line-width': 5, 'line-opacity': 0.95,
    });
    ensureSharedLayer('route-air-dash', 'route-air-remain', {
      'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.9,
      'line-dasharray': rotateDashArray([0.5, 0.4, 0.5, 1.6], dashPhaseRef.current),
    });

    // Pulsing DOM markers at the head of each remaining route (kept per-unit).
    // Air transports pulse amber to match their flight path; road units cyan.
    gpsUnits.forEach(({ unit, waypoints: unitWps, progress }) => {
      if (unitWps.length < 2) return;
      const { remaining } = splitPathByProgress(unitWps, Math.max(0, Math.min(1, progress)));
      const lead = remaining[0];
      const leadColor = airLiftUnitIds.has(unit.id) ? '#FBBF24' : '#22D3EE';
      const existingLead = routeLeadMarkersRef.current.get(unit.id);
      if (existingLead) {
        existingLead.marker.setLngLat(lead);
        // Air status can change mid-run (road → airborne at transport start) —
        // repaint the pulse so the lead matches the flight path, not the road.
        if (existingLead.pulse.style.borderColor !== leadColor) {
          existingLead.pulse.style.borderColor = leadColor;
          existingLead.pulse.style.boxShadow = `0 0 10px 2px ${leadColor}88`;
          existingLead.core.style.borderColor = leadColor;
        }
      } else {
        const el = document.createElement('div');
        el.style.cssText = 'position:relative; width:0; height:0; pointer-events:none;';
        const inner = document.createElement('div');
        inner.style.cssText = `
          position:absolute; left:50%; top:50%;
          width:16px; height:16px; transform:translate(-50%,-50%);
        `;
        const pulse = document.createElement('div');
        pulse.style.cssText = `
          position:absolute; inset:-4px; border-radius:50%;
          border:2px solid ${leadColor};
          box-shadow:0 0 10px 2px ${leadColor}88;
          animation:leadPulse 1.1s infinite;
        `;
        const core = document.createElement('div');
        core.style.cssText = `
          position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
          width:8px; height:8px; border-radius:50%;
          background:#ffffff; border:1.5px solid ${leadColor};
        `;
        inner.appendChild(pulse);
        inner.appendChild(core);
        el.appendChild(inner);
        const marker = new maplibregl.Marker({ element: el }).setLngLat(lead).addTo(map.current!);
        routeLeadMarkersRef.current.set(unit.id, { marker, pulse, core });
      }
    });

    // Cleanup lead markers for units no longer moving — the shared route layers
    // simply drop their features on the next tick, so no per-unit cleanup needed.
    const activeUnitIds = new Set(units.filter(u => u.status === 'en_route' || u.status === 'patrolling').map(u => u.id));
    routeLeadMarkersRef.current.forEach((entry, id) => {
      if (!activeUnitIds.has(id)) {
        entry.marker.remove();
        routeLeadMarkersRef.current.delete(id);
      }
    });
  }, [units, mapLoaded, missions]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── Idle patrol routes: faint dashed line for routes whose assigned units are
  // NOT currently moving (rest break at the station, returning, or dispatched to
  // a call). Active patrols render their live GPS line in the effect above, so
  // this only shows the planned beat while nobody is actively riding it. ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const idleRoutes = (patrolRoutes || []).filter((r) =>
      r.active &&
      !r.assignedUnits.some((id) => units.some((u) => u.id === id && u.status === 'patrolling'))
    );
    const idleIds = new Set(idleRoutes.map((r) => r.id));

    idleRoutes.forEach((route) => {
      const sourceId = `patrol-${route.id}`;
      const layerId = `${sourceId}-line`;
      if (!map.current!.getSource(sourceId)) {
        map.current!.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
        });
        map.current!.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': 'rgba(59, 130, 246, 0.4)',
            'line-width': 2.5,
            'line-dasharray': [3, 3],
            'line-opacity': 0.55,
          },
        });
      }
      const coords = route.waypoints.map(([lat, lng]) => [lng, lat]);
      if (coords.length >= 2) {
        (map.current!.getSource(sourceId) as maplibregl.GeoJSONSource)?.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
    });

    try {
      const style = map.current!.getStyle();
      style.layers?.forEach((layer: any) => {
        if (layer.id.startsWith('patrol-') && layer.id.endsWith('-line')) {
          const routeId = layer.id.replace('patrol-', '').replace(/-line$/, '');
          if (!idleIds.has(routeId)) {
            try { map.current!.removeLayer(layer.id); } catch {}
            const sourceId = `patrol-${routeId}`;
            if (map.current!.getSource(sourceId)) try { map.current!.removeSource(sourceId); } catch {}
          }
        }
      });
    } catch {}
  }, [patrolRoutes, units, mapLoaded]);

  // ── Crime-heat zone overlay — heat-colored neighborhood fills ──
  // Layers are created/removed here (rare); heat data updates in a second effect
  // keyed on missions so the overlay isn't torn down on every mission tick.
  // v0.18.0: the colorblindHeat setting swaps the green→red ramp for a
  // perceptually-uniform blue→orange ramp (deuteranopia/protanopia safe).
  const heatRamp = (cb: boolean): any =>
    cb
      ? [
          'interpolate', ['linear'], ['get', 'heat'],
          0, 'rgba(59, 130, 246, 0.26)',
          4, 'rgba(147, 51, 234, 0.34)',
          8, 'rgba(249, 115, 22, 0.5)',
        ]
      : [
          'interpolate', ['linear'], ['get', 'heat'],
          0, 'rgba(34, 197, 94, 0.22)',
          4, 'rgba(234, 179, 8, 0.34)',
          8, 'rgba(239, 68, 68, 0.46)',
        ];
  const colorblindHeat = loadSettings().colorblindHeat;
  useEffect(() => {
    if (!map.current || !mapLoaded || !showPatrolHeat || !mapBounds) return;

    const boundary = selectedCity?.boundary ?? null;
    const zones = patrolZonesForCity({ bounds: mapBounds, boundary });

    const draw = () => {
      const m = map.current;
      if (!m) return;
      const srcId = 'patrol-heat';
      const fillId = 'patrol-heat-fill';
      const lineId = 'patrol-heat-line';
      try {
        if (!m.getSource(srcId)) {
          m.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addLayer({
            id: fillId,
            type: 'fill',
            source: srcId,
            paint: {
              'fill-color': heatRamp(colorblindHeat),
              'fill-opacity': 0.9,
            },
          });
          m.addLayer({
            id: lineId,
            type: 'line',
            source: srcId,
            layout: { 'line-join': 'round' },
            paint: { 'line-color': 'rgba(255,255,255,0.18)', 'line-width': 1 },
          });
        }
        // Pull fresh missions so styledata redraws don't serve stale heat.
        const live = useGameStore.getState();
        const heat = computeZoneHeat(zones, live.missions);

        (m.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
          type: 'FeatureCollection',
          features: heatFeatures(zones, heat) as any,
        });
      } catch {}
    };

    draw();
    map.current.on('styledata', draw);
    return () => {
      map.current?.off('styledata', draw);
      try {
        if (map.current?.getLayer('patrol-heat-fill')) map.current.removeLayer('patrol-heat-fill');
        if (map.current?.getLayer('patrol-heat-line')) map.current.removeLayer('patrol-heat-line');
        if (map.current?.getSource('patrol-heat')) map.current.removeSource('patrol-heat');
      } catch {}
    };
  }, [showPatrolHeat, mapBounds, mapLoaded, selectedCity]);

  // Keep the heat overlay data fresh as missions move/complete, and re-apply the
  // palette when the colorblind setting changes.
  useEffect(() => {
    if (!map.current || !mapLoaded || !showPatrolHeat || !mapBounds) return;
    const src = map.current.getSource('patrol-heat') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const boundary = selectedCity?.boundary ?? null;
    const zones = patrolZonesForCity({ bounds: mapBounds, boundary });
    const heat = computeZoneHeat(zones, missions);
    try {
      src.setData({ type: 'FeatureCollection', features: heatFeatures(zones, heat) as any });
      map.current.setPaintProperty('patrol-heat-fill', 'fill-color', heatRamp(colorblindHeat));
    } catch {}
  }, [missions, showPatrolHeat, mapBounds, mapLoaded, selectedCity, colorblindHeat]);

  // ── Coverage-gap overlay — neighborhoods beyond every station's reach ──
  // Renders zones with little/no station coverage as red (full gap) or amber
  // (partial) shading so commanders see exactly where a new station is needed.
  // Pairs with the Station Coverage toggle: circles show your reach, this shows
  // the holes. Same rare-effect + styledata-refresh pattern as the circles.
  useEffect(() => {
    if (!map.current || !mapLoaded || !showCoverageGap) return;
    const srcId = 'coverage-gap';
    const fillId = 'coverage-gap-fill';
    const lineId = 'coverage-gap-line';
    const draw = () => {
      const m = map.current;
      if (!m) return;
      try {
        if (!m.getSource(srcId)) {
          m.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addLayer({
            id: fillId,
            type: 'fill',
            source: srcId,
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 1 },
          });
          m.addLayer({
            id: lineId,
            type: 'line',
            source: srcId,
            layout: { 'line-join': 'round' },
            paint: {
              'line-color': ['match', ['get', 'severity'], 'full', '#EF4444', '#F59E0B'],
              'line-width': 1.5,
              'line-opacity': 0.6,
              'line-dasharray': [2, 2],
            },
          });
        }
        const st = useGameStore.getState();
        if (!st.mapBounds) return;
        const zones = patrolZonesForCity({ bounds: st.mapBounds, boundary: st.selectedCity?.boundary ?? null });
        (m.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
          type: 'FeatureCollection',
          features: gapFeatures(zones, st.stations) as any,
        });
      } catch {}
    };
    draw();
    map.current.on('styledata', draw);
    return () => {
      map.current?.off('styledata', draw);
      try {
        if (map.current?.getLayer(fillId)) map.current.removeLayer(fillId);
        if (map.current?.getLayer(lineId)) map.current.removeLayer(lineId);
        if (map.current?.getSource(srcId)) map.current.removeSource(srcId);
      } catch {}
    };
  }, [showCoverageGap, stations, mapBounds, selectedCity, mapLoaded]);

  // ── Station coverage overlay — each station's effective response radius ──
  // Subtle service-tinted circles drawn from the live coverageRadius (which
  // already includes the Response Radius perk). Stations change rarely (build /
  // upgrade / perk pick), so a single effect both creates and refreshes the
  // layers — no per-tick data effect needed. Toggled from the top bar.
  useEffect(() => {
    if (!map.current || !mapLoaded || !showStationCoverage) return;
    const srcId = 'station-coverage';
    const fillId = 'station-coverage-fill';
    const lineId = 'station-coverage-line';
    const draw = () => {
      const m = map.current;
      if (!m) return;
      try {
        if (!m.getSource(srcId)) {
          m.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          m.addLayer({
            id: fillId,
            type: 'fill',
            source: srcId,
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': 0.14,
            },
          });
          m.addLayer({
            id: lineId,
            type: 'line',
            source: srcId,
            layout: { 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 1.5,
              'line-opacity': 0.55,
            },
          });
        }
        const live = useGameStore.getState();
        (m.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
          type: 'FeatureCollection',
          features: coverageFeatures(live.stations) as any,
        });
      } catch {}
    };
    draw();
    map.current.on('styledata', draw);
    return () => {
      map.current?.off('styledata', draw);
      try {
        if (map.current?.getLayer(fillId)) map.current.removeLayer(fillId);
        if (map.current?.getLayer(lineId)) map.current.removeLayer(lineId);
        if (map.current?.getSource(srcId)) map.current.removeSource(srcId);
      } catch {}
    };
  }, [showStationCoverage, stations, mapLoaded]);

  // ── City limits line — draws the precise boundary polygon so players can see
  //     exactly where the city ends (and where missions will never spawn). ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const rings = selectedCity?.boundary;
    if (!rings || rings.length === 0) return;

    const draw = () => {
      const m = map.current;
      if (!m) return;
      const srcId = 'city-boundary';
      const fillId = 'city-boundary-fill';
      const lineId = 'city-boundary-line';
      try {
        const polygons = rings
          .map((ring) => ring.map((p) => [p.lng, p.lat] as [number, number]))
          .filter((ring) => ring.length >= 3);
        if (polygons.length === 0) return;
        const feature = {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Polygon' as const,
            coordinates: polygons,
          },
        };
        if (!m.getSource(srcId)) {
          m.addSource(srcId, { type: 'geojson', data: feature as any });
          m.addLayer({
            id: fillId,
            type: 'fill',
            source: srcId,
            paint: {
              'fill-color': 'rgba(255, 255, 255, 0.02)',
              'fill-opacity': 0.9,
            },
          });
          m.addLayer({
            id: lineId,
            type: 'line',
            source: srcId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': 'rgba(248, 113, 113, 0.75)',
              'line-width': 2,
              'line-dasharray': [4, 3],
            },
          });
        } else {
          (m.getSource(srcId) as maplibregl.GeoJSONSource)?.setData(feature as any);
        }
      } catch {}
    };

    draw();
    map.current.on('styledata', draw);
    return () => {
      map.current?.off('styledata', draw);
      try {
        if (map.current?.getLayer('city-boundary-line')) map.current.removeLayer('city-boundary-line');
        if (map.current?.getLayer('city-boundary-fill')) map.current.removeLayer('city-boundary-fill');
        if (map.current?.getSource('city-boundary')) map.current.removeSource('city-boundary');
      } catch {}
    };
  }, [selectedCity, mapLoaded]);

  // ── Crime-heat zone name labels — clickable pills over each neighborhood ──
  // Clicking a zone hands it to the app, which reassigns nearby patrol units there.
  const zoneLabelMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  useEffect(() => {
    if (!map.current || !mapLoaded || !showPatrolHeat || !mapBounds) return;
    const boundary = selectedCity?.boundary ?? null;
    const zones = patrolZonesForCity({ bounds: mapBounds, boundary });

    zones.forEach((z) => {
      // No city land in this bbox cell — no label to click.
      if (z.covered === false) return;
      if (zoneLabelMarkersRef.current.has(z.id)) return;
      const el = document.createElement('div');
      el.style.cssText = 'position:relative; width:0; height:0; cursor:pointer; pointer-events:auto;';
      el.title = `Focus patrol on ${z.name}`;
      const label = document.createElement('div');
      label.style.cssText = `
        position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        background:rgba(11,18,32,0.88); border:1px solid rgba(255,255,255,0.28);
        color:#ffffff; font-size:9px; font-weight:700; padding:2px 8px; border-radius:999px;
        white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.5);
        transition:background 0.15s, border-color 0.15s, transform 0.15s;
      `;
      label.textContent = z.name;
      el.appendChild(label);
      el.addEventListener('mouseenter', () => {
        label.style.background = 'rgba(29,78,216,0.92)';
        label.style.borderColor = 'rgba(147,197,253,0.9)';
        label.style.transform = 'translate(-50%,-50%) scale(1.08)';
      });
      el.addEventListener('mouseleave', () => {
        label.style.background = 'rgba(11,18,32,0.88)';
        label.style.borderColor = 'rgba(255,255,255,0.28)';
        label.style.transform = 'translate(-50%,-50%)';
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onZoneClickRef.current?.(z.id, z.name);
      });
      const pos = z.polygon && z.polygon.length >= 3 ? polygonCentroid(z.polygon) : z.center;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map.current!);
      zoneLabelMarkersRef.current.set(z.id, marker);
    });

    return () => {
      zoneLabelMarkersRef.current.forEach((m) => m.remove());
      zoneLabelMarkersRef.current.clear();
    };
  }, [showPatrolHeat, mapBounds, mapLoaded, selectedCity]);

  // ── Nearby station markers (other players) — diff-based ──
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const currentIds = new Set(nearbyStations.map((s: any) => s.id));
    nearbyStationMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        nearbyStationMarkersRef.current.delete(id);
      }
    });
    const alliedIds = showAlliesOnMap && myAlliance ? new Set<string>(myAlliance.members?.map((m: any) => m.playerId)) : new Set<string>();
    const myAllianceId = myAlliance?.id ?? null;
    nearbyStations.forEach((station: any) => {
      if (nearbyStationMarkersRef.current.has(station.id)) return;
      const config = STATION_CONFIGS[station.type] || STATION_CONFIGS.fire_station;
      const isAlly = alliedIds.has(station.ownerId);
      const isAllianceOwned = station.allianceId && station.allianceId === myAllianceId;
      const el = document.createElement('div');
      el.style.cssText = `
        position:relative; width:0; height:0; pointer-events:none; opacity:${isAlly || isAllianceOwned ? 1 : 0.7};
      `;
      const inner = document.createElement('div');
      inner.style.cssText = `
        position:absolute; left:50%; top:50%;
        width:30px; height:30px;
        transform:translate(-50%,-50%) scale(var(--marker-scale, 1));
        background:${config.color};
        border:${isAllianceOwned ? '3px solid #C084FC' : isAlly ? '3px solid #A855F7' : '2px dashed rgba(255,255,255,0.85)'};
        border-radius:50%; display:flex; align-items:center; justify-content:center;
        font-size:13px; ${isAllianceOwned ? 'box-shadow:0 0 12px 3px rgba(192,132,252,0.7);' : isAlly ? 'box-shadow:0 0 10px 2px rgba(168,85,247,0.55);' : 'box-shadow:0 2px 8px rgba(0,0,0,0.3);'}
      `;
      inner.textContent = config.icon;
      el.appendChild(inner);
      const label = document.createElement('div');
      label.style.cssText = `
        position:absolute; top:18px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.55); color:#fff; font-size:8px; padding:1px 5px;
        border-radius:999px; white-space:nowrap; pointer-events:none;
      `;
      label.textContent = station.name || 'Station';
      el.appendChild(label);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([station.position.lng, station.position.lat])
        .addTo(map.current!);
      nearbyStationMarkersRef.current.set(station.id, marker);
    });
  }, [nearbyStations, mapLoaded, showAlliesOnMap, myAlliance]);

  // ── Nearby unit markers (other players) — diff-based ──
  useEffect(() => {
    nearbyUnitsRef.current = nearbyUnits;
    if (!map.current || !mapLoaded) return;
    const currentIds = new Set(nearbyUnits.map((u: any) => u.id));
    nearbyUnitMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        nearbyUnitMarkersRef.current.delete(id);
      }
    });
    const unitAlliedIds = showAlliesOnMap && myAlliance ? new Set<string>(myAlliance.members?.map((m: any) => m.playerId)) : new Set<string>();
    nearbyUnits.forEach((unit: any) => {
      if (!unit.position) return;
      const existing = nearbyUnitMarkersRef.current.get(unit.id);
      if (existing) {
        existing.setLngLat([unit.position.lng, unit.position.lat]);
        return;
      }
      const config = UNIT_CONFIGS[unit.type];
      const icon = config?.icon || '🚛';
      const typeLower = String(unit.type).toLowerCase();
      let color = '#6B7280';
      if (typeLower.includes('patrol') || typeLower.includes('swat') || typeLower.includes('k9') || typeLower.includes('police')) color = '#2563EB';
      else if (typeLower.includes('engine') || typeLower.includes('ladder') || typeLower.includes('rescue') || typeLower.includes('battalion') || typeLower.includes('fire')) color = '#DC2626';
      else if (typeLower.includes('ambulance') || typeLower.includes('paramedic') || typeLower.includes('ems')) color = '#16A34A';
      const isAlly = unitAlliedIds.has(unit.ownerId);
      const el = document.createElement('div');
      el.style.cssText = `
        position:relative; width:0; height:0; pointer-events:none; opacity:${isAlly ? 1 : 0.75};
      `;
      const inner = document.createElement('div');
      inner.style.cssText = `
        position:absolute; left:50%; top:50%;
        width:24px; height:24px;
        transform:translate(-50%,-50%) scale(var(--marker-scale, 1));
        background:${color};
        border:${isAlly ? '3px solid #A855F7' : '2px solid rgba(255,255,255,0.8)'};
        ${isAlly ? 'box-shadow:0 0 8px 1px rgba(168,85,247,0.6);' : ''}
        border-radius:50%; display:flex; align-items:center; justify-content:center;
        font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.35);
      `;
      inner.textContent = icon;
      el.appendChild(inner);
      const label = document.createElement('div');
      label.style.cssText = `
        position:absolute; top:14px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.55); color:#fff; font-size:8px; padding:1px 5px;
        border-radius:999px; white-space:nowrap; pointer-events:none;
      `;
      label.textContent = unit.name || 'Unit';
      el.appendChild(label);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([unit.position.lng, unit.position.lat])
        .addTo(map.current!);
      nearbyUnitMarkersRef.current.set(unit.id, marker);
    });
  }, [nearbyUnits, mapLoaded, showAlliesOnMap, myAlliance]);

  // ── Mission popup derived state + quick dispatch ──
  const popupMissionLive = popupMission ? missions.find((m) => m.id === popupMission.id) ?? null : null;
  const popupTier = popupMissionLive ? TIER_META[difficultyTierFor(popupMissionLive.difficulty)] : null;
  const popupReqTypes = popupMissionLive ? Array.from(new Set(popupMissionLive.requirements.map((r) => r.unitType))) : [];
  const popupUrgent = !!popupMissionLive && popupMissionLive.timeRemaining < 120;
  const popupExpired = !!popupMissionLive && popupMissionLive.timeRemaining <= 0;
  const popupDispatched = !!popupMissionLive &&
    (popupMissionLive.status === 'en_route' || popupMissionLive.status === 'on_scene' || popupMissionLive.status === 'in_progress');
  // A city-handled call (CPU mutual aid / simulated cross-service incident) is
  // already being answered — never offer quick dispatch on it.
  const popupCpuHandled = !!popupMissionLive?.cpuHandled;
  // Units of the call's answer services — primary + requirement services (any
  // state) — so the empty state is truthful for crossover calls: a traffic
  // accident that needs a fire engine counts engines, not just patrol cars.
  const popupAnswerServices = popupMissionLive
    ? new Set(requiredServicesForMission(popupMissionLive))
    : new Set<string>();
  const popupServiceUnitCount = popupMissionLive
    ? units.filter((u) => u.position && popupAnswerServices.has(getUnitServiceType(u.type))).length
    : 0;
  // Multi-unit quick dispatch: nearest requirement-filling units, capped by the
  // dispatch-limit tech (r3 → 3, otherwise 1), then topped up with the nearest
  // service-appropriate units while the limit allows.
  const maxDispatchUnits = getMaxDispatchUnits();
  const dispatchCandidates = popupMissionLive
    ? findNearestDispatchUnits(units, popupMissionLive, maxDispatchUnits).map((u) => {
        const distKm = haversineKm(u.position!, popupMissionLive.location);
        return { unit: u, distKm, etaSec: applyTravelTech((distKm * 1000) / (u.speed || 13.9)) };
      })
    : [];
  const totalRequired = popupMissionLive
    ? popupMissionLive.requirements.reduce((sum, r) => sum + r.count, 0)
    : 0;
  // Honest requirement coverage: when candidates can't cover a requirement,
  // say which service is missing — and if a matching unit exists but is busy
  // on another call, say WHICH unit so it never looks like the department is
  // empty (v0.22.12 duplicate-dispatch visibility).
  const missingReqHint = popupMissionLive && !popupDispatched && !popupExpired
    ? requirementGapReason(units, popupMissionLive, dispatchCandidates.map((c) => c.unit))
    : null;
  const requirementHint = missingReqHint ?? (popupMissionLive && !popupDispatched && !popupExpired &&
    totalRequired > dispatchCandidates.length && dispatchCandidates.length > 0
    ? `Requires ${totalRequired} unit${totalRequired > 1 ? 's' : ''} — assign more from the dispatch center.`
    : null);
  // Needs-backup dimming (v0.22.17): when the candidate crew can't cover every
  // required service, dispatching would send a partial response — flag it the
  // same way a patrol intercept does (dimmed + "Needs backup: …"), so the
  // commander sees the crossover gap before committing.
  const popupBackupServices = popupMissionLive && !popupDispatched && !popupExpired && !popupCpuHandled
    ? missingBackupServices(dispatchCandidates.map((c) => c.unit), popupMissionLive)
    : [];
  const popupPartialCrew = popupBackupServices.length > 0 && dispatchCandidates.length > 0;

  // ── POI popover data (v0.22.10) ──
  // Incidents anchored to the named place; when it's quiet, the nearest calls
  // within ~1.2 km so the popover always has something actionable.
  const popupPoiAnchored = popupPoi
    ? missions
        .filter((mm) => mm.poiId === popupPoi.id && mm.status !== 'completed' && mm.status !== 'failed')
        .slice(0, 4)
    : [];
  const popupPoiNearby = popupPoi && popupPoiAnchored.length === 0
    ? missions
        .filter((mm) => mm.poiId !== popupPoi.id && mm.status !== 'completed' && mm.status !== 'failed')
        .map((mm) => ({ mm, d: haversineKm(popupPoi.position, mm.location) }))
        .filter((x) => x.d <= 1.2)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
    : [];

  // ── Facility popover data (v0.22.13) ──────────────────────────────────────
  // Clicking the hospital or helipad puck opens a dark panel with live stats,
  // features, and an inline rename. Same folds the Shift Report / Hospital tab
  // use, so the popup never contradicts the panels.
  const popupFacilityData = popupFacility === 'hospital' && hospital
    ? { kind: 'hospital' as const, data: hospital }
    : popupFacility === 'helipad' && helipad
      ? { kind: 'helipad' as const, data: helipad }
      : null;
  const facilityErStats = (() => {
    if (!hospital) return null;
    const { patients, shift, stations } = useGameStore.getState();
    const occupied = hospitalOccupancy(patients);
    const staff = erStaffing(shift, Date.now(), hospital);
    const beds = effectiveBeds(hospital, shift, Date.now(), stations);
    const fatigue = erStaffFatigue(shift, Date.now(), hospital);
    const outcomes = patientOutcomesForShift(patients, shift.startedAt);
    return {
      occupied, staff, beds, fatigue,
      nursesRotatingOff: fatigue >= STAFF_OVERWORK_THRESHOLD,
      recovered: outcomes.recovered, diverted: outcomes.diverted,
    };
  })();

  // Ward expansion from the map (v0.22.17): commanders can buy the next bed
  // level without opening the Hospital tab — same cost + Shift Report tally as
  // the Hospital panel, so the two surfaces never disagree.
  const nextWardCost = hospital ? wardUpgradeCost(hospital) : null;
  const wardCanAfford = nextWardCost !== null && (useGameStore.getState().player?.credits ?? 0) >= nextWardCost;
  const handlePopupWardUpgrade = () => {
    if (!hospital) return;
    const cost = wardUpgradeCost(hospital);
    if (cost === null) return;
    const st = useGameStore.getState();
    const credits = st.player?.credits ?? 0;
    if (credits < cost) return;
    st.updatePlayer({ credits: credits - cost });
    const upgraded = applyWardUpgrade(hospital);
    if (upgraded) {
      st.setHospital(upgraded);
      st.recordShiftStats({
        wardExpansions: (st.shift.wardExpansions ?? 0) + 1,
        wardBedsAdded: (st.shift.wardBedsAdded ?? 0) + WARD_BEDS_PER_LEVEL,
        wardCreditsSpent: (st.shift.wardCreditsSpent ?? 0) + cost,
      });
      addNotification({
        type: 'success',
        title: 'Ward Expanded',
        message: `${upgraded.name} now holds ${upgraded.beds} base beds (+${WARD_BEDS_PER_LEVEL}).`,
        icon: '🏥',
        duration: 4000,
      });
    }
  };

  const quickDispatchDisabled = dispatching || popupDispatched || popupExpired || popupCpuHandled || dispatchCandidates.length === 0;
  let quickDispatchLabel: string;
  if (dispatching) quickDispatchLabel = 'Routing…';
  else if (popupExpired) quickDispatchLabel = 'Call expired';
  else if (popupCpuHandled) quickDispatchLabel = 'City responding';
  else if (dispatchCandidates.length === 0) quickDispatchLabel = popupServiceUnitCount > 0 ? 'All units busy' : 'No available units';
  else if (dispatchCandidates.length === 1) quickDispatchLabel = `Dispatch ${dispatchCandidates[0].unit.name}`;
  else quickDispatchLabel = `Dispatch ${dispatchCandidates.length} units`;

  // ── Real OSRM ETAs for the popup candidates ──
  // Replaces the straight-line estimate with an actual driving-time lookup per
  // candidate. Shows a loading state while each fetch is in flight; the shared
  // route cache (5-min TTL in utils/routing) also makes the follow-up dispatch
  // click instant. Falls back to the straight-line estimate on any failure.
  const candidateSig = dispatchCandidates.map((c) => c.unit.id).join(',');
  useEffect(() => {
    if (!popupMissionLive || dispatchCandidates.length === 0) {
      setPopupRouteEtas({});
      inFlightRoutesRef.current.clear();
      return;
    }
    let cancelled = false;
    for (const { unit } of dispatchCandidates) {
      const key = `${unit.id}:${popupMissionLive.id}`;
      if (inFlightRoutesRef.current.has(key) || popupRouteEtas[key] !== undefined) continue;
      inFlightRoutesRef.current.add(key);
      setPopupRouteEtas((prev) => ({ ...prev, [key]: null }));
      fetchDrivingRoute(unit.position!, popupMissionLive.location, unit.speed || 13.9)
        .then((route) => {
          if (cancelled) return;
          setPopupRouteEtas((prev) => ({ ...prev, [key]: applyTravelTech(route.durationSec) }));
        })
        .catch(() => {
          // fetchDrivingRoute falls back internally and never rejects, but keep
          // the straight-line estimate if something unexpected happens.
          if (cancelled) return;
          setPopupRouteEtas((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        })
        .finally(() => {
          inFlightRoutesRef.current.delete(key);
        });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupMissionLive?.id, candidateSig]);

  const handleQuickDispatch = async () => {
    if (!popupMissionLive || dispatching || dispatchCandidates.length === 0) return;
    setDispatching(true);
    try {
      const results = await Promise.allSettled(
        dispatchCandidates.map(({ unit }) => dispatchUnitToMission(unit.id, popupMissionLive)),
      );
      const dispatched = dispatchCandidates.filter(
        (_, i) => results[i]?.status === 'fulfilled' && (results[i] as PromiseFulfilledResult<boolean>).value,
      );
      if (dispatched.length > 0) {
        playDispatchTone();
        const st = useGameStore.getState();
        // Same radio wiring as MissionCard so the map quick-dispatch speaks the
        // same over-the-air language as every other assignment.
        for (const { unit } of dispatched) {
          const key = `assign:${unit.id}:${popupMissionLive.id}`;
          if (wasRadioKeyDispatched(key)) continue;
          const seq = assignmentSequence(unit, popupMissionLive, st.units.filter((u) => u.status === 'available'), [popupMissionLive], st.helipad?.name);
          broadcastRadioSequence(seq, key);
          markRadioKeyDispatched(key);
        }
        addNotification({
          type: 'success',
          title: 'Units Dispatched',
          message: `${dispatched.length} unit${dispatched.length > 1 ? 's' : ''} en route to ${popupMissionLive.name}.`,
          duration: 3500,
        });
      } else {
        playFailure();
        addNotification({ type: 'error', title: 'Dispatch failed', message: 'Could not route any units — check roads or unit positions.', duration: 3500 });
      }
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className={`relative w-full h-full ${night ? 'map-night' : ''}`}>
      <div ref={mapContainer} className="w-full h-full" />
      {/* Night overlay — dims the base map and adds a cool blue vignette.
          z-[1]: above the canvas/markers (z-auto) but below MapLibre controls (z-2). */}
      {night && (
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(2,6,23,0) 55%, rgba(2,6,23,0.45) 100%)',
          }}
        />
      )}
      {showPatrolHeat && (
        <div className="absolute top-2 right-2 z-10 rounded-lg bg-gray-950/85 border border-gray-700/50 px-2.5 py-1.5 backdrop-blur-sm pointer-events-none">
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-wider mb-1">Crime Heat</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500">Low</span>
            <div className="w-20 h-1.5 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500" />
            <span className="text-[9px] text-gray-500">High</span>
          </div>
        </div>
      )}

      {/* ── POI popover (v0.22.10): click a named place for what's here + incidents ── */}
      {popupPoi && poiPopupPos && (
        <div
          className="absolute z-[30]"
          style={{
            left: Math.max(8, Math.min(poiPopupPos.x + 16, (mapContainer.current?.clientWidth ?? 800) - 264)),
            top: Math.max(8, Math.min(poiPopupPos.y - 40, (mapContainer.current?.clientHeight ?? 600) - 330)),
          }}
        >
          <div
            className="relative w-[248px] rounded-xl bg-gray-950/95 border border-gray-700/60 shadow-2xl shadow-black/60 backdrop-blur-md overflow-hidden"
            style={{ backgroundColor: 'rgba(3, 7, 18, 0.95)' }}
          >
            <div className="absolute -left-[7px] top-8 w-3 h-3 rotate-45 bg-gray-950 border-l border-b border-gray-700/60" />

            {/* Header */}
            <div className="flex items-start gap-2.5 p-3 pb-2">
              <div
                className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 text-lg"
                style={{ border: `1.5px solid ${POI_TYPE_META[popupPoi.type].color}66` }}
              >
                {POI_TYPE_META[popupPoi.type].icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-[13px] text-white leading-tight">{popupPoi.name}</h3>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400 border border-gray-700/40">
                    {POI_TYPE_META[popupPoi.type].label}
                  </span>
                  <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" /> landmark
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPopupPoi(null)}
                className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Incidents at this place */}
            <p className="px-3 pb-1 text-[9px] uppercase tracking-wider text-gray-500">
              {popupPoiAnchored.length > 0 ? 'Active incidents here' : 'Active incidents'}
            </p>
            <div className="px-3 pb-3 max-h-40 overflow-y-auto">
              {popupPoiAnchored.length > 0 ? (
                popupPoiAnchored.map((mm) => {
                  const tier = TIER_META[difficultyTierFor(mm.difficulty)];
                  return (
                    <button
                      key={mm.id}
                      onClick={() => { setPopupPoi(null); setPopupMission(mm); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/70 transition-colors text-left"
                    >
                      <span className="text-sm shrink-0">{mm.icon || '🚨'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-gray-200 truncate">{mm.name}</span>
                        <span className="block text-[9px] text-gray-500">{tier?.icon} {tier?.label}</span>
                      </span>
                      <span className={`text-[10px] font-mono shrink-0 ${mm.timeRemaining < 120 ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                        {formatTimer(mm.timeRemaining)}
                      </span>
                    </button>
                  );
                })
              ) : popupPoiNearby.length > 0 ? (
                <>
                  <p className="text-[11px] text-gray-500 mb-1">Quiet here — nearest calls:</p>
                  {popupPoiNearby.map(({ mm }) => (
                    <button
                      key={mm.id}
                      onClick={() => { setPopupPoi(null); setPopupMission(mm); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/70 transition-colors text-left"
                    >
                      <span className="text-sm shrink-0">{mm.icon || '🚨'}</span>
                      <span className="min-w-0 flex-1 text-[11px] text-gray-200 truncate">{mm.name}</span>
                      <span className={`text-[10px] font-mono shrink-0 ${mm.timeRemaining < 120 ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                        {formatTimer(mm.timeRemaining)}
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <p className="text-[11px] text-gray-500">No active incidents at this location.</p>
              )}
            </div>

            {/* Player-placed landmark — the commander can remove it (v0.22.12) */}
            <div className="px-3 pb-3">
              <RemovePoiButton poiId={popupPoi.id} onDone={() => setPopupPoi(null)} />
            </div>
          </div>
        </div>
      )}

      {/* ── Facility popover (v0.22.13): click the hospital or helipad puck ── */}
      {popupFacilityData && facilityPopupPos && (
        <div
          className="absolute z-[30]"
          style={{
            left: Math.max(8, Math.min(facilityPopupPos.x + 16, (mapContainer.current?.clientWidth ?? 800) - 264)),
            top: Math.max(8, Math.min(facilityPopupPos.y - 40, (mapContainer.current?.clientHeight ?? 600) - 400)),
          }}
        >
          <div
            className="relative w-[248px] rounded-xl bg-gray-950/95 border border-gray-700/60 shadow-2xl shadow-black/60 backdrop-blur-md overflow-hidden"
            // Keep the rgba fallback in sync with the /95 class — older
            // webviews drop 8-digit-hex alpha and would render this panel white.
            style={{ backgroundColor: 'rgba(3, 7, 18, 0.95)' }}
          >
            <div className="absolute -left-[7px] top-8 w-3 h-3 rotate-45 bg-gray-950 border-l border-b border-gray-700/60" />

            {/* Header */}
            <div className="flex items-start gap-2.5 p-3 pb-2">
              <div
                className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 text-lg"
                style={{ border: `1.5px solid ${popupFacilityData.kind === 'hospital' ? '#34d39966' : '#fbbf2466'}` }}
              >
                {popupFacilityData.kind === 'hospital' ? '🏥' : '🚁'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <h3 className="font-semibold text-[13px] text-white leading-tight truncate">{popupFacilityData.data.name}</h3>
                  <InlineRename
                    value={popupFacilityData.data.name}
                    onSave={(name) => {
                      if (popupFacilityData.kind === 'hospital') {
                        setHospital({ ...popupFacilityData.data, name });
                      } else {
                        setHelipad({ ...popupFacilityData.data, name });
                      }
                    }}
                    maxLength={40}
                    buttonClassName="p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors shrink-0"
                    inputClassName="w-36 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400 border border-gray-700/40">
                    {popupFacilityData.kind === 'hospital' ? 'Emergency Room' : 'Air Ambulance Helipad'}
                  </span>
                  <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" />
                    {popupFacilityData.kind === 'hospital'
                      ? `$${HOSPITAL_BUILD_COST.toLocaleString()}`
                      : `$${HELIPAD_BUILD_COST.toLocaleString()}`}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPopupFacility(null)}
                className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body — live ER census / landing-zone status */}
            {popupFacilityData.kind === 'hospital' ? (
              <div className="px-3 pb-2 space-y-1.5">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-900/70 border border-gray-800">
                  <span className="text-[10px] text-gray-400">Beds</span>
                  <span className={`text-[11px] font-mono font-semibold ${
                    facilityErStats && facilityErStats.occupied >= facilityErStats.beds ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {facilityErStats?.occupied ?? 0}/{facilityErStats?.beds ?? hospital!.beds}
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-900/70 border border-gray-800">
                  <span className="text-[10px] text-gray-400">Ward</span>
                  <span className="text-[11px] font-mono text-emerald-400">
                    Lv {wardLevel(hospital!)}/{HOSPITAL_WARD_MAX_LEVEL} · {hospital!.beds} base beds
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-900/70 border border-gray-800">
                  <span className="text-[10px] text-gray-400">ER Staff</span>
                  <span className="text-[11px] font-mono text-cyan-400">{facilityErStats?.staff ?? 0} nurses</span>
                </div>
                {/* ER fatigue warning — capacity sags as the shift wears on, so
                    commanders see it before opening the panel (v0.22.17). Amber
                    once overworked nurses actually start rotating off; a muted
                    amber while fatigue is still building toward the threshold. */}
                {facilityErStats && facilityErStats.fatigue > 0 && (
                  <div
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg border ${
                      facilityErStats.nursesRotatingOff ? 'bg-amber-950/60 border-amber-500/40' : 'bg-gray-900/70 border-gray-800'
                    }`}
                    title={facilityErStats.nursesRotatingOff
                      ? 'Overworked nurses are rotating off the floor — effective beds are sagging. Open the Hospital tab for a nurse rotation.'
                      : 'Shift fatigue is building — nurses start rotating off at 70/100.'}
                  >
                    <span className={`text-[10px] ${facilityErStats.nursesRotatingOff ? 'text-amber-300 font-bold' : 'text-gray-400'}`}>
                      {facilityErStats.nursesRotatingOff ? '⚠ ER fatigued · capacity sagging' : 'ER staff tiring'}
                    </span>
                    <span className={`text-[11px] font-mono ${facilityErStats.nursesRotatingOff ? 'text-amber-300' : 'text-amber-400/80'}`}>
                      {facilityErStats.fatigue}/100
                    </span>
                  </div>
                )}
                {facilityErStats && facilityErStats.recovered > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-900/70 border border-gray-800">
                    <span className="text-[10px] text-gray-400">Recovered this shift</span>
                    <span className="text-[11px] font-mono text-emerald-400">{facilityErStats.recovered}</span>
                  </div>
                )}
                {nextWardCost !== null && (
                  <button
                    onClick={handlePopupWardUpgrade}
                    disabled={!wardCanAfford}
                    className="w-full px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-600/80 text-white hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    title={wardCanAfford
                      ? `Add ${WARD_BEDS_PER_LEVEL} beds to the base ward for ${nextWardCost.toLocaleString()} credits.`
                      : `Insufficient credits — ward upgrade costs ${nextWardCost.toLocaleString()} credits.`}
                  >
                    ⬆ Upgrade Ward — {nextWardCost.toLocaleString()} 💰 · +{WARD_BEDS_PER_LEVEL} beds
                  </button>
                )}
                <p className="pt-1 text-[9px] uppercase tracking-wider text-gray-500">What this ER does</p>
                <ul className="space-y-1">
                  {[
                    'All EMS victims transport here after scenes clear',
                    'Every EMS call cleared adds an ER nurse — beds grow with your shift',
                    facilityErStats && facilityErStats.occupied >= facilityErStats.beds
                      ? 'At capacity — next patients divert to the regional trauma center'
                      : 'A full ER diverts patients to the regional trauma center',
                    helipad
                      ? 'Critical patients airlift to your helipad'
                      : 'Build the Air Ambulance Helipad to airlift critical patients',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[10px] text-gray-400">
                      <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="px-3 pb-2 space-y-1.5">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-900/70 border border-gray-800">
                  <span className="text-[10px] text-gray-400">Status</span>
                  <span className={`text-[10px] font-semibold ${hospital ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {hospital ? 'Ready — air ambulance on standby' : 'Needs the ER built'}
                  </span>
                </div>
                <p className="pt-1 text-[9px] uppercase tracking-wider text-gray-500">What this pad does</p>
                <ul className="space-y-1">
                  {[
                    'Critical EMS victims are airlifted here — ~200 km/h, about 4× road speed',
                    'The transporting unit becomes a helicopter with its own radio + flight ring',
                    hospital
                      ? 'Airlifts land here whenever an EMS scene clears critical'
                      : 'Build the City General Hospital to enable airlift transports',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[10px] text-gray-400">
                      <span className="text-amber-500 mt-0.5 shrink-0">✈</span>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick action */}
            <div className="border-t border-gray-800 p-3">
              <button
                onClick={() => {
                  setPopupFacility(null);
                  useGameStore.getState().setShowDispatchCenter(true);
                }}
                className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600/80 text-white hover:bg-emerald-600 active:scale-[0.98] transition-all"
              >
                Open Hospital Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mission info popup: click a mission marker for details + quick dispatch ── */}
      {popupMissionLive && popupPos && (
        <div
          className="absolute z-[30]"
          style={{
            left: Math.max(8, Math.min(popupPos.x + 18, (mapContainer.current?.clientWidth ?? 800) - 288)),
            top: Math.max(8, Math.min(popupPos.y - 44, (mapContainer.current?.clientHeight ?? 600) - 470)),
          }}
        >
          <div
            className="relative w-[264px] rounded-xl bg-gray-950/95 border border-gray-700/60 shadow-2xl shadow-black/60 backdrop-blur-md overflow-hidden"
            // Tailwind's /95 emits 8-digit-hex alpha (#030712f2), which older
            // webviews drop — leaving the panel transparent (looks white over
            // light tiles). Keep this rgba fallback in sync with the class.
            style={{ backgroundColor: 'rgba(3, 7, 18, 0.95)' }}
          >
            {/* Pointer arrow toward the marker */}
            <div className="absolute -left-[7px] top-8 w-3 h-3 rotate-45 bg-gray-950 border-l border-b border-gray-700/60" />

            {/* Header */}
            <div className="flex items-start gap-2.5 p-3 pb-2">
              <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 text-lg">
                {popupMissionLive.icon || '🔥'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-[13px] text-white leading-tight">{popupMissionLive.name}</h3>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400 border border-gray-700/40">
                    {popupMissionLive.category}
                  </span>
                  {popupTier && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${popupTier.chipClass}`}>
                      {popupTier.icon} {popupTier.label}
                    </span>
                  )}
                  {popupMissionLive.priority && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase ${PRIORITY_STYLE[popupMissionLive.priority] || PRIORITY_STYLE.medium}`}>
                      {popupMissionLive.priority}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPopupMission(null)}
                className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* The incident — what's actually happening on scene */}
            <p className="px-3 pb-2 text-[11px] leading-relaxed text-gray-400">{popupMissionLive.description}</p>

            {/* Stats */}
            <div className="mx-3 mb-2 flex items-center gap-2 px-2 py-1.5 bg-gray-900/70 rounded-lg border border-gray-800">
              <span className={`flex items-center gap-1 text-[11px] font-mono ${popupUrgent ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                <Clock className="w-3 h-3" />
                {formatTimer(popupMissionLive.timeRemaining)}
              </span>
              <span className="w-px h-3 bg-gray-700" />
              <span className="flex items-center gap-1 text-[11px] font-mono text-amber-400">
                <Zap className="w-3 h-3" />
                {popupMissionLive.creditsReward.toLocaleString()}
              </span>
              <span className="w-px h-3 bg-gray-700" />
              <span className="text-[11px] font-mono text-cyan-400">+{popupMissionLive.xpReward} XP</span>
            </div>

            {/* Required unit types */}
            {popupReqTypes.length > 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1">
                {popupReqTypes.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 text-[9px] rounded-full bg-gray-800/80 text-gray-300 border border-gray-700/40">
                    {t.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}

            {/* Dispatch plan — the services needed, visible before any unit is
                picked. Primary department first; cross-service requirements
                tinted so the crossover need reads at a glance (v0.22.13). */}
            <div className="px-3 pb-2 flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-gray-500">Needs</span>
              {dispatchPlanParts(popupMissionLive).map((p) => (
                <span
                  key={p.label}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                    p.crossover
                      ? p.service === 'fire'
                        ? 'bg-red-500/15 text-red-400 border-red-500/30'
                        : p.service === 'ems'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      : 'bg-gray-800/80 text-gray-300 border-gray-700/40'
                  }`}
                  title={p.crossover ? `Cross-service — answered by ${p.service.toUpperCase()} units` : `Answered by your ${p.service} department`}
                >
                  {p.label}
                </span>
              ))}
            </div>

            {/* Quick dispatch — nearest units */}
            <div className="border-t border-gray-800 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] uppercase tracking-wider text-gray-500">Quick Dispatch · Nearest</p>
                {!popupDispatched && !popupCpuHandled && (
                  <span className="text-[9px] text-gray-600">{dispatchCandidates.length}/{maxDispatchUnits} limit</span>
                )}
              </div>
              {popupCpuHandled ? (
                <div className="flex items-center gap-1.5 mb-1 px-2 py-1.5 rounded-lg text-[10px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/25">
                  🏙️ City responding — the partner agency is handling this call automatically.
                </div>
              ) : popupDispatched ? (
                <div className={`flex items-center gap-1.5 mb-1 px-2 py-1.5 rounded-lg text-[10px] font-medium ${
                  popupMissionLive.status === 'en_route'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                    : 'bg-dispatch-red/15 text-dispatch-red border border-dispatch-red/25'
                }`}>
                  {popupMissionLive.status === 'en_route' ? '🚗' : '⚡'}
                  {popupMissionLive.status === 'en_route'
                    ? `En route — ${popupMissionLive.assignedUnits.length} assigned`
                    : 'In progress'}
                </div>
              ) : dispatchCandidates.length > 0 ? (
                <>
                  {popupPartialCrew && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg text-[10px] font-medium opacity-60 border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-300">
                      ⚠ Needs backup: {popupBackupServices.map(serviceDisplayName).join(' + ')} — dispatch sends a partial crew.
                    </div>
                  )}
                  <div className={`space-y-1 mb-2 max-h-36 overflow-y-auto pr-0.5${popupPartialCrew ? ' opacity-60' : ''}`}>
                    {dispatchCandidates.map(({ unit, distKm, etaSec }) => {
                      const routeEta = popupRouteEtas[`${unit.id}:${popupMissionLive.id}`];
                      const etaLoading = routeEta === null;
                      return (
                        <div key={unit.id} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center text-[11px] shrink-0">
                            {UNIT_CONFIGS[unit.type]?.icon || '🚛'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold text-white truncate">{unit.name}</p>
                            <p className="text-[8px] text-gray-500 capitalize">
                              {unit.type.replace(/_/g, ' ')}
                              {(() => {
                                const usvc = getUnitServiceType(unit.type);
                                if (!popupMissionLive || usvc === missionService(popupMissionLive)) return null;
                                return (
                                  <span className={`ml-1 px-1 rounded text-[7px] font-bold uppercase ${
                                    usvc === 'fire' ? 'bg-red-500/20 text-red-400'
                                    : usvc === 'ems' ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-blue-500/20 text-blue-400'
                                  }`}>
                                    {usvc}
                                  </span>
                                );
                              })()}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[9px] font-mono text-gray-300">{distKm.toFixed(1)} km</p>
                            {etaLoading ? (
                              <p className="text-[8px] font-mono text-cyan-400 animate-pulse">ETA ~{formatTimer(etaSec)}…</p>
                            ) : routeEta != null ? (
                              <p className="text-[8px] font-mono text-cyan-400">ETA {formatTimer(routeEta)}</p>
                            ) : (
                              <p className="text-[8px] font-mono text-cyan-400">ETA ~{formatTimer(etaSec)}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {requirementHint && (
                    <p className="text-[9px] text-amber-400/90 mb-2">{requirementHint}</p>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-amber-400 mb-2">
                  {popupServiceUnitCount > 0
                    ? 'All units busy — wait for one to return or recall one from the roster.'
                    : 'No available units — build or recall a unit first.'}
                </p>
              )}
              {!popupDispatched && !popupCpuHandled && (
                <button
                  onClick={handleQuickDispatch}
                  disabled={quickDispatchDisabled}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    quickDispatchDisabled
                      ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-700/30'
                      : 'bg-dispatch-red text-white hover:bg-red-700 active:scale-[0.98] shadow-lg shadow-red-500/20'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  {quickDispatchLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        /* Night mode: dim the base map canvas (markers/overlays stay vivid). */
        .map-night .maplibregl-canvas {
          filter: brightness(0.7) hue-rotate(210deg) saturate(0.75);
          transition: filter 1.2s ease;
        }
        @keyframes missionPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
        @keyframes alliancePulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(124,58,237,0.6); }
          50% { opacity: 0.85; transform: scale(1.1); box-shadow: 0 0 12px 4px rgba(124,58,237,0.3); }
        }
        @keyframes unitPulseRoute {
          0% { transform: scale(1); opacity: 0.9; }
          70% { transform: scale(1.45); opacity: 0; }
          100% { transform: scale(1.45); opacity: 0; }
        }
        @keyframes unitPulseScene {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.3); opacity: 0.3; }
        }
        @keyframes leadPulse {
          0% { transform: scale(1); opacity: 0.9; }
          70% { transform: scale(1.65); opacity: 0; }
          100% { transform: scale(1.65); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
