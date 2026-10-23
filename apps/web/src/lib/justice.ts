// ============================================
// Dispatch HQ — Criminal records & county jail helpers
// ============================================

import type { CriminalRecord, Inmate, RiskLevel, WarrantStatus } from '@dispatch-hq/shared';

const FIRST_NAMES = [
  'James','Robert','John','Michael','David','William','Richard','Joseph','Thomas','Charles',
  'Daniel','Matthew','Anthony','Mark','Donald','Steven','Andrew','Paul','Joshua','Kenneth',
  'Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan','Jacob',
  'Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin',
  'Samuel','Gregory','Frank','Alexander','Raymond','Patrick','Jack','Dennis','Jerry','Tyler',
  'Mary','Patricia','Jennifer','Linda','Elizabeth','Susan','Jessica','Sarah','Karen','Nancy',
  'Lisa','Betty','Margaret','Sandra','Ashley','Kimberly','Emily','Donna','Michelle','Dorothy',
  'Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Laura','Sharon','Cynthia','Kathleen',
  'Amy','Shirley','Angela','Helen','Anna','Brenda','Pamela','Nicole','Emma','Samantha',
];

const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
];

const STREETS = [
  'Main St','Broadway','Oak Ave','Maple Dr','Cedar Ln','Pine St','Elm St','Washington Ave',
  'Lake St','Hill Rd','River Rd','Jefferson Ave','Lincoln Hwy','Wilson Blvd','Park Ave',
  '2nd St','3rd St','Center St','Church St','North St','South St','West End Blvd','East Ave',
];

const CITIZENSHIPS = ['US','US','US','US','Mexico','Canada','El Salvador','Honduras','Guatemala','Jamaica'];

const CRIMES = [
  'Petty theft','Shoplifting','Criminal trespass','Vandalism','Public intoxication','Disorderly conduct',
  'Possession of controlled substance','Drug paraphernalia','DUI','Reckless driving','Suspended license',
  'Domestic battery','Assault','Aggravated assault','Robbery','Burglary','Auto theft','Criminal mischief',
  'Resisting arrest','Obstruction','Possession of stolen property','Fraud','Forgery','Identity theft',
  'Weapons violation','Unlawful possession of firearm','Probation violation','Warrant - failure to appear',
  'Warrant - unpaid fines','Warrant - felony',
];

const CELL_BLOCKS = ['A','B','C','D','E','F','G','H'];

function rng(seed: number): number {
  const x = Math.sin(seed * 9999 + 0.5) * 13758.5453123;
  return x - Math.floor(x);
}

function seededChoice<T>(seed: number, arr: T[]): T {
  return arr[Math.floor(rng(seed) * arr.length)];
}

function dateOfBirth(seed: number): string {
  const age = 18 + Math.floor(rng(seed + 1) * 52);
  const now = new Date();
  const year = now.getFullYear() - age;
  const month = 1 + Math.floor(rng(seed + 2) * 12);
  const day = 1 + Math.floor(rng(seed + 3) * 28);
  return `${month.toString().padStart(2,'0')}/${day.toString().padStart(2,'0')}/${year}`;
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function buildCriminalRecord(city: string, state: string, missionId?: string, seed?: number): CriminalRecord {
  const baseSeed = seed ?? Math.floor(Math.random() * 1_000_000);
  const firstName = seededChoice(baseSeed, FIRST_NAMES);
  const lastName = seededChoice(baseSeed + 0.1, LAST_NAMES);
  const riskRoll = rng(baseSeed + 7);
  let riskLevel: RiskLevel = 'low';
  if (riskRoll > 0.92) riskLevel = 'violent';
  else if (riskRoll > 0.76) riskLevel = 'high';
  else if (riskRoll > 0.46) riskLevel = 'medium';

  const priorCount = Math.floor(rng(baseSeed + 8) * (riskLevel === 'violent' ? 8 : riskLevel === 'high' ? 5 : 3));
  const charges: string[] = [];
  const nCharges = 1 + Math.floor(rng(baseSeed + 9) * 3);
  for (let i = 0; i < nCharges; i++) {
    charges.push(seededChoice(baseSeed + 10 + i, CRIMES));
  }

  let warrantStatus: WarrantStatus = missionId ? (rng(baseSeed + 11) > 0.4 ? 'active' : 'none') : 'none';
  if (missionId && riskLevel === 'high' && rng(baseSeed + 12) > 0.5) warrantStatus = 'active';

  return {
    id: makeId('record'),
    firstName,
    lastName,
    dateOfBirth: dateOfBirth(baseSeed),
    heightIn: 60 + Math.floor(rng(baseSeed + 2) * 17),
    weightLb: 110 + Math.floor(rng(baseSeed + 3) * 170),
    citizenship: seededChoice(baseSeed + 4, CITIZENSHIPS),
    address: `${100 + Math.floor(rng(baseSeed + 5) * 9800)} ${seededChoice(baseSeed + 6, STREETS)}`,
    city,
    state,
    photoSeed: `${firstName}${lastName}${baseSeed}`,
    riskLevel,
    warrantStatus,
    knownAliases: rng(baseSeed + 13) > 0.7 ? [`"${seededChoice(baseSeed+14, FIRST_NAMES)}"`] : [],
    charges,
    arrestCount: priorCount,
    missionId,
    notes: '',
  };
}

function bookingNumber(): string {
  return `B-${Date.now().toString(36).slice(-6).toUpperCase()}-${Math.floor(Math.random()*999).toString().padStart(3,'0')}`;
}

export function buildInmateFromRecord(record: CriminalRecord, city: string): Inmate {
  return {
    id: makeId('inmate'),
    recordId: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    dateOfBirth: record.dateOfBirth,
    photoSeed: record.photoSeed,
    charges: record.charges,
    sentenceDays: 1 + Math.floor(Math.random() * 180) + (record.riskLevel === 'violent' ? 180 : record.riskLevel === 'high' ? 60 : 0),
    bookingNumber: bookingNumber(),
    bookingTime: Date.now(),
    cellBlock: `${seededChoice(record.id.length, CELL_BLOCKS)}-${Math.ceil(Math.random()*9)}`,
    bailAmount: record.riskLevel === 'violent' ? 50000 + Math.floor(Math.random()*50000) : record.riskLevel === 'high' ? 10000 + Math.floor(Math.random()*15000) : 500 + Math.floor(Math.random()*2500),
    status: 'booking',
    riskLevel: record.riskLevel,
  };
}

export function generateRecordPool(city: string, state: string, count: number, startSeed = 0): CriminalRecord[] {
  const pool: CriminalRecord[] = [];
  for (let i = 0; i < count; i++) {
    pool.push(buildCriminalRecord(city, state, undefined, startSeed + i + 1));
  }
  return pool;
}

export function searchRecords(records: CriminalRecord[], query: string): CriminalRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records.slice(0, 30);
  const matches = records.filter((r) => {
    const full = `${r.firstName} ${r.lastName} ${r.knownAliases.join(' ')} ${r.address} ${r.charges.join(' ')}`.toLowerCase();
    return full.includes(q);
  });
  return matches;
}
