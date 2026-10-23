// ============================================
// Dispatch HQ — Criminal Justice Types
// ============================================

export type WarrantStatus = 'none' | 'active' | 'served' | 'expired';
export type RiskLevel = 'low' | 'medium' | 'high' | 'violent';

export interface CriminalRecord {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // MM/DD/YYYY
  heightIn: number;
  weightLb: number;
  citizenship: string;
  address: string;
  city: string;
  state: string;
  photoSeed: string;
  riskLevel: RiskLevel;
  warrantStatus: WarrantStatus;
  knownAliases: string[];
  charges: string[];
  arrestCount: number;
  /** Link to an active mission/report when present. */
  missionId?: string;
  notes: string;
}

export type InmateStatus = 'booking' | 'held' | 'released' | 'transferred';

export interface Inmate {
  id: string;
  recordId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  photoSeed: string;
  charges: string[];
  sentenceDays: number;
  bookingNumber: string;
  bookingTime: number;
  cellBlock: string;
  bailAmount: number;
  status: InmateStatus;
  riskLevel: RiskLevel;
}

// ── EMS: patient transport & city hospital ──

export type PatientStatus = 'admitted' | 'treated' | 'discharged';
export type PatientSeverity = 'critical' | 'moderate' | 'stable';

export interface Patient {
  id: string;
  missionId: string;
  firstName: string;
  lastName: string;
  age: number;
  condition: string;
  severity: PatientSeverity;
  admitTime: number;
  /** Set once the treatment cycle completes and the patient is ready to leave. */
  treatedAt?: number;
  /** Set when the patient leaves the ER — discharged (after treatment) or released early. */
  dischargedAt?: number;
  status: PatientStatus;
  roomNumber: string;
  /** Call sign of the EMS unit that delivered this patient (v0.22.9 transport). */
  transportedBy?: string;
  /** How the patient reached the ER — 'air' (helicopter via the helipad) or
   *  'road' (ambulance). Only set for transported patients (v0.22.14 airlift
   *  tally); scene-admitted patients carry no mode. */
  transportMode?: 'air' | 'road';
  /** True when the ER was at capacity and the patient was diverted to the
   *  regional trauma center (v0.22.12 ER depth). */
  diverted?: boolean;
  /** Name of the trauma center the patient was diverted to (off-map). */
  divertedTo?: string;
}

// ── Fire: fire marshal bureau & post-fire investigations ──

export type InvestigationStatus = 'open' | 'cleared';
export type FireCause = 'Electrical' | 'Arson' | 'Accidental' | 'Unknown';

export interface FireInvestigation {
  id: string;
  missionId: string;
  address: string;
  structure: string;
  openedAt: number;
  cause: FireCause;
  difficulty: number;
  status: InvestigationStatus;
}
