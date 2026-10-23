// ============================================
// Dispatch HQ — EMS & Fire Agency Helpers
// ============================================
// Patient transport (EMS → City Hospital) and post-fire investigations
// (Fire Marshal Bureau) — the fire/EMS mirror of the police criminal
// records + county jail loop. Builders create persistent follow-up
// records when a scene is cleared.

import type { Mission, Patient, FireInvestigation, PatientSeverity, FireCause } from '@dispatch-hq/shared';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function pick<T>(arr: T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function seededChoice(seed: number, arr: string[]): string {
  let h = seed;
  for (let i = 0; i < 3; i++) h = (h * 9301 + 49297) % 233280;
  return arr[Math.abs(h) % arr.length];
}

const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'Michael', 'Susan', 'David', 'Karen', 'John', 'Lisa', 'Carlos', 'Aisha', 'Derrick', 'Tanya', 'Marcus', 'Elena'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Davis', 'Garcia', 'Wilson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'Nguyen'];
const STREET_NAMES = ['Main St', 'Oak Ave', 'Elm St', 'Broadway', 'Riverside Dr', 'Martin Luther King Blvd', 'Jefferson Ave', '7th St', 'Park Ave', 'Union Ave', 'Walnut St', 'Harrison St'];
const ROOMS = ['ER-1', 'ER-2', 'ICU-1', 'ICU-2', 'Ward-A', 'Ward-B', 'Ward-C', 'Surgery-1'];

/** Keyword map from mission names to a concrete medical condition. */
function conditionFromMission(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('cardiac') || n.includes('heart')) return 'Cardiac Arrest';
  if (n.includes('breath') || n.includes('respirat')) return 'Respiratory Distress';
  if (n.includes('accident') || n.includes('collision') || n.includes('crash')) return 'Trauma — Multi-Vehicle';
  if (n.includes('fall') || n.includes('injur')) return 'Trauma — Fall Injury';
  if (n.includes('overdose')) return 'Drug Overdose';
  if (n.includes('stroke')) return 'Stroke';
  if (n.includes('fire') || n.includes('burn')) return 'Smoke Inhalation / Burns';
  if (n.includes('childbirth') || n.includes('labor')) return 'Complicated Labor';
  if (n.includes('seizure')) return 'Seizure';
  return pick(['Chest Pain', 'Severe Allergic Reaction', 'Uncontrolled Bleeding', 'Abdominal Pain', 'High Fever', 'Diabetic Emergency']);
}

/**
 * A victim of an EMS call is transported and admitted to the city hospital.
 * Runs inside the mission-completion path for every cleared EMS scene.
 */
export function buildPatientFromMission(mission: Mission): Patient {
  const severity: PatientSeverity =
    mission.difficulty >= 6 ? 'critical' : mission.difficulty >= 3 ? 'moderate' : 'stable';
  const seed = mission.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    id: makeId('patient'),
    missionId: mission.id,
    firstName: seededChoice(seed + 1, FIRST_NAMES),
    lastName: seededChoice(seed + 2, LAST_NAMES),
    age: 4 + Math.floor(Math.random() * 88),
    condition: conditionFromMission(mission.name),
    severity,
    admitTime: Date.now(),
    status: 'admitted',
    roomNumber: pick(ROOMS),
  };
}

/**
 * A fire marshal case opened after a fire scene is cleared — cause is
 * determined at open time (arson chance rises with difficulty). Closing
 * the case pays the department an inspection/clearance fee.
 */
export function buildInvestigationFromMission(mission: Mission): FireInvestigation {
  const seed = mission.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const arsonChance = 0.1 + mission.difficulty * 0.02;
  const roll = Math.random();
  const cause: FireCause =
    roll < arsonChance ? 'Arson' : roll < arsonChance + 0.45 ? 'Electrical' : roll < arsonChance + 0.8 ? 'Accidental' : 'Unknown';
  const structures = ['Residence', 'Garage', 'Warehouse', 'Retail Store', 'Apartment Building', 'Restaurant', 'Vehicle', 'Storage Facility'];
  const streetNumber = 100 + Math.floor(Math.random() * 8900);
  return {
    id: makeId('invest'),
    missionId: mission.id,
    address: `${streetNumber} ${seededChoice(seed, STREET_NAMES)}`,
    structure: seededChoice(seed + 3, structures),
    openedAt: Date.now(),
    cause,
    difficulty: mission.difficulty,
    status: 'open',
  };
}

/** Clearance fee for filing a fire-marshal report on a cleared case. */
export function investigationReward(difficulty: number): number {
  return 150 + difficulty * 75;
}
