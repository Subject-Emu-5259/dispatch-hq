// ============================================
// Dispatch HQ — Game Setup Library
// ============================================

import type { Station, StationType, GeoPoint } from '@dispatch-hq/shared';
import type { PatrolRoute } from '@/stores/gameStore';

export interface CityConfig {
  id: string;
  name: string;
  center: GeoPoint;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  population: number;
  stationSpots: { fire: number; police: number; ems: number };
}

const CITY_CONFIGS: Record<string, CityConfig> = {
  'new-york': {
    id: 'new-york',
    name: 'New York',
    center: { lat: 40.7128, lng: -74.006 },
    bounds: { minLat: 40.5, maxLat: 40.9, minLng: -74.3, maxLng: -73.7 },
    population: 8800000,
    stationSpots: { fire: 8, police: 6, ems: 5 },
  },
  'los-angeles': {
    id: 'los-angeles',
    name: 'Los Angeles',
    center: { lat: 34.0522, lng: -118.2437 },
    bounds: { minLat: 33.7, maxLat: 34.3, minLng: -118.7, maxLng: -118.0 },
    population: 4000000,
    stationSpots: { fire: 6, police: 5, ems: 4 },
  },
  'chicago': {
    id: 'chicago',
    name: 'Chicago',
    center: { lat: 41.8781, lng: -87.6298 },
    bounds: { minLat: 41.6, maxLat: 42.0, minLng: -87.9, maxLng: -87.5 },
    population: 2700000,
    stationSpots: { fire: 5, police: 4, ems: 3 },
  },
  'memphis': {
    id: 'memphis',
    name: 'Memphis',
    center: { lat: 35.1495, lng: -90.049 },
    bounds: { minLat: 35.0, maxLat: 35.3, minLng: -90.3, maxLng: -89.8 },
    population: 633000,
    stationSpots: { fire: 4, police: 3, ems: 2 },
  },
};

const STATION_NAMES: Record<string, string[]> = {
  fire: ['Station 1', 'Station 2', 'Station 3', 'Station 4', 'Station 5', 'Station 6', 'Station 7', 'Station 8'],
  police: ['Precinct 1', 'Precinct 2', 'Precinct 3', 'Precinct 4', 'Precinct 5', 'Precinct 6'],
  ems: ['Medic 1', 'Medic 2', 'Medic 3', 'Medic 4', 'Medic 5'],
};

function randomPointInBounds(bounds: CityConfig['bounds']): GeoPoint {
  return {
    lat: bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat),
    lng: bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng),
  };
}

function serviceToStationType(service: string): StationType {
  switch (service) {
    case 'fire': return 'fire_station';
    case 'police': return 'police_station';
    case 'ems': return 'ems_station';
    default: return 'fire_station';
  }
}

export function generateCityStations(city: CityConfig, service: string): Station[] {
  const stations: Station[] = [];
  const count = city.stationSpots[service as keyof typeof city.stationSpots] || 3;
  const names = STATION_NAMES[service] || [];

  for (let i = 0; i < count; i++) {
    const position = randomPointInBounds(city.bounds);
    stations.push({
      id: `${city.id}-${service}-station-${i}`,
      ownerId: 'player',
      type: serviceToStationType(service),
      level: 1,
      name: `${city.name} ${names[i] || `${service} ${i + 1}`}`,
      position,
      capacity: 6,
      unitCount: 0,
      coverageRadius: 3000,
      createdAt: new Date().toISOString(),
    });
  }

  return stations;
}

export function generateUnitsForStations(stations: Station[], service: string): any[] {
  const units: any[] = [];
  const unitTypes: Record<string, { type: string; name: string; icon: string }[]> = {
    fire: [
      { type: 'engine', name: 'Engine', icon: '🚒' },
      { type: 'ladder', name: 'Ladder', icon: '🪜' },
      { type: 'rescue', name: 'Rescue', icon: '🛟' },
      { type: 'battalion_chief', name: 'Chief', icon: '👨‍🚒' },
    ],
    police: [
      { type: 'patrol_car', name: 'Patrol', icon: '🚔' },
      { type: 'swat_van', name: 'SWAT', icon: '🚐' },
      { type: 'k9_unit', name: 'K9', icon: '🐕' },
    ],
    ems: [
      { type: 'ambulance', name: 'Ambulance', icon: '🚑' },
      { type: 'paramedic_unit', name: 'Paramedic', icon: '🩺' },
      { type: 'ems_supervisor', name: 'Supervisor', icon: '📋' },
    ],
  };

  const types = unitTypes[service] || unitTypes.fire;

  stations.forEach((station, si) => {
    const count = Math.min(types.length, 3);
    for (let i = 0; i < count; i++) {
      units.push({
        id: `${station.id}-unit-${i}`,
        ownerId: 'player',
        stationId: station.id,
        type: types[i].type,
        name: `${types[i].name} ${si + 1}-${i + 1}`,
        status: 'available',
        position: { ...station.position },
        destination: null,
        heading: 0,
        speed: 12,
        eta: null,
        missionId: null,
        trainingLevel: 1,
        createdAt: new Date().toISOString(),
      });
    }
  });

  return units;
}

export function generatePatrolRoutes(stations: Station[], city: CityConfig): PatrolRoute[] {
  const routes: PatrolRoute[] = [];

  stations.forEach((station, i) => {
    const waypoints: [number, number][] = [
      [station.position.lat, station.position.lng],
      [
        station.position.lat + 0.005 * (Math.random() - 0.5),
        station.position.lng + 0.005 * (Math.random() - 0.5),
      ],
      [
        station.position.lat + 0.008 * (Math.random() - 0.5),
        station.position.lng + 0.008 * (Math.random() - 0.5),
      ],
      [station.position.lat, station.position.lng],
    ];

    routes.push({
      id: `${city.id}-patrol-${i}`,
      stationId: station.id,
      waypoints,
      assignedUnits: [],
      active: true,
    });
  });

  return routes;
}

export { CITY_CONFIGS };