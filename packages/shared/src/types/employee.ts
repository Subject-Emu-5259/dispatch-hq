// ============================================
// Dispatch HQ — Employee / Personnel Types
// ============================================

export type EmployeeStatus = 'available' | 'assigned' | 'training' | 'off_duty' | 'injured';

export interface Employee {
  id: string;
  stationId: string;
  name: string;
  role: string;
  service: 'fire' | 'police' | 'ems';
  level: number;
  xp: number;
  status: EmployeeStatus;
  assignedUnitId?: string | null;
  trainingEndAt?: string | null; // ISO date
  traits?: string[];
  /** 0–100 how tired the employee is (0 = fresh, 100 = exhausted). Raised by
   * field time, recovered at the station — see lib/personnel. */
  fatigue?: number;
  /** 0–100 morale (100 = high). Falls when overworked; training restores it. */
  morale?: number;
}
