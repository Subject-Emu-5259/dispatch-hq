// ============================================
// Dispatch HQ — Unit Types
// ============================================

import type { GeoPoint } from './station';

export type UnitType = 'engine' | 'ladder' | 'rescue' | 'battalion_chief'
  | 'patrol_car' | 'swat_van' | 'k9_unit' | 'police_suv'
  | 'ambulance' | 'paramedic_unit' | 'ems_supervisor' | 'fire_ambulance';

export type UnitStatus = 'available' | 'dispatched' | 'en_route' | 'on_scene' | 'returning' | 'patrolling';

export interface UnitConfig {
  type: UnitType;
  name: string;
  description: string;
  icon: string;
  speed: number;          // meters per second
  capacity: number;       // personnel needed
  cost: number;
  unlockLevel: number;
  trainingTime: number;   // seconds
}

export interface Unit {
  id: string;
  ownerId: string;
  stationId: string;
  type: UnitType;
  name: string;
  liveryId?: string; // per-service paint scheme (see LIVERIES)
  status: UnitStatus;
  position: GeoPoint | null;
  destination: GeoPoint | null;
  heading: number;
  speed: number;          // configured top speed (m/s)
  currentSpeed?: number;  // real-time measured speed (m/s)
  lastPosition?: GeoPoint;
  lastPositionAt?: number;
  eta: number | null;     // seconds
  missionId: string | null;
  trainingLevel: number;
  trainingEndsAt?: number; // epoch ms — unit is unavailable while set (training in progress)
  /** Batch 3a veterancy: XP earned per cleared mission (rank derived). */
  veterancyXp?: number;
  /** Batch 3a academy certs held (course ids: 'driving' | 'hazmat' | 'paramedic'). */
  certs?: string[];
  /** Batch 3a academy enrollment in progress (game-clock end), or null. */
  academy?: { course: string; endsAtGameMin: number } | null;
  createdAt: string;
  waypoints?: GeoPoint[]; // Road-following path waypoints
  waypointIndex?: number; // Current waypoint index
  routeDistanceKm?: number; // total road distance of the current dispatch route
  etaTotal?: number; // original ETA in seconds (for progress-based interpolation)
  patrolRouteId?: string | null; // assigned patrol route
  patrolWaypointIndex?: number;  // current index in patrol route waypoints
  patrolProgress?: number;       // 0..1 arc-length progress along the patrol route (keeps units on the road polyline)
  returnTimer?: number;          // seconds before an available unit auto-returns to station
  postMissionBehavior?: 'return' | 'patrol' | 'auto'; // what to do after a mission clears
  patrolMode?: 'station-beat' | 'zone' | 'hotspot' | 'city-sweep'; // patrol routing style
  patrolAreaId?: string | null; // zone/area id if zone/hotspot assigned
  patrolShiftEndsAt?: number;   // epoch ms — end of the current patrol shift (auto-return for a rest break)
  lastStatusReportAt?: number; // epoch ms
  lastUnitChatAt?: number; // epoch ms
  crewIds?: string[]; // assigned employee IDs
}
