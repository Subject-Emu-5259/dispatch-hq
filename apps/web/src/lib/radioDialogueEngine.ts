// ============================================
// Dispatch HQ — Radio / Comms Dialogue Engine
// ============================================
// Generates realistic, context-aware emergency-service radio traffic.
// Supports unit↔dispatch, unit↔unit, status reports, acknowledgements,
// cross-service coordination, and patrol/on-scene traffic.

import type { Unit, Mission } from '@dispatch-hq/shared';
import { UNIT_CONFIGS } from '@dispatch-hq/shared';
import { zoneIdForPoint, type CityZone } from '@/lib/patrol/patrolZones';
import { streetsForZone, landmarksForZone, zoneNameForId, crossStreetsForZone, setCityStreetsContext } from '@/data/cityStreets';
import type { Poi } from '@/lib/pois';
import { getCityAccent, type CityAccent } from './cityAccents';

export type CommsService = 'police' | 'fire' | 'ems';
export type CommsParty = 'dispatch' | 'unit' | 'partner' | 'supervisor';

// ── Airlift-capable callouts (v0.22.13) ────────────────────────────────────
// These EMS templates bring CRITICAL victims; when the commander has placed a
// helipad, the responding unit flies the WHOLE call — station → scene → pad.
// The dialogue engine switches to air-ambulance traffic for them (v0.22.18).

export const AIRLIFT_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'remote_rescue_airlift',
  'highway_trauma_airlift',
]);

export function isAirliftMission(mission: Pick<Mission, 'templateId'> | null | undefined): boolean {
  return !!mission && AIRLIFT_TEMPLATE_IDS.has(mission.templateId);
}

// ── Active city context ────────────────────────────────────────────────────
// RadioComms (and the app) sets this whenever the selected city / map bounds
// change. When present, dialogue references the city's REAL streets, zones,
// and landmarks; without it, the engine falls back to the generic pools below.

let radioZones: CityZone[] | null = null;
let radioCityName = 'the city';
// Named places (v0.22.10): when set alongside the zones, dialogue references
// the city's real POIs — "respond to School Emergency at West Memphis High".
let radioPois: Poi[] = [];
// City accent (v0.43.0): per-city dispatch codes, call signs, and terminology.
let radioAccent: CityAccent | null = null;

export function setRadioCityContext(zones: CityZone[] | null, cityName?: string, pois?: Poi[] | null): void {
  radioZones = zones;
  if (cityName) radioCityName = cityName;
  radioPois = pois ?? [];
  radioAccent = cityName ? getCityAccent(cityName) : null;
  // Keep the street/landmark pools pointed at the same city (v0.33.0) so radio
  // traffic names the selected city's real roads and districts.
  setCityStreetsContext(cityName);
}

export function getRadioCityContext(): { zones: CityZone[] | null; cityName: string; pois: Poi[]; accent: CityAccent | null } {
  return { zones: radioZones, cityName: radioCityName, pois: radioPois, accent: radioAccent };
}

function zoneForPoint(point: { lat: number; lng: number } | null): string | null {
  if (!point || !radioZones || radioZones.length === 0) return null;
  return zoneIdForPoint(radioZones, point);
}

function cityRoad(zoneId: string | null): string {
  return rand(streetsForZone(zoneId));
}

function cityLandmark(zoneId: string | null): string {
  return rand(landmarksForZone(zoneId));
}

function cityZoneName(zoneId: string | null): string {
  return zoneNameForId(zoneId);
}

function cityCrossStreets(zoneId: string | null): [string, string] {
  return crossStreetsForZone(zoneId);
}

export interface DialogueMessage {
  from: string;
  to: string | 'all';
  text: string;
  type: 'dispatch' | 'unit' | 'broadcast' | 'system';
  service?: CommsService;
  fromUnitId?: string;
  toUnitId?: string;
}

const ROADS = [
  'Main St', '5th Ave', 'Oak St', 'Broadway', 'River Rd', 'Park Ave',
  'Center St', '1st Ave', '2nd St', '3rd Blvd', 'Maple Dr', 'Elm St',
  'Washington Ave', 'Lincoln Rd', 'Franklin St', 'Commerce Dr', 'Hill St',
];

const LANDMARKS = [
  'City Hall', 'the civic center', 'Central Park', 'the river bridge',
  'Memorial Hospital', 'the stadium', 'the mall', 'the industrial district',
  'the transit station', 'the high school', 'the airport access road',
];

const SECTORS = ['1', '2', '3', '4', 'North', 'South', 'East', 'West', 'A', 'B', 'C'];
export const WEATHER = ['clear', 'overcast', 'light rain', 'foggy', 'cold', 'windy'];
export const DISPATCHER_NAMES = ['Dispatch', 'Central', 'Comms', 'Control', 'Dispatch HQ'];

export const SUPERVISOR_TITLES: Record<CommsService, string[]> = {
  police: ['Sergeant', 'Lieutenant', 'Watch Commander'],
  fire: ['Battalion Chief', 'Captain', 'Shift Commander'],
  ems: ['Supervisor', 'Field Chief', 'Duty Medic'],
};

const CALLCODES: Record<CommsService, string[]> = {
  police: ['Signal 4', 'Code 1', 'Code 2', 'Code 3', '10-33', '10-50', '10-55', '10-80'],
  fire: ['Working Fire', 'Still Box', 'Box Alarm', 'All Hands', 'Signal 99', 'General Alarm'],
  ems: ['Priority 1', 'Priority 2', 'Priority 3', 'Priority 4', 'Alpha', 'Bravo', 'Charlie', 'Delta'],
};

const CODES: Record<CommsService, Record<string, string[]>> = {
  police: {
    ack: ['10-4', 'Copy', 'Roger', 'Affirmative'],
    en_route: ['10-76', '10-8', 'Code 3', 'Rolling'],
    on_scene: ['10-97', '10-23', 'On scene'],
    returning: ['10-42', '10-98', 'Clear', '10-19'],
    patrolling: ['10-41', '10-43', 'Patrol check', '10-8 available'],
    available: ['10-8', '10-7'],
    request: ['10-32', 'Requesting backup', 'Need supervisor'],
    traffic_stop: ['10-28', '10-29', 'Traffic stop'],
    suspect: ['10-65', 'Suspicious person', '10-66'],
  },
  fire: {
    ack: ['10-4', 'Copied', 'QSL', 'Roger'],
    en_route: ['10-76', 'Responding', 'En route', 'QRS'],
    on_scene: ['10-84', 'On scene', 'Working', 'First due'],
    returning: ['10-29', 'Returning', 'Available shortly', 'Clear'],
    patrolling: ['10-41', 'QRT patrol', 'District patrol', 'Fire prevention round'],
    available: ['10-8', 'In quarters'],
    request: ['Requesting second alarm', 'Need ventilation', 'Call for water pressure'],
  },
  ems: {
    ack: ['10-4', 'Copy', 'Acknowledged', 'Roger'],
    en_route: ['10-52', '10-76', 'Responding', 'Rolling'],
    on_scene: ['10-84', 'Patient contact', 'On scene', 'At location'],
    returning: ['10-29', 'In service', 'Returning', 'Clear'],
    patrolling: ['10-41', 'Standby patrol', 'District standby', 'Post position'],
    available: ['10-8', 'Available', 'In quarters'],
    request: ['Requesting ALS', 'Need Priority 1', 'Requesting helicopter'],
  },
};

// Pools used by template placeholders. The Cartesian product of these pools,
// summed across every template, gives the total distinct dialogue count.
/** @internal */ export const POOLS = {
  road: ROADS,
  landmark: LANDMARKS,
  sector: SECTORS,
  weather: WEATHER,
  dispatcher: DISPATCHER_NAMES,
};

// Air-ambulance traffic (v0.22.18) — used when an airlift-capable mission is
// dispatched with a helipad in the city: the unit flies the whole call, and
// the radio says so instead of quoting roads and traffic.
/** @internal */ export const AIR_TEMPLATES: Record<string, string[]> = {
  air_dispatch: [
    '{dispatcher} to {unit}, air ambulance — respond to {call} at {landmark}. Set down at {helipad} for your flight line.',
    '{dispatcher} to {unit}, {code}, airlift requested for {call} near {landmark}. LZ coordinates inbound.',
    '{unit}, {dispatcher}, rotor service for {call} — {helipad} is your pad, expect quick turnaround.',
  ],
  air_ack: [
    '{unit} to {dispatcher}, {code}, blades turning.',
    '{unit}, {code}, air ambulance responding.',
    '{unit} to {dispatcher}, rotor engaged, lifting off {helipad}.',
  ],
  air_en_route: [
    '{unit} airborne, flight ETA {eta} minutes to {call}.',
    '{unit} to {dispatcher}, {code}, at cruising altitude, heading to {call}.',
    '{unit} to {dispatcher}, {code}, weather {weather}, visibility good on the flight line.',
    '{unit} inbound, marking {call} from the air.',
  ],
  air_on_scene: [
    '{unit} to {dispatcher}, {code}, on scene — setting down at {landmark}.',
    '{unit}, {code}, rotor down, patient contact at {call}.',
    '{unit} to {dispatcher}, {code}, landing zone secure, extracting the patient.',
  ],
  air_returning: [
    '{unit} to {dispatcher}, patient on board — airborne to {helipad}.',
    '{unit}, {code}, wheels up, returning to {helipad}.',
    '{unit} to {dispatcher}, {code}, cleared to land at {helipad}.',
  ],
  // v0.22.x hospital leg: after the helicopter sets down at the pad, it hops
  // to the ER with the patient — these lines carry that final leg.
  air_hospital: [
    '{unit} to {dispatcher}, patient secured at {helipad} — final approach to {hospital} ER.',
    '{unit}, {code}, inbound {hospital} with the patient on board.',
    '{unit} to {dispatcher}, cleared from {helipad}, wheels up for {hospital}.',
  ],
  air_chatter: [
    '{unit} to {dispatcher}, {code}, air traffic clear over {sector}.',
    '{unit}, {code}, rotors at RPM, holding at {landmark}.',
  ],
  air_followup: [
    '{dispatcher} to {unit}, report flight status on {call}.',
    '{dispatcher} to {unit}, {code}, what\'s your position on {call}?',
    '{dispatcher} to {unit}, confirm LZ coordinates for {call}.',
  ],
};

/** @internal */ export const TEMPLATES: Record<CommsService, Record<string, string[]>> = {
  police: {
    dispatcher_followup: [
      '{dispatcher} to {unit}, status on {call}? What\'s your 10-20?',
      '{dispatcher} to {unit}, update on {call} — ETA?',
      '{dispatcher} to {unit}, how does it look at {landmark}?',
      '{dispatcher} to {unit}, any units needed at {call}?',
      '{dispatcher} to {unit}, copy — advise when clear of {call}.',
    ],
    unit_followup: [
      '{unit} to {dispatcher}, 10-20 is {road}, in {sector}.',
      '{unit} to {dispatcher}, I\'m at {road} near {landmark}.',
      '{unit} to {dispatcher}, {code}, holding at {road} and {road2}.',
      '{unit} to {dispatcher}, {code}, {sector} unit, all quiet.',
      '{unit} to {dispatcher}, en route, ETA {eta} minutes via {road}.',
    ],
    dispatch_backup: [
      '{dispatcher} to {unit}, backup requested — {call} at {landmark}. Respond with {backup}.',
      '{dispatcher} to {unit}, {call} at {road} needs {backup}. Backup requested — respond.',
      '{unit}, {dispatcher}, {code} — backup requested for {call}. Coordinate with {backup}.',
      '{dispatcher} to {unit}, requesting backup for {call} near {landmark}. Respond with {backup}.',
    ],
    dispatch_assign: [
      '{dispatcher} to {unit}, respond {code} to {call} near {landmark}.',
      '{dispatcher} to {unit}, {call} reported at {road}, handle Code 2.',
      '{unit}, {dispatcher}, you are the closest unit for {call} on {road}.',
      '{unit}, priority {code} in {sector} district, {landmark}.',
      '{dispatcher} to {unit}, alarm drop at {road}, investigate.',
    ],
    unit_ack: [
      '{unit} to {dispatcher}, {code}.',
      '{unit}, {code}, I copy the call.',
      '{unit} responding, {code}.',
      '{unit}, en route, {code}.',
    ],
    unit_en_route: [
      '{unit} to {dispatcher}, {code}, rolling to {call} via {road}.',
      '{unit} to {dispatcher}, still en route, traffic moving on {road}.',
      '{unit}, {code}, ETA about {eta} minutes out.',
      '{unit}, approaching {landmark}, siren and lights active.',
      '{unit} to {dispatcher}, {code}, roads are {weather} but passable.',
      '{unit}, slowing for the intersection at {road}.',
      '{unit} to {dispatcher}, {code}, taking {road} as alternate.',
    ],
    unit_on_scene: [
      '{unit} to {dispatcher}, {code}, on scene at {call}.',
      '{unit}, {code}, established perimeter at {landmark}.',
      '{unit} to {dispatcher}, {code}, scene is secure.',
      '{unit}, suspect in custody at {call}.',
      '{unit} to {dispatcher}, {call} under control, code 4.',
      '{unit}, requesting supervisor for {call} at {landmark}.',
      '{unit} to {dispatcher}, {code}, witness statements taken.',
      '{unit} to {dispatcher}, additional units requested for {call}.',
    ],
    unit_patrol: [
      '{unit} to {dispatcher}, {code}, all quiet in {sector}.',
      '{unit}, patrol check {road}, no activity.',
      '{unit} to {dispatcher}, {code}, clearing {landmark}.',
      '{unit}, traffic light out at {road}, reporting to public works.',
      '{unit}, {code}, suspicious vehicle on {road}.',
      '{unit} to {dispatcher}, foot patrol through {landmark}.',
      '{unit}, {code}, routine stop at {road}, nothing showing.',
      '{unit}, visibility good, no units needed in {sector}.',
    ],
    unit_returning: [
      '{unit} to {dispatcher}, {code}, clear of scene, returning to station.',
      '{unit}, {code}, back in service soon.',
      '{unit} to {dispatcher}, {code}, heading to station via {road}.',
      '{unit}, paperwork complete, returning to quarters.',
      '{unit} to {dispatcher}, {code}, available after refuel.',
    ],
    unit_to_unit: [
      '{unit} to {partner}, cover me on {road}.',
      '{partner}, {unit} is 2 minutes out, status?',
      '{unit} to {partner}, keep the channel clear for {call}.',
      '{unit} to {partner}, swapping positions on {landmark}.',
      '{partner}, {unit} has your six at {road}.',
      '{unit} to {partner}, traffic is stacked on {road}, take alternate.',
      '{unit} to {partner}, victim secure, stand down perimeter.',
    ],
    dispatcher_reply: [
      '{dispatcher} to {unit}, {code}, continue Code 3 to {call}.',
      '{dispatcher} to {unit}, {code}, keep channel clear for updates.',
      '{dispatcher} to {unit}, {code}, copy, standby for next assignment.',
      '{dispatcher} to {unit}, {code}, supervisor notified.',
      '{dispatcher} to {unit}, {code}, return to station when ready.',
      '{dispatcher} to {unit}, {code}, mutual aid units also en route.',
      '{dispatcher} to {unit}, {code}, updated location is {landmark}.',
    ],
    supervisor_check: [
      '{supervisor} to {unit}, status of {call}?',
      '{supervisor} to {unit}, need a supervisor at {landmark}?',
      '{supervisor} to {unit}, {code}, command post set at {road}.',
      '{supervisor} to {unit}, {code}, stage on {road} until cleared.',
    ],
  },
  fire: {
    dispatcher_followup: [
      '{dispatcher} to {unit}, progress report on {call} at {landmark}.',
      '{dispatcher} to {unit}, command wants an update on {call}.',
      '{dispatcher} to {unit}, copy — what\'s the exposure status?',
      '{dispatcher} to {unit}, any additional alarms needed at {call}?',
      '{dispatcher} to {unit}, advise when primary search is complete.',
    ],
    unit_followup: [
      '{unit} to {dispatcher}, {code}, we\'re at {road} staging.',
      '{unit} to {dispatcher}, command post at {landmark}, in {sector}.',
      '{unit} to {dispatcher}, {code}, water supply on {road}.',
      '{unit} to {dispatcher}, {sector} unit, {code}, secondary search done.',
      '{unit} to {dispatcher}, {code}, ETA {eta} minutes via {road}.',
    ],
    dispatch_backup: [
      '{dispatcher} to {unit}, backup requested — {call} at {landmark}. Respond with {backup}.',
      '{dispatcher} to {unit}, {code} — {call} on {road} needs {backup}. Backup requested.',
      '{unit}, {dispatcher}, backup requested for {call} at {landmark}. Coordinate with {backup}.',
      '{dispatcher} to {unit}, additional {backup} responding to {call} — backup requested. Stand by at {landmark}.',
    ],
    dispatch_assign: [
      '{dispatcher} to {unit}, respond to {call} at {landmark}, {code}.',
      '{dispatcher} to {unit}, {call} on {road}, report on scene.',
      '{unit}, {dispatcher}, {call} near {landmark}, respond {code}.',
      '{dispatcher} to {unit}, multiple calls for {call}, {road}.',
      '{unit}, second alarm for {call} at {landmark}.',
    ],
    unit_ack: [
      '{unit} to {dispatcher}, {code}, responding.',
      '{unit}, {code}, copy.',
      '{unit} to {dispatcher}, {code}, rolling.',
      '{unit}, {code}, wheels turning.',
    ],
    unit_en_route: [
      '{unit} to {dispatcher}, {code}, en route to {call} via {road}.',
      '{unit}, {code}, approaching {landmark}.',
      '{unit} to {dispatcher}, {code}, ETA {eta} minutes, {weather}.',
      '{unit}, water tank full, responding to {call}.',
      '{unit} to {dispatcher}, {code}, taking {road}, traffic yielding.',
      '{unit}, {code}, heavy smoke visible from {road}.',
      '{unit} to {dispatcher}, {code}, staging at {landmark} briefly.',
    ],
    unit_on_scene: [
      '{unit} to {dispatcher}, {code}, on scene at {call}.',
      '{unit}, {code}, first due at {landmark}. Determining exposures.',
      '{unit} to {dispatcher}, {code}, fire attack underway.',
      '{unit}, {code}, primary search in progress.',
      '{unit} to {dispatcher}, {code}, ventilation requested for {call}.',
      '{unit}, {code}, 2 lines in service at {landmark}.',
      '{unit} to {dispatcher}, {code}, victim removed from structure.',
      '{unit}, {code}, command transferred to {supervisor}.',
    ],
    unit_patrol: [
      '{unit} to {dispatcher}, {code}, inspection round complete in {sector}.',
      '{unit}, {code}, hydrant check on {road}, good flow.',
      '{unit} to {dispatcher}, all clear at {landmark}.',
      '{unit}, {code}, visibility unobstructed in {sector}.',
      '{unit}, routine familiarization on {road}.',
    ],
    unit_returning: [
      '{unit} to {dispatcher}, {code}, clear of scene, back in service.',
      '{unit}, {code}, returning to quarters.',
      '{unit} to {dispatcher}, equipment secured, heading in.',
      '{unit}, {code}, {weather} roads on return route.',
    ],
    unit_to_unit: [
      '{unit} to {partner}, take the alpha side of {landmark}.',
      '{partner}, {unit} has water supply at {road}.',
      '{unit} to {partner}, ladder up on the bravo side.',
      '{unit} to {partner}, vent the roof before interior entry.',
      '{partner}, {unit} clearing floor two, status on floor three?',
      '{unit} to {partner}, RIT standby at {road}.',
    ],
    dispatcher_reply: [
      '{dispatcher} to {unit}, {code}, additional alarms ordered.',
      '{dispatcher} to {unit}, {code}, supply line at {road}.',
      '{dispatcher} to {unit}, {code}, copy your PAR.',
      '{dispatcher} to {unit}, {code}, all units accounted for.',
      '{dispatcher} to {unit}, {code}, rehab at {landmark}.',
      '{dispatcher} to {unit}, {code}, return when clear.',
      '{dispatcher} to {unit}, {code}, conditions updated by caller.',
    ],
    supervisor_check: [
      '{supervisor} to {unit}, command post location at {landmark}.',
      '{supervisor} to {unit}, {code}, sector assignments on {road}.',
      '{supervisor} to {unit}, {code}, establish collapse zone.',
      '{supervisor} to {unit}, {code}, pass accountability.',
    ],
  },
  ems: {
    dispatcher_followup: [
      '{dispatcher} to {unit}, patient status on {call}?',
      '{dispatcher} to {unit}, copy — transport destination confirmed?',
      '{dispatcher} to {unit}, any update on {call} at {landmark}?',
      '{dispatcher} to {unit}, advise when you\'re rolling with the patient.',
      '{dispatcher} to {unit}, additional ALS needed at {call}?',
    ],
    unit_followup: [
      '{unit} to {dispatcher}, {code}, patient contact at {road}.',
      '{unit} to {dispatcher}, we\'re staged at {landmark}, in {sector}.',
      '{unit} to {dispatcher}, {code}, vitals stable, loading at {road}.',
      '{unit} to {dispatcher}, {sector} unit, {code}, ready for transport.',
      '{unit} to {dispatcher}, ETA {eta} minutes via {road}.',
    ],
    dispatch_backup: [
      '{dispatcher} to {unit}, backup requested — {call} at {landmark}. Respond with {backup}.',
      '{dispatcher} to {unit}, {code} — {call} in {sector} needs {backup}. Backup requested.',
      '{unit}, {dispatcher}, backup requested for {call} at {landmark}. Coordinate with {backup}.',
      '{dispatcher} to {unit}, {backup} units joining for {call} near {landmark} — backup requested.',
    ],
    dispatch_assign: [
      '{dispatcher} to {unit}, {call} at {landmark}, respond {code}.',
      '{unit}, {dispatcher}, {call} on {road}, {code}.',
      '{dispatcher} to {unit}, {code}, {call} reported in {sector}.',
      '{unit}, {dispatcher}, standby for {call} near {landmark}.',
      '{dispatcher} to {unit}, transfer to {call} from {road}.',
    ],
    unit_ack: [
      '{unit} to {dispatcher}, {code}, responding.',
      '{unit}, {code}, copy.',
      '{unit} to {dispatcher}, {code}, patient side shortly.',
      '{unit}, {code}, rolling to {call}.',
    ],
    unit_en_route: [
      '{unit} to {dispatcher}, {code}, en route to {call} on {road}.',
      '{unit}, {code}, ETA {eta} minutes, {weather} conditions.',
      '{unit} to {dispatcher}, {code}, approaching {landmark}.',
      '{unit}, requesting ALS for {call} at {landmark}.',
      '{unit} to {dispatcher}, {code}, traffic yielding on {road}.',
      '{unit}, radio report: conscious and breathing, {call}.',
      '{unit}, {code}, rerouting around congestion on {road}.',
    ],
    unit_on_scene: [
      '{unit} to {dispatcher}, {code}, on scene at {call}.',
      '{unit}, {code}, patient contact at {landmark}.',
      '{unit} to {dispatcher}, {code}, beginning assessment.',
      '{unit}, {code}, loading patient, transport shortly.',
      '{unit} to {dispatcher}, {code}, need police for scene safety at {call}.',
      '{unit}, {code}, vitals stable, preparing for transport.',
      '{unit} to {dispatcher}, requesting destination guidance for {call}.',
      '{unit}, {code}, patient transferred to hospital crew.',
    ],
    unit_patrol: [
      '{unit} to {dispatcher}, {code}, standby post at {landmark}.',
      '{unit}, {code}, no calls in {sector}.',
      '{unit} to {dispatcher}, {code}, covering special event at {landmark}.',
      '{unit}, {code}, staged on {road}, ready.',
      '{unit}, checking equipment between standby assignments.',
    ],
    unit_returning: [
      '{unit} to {dispatcher}, {code}, clear, returning to post.',
      '{unit}, {code}, available after restock.',
      '{unit} to {dispatcher}, {code}, back to station via {road}.',
      '{unit}, patient dropped off, returning to coverage.',
    ],
    unit_to_unit: [
      '{unit} to {partner}, handoff report for {call}.',
      '{partner}, {unit} taking primary on {road}.',
      '{unit} to {partner}, need backboard at {landmark}.',
      '{unit} to {partner}, spine precautions observed.',
      '{partner}, {unit} has airway management at {call}.',
      '{unit} to {partner}, transport unit is 5 minutes out.',
    ],
    dispatcher_reply: [
      '{dispatcher} to {unit}, {code}, destination is Memorial Hospital.',
      '{dispatcher} to {unit}, {code}, ALS unit also responding to {call}.',
      '{dispatcher} to {unit}, {code}, keep me updated on patient status.',
      '{dispatcher} to {unit}, {code}, return to {sector} coverage.',
      '{dispatcher} to {unit}, {code}, hospital notified.',
      '{dispatcher} to {unit}, {code}, next call is {call} at {landmark}.',
    ],
    supervisor_check: [
      '{supervisor} to {unit}, {code}, triage tag count?',
      '{supervisor} to {unit}, {code}, MCI protocol at {landmark}?',
      '{supervisor} to {unit}, {code}, stage at {road} until cleared.',
      '{supervisor} to {unit}, {code}, resource request noted.',
    ],
  },
};

/** @internal */ export const CROSS_SERVICE_TEMPLATES: Record<string, Record<CommsService, string[]>> = {
  police_to_fire: {
    police: ['{unit} to fire command, perimeter is set at {landmark}.', '{unit} to {partner}, holding traffic on {road} for fire apparatus.'],
    fire: ['Fire command to {unit}, copy your perimeter.', 'Fire command to {unit}, keep {road} clear for water supply.'],
    ems: [],
  },
  fire_to_ems: {
    police: [],
    fire: ['{unit} to EMS, trauma patient ready at {landmark}.', '{unit} to {partner}, patient extricated, bring stretcher.'],
    ems: ['EMS to {unit}, copy, staging at {road}.', 'EMS to {unit}, patient status on arrival?'],
  },
  police_to_ems: {
    police: ['{unit} to EMS, scene is secure at {landmark}.', '{unit} to {partner}, clear to enter {road}.'],
    fire: [],
    ems: ['EMS to {unit}, copy, coming in.', 'EMS to {unit}, thanks for scene safety.'],
  },
};

/** @internal */ export function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getUnitServiceType(type: string): CommsService {
  if (type.includes('engine') || type.includes('ladder') || type.includes('rescue') || type.includes('battalion') || type.includes('fire')) return 'fire';
  if (type.includes('ambulance') || type.includes('paramedic') || type.includes('medic')) return 'ems';
  return 'police';
}

export function statusCode(service: CommsService, context: string): string {
  // Use accent-specific codes when a city accent is active.
  const codes = radioAccent?.codes?.[service] ?? CODES[service];
  const arr = codes?.[context] ?? codes?.ack ?? CODES[service].ack;
  return rand(arr);
}

function callCode(service: CommsService): string {
  // Use accent-specific call codes when a city accent is active.
  const callCodes = radioAccent?.callCodes?.[service] ?? CALLCODES[service];
  return rand(callCodes);
}

/** @internal */ export function unitDisplay(unit: Unit): string {
  const icon = UNIT_CONFIGS[unit.type]?.icon || '🚛';
  return `${icon} ${unit.name}`;
}

/** @internal */ export function missionName(unit: Unit, missions: Mission[]): string {
  if (!unit.missionId) return 'scene';
  const m = missions.find((x) => x.id === unit.missionId);
  if (!m) return 'call';
  // POI-anchored call: name the place, not just the incident (v0.22.10).
  if (m.poiId) {
    const poi = radioPois.find((p) => p.id === m.poiId);
    if (poi) return `${m.name} at ${poi.name}`;
  }
  return m.name;
}

/** @internal */ export function etaMinutes(unit: Unit): string {
  if (!unit.eta || unit.eta <= 0) return 'a few';
  return Math.ceil(unit.eta / 60).toString();
}

/** @internal */ export function findPartner(unit: Unit, units: Unit[]): Unit | null {
  const svc = getUnitServiceType(unit.type);
  const sameSvc = units.filter(
    (u) =>
      u.id !== unit.id &&
      u.status !== 'available' &&
      getUnitServiceType(u.type) === svc,
  );
  if (sameSvc.length === 0) return null;
  return rand(sameSvc);
}

/** @internal */ export function findSupervisor(unit: Unit, units: Unit[]): Unit | null {
  const svc = getUnitServiceType(unit.type);
  return units.find((u) => u.id !== unit.id && getUnitServiceType(u.type) === svc && (u.type.includes('chief') || u.type.includes('supervisor') || u.type.includes('battalion'))) || null;
}

/** @internal */ export function renderTpl(tpl: string, ctx: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => ctx[key] ?? `{${key}}`);
}

/** @internal */ export function makeCtx(
  unit: Unit,
  service: CommsService,
  missions: Mission[],
  partner?: Unit | null,
  extra: Record<string, string> = {},
): Record<string, string> {
  const zoneId = zoneForPoint(unit.position);
  // Use accent-specific dispatcher/supervisor names when a city accent is active.
  const dispatchers = radioAccent?.dispatcherNames ?? DISPATCHER_NAMES;
  const supervisors = radioAccent?.supervisorTitles?.[service] ?? SUPERVISOR_TITLES[service];
  return {
    unit: unitDisplay(unit),
    service,
    // Real streets/landmarks when the city context is set; generic pools otherwise.
    road: cityRoad(zoneId),
    road2: cityCrossStreets(zoneId)[1],
    landmark: cityLandmark(zoneId),
    sector: cityZoneName(zoneId),
    weather: rand(WEATHER),
    dispatcher: rand(dispatchers),
    call: missionName(unit, missions),
    code: statusCode(service, 'ack'),
    eta: etaMinutes(unit),
    partner: partner ? unitDisplay(partner) : 'all units',
    supervisor: rand(supervisors),
    ...extra,
  };
}

/** @internal Zone-aware intersection callout: "at the corner of X and Y". */
export function crossStreetsText(unit: Unit): string {
  const zoneId = zoneForPoint(unit.position);
  const [a, b] = cityCrossStreets(zoneId);
  return `${a} and ${b}`;
}

/** @internal */ export function pickTemplate(service: CommsService, context: string): string {
  // Use accent-specific template overrides when a city accent is active.
  const overrides = radioAccent?.templateOverrides?.[service]?.[context];
  if (overrides && overrides.length > 0) return rand(overrides);
  const arr = TEMPLATES[service]?.[context] ?? TEMPLATES[service].unit_ack;
  return rand(arr);
}

/** @internal Build a single dialogue line. */
export function line(
  from: string,
  to: string | 'all',
  text: string,
  type: DialogueMessage['type'],
  service: CommsService,
  fromUnitId?: string,
  toUnitId?: string,
): DialogueMessage {
  return {
    from,
    to,
    text,
    type,
    service,
    fromUnitId: fromUnitId,
    toUnitId: toUnitId,
  };
}

/** Yield dispatcher assignment -> unit ack optionally with partner ack. */
export function* transitionConversation(
  prevStatus: string,
  nextStatus: string,
  unit: Unit,
  units: Unit[],
  missions: Mission[],
  helipadName?: string,
): Generator<DialogueMessage> {
  const service = getUnitServiceType(unit.type);
  const partner = findPartner(unit, units);
  const mission = missions.find((m) => m.id === unit.missionId);
  const airborne = isAirliftMission(mission) && !!helipadName;
  const ctx = makeCtx(unit, service, missions, partner, {
    code: statusCode(service, nextStatus),
    ...(helipadName ? { helipad: helipadName } : {}),
  });
  const unitName = unitDisplay(unit);

  if (prevStatus === 'available' && nextStatus === 'patrolling') {
    yield line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatch_assign'), ctx), 'dispatch', service, undefined, unit.id);
    ctx.code = statusCode(service, 'ack');
    yield line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_ack'), ctx), 'unit', service, unit.id);
    ctx.code = statusCode(service, 'patrolling');
    yield line(unitName, 'all', renderTpl(pickTemplate(service, 'unit_patrol'), ctx), 'unit', service, unit.id);
    if (partner) {
      yield line(unitName, unitDisplay(partner), renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, unit.id, partner.id);
    }
    return;
  }

  if (nextStatus === 'en_route') {
    ctx.code = statusCode(service, 'en_route');
    if (airborne) {
      // Air-ambulance launch — the unit flies to the scene, not the roads.
      yield line(rand(DISPATCHER_NAMES), unitName, renderTpl(rand(AIR_TEMPLATES.air_dispatch), ctx), 'dispatch', service, undefined, unit.id);
      ctx.code = statusCode(service, 'ack');
      yield line(unitName, rand(DISPATCHER_NAMES), renderTpl(rand(AIR_TEMPLATES.air_ack), ctx), 'unit', service, unit.id);
      ctx.code = statusCode(service, 'en_route');
      yield line(unitName, 'all', renderTpl(rand(AIR_TEMPLATES.air_en_route), ctx), 'unit', service, unit.id);
    } else {
      yield line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatch_assign'), ctx), 'dispatch', service, undefined, unit.id);
      ctx.code = statusCode(service, 'ack');
      yield line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_ack'), ctx), 'unit', service, unit.id);
      ctx.code = statusCode(service, 'en_route');
      yield line(unitName, 'all', renderTpl(pickTemplate(service, 'unit_en_route'), ctx), 'unit', service, unit.id);
      if (partner) {
        yield line(unitDisplay(partner), unitName, renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, partner.id, unit.id);
      }
    }
    return;
  }

  if (nextStatus === 'on_scene') {
    ctx.code = statusCode(service, 'on_scene');
    if (airborne) {
      yield line(unitName, rand(DISPATCHER_NAMES), renderTpl(rand(AIR_TEMPLATES.air_on_scene), ctx), 'unit', service, unit.id);
    } else {
      yield line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_on_scene'), ctx), 'unit', service, unit.id);
    }
    ctx.code = statusCode(service, 'ack');
    yield line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatcher_reply'), ctx), 'dispatch', service, undefined, unit.id);
    if (partner) {
      ctx.code = statusCode(service, 'ack');
      yield line(unitDisplay(partner), unitName, renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, partner.id, unit.id);
    }
    return;
  }

  if (nextStatus === 'returning') {
    ctx.code = statusCode(service, 'returning');
    // An air-ambulance unit reports its return over the air, not the roads
    // (v0.22.x fix — airborne units previously quoted street traffic).
    yield line(unitName, rand(DISPATCHER_NAMES), renderTpl(airborne ? rand(AIR_TEMPLATES.air_returning) : pickTemplate(service, 'unit_returning'), ctx), 'unit', service, unit.id);
    ctx.code = statusCode(service, 'ack');
    yield line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatcher_reply'), ctx), 'dispatch', service, undefined, unit.id);
    return;
  }

  // Fallback status report
  ctx.code = statusCode(service, 'ack');
  yield line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_ack'), ctx), 'unit', service, unit.id);
}

