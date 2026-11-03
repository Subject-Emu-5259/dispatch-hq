// ============================================
// Dispatch HQ — Station Types
// ============================================

export type StationType = 'fire_station' | 'police_station' | 'ems_station';

export type ServiceType = 'fire' | 'police' | 'ems';

export interface StationConfig {
  type: StationType;
  name: string;
  description: string;
  icon: string;
  color: string;
  baseCost: number;
  baseCapacity: number;
  maxLevel: number;
}
import type { Employee } from './employee';

export interface Station {
  id: string;
  ownerId: string;
  type: StationType;
  level: number;
  name: string;
  themeId?: string; // Urban | Suburban | County (see STATION_THEMES)
  position: GeoPoint;
  capacity: number;
  unitCount: number;
  coverageRadius: number;
  createdAt: string;
  employees?: Employee[];
  maxEmployees?: number;
  employeeCapacity?: number;
  staffLevel?: number;
  /** Chosen station specialization perks (v0.20.1) — see constants/perks. */
  perks?: string[];
  /** Batch 3a shift schedule: true = that shift is covered. Absent = unscheduled (neutral). */
  shifts?: { day?: boolean; night?: boolean; weekend?: boolean };
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface StationLevel {
  level: number;
  cost: number;
  capacity: number;
  coverageRadius: number;
}
