// ============================================
// Dispatch HQ — Mission Types
// ============================================

import type { GeoPoint } from './station';
import type { Patient } from './justice';

export type MissionStatus = 'generated' | 'active' | 'dispatching' | 'en_route' | 'on_scene' | 'in_progress' | 'completing' | 'completed' | 'failed' | 'expired';

/** Alliance responder tracking for co-op dispatch. */
export interface AllianceResponder {
  playerName: string;
  unitCount: number;
  eta: number;           // seconds
  service: string;       // fire/ems/police
}

export type MissionCategory = 'fire' | 'traffic' | 'rescue' | 'hazmat' | 'police' | 'ems';

export type MissionPriority = 'low' | 'medium' | 'high' | 'critical';

export interface MissionTemplate {
  id: string;
  name: string;
  description: string;
  category: MissionCategory;
  icon: string;
  baseCredits: number;
  baseXp: number;
  difficulty: number;
  requirements: MissionRequirement[];
  estimatedDuration: number; // seconds
  poiTypes: string[];
  /** How often this template is selected during mission generation. Higher = more common. */
  spawnWeight?: number;
  /**
   * Staged batch (Addition 6): organized-crime layer. When set, missions
   * from this template belong to that gang (see GANGS): the mission carries
   * the gangId, the linked suspect record is stamped with it, and gang
   * activity derives from those records + mission history. Game-only
   * fictional gangs — never real-world groups.
   */
  gangId?: string;
}

/** Traffic-stop resolution (staged batch, Addition 6): how a cleared
 * traffic mission ends, resolved from the linked record's real data
 * (active warrant → arrest) or the citation/warning roll. */
export type TrafficStopOutcome = 'citation' | 'warning' | 'arrest';

export interface MissionRequirement {
  unitType: string;
  count: number;
  minTrainingLevel: number;
}

export interface Mission {
  id: string;
  templateId: string;
  name: string;
  description: string;
  category: MissionCategory;
  icon: string;
  status: MissionStatus;
  location: GeoPoint;
  poiType: string | null;
  difficulty: number;
  creditsReward: number;
  xpReward: number;
  requirements: MissionRequirement[];
  assignedUnits: string[];
  progress: number;        // 0-100
  timeRemaining: number;   // seconds
  totalTime: number;       // seconds
  createdAt: string;
  expiresAt: string;

  /** First-response time in seconds (dispatch → all assigned units on scene),
   *  recorded when the call is answered so analytics can report it per type. */
  responseTimeSeconds?: number;

  /** Dispatch priority rating, derived from incident severity at spawn time. */
  priority?: MissionPriority;

  /** Chain missions: stable chain id + 1-based stage (spawned by nextChainMission). */
  chainId?: string;
  /** Staged batch: how many times this mission has escalated (capped at 1). */
  escalations?: number;
  chainStage?: number;
  chainTotal?: number;
  /** Chain bypass: true once any earlier stage of this chain was skipped.
   *  A skipped chain is a broken chain — its remaining stages pay no 1.25x
   *  bonus (see chainBonusForStage). Propagated by spawnChainStage. */
  chainSkipped?: boolean;
  /** Staged batch (Addition 6): gang this incident belongs to (see GANGS). */
  gangId?: string;
  /** Staged batch (Addition 6): how a cleared traffic mission resolved. */
  stopOutcome?: TrafficStopOutcome;

  /** Disaster events: set on missions spawned by a city-wide disaster. */
  disasterId?: string;

  /** Batch 3b: district this mission belongs to (district unlocks + satisfaction). */
  district?: string;
  /** Batch 3b: 1-based multi-stage disaster-wave stage this mission belongs to. */
  waveStage?: number;

  /** Recovery phase: a low-stakes restoration call spawned after a disaster window closes. */
  recovery?: boolean;

  /** CPU Mutual Aid (v0.22.2): a partner-agency call being answered by simulated city units instead of the player. */
  cpuHandled?: boolean;

  /** POI anchor (v0.22.10): the named place this call is attached to (school, park, gas station…). */
  poiId?: string;

  // ── Co-op dispatch (v1.0) ──────────────────────────────────────────────
  /** Whether this mission is shared on the alliance board. */
  allianceShared?: boolean;
  /** Player ID of the alliance member who spawned this mission. */
  allianceSpawnerId?: string;
  /** Player name of the spawner (for display). */
  allianceSpawnerName?: string;
  /** Units currently en route from OTHER alliance members. */
  allianceResponders?: AllianceResponder[];
  /** Player name who completed this shared mission (shown briefly before removal). */
  allianceClearedBy?: string;

  /**
   * EMS patient transport (v0.22.9): set while a cleared medical scene is in
   * the transport phase — the responding unit is driving the victim to the
   * city hospital, where the patient is admitted (and the call finalized) on
   * arrival. The mission stays status 'en_route' during transport so the unit
   * keeps driving; TRANSPORT_TIMEOUT_MS in lib/hospital is the safety cap.
   */
  patientTransport?: {
    patient: Patient;
    hospitalId: string;
    hospitalName: string;
    hospitalPos: GeoPoint;
    /** Call sign of the unit delivering the patient (shown in the ER panel). */
    transportedByUnit?: string;
    startedAt: number;
    /** 'road' drives the ER via OSRM; 'air' flies critical patients to the helipad (v0.22.11). */
    mode?: 'road' | 'air';
    /**
     * Air-ambulance two-leg flight (v0.22.x): true once the helicopter has set
     * down at the pad — the transport then continues to the HOSPITAL ER so the
     * patient actually reaches the hospital, not just the landing zone.
     */
    padReached?: boolean;
  };
}
