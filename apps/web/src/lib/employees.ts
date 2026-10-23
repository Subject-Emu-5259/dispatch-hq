// ============================================
// Dispatch HQ — Employee / Personnel Helpers
// ============================================

import type { Employee, EmployeeStatus, Station, Unit, ServiceType } from '@dispatch-hq/shared';
import { UNIT_CONFIGS, STATION_PERKS } from '@dispatch-hq/shared';

const POLICE_TITLES = ['Patrol Officer', 'Sergeant', 'Detective', 'Dispatcher', 'K-9 Handler', 'SWAT Officer', 'Watch Commander'];
const FIRE_TITLES = ['Firefighter', 'Firefighter / EMT', 'Engineer', 'Lieutenant', 'Captain', 'Battalion Chief', 'Hazmat Tech', 'Rescue Specialist'];
const EMS_TITLES = ['EMT', 'Paramedic', 'Paramedic Supervisor', 'Rescue Specialist', 'Dispatcher', 'Field Chief'];

// Traits: two are mechanical (tune the fatigue/morale sim — see lib/personnel)
// and the rest are flavor that shows on the roster card.
const TRAITS = ['Hardened', 'Steady', 'Energized', 'Night Owl', 'Methodical', 'Veteran', 'Cool Under Pressure', 'Team Player', 'Street Smart', 'Precise', 'Caffeine Addict', 'Meticulous'];

const FIRST_NAMES = ['Alex','Jordan','Taylor','Morgan','Casey','Jamie','Riley','Quinn','Avery','Dakota','Reese','Skyler','Sam','Charlie','Hayden','Peyton','Drew','Sage','Cameron','Jesse','Bailey','Kendall','Pat','Dakota','Finley','River','Sasha','Terry','Hunter','Dale','Corey','Devon','Elliott','Frankie','Glen','Harley','Ira','Jean','Kerry','Leslie','Marion','Nicky','Ollie','Perry','Reggie','Shannon','Toby','Val','Wiley'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 0–2 unique traits: ~40% none, ~40% one, ~20% two. */
export function generateTraits(): string[] {
  const roll = Math.random();
  const count = roll < 0.4 ? 0 : roll < 0.8 ? 1 : 2;
  const pool = [...TRAITS];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function generateName(): string {
  return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
}

export function serviceForStation(station: Station): ServiceType {
  if (station.type === 'fire_station') return 'fire';
  if (station.type === 'ems_station') return 'ems';
  return 'police';
}

export function titlesForService(service: ServiceType): string[] {
  if (service === 'fire') return FIRE_TITLES;
  if (service === 'ems') return EMS_TITLES;
  return POLICE_TITLES;
}

export function generateEmployee(station: Station, level = 1, title?: string): Employee {
  const service = serviceForStation(station);
  const role = title || randomFrom(titlesForService(service));
  return {
    id: `emp_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
    stationId: station.id,
    name: generateName(),
    role,
    service,
    level: Math.max(1, level + (Math.random() < 0.2 ? 1 : 0)),
    xp: 0,
    status: 'available',
    assignedUnitId: null,
    traits: generateTraits(),
    fatigue: 0,
    morale: 100,
  };
}

/** Re-roll an employee's traits (v0.21.0) — retrain their personality for a fee. */
export function rerollTraits(employee: Employee): Employee {
  return { ...employee, traits: generateTraits() };
}

export function generateInitialRoster(station: Station): Employee[] {
  const service = serviceForStation(station);
  const titles = titlesForService(service);
  const count = 4 + station.level; // starter roster grows with station level
  const roster: Employee[] = [];
  for (let i = 0; i < count; i++) {
    const level = i === 0 ? 2 : 1;
    const role = titles[i % titles.length];
    roster.push(generateEmployee(station, level, role));
  }
  return roster;
}

export function employeeCapacity(station: Station): number {
  return station.employeeCapacity ?? (station.capacity + 4);
}

/** Hiring cost — the police `dispatch_office` perk discounts recruitment. */
export function hireCost(station: Station): number {
  const base = 500 + station.level * 250;
  const discount = STATION_PERKS.filter(
    (p) => p.kind === 'hire_discount' && (station.perks ?? []).includes(p.id),
  ).reduce((sum, p) => sum + p.value, 0);
  return Math.round(base * (1 - Math.min(0.4, discount)));
}

/** Training cost — fire `training_hall` / EMS `paramedic_training` discount it. */
export function trainCost(employee: Employee, station?: Pick<Station, 'perks'>): number {
  const base = employee.level * 400;
  const discount = STATION_PERKS.filter(
    (p) => p.kind === 'training_discount' && (station?.perks ?? []).includes(p.id),
  ).reduce((sum, p) => sum + p.value, 0);
  return Math.round(base * (1 - Math.min(0.5, discount)));
}

export function xpToNextLevel(level: number): number {
  return 500 * level;
}

/** Staff roles that work the dispatch floor and never ride in units. */
export function isStationStaff(employee: Employee): boolean {
  return employee.role === 'Dispatcher';
}

export function assignableEmployees(station: Station): Employee[] {
  return (station.employees || []).filter((e) => e.status === 'available' && !e.assignedUnitId && !isStationStaff(e));
}

export function stationEmployeesForUnit(station: Station, unit: Unit): Employee[] {
  const all = station.employees || [];
  if (unit.crewIds) {
    const assigned = all.filter((e) => unit.crewIds!.includes(e.id));
    return assigned;
  }
  return [];
}

export function autoAssignCrew(station: Station, unit: Unit): { crewIds: string[]; assigned: Employee[] } {
  const config = UNIT_CONFIGS[unit.type];
  const needed = config?.capacity ?? 2;
  const already = unit.crewIds || [];
  const available = assignableEmployees(station).filter((e) => !already.includes(e.id));
  const count = Math.max(0, needed - already.length);
  const picked = available.slice(0, count);
  const crewIds = [...already, ...picked.map((e) => e.id)];
  return { crewIds, assigned: picked };
}

export function unassignEmployee(employee: Employee): Employee {
  return { ...employee, assignedUnitId: null, status: 'available' as EmployeeStatus };
}
