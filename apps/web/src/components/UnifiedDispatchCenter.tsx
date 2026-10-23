// ============================================
// Dispatch HQ — Unified Dispatch Center
// ============================================
// Full-screen command console combining incoming 911 calls,
// dispatch board, radio comms, unit roster, and assistant.

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneOff, X, MapPin, Radio, ChevronRight,
  CheckCircle, Circle, Shield, Heart, Flame, Zap,
  Megaphone, Users, Send, Brain, Activity,
  Navigation, Crosshair, AlertTriangle, MessageSquare,
  Car, Ambulance, Swords, List, Filter, Database, Landmark,
  HeartPulse, ClipboardList, Handshake, Building2, RotateCcw,
} from 'lucide-react';
import { useGameStore, type PatrolRoute } from '@/stores/gameStore';
import { missionService } from '@/lib/rewards';
import { backupAssignedUnits, requiredServicesForMission, unitCanPatrol, unitCommittedElsewhere } from '@/lib/dispatchLogic';
import { fetchDrivingRoute, generatePatrolRoute, generateGridRoadPath, getUnitServiceType } from '@/utils/routing';
import { applyTravelTech } from '@/lib/techTree';
import { haversineKm } from '@/utils/roadPathfinding';
import { formatTimer } from '@/utils/timeFormat';
import { zoneIdForPoint, patrolZonesForCity, type CityZone } from '@/lib/patrol/patrolZones';
import { streetsForZone, zoneNameForId } from '@/data/cityStreets';
import type { Mission, GeoPoint, Unit } from '@dispatch-hq/shared';
import { UNIT_CONFIGS, getMissionPriority, MISSION_PRIORITY_RANK, difficultyTierFor, TIER_META } from '@dispatch-hq/shared';import { broadcastRadioMessage,
  broadcastRadioSequence,
  broadcastRadioOnce,
} from '@/utils/radioEvents';
import { wsClient } from '@/lib/wsClient';
import { allianceLevelFor } from '@dispatch-hq/shared';
import type { RadioMessageEvent } from '@/utils/radioEvents';
import { transitionConversation, type DialogueMessage } from '@/lib/radioDialogueEngine';
import {
  assignmentSequence,
  returnToStationSequence,
  startPatrolSequence,
  commandResponse,
} from '@/lib/radioDialogueEngine.lazy';
// Service pipeline panels are code-split — only the tab for the player's
// department loads its panel (v0.18.0 perf pass).
const CriminalRecordsPanel = lazy(() => import('./CriminalRecordsPanel'));
const CountyJailPanel = lazy(() => import('./CountyJailPanel'));
const CityHospitalPanel = lazy(() => import('./CityHospitalPanel'));
import FireMarshalPanel from './FireMarshalPanel';
import { AllianceTreasury } from './AllianceTreasury';
import { AllianceGifts } from './AllianceGifts';
import { AllianceStations } from './AllianceStations';
import { AllianceLoans } from './AllianceLoans';
import { AllianceActivity } from './AllianceActivity';

// ── Types ──────────────────────────────────────────────

type DispatchTab = 'calls' | 'board' | 'radio' | 'roster' | 'assistant' | 'alliance' | 'records' | 'jail' | 'hospital' | 'marshal';
type ServiceFilter = 'all' | 'fire' | 'police' | 'ems';

/** Console tabs shared by every service. */
const CORE_TABS: DispatchTab[] = ['calls', 'board', 'radio', 'roster', 'assistant', 'alliance'];

/** Service-specific agency systems — each department only sees its own. */
const SERVICE_TABS: Record<'fire' | 'police' | 'ems', DispatchTab[]> = {
  police: [...CORE_TABS, 'records', 'jail'],
  ems: [...CORE_TABS, 'hospital'],
  fire: [...CORE_TABS, 'marshal'],
};

const TAB_META: Record<DispatchTab, { icon: any; label: string }> = {
  calls: { icon: Phone, label: 'Incoming' },
  board: { icon: List, label: 'Board' },
  radio: { icon: Radio, label: 'Radio' },
  roster: { icon: Users, label: 'Roster' },
  assistant: { icon: Brain, label: 'Assistant' },
  records: { icon: Database, label: 'Records' },
  jail: { icon: Landmark, label: 'County Jail' },
  hospital: { icon: HeartPulse, label: 'Hospital' },
  alliance: { icon: Users, label: 'Alliance' },
  marshal: { icon: ClipboardList, label: 'Fire Marshal' },
};

interface IncomingCall {
  id: string;
  callerName: string;
  callerNumber: string;
  location: string;
  locationGeo: GeoPoint;
  reportedType: string;
  category: 'fire' | 'traffic' | 'rescue' | 'hazmat' | 'ems' | 'police';
  severity: 'low' | 'medium' | 'high' | 'critical';
  service: 'fire' | 'police' | 'ems';
  notes: string;
  triageScore: number;
  timestamp: string;
  status: 'ringing' | 'active' | 'dispatched' | 'closed';
}

interface CommLogEntry {
  id: string;
  timestamp: string;
  type: 'call' | 'dispatch' | 'update' | 'system' | 'radio' | 'broadcast';
  text: string;
  sender?: string;
  service?: 'fire' | 'police' | 'ems';
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

interface RadioMessage {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  text: string;
  channel: 'dispatch-to-unit' | 'unit-to-unit' | 'dispatch-to-all' | 'unit-to-dispatch' | 'broadcast';
  serviceType?: 'fire' | 'police' | 'ems';
}

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Helpers ────────────────────────────────────────────

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function serviceColor(service: string): string {
  if (service === 'fire') return 'text-red-400 border-red-500/30 bg-red-500/10';
  if (service === 'ems') return 'text-green-400 border-green-500/30 bg-green-500/10';
  return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
}

function serviceIcon(service: string) {
  if (service === 'fire') return <Flame className="w-3.5 h-3.5 text-red-400" />;
  if (service === 'ems') return <Heart className="w-3.5 h-3.5 text-green-400" />;
  return <Shield className="w-3.5 h-3.5 text-blue-400" />;
}

/**
 * Mission icon badge — the mission's own emoji in a service-tinted tile,
 * matching the MissionCard visual language so board cards read at a glance.
 */
function missionIconBadge(m: Mission) {
  const svc = missionService(m);
  const tint =
    svc === 'fire'
      ? 'bg-red-500/15 border-red-500/30'
      : svc === 'ems'
        ? 'bg-emerald-500/15 border-emerald-500/30'
        : 'bg-blue-500/15 border-blue-500/30';
  return (
    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${tint}`}>
      <span className="text-lg leading-none">{m.icon || '🚨'}</span>
    </div>
  );
}

const SERVICE_LABEL: Record<string, string> = {
  fire: 'Fire Department',
  police: 'Police Department',
  ems: 'EMS Division',
};

/**
 * Deterministic pseudo-street for a mission, so the board card shows a
 * readable address ("214 Elm St · Downtown") instead of raw coordinates.
 * Stable across re-renders — derived from the mission id, not Math.random.
 */
function streetForMission(m: Mission, zones: CityZone[] | null): string {
  const streets = streetsForZone(zoneIdForPoint(zones, m.location));
  let hash = 0;
  for (let i = 0; i < m.id.length; i++) hash = (hash * 31 + m.id.charCodeAt(i)) >>> 0;
  const street = streets[hash % streets.length] ?? 'Main St';
  const house = 100 + (hash % 800);
  return `${house} ${street}`;
}

/** Per-unit-type requirement tally: required vs (assigned + selected) counts. */
function reqCountsFor(m: Mission, selectedIds: string[], units: Unit[]): Map<string, { required: number; selected: number }> {
  const counts = new Map<string, { required: number; selected: number }>();
  for (const r of m.requirements) {
    const cur = counts.get(r.unitType) ?? { required: 0, selected: 0 };
    cur.required += r.count;
    counts.set(r.unitType, cur);
  }
  for (const id of new Set([...m.assignedUnits, ...selectedIds])) {
    const u = units.find(x => x.id === id);
    if (!u) continue;
    const cur = counts.get(u.type) ?? { required: 0, selected: 0 };
    cur.selected += 1;
    counts.set(u.type, cur);
  }
  return counts;
}

function severityBadge(severity: string) {
  if (severity === 'critical') return 'bg-red-500/20 text-red-400 border-red-500/40';
  if (severity === 'high') return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  if (severity === 'medium') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
}

/** Mission priority for display/sorting, falling back to a derived rating for legacy missions. */
function missionPriority(m: Mission) {
  return m.priority ?? getMissionPriority(m.difficulty, m.category, m.totalTime);
}

function priorityRank(m: Mission) {
  return MISSION_PRIORITY_RANK[missionPriority(m)];
}

function sortByPriority(a: Mission, b: Mission) {
  return priorityRank(b) - priorityRank(a) || b.difficulty - a.difficulty;
}

const CALLER_NAMES = ['Sarah J.', 'Mike T.', 'Unknown Caller', 'Dispatcher Relay', 'Park Ranger', 'Witness', 'Alarm Co.', 'Driver', 'Neighbor', 'Business Owner'];
const STREET_NAMES = ['Main St', '5th Ave', 'Oak St', 'Broadway', 'Park Ave', 'River Rd', 'Market St', 'Hill Rd', 'Lakeview Dr', 'Elm St', 'Union Ave', 'Pine St'];
const INCIDENT_TEMPLATES: { category: IncomingCall['category']; reportedType: string; service: IncomingCall['service']; severity: IncomingCall['severity'] }[] = [
  { category: 'fire', reportedType: 'Structure Fire', service: 'fire', severity: 'critical' },
  { category: 'fire', reportedType: 'Vehicle Fire', service: 'fire', severity: 'high' },
  { category: 'fire', reportedType: 'Smoke Investigation', service: 'fire', severity: 'medium' },
  { category: 'ems', reportedType: 'Cardiac Arrest', service: 'ems', severity: 'critical' },
  { category: 'ems', reportedType: 'Injury Accident', service: 'ems', severity: 'high' },
  { category: 'ems', reportedType: 'Difficulty Breathing', service: 'ems', severity: 'medium' },
  { category: 'police', reportedType: 'Robbery in Progress', service: 'police', severity: 'critical' },
  { category: 'police', reportedType: 'Traffic Pursuit', service: 'police', severity: 'high' },
  { category: 'police', reportedType: 'Noise Complaint', service: 'police', severity: 'low' },
  { category: 'traffic', reportedType: 'Multi-Vehicle Crash', service: 'police', severity: 'high' },
  { category: 'rescue', reportedType: 'Water Rescue', service: 'fire', severity: 'critical' },
];

/**
 * Rolling memory of recently rung reported types, keyed by the service filter
 * the call was generated for (v0.28.0). Mirrors the organic spawn loop's
 * variety guard: the dispatch board should read as a living city, not a
 * repeating carousel of the same callout back-to-back.
 */
const recentCallReported: Record<string, string[]> = {};

function generateRandomCall(city?: GeoPoint | null, service?: string | null): IncomingCall {
  // Only surface calls for the department the player runs — a police city
  // gets police + traffic calls, EMS gets medical, fire gets fires + rescues.
  const pool = service
    ? INCIDENT_TEMPLATES.filter(t => t.service === service)
    : INCIDENT_TEMPLATES;
  let template = pool[Math.floor(Math.random() * pool.length)] || INCIDENT_TEMPLATES[Math.floor(Math.random() * INCIDENT_TEMPLATES.length)];

  // Variety guard: if the roll repeats a recently rung type, re-roll from the
  // rest of the pool so the same call never rings twice in a row. Falls back
  // to the original pick when the pool is too small to avoid (a 4-template
  // police board with a window of 4 would otherwise starve).
  const bucket = service ?? 'all';
  const recent = recentCallReported[bucket] || [];
  if (recent.includes(template.reportedType)) {
    const others = pool.filter(t => !recent.includes(t.reportedType));
    if (others.length > 0) {
      template = others[Math.floor(Math.random() * others.length)];
    }
  }
  recentCallReported[bucket] = [...recent.filter(t => t !== template.reportedType), template.reportedType].slice(-4);
  const name = CALLER_NAMES[Math.floor(Math.random() * CALLER_NAMES.length)];
  const street = STREET_NAMES[Math.floor(Math.random() * STREET_NAMES.length)];
  const house = Math.floor(Math.random() * 900) + 100;
  const lat = (city?.lat || 40.7128) + (Math.random() - 0.5) * 0.04;
  const lng = (city?.lng || -74.006) + (Math.random() - 0.5) * 0.04;
  return {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    callerName: name,
    callerNumber: `555-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    location: `${house} ${street}`,
    locationGeo: { lat, lng },
    reportedType: template.reportedType,
    category: template.category,
    service: template.service,
    severity: template.severity,
    notes: `${template.reportedType} reported by ${name}.`,
    triageScore: template.severity === 'critical' ? 100 : template.severity === 'high' ? 75 : template.severity === 'medium' ? 50 : 25,
    timestamp: formatTime(),
    status: 'ringing',
  };
}

function makeMissionFromCall(call: IncomingCall): Mission {
  return {
    id: `m_${call.id}`,
    templateId: `call_${call.category}`,
    name: call.reportedType,
    description: call.notes,
    category: call.category === 'traffic' || call.category === 'rescue' || call.category === 'hazmat' ? call.category : call.service,
    icon: call.service === 'fire' ? 'fire' : call.service === 'ems' ? 'ems' : 'police',
    status: 'active',
    location: call.locationGeo,
    poiType: null,
    difficulty: call.triageScore,
    creditsReward: Math.round(call.triageScore * 1.5),
    xpReward: Math.round(call.triageScore * 0.8),
    priority: call.severity,
    requirements: [],
    assignedUnits: [],
    progress: 0,
    timeRemaining: 300,
    totalTime: 300,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

// ── Component ────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function UnifiedDispatchCenter({ isOpen, onClose }: Props) {
  const {
    addMission, missions, updateMission, removeMission,
    units, stations, selectedCity, selectedService,
    updateUnit, patrolRoutes, addPatrolRoute, updatePatrolRoute, mapBounds,
    criminalRecords, inmates, patients, investigations, helipad,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<DispatchTab>('calls');
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>(selectedService ?? 'all');
  const [prefillLoanUnitType, setPrefillLoanUnitType] = useState<string | null>(null);

  // Only show the tabs for the department the player runs: police gets
  // Records + County Jail, EMS gets the Hospital, fire gets Fire Marshal.
  const visibleTabs = useMemo<DispatchTab[]>(() => {
    if (!selectedService) return [...CORE_TABS, 'records', 'jail', 'hospital', 'marshal'];
    return SERVICE_TABS[selectedService];
  }, [selectedService]);

  // If the active tab belongs to another department (or the service changed),
  // bounce back to the Calls tab.
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab('calls');
  }, [visibleTabs, activeTab]);

  // Keep the roster filter aligned with the selected service.
  useEffect(() => {
    if (selectedService) setServiceFilter(selectedService);
  }, [selectedService]);
  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [commLog, setCommLog] = useState<CommLogEntry[]>([]);
  const [radioMessages, setRadioMessages] = useState<RadioMessage[]>([]);
  const [composeText, setComposeText] = useState('');
  // Dispatch-board virtualization (v0.18.0): render the top-N calls by priority,
  // expandable so a flood of calls never renders hundreds of cards at once.
  const BOARD_PAGE = 24;
  const [boardLimit, setBoardLimit] = useState(BOARD_PAGE);
  const [radioChannel, setRadioChannel] = useState<'all' | 'unit'>('all');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantHistory, setAssistantHistory] = useState<AssistantMessage[]>([
    { role: 'assistant', content: 'Dispatch Assistant online. Ask about triage, unit status, or patrol recommendations.' },
  ]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [routingUnitId, setRoutingUnitId] = useState<string | null>(null);
  const [selectedMissionUnitIds, setSelectedMissionUnitIds] = useState<Record<string, string[]>>({});

  const logEndRef = useRef<HTMLDivElement>(null);
  const radioEndRef = useRef<HTMLDivElement>(null);
  const assistantRef = useRef<HTMLDivElement>(null);
  const reportedRef = useRef<Set<string>>(new Set());
  const seenRadioKeysRef = useRef<Set<string>>(new Set());

  const addComm = useCallback((type: CommLogEntry['type'], text: string, priority?: CommLogEntry['priority'], service?: CommLogEntry['service']) => {
    setCommLog(prev => [...prev, {
      id: `comm-${Date.now()}`, timestamp: formatTime(), type, text, priority, service,
    }].slice(-300));
  }, []);

  const addRadio = useCallback((msg: Omit<RadioMessage, 'id' | 'timestamp'>) => {
    if (typeof window === 'undefined') return;
    const mappedType: RadioMessageEvent['type'] =
      msg.channel === 'dispatch-to-unit' ? 'dispatch' :
      msg.channel === 'dispatch-to-all' ? 'broadcast' :
      msg.channel === 'unit-to-unit' ? 'unit' :
      msg.channel === 'unit-to-dispatch' ? 'unit' : 'system';
    broadcastRadioMessage({
      from: msg.from,
      to: msg.to,
      text: msg.text,
      type: mappedType,
      service: msg.serviceType,
    });
  }, []);

  const addRadioSequence = useCallback((seq: DialogueMessage[] | Iterable<DialogueMessage>, dispatchKey?: string) => {
    const items = Array.isArray(seq) ? seq : Array.from(seq);
    if (items.length === 0) return;
    broadcastRadioSequence(items, dispatchKey);
  }, []);


  // Scroll refs
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [commLog]);
  useEffect(() => { radioEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [radioMessages]);
  useEffect(() => { assistantRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [assistantHistory]);

  // Auto-generate incoming calls
  useEffect(() => {
    if (!isOpen) return;
    const t1 = setTimeout(() => {
      const call = generateRandomCall(selectedCity, selectedService);
      setIncomingCalls(prev => [call, ...prev].slice(0, 50));
      addComm('call', `Incoming 911: ${call.reportedType} — ${call.location}`, call.severity, call.service);
    }, 1500);
    const interval = setInterval(() => {
      const call = generateRandomCall(selectedCity, selectedService);
      setIncomingCalls(prev => [call, ...prev].slice(0, 50));
      addComm('call', `Incoming 911: ${call.reportedType} — ${call.location}`, call.severity, call.service);
    }, 22000 + Math.random() * 12000);
    return () => { clearTimeout(t1); clearInterval(interval); };
  }, [isOpen, selectedCity, selectedService, addComm]);

  // Keep the UDC Radio tab in sync with the global radio bus (MissionCard, SelectedUnitPanel, App).
  // This avoids duplicating the engine-generated traffic already produced by RadioComms.
  useEffect(() => {
    if (!isOpen) return;
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      if (detail.dispatchKey && seenRadioKeysRef.current.has(detail.dispatchKey)) return;
      if (detail.dispatchKey) seenRadioKeysRef.current.add(detail.dispatchKey);

      if (detail.sequence && Array.isArray(detail.sequence) && detail.sequence.length > 0) {
        const SEQ_SPACING_MS = 650;
        const seq = detail.sequence as DialogueMessage[];
        const now = Date.now();
        const newMessages: RadioMessage[] = seq.map((m, i) => ({
          ...m,
          id: `radio-${now}-${i}`,
          timestamp: formatTime(new Date(now + i * SEQ_SPACING_MS)),
          channel: m.from === 'Dispatch' ? 'dispatch-to-unit' : m.to === 'Dispatch' ? 'unit-to-dispatch' : 'unit-to-unit',
          serviceType: m.service,
        } as RadioMessage));
        setRadioMessages(prev => [...prev, ...newMessages].slice(-300));
        return;
      }

      if (!detail.text) return;
      const m = detail;
      const rm: RadioMessage = {
        id: `radio-${Date.now()}`,
        timestamp: formatTime(),
        from: m.from || 'Dispatch',
        to: typeof m.to === 'string' ? m.to : 'all',
        text: m.text,
        channel: m.from === 'Dispatch' ? 'dispatch-to-unit' : m.to === 'Dispatch' ? 'unit-to-dispatch' : 'unit-to-unit',
        serviceType: m.service,
      };
      setRadioMessages(prev => [...prev, rm].slice(-300));
    };
    window.addEventListener('radio-message', listener);
    return () => window.removeEventListener('radio-message', listener);
  }, [isOpen]);

  // City zone grid — used to label mission locations ("Downtown", "East End")
  // on board cards instead of raw lat/lng coordinates.
  const zones = useMemo(
    () => patrolZonesForCity({ bounds: mapBounds, boundary: selectedCity?.boundary ?? null }),
    [mapBounds, selectedCity?.boundary],
  );

  const availableUnits = useMemo(() => units.filter(u => u.status === 'available'), [units]);
  const busyUnits = useMemo(() => units.filter(u => u.status !== 'available' && u.status !== 'patrolling'), [units]);
  const dispatchableUnits = useMemo(() => units.filter(u => (u.status === 'available' || u.status === 'returning' || u.status === 'patrolling') && !(u.trainingEndsAt && u.trainingEndsAt > Date.now())), [units]);
  const filteredUnits = useMemo(() => {
    if (serviceFilter === 'all') return units;
    return units.filter(u => getUnitServiceType(u.type) === serviceFilter);
  }, [units, serviceFilter]);

  const activeMissions = useMemo(() => missions.filter(m => m.status === 'active' || m.status === 'dispatching' || m.status === 'en_route' || m.status === 'on_scene'), [missions]);
  const unassignedMissions = useMemo(
    // CPU Mutual Aid: city-handled calls are excluded — the player never
    // dispatches to them and they resolve automatically (see App.tsx tick).
    () => activeMissions.filter(m => m.assignedUnits.length === 0 && !m.cpuHandled),
    [activeMissions],
  );

  // Board split: the department the player runs vs. Mutual Aid requests from
  // other departments (missions whose category belongs to another service).
  const mainMissions = useMemo(
    () => selectedService ? activeMissions.filter(m => missionService(m) === selectedService) : activeMissions,
    [activeMissions, selectedService],
  );
  const mutualAidMissions = useMemo(
    () => selectedService ? activeMissions.filter(m => missionService(m) !== selectedService) : [],
    [activeMissions, selectedService],
  );

  const bestUnitFor = useCallback((service: IncomingCall['service'], location: GeoPoint): Unit | null => {
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const u of dispatchableUnits) {
      if (getUnitServiceType(u.type) !== service) continue;
      const d = Math.hypot((u.position?.lat || location.lat) - location.lat, (u.position?.lng || location.lng) - location.lng);
      if (d < bestDist) { bestDist = d; best = u; }
    }
    // No cross-service fallback: a Mutual Aid request is only answered by a
    // unit of the department it belongs to.
    return best;
  }, [dispatchableUnits]);

  const dispatchMission = useCallback(async (mission: Mission, unit?: Unit | null) => {
    const targetUnit = unit || bestUnitFor(missionService(mission), mission.location);
    if (!targetUnit) {
      addComm('system', `No ${SERVICE_LABEL[missionService(mission)]} unit available for ${mission.name}.`, 'high');
      return false;
    }
    if (!targetUnit.position) return false;
    setRoutingUnitId(targetUnit.id);
    try {
      const route = await fetchDrivingRoute(targetUnit.position, mission.location, targetUnit.speed || 13.9);
      updateUnit(targetUnit.id, {
        status: 'en_route', missionId: mission.id,
        eta: applyTravelTech(route.durationSec), etaTotal: applyTravelTech(route.durationSec),
        destination: mission.location,
        waypoints: route.waypoints, waypointIndex: 0,
        returnTimer: undefined,
        routeDistanceKm: route.distanceKm,
        // preserve patrol route so the unit can resume after mission
      });
      updateMission(mission.id, { status: 'en_route', assignedUnits: [targetUnit.id] });
      addComm('dispatch', `Dispatched ${targetUnit.name} → ${mission.name} [${route.distanceKm.toFixed(1)}km, ${Math.ceil(route.durationSec / 60)}min]`, 'high', getUnitServiceType(targetUnit.type));
      addRadioSequence(assignmentSequence(targetUnit, mission, units, missions, useGameStore.getState().helipad?.name), `assign:${targetUnit.id}:${mission.id}`);
      // Co-op dispatch: broadcast to alliance if this is a shared mission (requires L3+)
      if (mission.allianceShared) {
        const allianceState = useGameStore.getState().myAlliance;
        const allianceLevel = allianceState ? allianceLevelFor(allianceState.xp ?? 0).level : 0;
        if (allianceLevel >= 3) {
          const eta = applyTravelTech(route.durationSec);
          wsClient.send({
            type: 'alliance_mission_dispatch',
            missionId: mission.id,
            playerName: useGameStore.getState().player?.username ?? 'Commander',
            unitCount: 1,
            eta,
            service: getUnitServiceType(targetUnit.type),
          });
        }
      }
      return true;
    } finally {
      setRoutingUnitId(null);
    }
  }, [bestUnitFor, updateUnit, updateMission, addComm, addRadio]);

  const matchingDispatchableUnits = useCallback((mission: Mission) => {
    // Primary service + every service behind the mission's requirements, so a
    // crossover call (traffic accident needing a fire engine, hazmat needing
    // an ambulance) shows the required units instead of only its own department
    // (v0.22.10 fix). Requirement-matching units sort first so the picker
    // leads with what the call actually needs, then the nearest own-service.
    const answerServices = new Set(requiredServicesForMission(mission));
    const reqTypes = new Set(mission.requirements.map((r) => r.unitType));
    const matching = dispatchableUnits.filter(u =>
      reqTypes.has(u.type) || answerServices.has(getUnitServiceType(u.type)),
    );
    const byDist = (a: Unit, b: Unit) =>
      (a.position ? haversineKm(a.position, mission.location) : 1e9) -
      (b.position ? haversineKm(b.position, mission.location) : 1e9);
    return matching
      .map((u) => ({ u, isReq: reqTypes.has(u.type) }))
      .sort((a, b) => {
        if (a.isReq !== b.isReq) return a.isReq ? -1 : 1;
        return byDist(a.u, b.u);
      })
      .map((x) => x.u);
  }, [dispatchableUnits]);

  const dispatchMissionMultiple = useCallback(async (mission: Mission, unitIds: string[]) => {
    const valid = unitIds.filter(id => dispatchableUnits.find(u => u.id === id));
    if (valid.length === 0) {
      addComm('system', `No dispatchable units selected for ${mission.name}.`, 'medium');
      return;
    }
    setRoutingUnitId(mission.id);
    const dispatchedNames: string[] = [];
    const assigned: string[] = [];
    try {
      for (const id of valid) {
        const unit = dispatchableUnits.find(u => u.id === id);
        if (!unit || !unit.position) continue;
        // v0.22.12 duplicate-dispatch guard: the unit may have been grabbed by
        // another call between the picker render and this click — consult
        // fresh state so it is never double-assigned.
        const stNow = useGameStore.getState();
        const live = stNow.units.find(u => u.id === id);
        if (unitCommittedElsewhere(live, mission.id, stNow.missions)) continue;
        const route = await fetchDrivingRoute(unit.position, mission.location, unit.speed || 13.9);
        updateUnit(unit.id, {
          status: 'en_route', missionId: mission.id,
          eta: applyTravelTech(route.durationSec), etaTotal: applyTravelTech(route.durationSec),
          destination: mission.location,
          waypoints: route.waypoints, waypointIndex: 0,
          returnTimer: undefined,
          routeDistanceKm: route.distanceKm,
          // preserve patrol route so the unit can resume after mission
        });
        assigned.push(unit.id);
        dispatchedNames.push(unit.name);
      }
      if (assigned.length > 0) {
        updateMission(mission.id, { status: 'en_route', assignedUnits: assigned });
        addComm('dispatch', `Dispatched ${dispatchedNames.join(', ')} → ${mission.name}`, 'high', missionService(mission));
        // Co-op dispatch: broadcast to alliance if this is a shared mission (requires L3+)
        if (mission.allianceShared) {
          const allianceState = useGameStore.getState().myAlliance;
          const allianceLevel = allianceState ? allianceLevelFor(allianceState.xp ?? 0).level : 0;
          if (allianceLevel >= 3) {
            const avgEta = assigned.reduce((sum, uid) => {
              const u = units.find(x => x.id === uid);
              return sum + (u?.eta ?? 0);
            }, 0) / assigned.length;
            wsClient.send({
              type: 'alliance_mission_dispatch',
              missionId: mission.id,
              playerName: useGameStore.getState().player?.username ?? 'Commander',
              unitCount: assigned.length,
              eta: avgEta,
              service: missionService(mission),
            });
          }
        }
        const seq: DialogueMessage[] = [];
        for (const uid of assigned) {
          const unit = dispatchableUnits.find(u => u.id === uid);
          if (!unit) continue;
          seq.push(...assignmentSequence(unit, mission, units, missions, useGameStore.getState().helipad?.name));
        }
        addRadioSequence(seq);
      }
    } finally {
      setRoutingUnitId(null);
      setSelectedMissionUnitIds(prev => ({ ...prev, [mission.id]: [] }));
    }
  }, [dispatchableUnits, updateUnit, updateMission, addComm, addRadio]);

  const handleAcceptCall = useCallback((call: IncomingCall) => {
    const mission = makeMissionFromCall(call);
    setIncomingCalls(prev => prev.map(c => c.id === call.id ? { ...c, status: 'active' } : c));
    setActiveCallId(call.id);
    addMission(mission);
    addComm('system', `Call accepted: ${call.reportedType} at ${call.location} logged as mission.`, call.severity, call.service);
    setActiveTab('calls');
  }, [addMission, addComm]);

  const handleDispatchCall = useCallback(async (call: IncomingCall) => {
    const callMission = missions.find(m => m.id === `m_${call.id}`);
    if (callMission) return dispatchMission(callMission);
    const mission = makeMissionFromCall(call);
    setIncomingCalls(prev => prev.map(c => c.id === call.id ? { ...c, status: 'dispatched' } : c));
    setActiveCallId(null);
    addMission(mission);
    // For police calls, surface a record check/traffic-stop radio line.
    if (call.service === 'police' || call.category === 'traffic') {
      const { criminalRecords, selectedCity } = useGameStore.getState();
      const record = criminalRecords[Math.floor(Math.random() * (criminalRecords.length || 1))];
      if (record && call.category === 'traffic') {
        addRadio({
          from: 'Dispatch', to: 'Unit', text: `10-28 check on the traffic stop. Driver comes back with ${record.warrantStatus === 'active' ? 'an active warrant' : 'no active wants'}.`,
          channel: 'dispatch-to-unit', serviceType: 'police',
        });
      } else if (record) {
        addRadio({
          from: 'Dispatch', to: 'Unit', text: `Be advised, responding to ${call.location}. A record check shows ${record.firstName} ${record.lastName} linked — ${record.riskLevel} risk, ${record.warrantStatus === 'active' ? 'active warrant' : 'no active warrant'}.`,
          channel: 'dispatch-to-unit', serviceType: 'police',
        });
      }
    }
    return dispatchMission(mission);
  }, [missions, addMission, dispatchMission, addRadio]);

  const handleDeclineCall = useCallback((call: IncomingCall) => {
    setIncomingCalls(prev => prev.filter(c => c.id !== call.id));
    addComm('system', `Call closed: ${call.reportedType}.`);
  }, [addComm]);

  const handleAutoDispatch = useCallback(async () => {
    const targets = unassignedMissions.slice().sort(sortByPriority);
    if (targets.length === 0) {
      addComm('system', 'No unassigned missions.');
      return;
    }
    let dispatched = 0;
    for (const m of targets.slice(0, 5)) {
      if (dispatchableUnits.length === 0) break;
      const ok = await dispatchMission(m);
      if (ok) dispatched++;
    }
    addComm('system', `Auto-dispatch sent ${dispatched} unit(s).`, dispatched > 0 ? 'high' : 'medium');
  }, [unassignedMissions, dispatchableUnits, dispatchMission, addComm]);

  const handleStartPatrol = useCallback(async (unit: Unit, mode?: import('@/lib/patrol/patrolEngine').PatrolMode) => {
    if (unit.status !== 'available' || !unit.stationId) return;
    const station = stations.find(s => s.id === unit.stationId);
    if (!station) return;

    // Build city context for longer, crime-aware routes.
    const cityCenter = selectedCity ? { lat: selectedCity.lat, lng: selectedCity.lng } : station.position;
    const cityRadiusKm = Math.max(4, mapBounds
      ? Math.max(
          Math.abs(mapBounds[1][0] - mapBounds[0][0]) * 111 / 2,
          Math.abs(mapBounds[1][1] - mapBounds[0][1]) * 111 * Math.cos(cityCenter.lat * Math.PI / 180) / 2,
        )
      : 10);

    const activeAtStation = patrolRoutes.filter(r => r.stationId === station.id && r.active).length;
    const routeIndex = activeAtStation + 1;
    const unitSeed = parseInt(unit.id.replace(/\D/g, '')) || routeIndex;
    const routePts = await generatePatrolRoute(
      station.position,
      Date.now() + unitSeed,
      routeIndex,
      {
        mode,
        cityCenter,
        cityRadiusKm,
        cityBounds: mapBounds ?? selectedCity?.bounds ?? null,
        boundary: selectedCity?.boundary ?? null,
        missions: missions.map(m => ({ location: m.location, category: m.category, difficulty: m.difficulty })),
      },
    );
    const waypoints: [number, number][] = routePts.map(p => [p.lat, p.lng]);
    const route: PatrolRoute = {
      id: `patrol_${station.id}_${Date.now()}`,
      stationId: station.id,
      waypoints,
      assignedUnits: [unit.id],
      active: true,
      generatedAt: Date.now(),
    };
    addPatrolRoute(route);
    updateUnit(unit.id, {
      status: 'patrolling',
      patrolRouteId: route.id,
      patrolWaypointIndex: 0,
      patrolProgress: 0,
      patrolMode: mode ?? 'city-sweep',
      postMissionBehavior: 'patrol',
    });
    addComm('system', `${unit.name} started ${mode ?? 'city'} patrol from ${station.name}.`, 'medium', getUnitServiceType(unit.type));
    addRadioSequence(startPatrolSequence(unit, station.name, units, missions), `patrol:${unit.id}`);
  }, [stations, addPatrolRoute, updateUnit, addComm, addRadio, addRadioSequence, selectedCity, mapBounds, missions, units]);

  const handleStopPatrol = useCallback((unit: Unit) => {
    if (unit.status !== 'patrolling') return;
    const station = stations.find(s => s.id === unit.stationId);
    updateUnit(unit.id, { status: 'available', patrolRouteId: null, patrolWaypointIndex: undefined });
    if (unit.patrolRouteId) {
      const route = patrolRoutes.find(r => r.id === unit.patrolRouteId);
      if (route) updatePatrolRoute(route.id, { assignedUnits: route.assignedUnits.filter(id => id !== unit.id) });
    }
    addComm('system', `${unit.name} ended patrol.`, 'medium', getUnitServiceType(unit.type));
    addRadioSequence(returnToStationSequence(unit, station?.name ?? 'station', units, missions), `return:${unit.id}`);
  }, [patrolRoutes, updateUnit, updatePatrolRoute, addComm, addRadio, addRadioSequence, stations, units, missions]);

  const handleRecallUnit = useCallback(async (unit: Unit) => {
    const station = stations.find(s => s.id === unit.stationId);
    if (!station || !unit.position) return;
    let route: { waypoints: GeoPoint[]; durationSec?: number; totalDistanceKm?: number };
    try {
      route = await fetchDrivingRoute(unit.position, station.position, unit.speed || 13.9);
    } catch {
      route = generateGridRoadPath(unit.position, station.position);
    }
    updateUnit(unit.id, {
      status: 'returning', destination: station.position,
      eta: route.durationSec ?? Math.max(5, Math.round((haversineKm(unit.position, station.position) * 1000) / (unit.speed || 13.9))),
      etaTotal: route.durationSec ?? Math.max(5, Math.round((haversineKm(unit.position, station.position) * 1000) / (unit.speed || 13.9))),
      waypoints: route.waypoints, waypointIndex: 0,
      returnTimer: undefined,
      missionId: null,
    });
    addComm('dispatch', `${unit.name} recalled to ${station.name}.`, 'medium', getUnitServiceType(unit.type));
    addRadioSequence(returnToStationSequence(unit, station.name, units, missions), `return:${unit.id}`);
    // Co-op dispatch: broadcast cancel if recalling from a shared mission
    if (unit.missionId) {
      const mission = missions.find(m => m.id === unit.missionId);
      if (mission?.allianceShared) {
        wsClient.send({
          type: 'alliance_mission_cancel',
          missionId: mission.id,
          playerName: useGameStore.getState().player?.username ?? 'Commander',
        });
      }
    }
  }, [stations, updateUnit, addComm, addRadio, addRadioSequence, units, missions]);

  const handleSendBroadcast = useCallback(() => {
    const text = composeText.trim();
    if (!text) return;
    const targetName = radioChannel === 'all' ? 'All Units' : units.find(u => u.id === selectedUnitId)?.name || 'Unit';
    addRadio({ from: 'Dispatch', to: targetName, text, channel: radioChannel === 'all' ? 'dispatch-to-all' : 'dispatch-to-unit', serviceType: selectedService || undefined });
    setComposeText('');

    const targets = radioChannel === 'all'
      ? units.filter(u => u.status === 'available' || u.status === 'en_route' || u.status === 'on_scene' || u.status === 'patrolling' || u.status === 'returning')
      : (selectedUnitId ? units.filter(u => u.id === selectedUnitId) : []);

    targets.forEach((u, i) => {
      const replies = Array.from(commandResponse(text, u, units, missions));
      setTimeout(() => addRadioSequence(replies, `cmd:${u.id}:${text}`), 500 + i * 550);
    });
  }, [composeText, radioChannel, selectedUnitId, selectedService, units, missions, addRadio, addRadioSequence]);

  const handleAssistantQuery = useCallback(() => {
    const text = assistantInput.trim();
    if (!text || assistantLoading) return;
    setAssistantInput('');
    setAssistantHistory(prev => [...prev, { role: 'user', content: text }]);
    setAssistantLoading(true);
    setTimeout(() => {
      const q = text.toLowerCase();
     let response = '';
      if (q.includes('status') || q.includes('situation')) {
        response = `Status report:\n• ${activeMissions.length} active missions, ${unassignedMissions.length} need units\n• ${dispatchableUnits.length} ready units, ${busyUnits.length} busy\n• ${stations.length} stations operational`;
      } else if (q.includes('triage') || q.includes('priority')) {
        response = unassignedMissions.length === 0 ? 'All missions are assigned.' : `Top priority unassigned:\n${unassignedMissions.slice(0, 3).map((m, i) => `${i + 1}. ${m.name} — difficulty ${m.difficulty}`).join('\n')}`;
      } else if (q.includes('dispatch') || q.includes('send')) {
        response = unassignedMissions.length === 0 ? 'No unassigned missions to dispatch.' : `I recommend dispatching units to ${unassignedMissions.length} mission(s). Use Auto-Dispatch in the Call Queue tab.`;
      } else if (q.includes('patrol')) {
        response = availableUnits.filter(u => u.stationId).length === 0 ? 'No units available to patrol.' : `${availableUnits.filter(u => u.stationId).length} unit(s) ready to patrol. Open the Unit Roster tab.`;
      } else {
        response = 'I can help with status, triage, dispatch recommendations, and patrol planning. What do you need?';
      }
      setAssistantHistory(prev => [...prev, { role: 'assistant', content: response }]);
      setAssistantLoading(false);
    }, 500);
  }, [assistantInput, assistantLoading, activeMissions, unassignedMissions, dispatchableUnits, busyUnits.length, stations.length]);

  /** Board card for one mission — reused for the main queue and Mutual Aid requests. */
  const renderBoardCard = (m: Mission, isMutualAid = false) => {
    const priority = missionPriority(m);
    const tierMeta = TIER_META[difficultyTierFor(m.difficulty)];
    const assigned = units.filter(u => m.assignedUnits.includes(u.id));
    const available = matchingDispatchableUnits(m);
    const selected = selectedMissionUnitIds[m.id] || [];
    const svc = missionService(m);
    // Backup units (v0.22.18): a partner-department unit auto-added by the
    // needs-backup patrol intercept pre-dispatch, or any cross-service unit
    // answering a call that requires another department — labeled "Backup en
    // route" instead of silently mixed into the main unit list.
    const backupAssigned = backupAssignedUnits(assigned, m);
    const isDispatched = m.status === 'en_route' || m.status === 'on_scene' || m.status === 'in_progress' || m.status === 'completing';
    const isUrgent = m.timeRemaining < 120;
    const isWarning = !isUrgent && m.timeRemaining < 300;
    const zoneName = zoneNameForId(zoneIdForPoint(zones, m.location));
    const street = streetForMission(m, zones);
    const reqCounts = reqCountsFor(m, selected, units);
    const statusLabel =
      m.patientTransport
        ? '🚑 TRANSPORTING'
        : m.status === 'in_progress' || m.status === 'on_scene'
          ? 'ON SCENE'
          : m.status === 'completing'
            ? 'COMPLETING'
            : 'EN ROUTE';
    return (
      <div
        key={m.id}
        tabIndex={0}
        role="region"
        aria-label={`${m.name} — ${priority} priority, ${formatTimer(m.timeRemaining)} remaining`}
        className={`mission-board-card group relative rounded-xl border p-3 pl-4 outline-none transition-colors ${
          isDispatched
            ? 'bg-gray-900/70 border-gray-700/40'
            : 'bg-gray-900/50 border-gray-800/50 hover:bg-gray-900/70 hover:border-gray-700/50'
        } ${isUrgent ? 'border-red-500/30' : ''} focus-visible:ring-2 focus-visible:ring-dispatch-red/60`}
        onKeyDown={(e) => {
          // Roving tabindex: arrow keys move focus between board cards
          // (Home/End jump to the ends). Escape is deliberately left to the
          // global handler (pause menu) so cards can't double-fire it.
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
          const cards = Array.from(document.querySelectorAll<HTMLElement>('.mission-board-card'));
          const idx = cards.indexOf(e.currentTarget);
          let next: HTMLElement | undefined;
          if (e.key === 'ArrowDown') next = cards[idx + 1];
          else if (e.key === 'ArrowUp') next = cards[idx - 1];
          else if (e.key === 'Home') next = cards[0];
          else next = cards[cards.length - 1];
          if (next) { e.preventDefault(); next.focus(); }
        }}
      >
        {/* Status accent — a glanceable left rail instead of a raw status chip. */}
        <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${
          m.patientTransport ? 'bg-emerald-400'
          : m.status === 'en_route' ? 'bg-amber-400'
          : m.status === 'on_scene' || m.status === 'in_progress' ? 'bg-dispatch-red animate-pulse'
          : m.status === 'completing' ? 'bg-emerald-400'
          : m.cpuHandled ? 'bg-blue-400'
          : 'bg-gray-600'
        }`} />

        {/* Header: icon · name + priority · timer + status chip */}
        <div className="flex items-start gap-2.5">
          {missionIconBadge(m)}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-[13px] font-bold text-white truncate leading-tight">{m.name}</h4>
              <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold border ${severityBadge(priority)}`}>{priority.toUpperCase()}</span>
            </div>
            <p className="text-[10.5px] leading-snug text-gray-400 mt-0.5 line-clamp-2">{m.description}</p>
            <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-1">
              <MapPin className="w-3 h-3 shrink-0" /> {street} · <span className="capitalize">{zoneName}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-sm font-mono font-bold tabular-nums ${isUrgent ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-gray-300'}`}>
              {formatTimer(m.timeRemaining)}
            </span>
            {isDispatched && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                m.status === 'in_progress' || m.status === 'on_scene'
                  ? 'bg-dispatch-red/20 text-dispatch-red border-dispatch-red/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}>
                {statusLabel}
              </span>
            )}
          </div>
        </div>

        {/* Meta chips — only what's relevant, no clutter. */}
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${tierMeta.chipClass}`}>
            {tierMeta.icon} {tierMeta.label}
          </span>
          {isMutualAid && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-blue-500/10 text-blue-300 border-blue-500/30" title="Belongs to another department — answering earns a +25% mutual aid bonus">
              <Handshake className="w-2.5 h-2.5" /> Mutual Aid · {SERVICE_LABEL[svc]}
            </span>
          )}
          {m.cpuHandled && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-gray-700/50 text-gray-200 border-gray-600/40">🏙️ City Responding</span>
          )}
          {m.chainId && m.chainStage && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              🔗 Chain {m.chainStage}/{m.chainTotal}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 ml-auto">
            <Zap className="w-3 h-3" /> {m.creditsReward.toLocaleString()}
          </span>
        </div>

        {/* Requirements — green when covered by assigned + selected units. */}
        {!m.cpuHandled && reqCounts.size > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[...reqCounts.entries()].map(([type, { required, selected }]) => {
              const met = selected >= required;
              return (
                <span key={type} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${
                  met ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-dispatch-red/15 text-dispatch-red border-dispatch-red/30'
                }`}>
                  {selected}/{required}× {type.replace('_', ' ')}
                </span>
              );
            })}
          </div>
        )}

        {/* Body: assigned units / ready-unit picker / status notes */}
        {m.cpuHandled ? (
          <div className="text-[10px] text-gray-400 mt-2 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> The city is responding — {SERVICE_LABEL[svc]} dispatch is handling this call automatically.
          </div>
        ) : assigned.length > 0 ? (
          <>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {assigned.map(u => (
              <span key={u.id} className="inline-flex items-center gap-1.5 text-[9px] px-2 py-1 rounded-md bg-gray-800/80 text-gray-300 border border-gray-700/40">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  u.status === 'on_scene' || u.status === 'dispatched' ? 'bg-dispatch-red' : 'bg-amber-400 animate-pulse'
                }`} />
                {u.name}
                {u.status === 'en_route' && u.eta != null && u.eta > 0 && (
                  <span className="text-amber-400 font-mono">ETA {formatTimer(u.eta)}</span>
                )}
                {u.status === 'en_route' && (
                  <button
                    onClick={() => { handleRecallUnit(u); }}
                    className="p-0.5 -m-0.5 hover:bg-gray-700 rounded transition-colors"
                    title="Recall unit"
                  >
                    <RotateCcw className="w-2.5 h-2.5 text-gray-500 hover:text-amber-400" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {backupAssigned.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span
                className="inline-flex items-center gap-1.5 text-[9px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/30"
                title="Backup units auto-dispatched from a patrol intercept — partner department responding to this call"
              >
                <Handshake className="w-2.5 h-2.5 shrink-0" />
                Backup en route: {backupAssigned.map(bu => bu.name).join(', ')}
              </span>
            </div>
          )}
          </>
        ) : m.assignedUnits.length === 0 && available.length > 0 ? (
          <div className="mt-2">
            <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Ready units</p>
            <div className="flex flex-wrap gap-1.5">
              {available.map(u => {
                const isSelected = selected.includes(u.id);
                const dist = u.position ? haversineKm(u.position, m.location) : 0;
                // Cross-service unit (a fire engine on a traffic accident, an
                // ambulance on a hazmat scene): tag it so the required service
                // is visible instead of looking like a mistake.
                const unitSvc = getUnitServiceType(u.type);
                const crossService = unitSvc !== svc;
                return (
                  <button
                    key={u.id}
                    disabled={routingUnitId === m.id}
                    title={crossService
                      ? `${u.name} — ${SERVICE_LABEL[unitSvc]} unit required for this call`
                      : u.name}
                    onClick={() => setSelectedMissionUnitIds(prev => {
                      const ids = prev[m.id] || [];
                      const next = ids.includes(u.id) ? ids.filter(id => id !== u.id) : [...ids, u.id];
                      return { ...prev, [m.id]: next };
                    })}
                    className={`inline-flex items-center gap-1.5 text-[9px] px-2 py-1 rounded border transition-colors ${
                      isSelected
                        ? 'bg-white/15 text-white border-white/30'
                        : 'bg-gray-800/60 text-gray-400 border-gray-700/40 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {u.name}
                    {crossService && (
                      <span className={`px-1 rounded text-[8px] font-bold uppercase ${
                        unitSvc === 'fire' ? 'bg-red-500/20 text-red-400'
                        : unitSvc === 'ems' ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {unitSvc}
                      </span>
                    )}
                    <span className="text-gray-500 font-mono">{dist.toFixed(1)} km</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : isMutualAid ? (
          <div className="text-[10px] text-blue-300/80 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> No {SERVICE_LABEL[svc]} units in the city — request stays open until a partner station is built.
          </div>
        ) : (
          <div className="text-[10px] text-amber-400/80 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> No ready units — build or recall units to respond.
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 mt-2.5 pt-2.5 border-t border-gray-800/50">
          {!m.cpuHandled && m.assignedUnits.length === 0 && (
            <button
              onClick={() => dispatchMissionMultiple(m, selected)}
              disabled={selected.length === 0 || routingUnitId === m.id}
              className="px-3 py-1.5 rounded-lg bg-dispatch-red/20 text-dispatch-red text-[10px] font-bold border border-dispatch-red/30 hover:bg-dispatch-red/30 disabled:opacity-40 flex items-center gap-1.5"
            >
              <Navigation className="w-3 h-3" />
              {routingUnitId === m.id
                ? 'DISPATCHING…'
                : selected.length > 0
                  ? `DISPATCH ${selected.length}`
                  : 'DISPATCH'}
            </button>
          )}
          <button
            onClick={() => { removeMission(m.id); addComm('system', `Mission ${m.name} removed from board.`); }}
            className="px-2.5 py-1.5 rounded-lg bg-gray-800/60 text-gray-400 text-[10px] hover:text-white hover:bg-gray-800 transition-colors"
          >
            ARCHIVE
          </button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-[55] bg-gray-950/95 backdrop-blur-sm flex flex-col"
        >
          {/* Header — stacks on phones (title row, then tabs row); single row on md+.
              The X lives with the title so it never scrolls out of reach. */}
          <div className="px-4 py-3 bg-gray-900/80 border-b border-gray-800/60 flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/logo.png?v=13"
                  alt="Dispatch HQ"
                  className="w-9 h-9 rounded-full object-cover border border-gray-700/60 shadow-md shrink-0"
                />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white truncate">Dispatch HQ Console</h2>
                  <p className="text-[10px] text-gray-500 truncate">
                    {selectedCity?.name ? selectedCity.name : 'No city selected'}
                    {selectedService ? ` · ${SERVICE_LABEL[selectedService] ?? selectedService}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close Dispatch Center" className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-1 bg-gray-900/60 rounded-lg p-1 border border-gray-800/60 overflow-x-auto min-w-0">
              {visibleTabs.map(t => {
                const meta = TAB_META[t];
                const TabIcon = meta.icon;
                return (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                    activeTab === t ? 'bg-dispatch-red/20 text-dispatch-red' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" /> {meta.label}
                  {t === 'records' && criminalRecords && criminalRecords.length > 0 && (
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === 'records' ? 'bg-dispatch-red/30 text-dispatch-red' : 'bg-gray-800 text-gray-500'}`}>{criminalRecords.length}</span>
                  )}
                  {t === 'jail' && inmates && inmates.length > 0 && (
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === 'jail' ? 'bg-dispatch-red/30 text-dispatch-red' : 'bg-gray-800 text-gray-500'}`}>{inmates.length}</span>
                  )}
                  {t === 'hospital' && patients && patients.some((p) => p.status !== 'discharged') && (
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === 'hospital' ? 'bg-dispatch-green/30 text-dispatch-green' : 'bg-gray-800 text-gray-500'}`}>{patients.filter((p) => p.status !== 'discharged').length}</span>
                  )}
                  {t === 'marshal' && investigations && investigations.length > 0 && (
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${activeTab === 'marshal' ? 'bg-orange-500/30 text-orange-400' : 'bg-gray-800 text-gray-500'}`}>{investigations.length}</span>
                  )}
                </button>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Main panel */}
            <div className="flex-1 min-w-0 p-4 overflow-y-auto">
              {activeTab === 'calls' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Incoming 911 Calls</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">{incomingCalls.filter(c => c.status === 'ringing').length} ringing</span>
                      <span className="text-[10px] text-gray-500">{activeCallId ? '1 selected' : ''}</span>
                    </div>
                  </div>
                  {incomingCalls.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <Phone className="w-8 h-8 mb-2" />
                      <p className="text-xs">No incoming calls.</p>
                    </div>
                  )}
                  {incomingCalls.map((call) => (
                    <div key={call.id} className={`border rounded-lg p-3 transition-colors ${activeCallId === call.id ? 'bg-white/5 border-dispatch-red/40' : 'bg-gray-900/40 border-gray-800/40 hover:border-gray-700/60'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${severityBadge(call.severity)}`}>{call.severity.toUpperCase()}</span>
                            <span className="text-xs font-bold text-white truncate">{call.reportedType}</span>
                            <span className="text-[10px] text-gray-500 shrink-0">{call.timestamp}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">{call.callerName} • {call.callerNumber}</p>
                          <p className="text-[10px] text-gray-300 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {call.location}</p>
                          <p className="text-[10px] text-gray-500 mt-1">{call.notes}</p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {call.status === 'ringing' && (
                            <button onClick={() => handleAcceptCall(call)} className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 hover:bg-emerald-500/30">ACCEPT</button>
                          )}
                          {call.status === 'active' && (
                            <button onClick={() => handleDispatchCall(call)} disabled={dispatchableUnits.length === 0} className="px-2 py-1 rounded bg-dispatch-red/20 text-dispatch-red text-[10px] font-bold border border-dispatch-red/30 hover:bg-dispatch-red/30 disabled:opacity-40">DISPATCH</button>
                          )}
                          {call.status === 'dispatched' && (
                            <span className="px-2 py-1 rounded bg-gray-800 text-gray-400 text-[10px]">DISPATCHED</span>
                          )}
                          <button onClick={() => handleDeclineCall(call)} className="px-2 py-1 rounded bg-gray-800 text-gray-400 text-[10px] hover:text-white">CLOSE</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'board' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2"><List className="w-3.5 h-3.5" /> Dispatch Board</h3>
                    <button onClick={handleAutoDispatch} disabled={unassignedMissions.length === 0} className="px-3 py-1.5 rounded bg-dispatch-red/20 text-dispatch-red text-[10px] font-bold border border-dispatch-red/30 hover:bg-dispatch-red/30 disabled:opacity-40 flex items-center gap-1"><Zap className="w-3 h-3" /> AUTO DISPATCH</button>
                  </div>
                  {unassignedMissions.length > 0 && (
                    <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {unassignedMissions.length} mission(s) need units.</div>
                  )}
                  {activeMissions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                      <Activity className="w-8 h-8 mb-2" />
                      <p className="text-xs">No active missions.</p>
                    </div>
                  )}

                  {/* Your department's calls — virtualized: top 24 by priority, expandable (v0.18.0) */}
                  {mainMissions.length > 0 && (
                    <div className="space-y-3">
                      {[...mainMissions].sort(sortByPriority).slice(0, boardLimit).map(m => renderBoardCard(m))}
                      {mainMissions.length > boardLimit && (
                        <button
                          onClick={() => setBoardLimit((l) => l + BOARD_PAGE)}
                          className="w-full py-1.5 rounded-lg text-[10px] font-bold text-gray-400 bg-gray-800/40 border border-gray-700/40 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                        >
                          Show {Math.min(BOARD_PAGE, mainMissions.length - boardLimit)} more of {mainMissions.length}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Mutual Aid — requests from other departments */}
                  {mutualAidMissions.length > 0 && (
                    <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
                        <Handshake className="w-4 h-4 text-blue-300 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-blue-200">Mutual Aid — Partner Agency Requests</p>
                          <p className="text-[9px] text-blue-300/70">These calls belong to another department. Route them to the nearest matching unit · <span className="text-blue-200 font-semibold">+25% bonus</span> on completion.</p>
                        </div>
                      </div>
                      <div className="p-3 space-y-3">
                        {[...mutualAidMissions].sort(sortByPriority).slice(0, boardLimit).map(m => renderBoardCard(m, true))}
                        {mutualAidMissions.length > boardLimit && (
                          <button
                            onClick={() => setBoardLimit((l) => l + BOARD_PAGE)}
                            className="w-full py-1.5 rounded-lg text-[10px] font-bold text-blue-300/80 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                          >
                            Show {Math.min(BOARD_PAGE, mutualAidMissions.length - boardLimit)} more
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'radio' && (
                <div className="flex flex-col h-full space-y-3">
                  <div className="flex items-center justify-between shrink-0">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2"><Radio className="w-3.5 h-3.5" /> Radio Comms</h3>
                    <div className="flex items-center gap-2">
                      <select
                        value={radioChannel}
                        onChange={e => setRadioChannel(e.target.value as 'all' | 'unit')}
                        className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
                      >
                        <option value="all">Broadcast All</option>
                        <option value="unit">Direct Unit</option>
                      </select>
                      {radioChannel === 'unit' && (
                        <select
                          value={selectedUnitId || ''}
                          onChange={e => setSelectedUnitId(e.target.value || null)}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
                        >
                          <option value="">Select unit</option>
                          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                    {radioMessages.length === 0 && <p className="text-xs text-gray-600 text-center mt-12">No radio traffic.</p>}
                    {radioMessages.map((msg) => (
                      <div key={msg.id} className="flex items-start gap-2 text-[11px]">
                        <span className="text-[9px] text-gray-600 font-mono shrink-0 mt-0.5">{msg.timestamp}</span>
                        <div className={`px-2 py-1.5 rounded-lg border max-w-[80%] ${msg.from === 'Dispatch' ? 'bg-dispatch-red/10 border-dispatch-red/20 text-red-100 ml-auto' : 'bg-gray-800/60 border-gray-700/40 text-gray-200'}`}>
                          <p className="font-bold text-[9px] text-gray-400 mb-0.5">{msg.from} → {msg.to}</p>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={radioEndRef} />
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <input
                      value={composeText}
                      onChange={e => setComposeText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendBroadcast(); }}
                      placeholder={radioChannel === 'all' ? 'Broadcast to all units...' : 'Message selected unit...'}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                    />
                    <button onClick={handleSendBroadcast} disabled={!composeText.trim() || (radioChannel === 'unit' && !selectedUnitId)} className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40 text-xs font-bold">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'roster' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Unit Roster</h3>
                    <div className="flex items-center gap-1">
                      {(['all', 'fire', 'police', 'ems'] as ServiceFilter[]).map(f => (
                        <button
                          key={f}
                          onClick={() => setServiceFilter(f)}
                          className={`px-2 py-1 rounded text-[9px] font-bold border transition-colors ${serviceFilter === f ? 'bg-white/10 text-white border-white/20' : 'bg-gray-900 text-gray-500 border-transparent hover:text-gray-300'}`}
                        >
                          {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredUnits.length === 0 && <p className="text-xs text-gray-600 text-center py-12">No units match this filter.</p>}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredUnits.map((unit) => {
                      const station = stations.find(s => s.id === unit.stationId);
                      const statusClass = unit.status === 'available' ? 'text-emerald-400' : unit.status === 'en_route' ? 'text-amber-400' : unit.status === 'patrolling' ? 'text-cyan-400' : 'text-blue-400';
                      return (
                        <div key={unit.id} className="border rounded-lg p-3 bg-gray-900/40 border-gray-800/40">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {serviceIcon(getUnitServiceType(unit.type))}
                              <div>
                                <p className="text-xs font-bold text-white">{unit.name}</p>
                                <p className="text-[9px] text-gray-500 capitalize">{unit.type.replace(/_/g, ' ')}</p>
                              </div>
                            </div>
                            <span className={`text-[9px] font-bold uppercase ${statusClass}`}>{unit.status}</span>
                          </div>
                          <div className="mt-2 text-[10px] text-gray-400 space-y-0.5">
                            <p>Station: {station?.name || '—'}</p>
                            {unit.status === 'en_route' && unit.eta != null && unit.eta > 0 && (
                              <p className="flex items-center gap-1">
                                <Navigation className="w-3 h-3 text-amber-400" />
                                <span className="text-amber-400 font-mono font-medium">ETA {formatTimer(unit.eta)}</span>
                              </p>
                            )}
                            {unit.routeDistanceKm != null && <p>Route: {unit.routeDistanceKm.toFixed(1)} km</p>}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {unit.status === 'available' && unit.stationId && unitCanPatrol(unit.type, helipad) && (
                              <button onClick={() => handleStartPatrol(unit)} className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[9px] font-bold hover:bg-cyan-500/20"><Navigation className="w-3 h-3 inline mr-1" /> PATROL</button>
                            )}
                            {unit.status === 'available' && (() => {
                              const aState = useGameStore.getState().myAlliance;
                              const aLevel = aState ? allianceLevelFor(aState.xp ?? 0).level : 0;
                              if (aLevel < 4) return null;
                              const capitalizedType = unit.type.charAt(0).toUpperCase() + unit.type.slice(1);
                              return (
                                <button
                                  onClick={() => {
                                    setPrefillLoanUnitType(capitalizedType);
                                    setActiveTab('alliance');
                                  }}
                                  className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[9px] font-bold hover:bg-purple-500/20"
                                >
                                  🤝 LEND TO ALLY
                                </button>
                              );
                            })()}
                            {unit.status === 'patrolling' && (
                              <button onClick={() => handleStopPatrol(unit)} className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[9px] font-bold hover:bg-amber-500/20"><Circle className="w-3 h-3 inline mr-1" /> END PATROL</button>
                            )}
                            {unit.status !== 'available' && unit.status !== 'patrolling' && (
                              <button onClick={() => handleRecallUnit(unit)} className="px-2 py-1 rounded bg-dispatch-red/10 text-dispatch-red border border-dispatch-red/30 text-[9px] font-bold hover:bg-dispatch-red/20"><Crosshair className="w-3 h-3 inline mr-1" /> RECALL</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'assistant' && (
                <div className="flex flex-col h-full space-y-3">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> Dispatch Assistant</h3>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                    {assistantHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-3 py-2 rounded-xl text-[11px] border ${msg.role === 'user' ? 'bg-dispatch-red/10 border-dispatch-red/30 text-red-100' : 'bg-gray-800/60 border-gray-700/40 text-gray-200'}`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {assistantLoading && <p className="text-[10px] text-gray-500">Assistant is thinking…</p>}
                    <div ref={assistantRef} />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <input
                      value={assistantInput}
                      onChange={e => setAssistantInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAssistantQuery(); }}
                      placeholder="Ask about status, triage, or dispatch..."
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/50"
                    />
                    <button onClick={handleAssistantQuery} disabled={assistantLoading || !assistantInput.trim()} className="px-3 py-2 rounded-lg bg-dispatch-red/20 text-dispatch-red border border-dispatch-red/30 hover:bg-dispatch-red/30 disabled:opacity-40 text-xs font-bold">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'alliance' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Alliance Board</h3>
                  {(() => {
                    const allianceState = useGameStore.getState().myAlliance;
                    const allianceLevel = allianceState ? allianceLevelFor(allianceState.xp ?? 0).level : 0;
                    const memberRole = (allianceState as any)?.memberRole ?? 'member';
                    const allianceMissions = missions.filter(m => m.allianceShared);
                    // Level gating indicators
                    const canSeeBoard = allianceLevel >= 2;
                    const canDispatch = allianceLevel >= 3;
                    const canCrossService = allianceLevel >= 4;
                    if (!allianceState) {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <p className="text-[11px]">Join an alliance to access the shared board.</p>
                          <p className="text-[10px] mt-1 text-gray-600">Alliances let you coordinate with other commanders.</p>
                        </div>
                      );
                    }
                    if (!canSeeBoard) {
                      const nextXp = 2000 - (allianceState.xp ?? 0);
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <p className="text-[11px]">Alliance Level 2 required for shared board.</p>
                          <p className="text-[10px] mt-1 text-gray-600">{nextXp > 0 ? `${nextXp} XP to Level 2` : 'Level up to unlock!'}</p>
                        </div>
                      );
                    }
                    if (allianceMissions.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <p className="text-[11px]">No shared missions from alliance members yet.</p>
                          <p className="text-[10px] mt-1 text-gray-600">Alliance members in the same city will appear here.</p>
                        </div>
                      );
                    }
                    // Player accent color palette
                    const accentColors = [
                      'bg-purple-500', 'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500',
                      'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500',
                    ];
                    const playerColorMap = new Map<string, string>();
                    let colorIdx = 0;
                    return (
                      <div className="space-y-3">
                        {/* Level status bar */}
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 pb-2 border-b border-gray-800/50">
                          <span className="text-purple-400 font-bold">L{allianceLevel}</span>
                          <span>•</span>
                          <span className={canDispatch ? 'text-emerald-400' : 'text-gray-600'}>Dispatch {canDispatch ? '✓' : 'L3+'}</span>
                          <span>•</span>
                          <span className={canCrossService ? 'text-emerald-400' : 'text-gray-600'}>Cross-svc {canCrossService ? '✓' : 'L4+'}</span>
                        </div>
                        {allianceMissions.map(m => {
                          // Assign color to spawner
                          if (!playerColorMap.has(m.allianceSpawnerName ?? '')) {
                            playerColorMap.set(m.allianceSpawnerName ?? '', accentColors[colorIdx % accentColors.length]);
                            colorIdx++;
                          }
                          const spawnerColor = playerColorMap.get(m.allianceSpawnerName ?? '') ?? accentColors[0];
                          const responders = m.allianceResponders ?? [];
                          const totalUnitsEnRoute = responders.reduce((sum, r) => sum + r.unitCount, 0);
                          const isHandled = totalUnitsEnRoute >= 2; // 2+ units = covered for routine missions
                          const isCleared = !!(m as any).allianceClearedBy;
                          const priority = m.difficulty >= 8 ? 'critical' : m.difficulty >= 5 ? 'high' : 'routine';
                          return (
                            <div key={m.id} className={`bg-purple-900/20 border rounded-lg p-3 transition-opacity ${isCleared ? 'opacity-70 border-green-500/30' : isHandled ? 'border-emerald-500/30' : 'border-purple-500/20'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{m.icon}</span>
                                  <span className="text-xs font-bold text-white">{m.name}</span>
                                  {isCleared && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300 font-bold">
                                      ✅ CLEARED BY {(m as any).allianceClearedBy}
                                    </span>
                                  )}
                                  {!isCleared && isHandled && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                                      HANDLED
                                    </span>
                                  )}
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${spawnerColor}/20 text-white/80`}>
                                  {m.allianceSpawnerName ?? 'Ally'}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-1">{m.description}</p>
                              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                                <span className={`px-1.5 py-0.5 rounded ${priority === 'critical' ? 'bg-red-500/20 text-red-400' : priority === 'high' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-700/40 text-gray-400'}`}>
                                  {priority.toUpperCase()}
                                </span>
                                <span>{m.difficulty}★</span>
                                <span>•</span>
                                <span>{m.timeRemaining}s left</span>
                              </div>
                              {/* Responders section */}
                              {responders.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-purple-500/10">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Navigation className="w-3 h-3 text-green-400" />
                                    <span className="text-[10px] font-bold text-green-400">
                                      {totalUnitsEnRoute} unit{totalUnitsEnRoute !== 1 ? 's' : ''} en route
                                    </span>
                                  </div>
                                  {responders.map((r, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px] text-gray-400 ml-5">
                                      <span className="text-white/70">{r.playerName}</span>
                                      <span>•</span>
                                      <span>{r.unitCount} unit{r.unitCount !== 1 ? 's' : ''}</span>
                                      <span>•</span>
                                      <span className="text-cyan-400">ETA {Math.ceil(r.eta / 60)}m</span>
                                      <span className="text-gray-600">({r.service})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Dispatch button — gated by alliance level 3+ */}
                              {!isCleared && !isHandled && m.status !== 'en_route' && (
                                canDispatch ? (
                                  <button
                                    onClick={() => dispatchMission(m)}
                                    className="mt-2 w-full py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 text-[10px] font-bold flex items-center justify-center gap-1.5"
                                  >
                                    <Send className="w-3 h-3" /> Respond to Call
                                  </button>
                                ) : (
                                  <div className="mt-2 text-[10px] text-gray-600 text-center py-1">
                                    Dispatch requires Alliance Level 3
                                  </div>
                                )
                              )}
                            </div>
                          );
                        })}
                        {/* Treasury section — Phase 1 of v1.0 co-op endgame */}
                        {allianceLevel >= 2 && (
                          <div className="mt-3 pt-3 border-t border-purple-500/10">
                            <AllianceTreasury
                              allianceLevel={allianceLevel}
                              memberRole={memberRole}
                            />
                          </div>
                        )}
                        {/* Gifting section — Phase 2 of v1.0 co-op endgame */}
                        {allianceLevel >= 2 && allianceState.members && (
                          <div className="mt-3 pt-3 border-t border-purple-500/10">
                            <AllianceGifts
                              currentPlayerId={useGameStore.getState().player?.id ?? ''}
                              members={allianceState.members.map((m: any) => ({
                                playerId: m.playerId,
                                username: m.username ?? m.name ?? 'Unknown',
                                level: m.level ?? 1,
                              }))}
                            />
                          </div>
                        )}
                        {/* Shared Stations — Phase 3 of v1.0 co-op endgame */}
                        {allianceLevel >= 3 && (
                          <div className="mt-3 pt-3 border-t border-purple-500/10">
                            <AllianceStations
                              allianceLevel={allianceLevel}
                              memberRole={memberRole}
                            />
                          </div>
                        )}
                        {/* Unit Loans — Phase 4 of v1.0 co-op endgame */}
                        {allianceLevel >= 4 && (
                          <div className="mt-3 pt-3 border-t border-blue-500/10">
                            <AllianceLoans
                              currentPlayerId={useGameStore.getState().player?.id ?? ''}
                              members={allianceState.members.map((m: any) => ({
                                playerId: m.playerId,
                                username: m.username ?? m.name ?? 'Unknown',
                                level: m.level ?? 1,
                              }))}
                              memberRole={memberRole}
                              prefillType={prefillLoanUnitType}
                              onPrefillConsumed={() => setPrefillLoanUnitType(null)}
                            />
                          </div>
                        )}
                        {/* Activity Feed — Phase 5 of v1.0 co-op endgame */}
                        <div className="mt-3 pt-3 border-t border-green-500/10">
                          <AllianceActivity
                            currentPlayerId={useGameStore.getState().player?.id ?? ''}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeTab === 'records' && (
                <div className="h-full min-w-0 overflow-hidden rounded-xl border border-white/5 bg-gray-950/40">
                  <Suspense fallback={<div className="h-full flex items-center justify-center text-[10px] text-gray-500">Loading records…</div>}>
                    <CriminalRecordsPanel />
                  </Suspense>
                </div>
              )}
              {activeTab === 'jail' && (
                <div className="h-full min-w-0 overflow-hidden rounded-xl border border-white/5 bg-gray-950/40">
                  <Suspense fallback={<div className="h-full flex items-center justify-center text-[10px] text-gray-500">Loading jail…</div>}>
                    <CountyJailPanel />
                  </Suspense>
                </div>
              )}
              {activeTab === 'hospital' && (
                <div className="h-full min-w-0 overflow-hidden rounded-xl border border-white/5 bg-gray-950/40">
                  <Suspense fallback={<div className="h-full flex items-center justify-center text-[10px] text-gray-500">Loading hospital…</div>}>
                    <CityHospitalPanel />
                  </Suspense>
                </div>
              )}
              {activeTab === 'marshal' && (
                <div className="h-full min-w-0 overflow-hidden rounded-xl border border-white/5 bg-gray-950/40">
                  <FireMarshalPanel />
                </div>
              )}
            </div>

            {/* Right comm log */}
            <div className="w-full md:w-72 shrink-0 h-44 md:h-auto border-t md:border-t-0 md:border-l border-gray-800/60 bg-gray-900/40 flex flex-col">
              <div className="px-3 py-2 border-b border-gray-800/60 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[11px] font-bold text-white">Comm Log</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {commLog.length === 0 && <p className="text-[10px] text-gray-600 text-center mt-8">No comm events.</p>}
                {commLog.map((entry) => (
                  <div key={entry.id} className="text-[10px] border-l-2 pl-2 py-0.5 border-gray-700">
                    <span className="text-gray-600 font-mono">{entry.timestamp}</span>
                    <p className={` ${entry.priority === 'critical' ? 'text-red-400' : entry.priority === 'high' ? 'text-amber-400' : 'text-gray-300'}`}>{entry.text}</p>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
