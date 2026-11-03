// ============================================
// Dispatch HQ — Random Events System
// ============================================
// Dynamic events that affect gameplay: weather, traffic, multi-incident, etc.

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useNotifications } from './NotificationCenter';

// ── Types ──
export interface RandomEvent {
  id: string;
  type: 'weather' | 'traffic' | 'multi_incident' | 'power_outage' | 'hazard' | 'bonus';
  name: string;
  description: string;
  effect: string;
  severity: 'positive' | 'neutral' | 'negative' | 'critical';
  duration: number; // seconds
  /** Epoch ms when the event spawned — stamped on every event at spawn so
   * ALL event types auto-expire after their duration (v0.22.16 weather, then
   * extended to traffic/power/bonus etc. so the whole system shares one
   * lifecycle). Also feeds the Alerts-tab weather countdown. */
  startedAt?: number;
  icon: string;
  multiplier?: number;
  affectedServices?: string[];
}

// ── Event Templates ──
const EVENT_POOL: RandomEvent[] = [
  // Weather Events
  {
    id: 'storm',
    type: 'weather',
    name: 'Severe Thunderstorm',
    description: 'Heavy rain and lightning reducing visibility. Response times increased.',
    effect: '+30% response time',
    severity: 'negative',
    duration: 120,
    icon: '⛈️',
    multiplier: 1.3,
    affectedServices: ['fire', 'ems'],
  },
  {
    id: 'heatwave',
    type: 'weather',
    name: 'Heat Wave',
    description: 'Extreme temperatures increase medical emergencies.',
    effect: '+50% medical calls',
    severity: 'negative',
    duration: 180,
    icon: '🌡️',
    affectedServices: ['ems'],
  },
  {
    id: 'fog',
    type: 'weather',
    name: 'Dense Fog',
    description: 'Visibility reduced to near zero. All units move slower.',
    effect: '-20% unit speed',
    severity: 'neutral',
    duration: 90,
    icon: '🌫️',
    multiplier: 0.8,
  },
  {
    id: 'clear_skies',
    type: 'weather',
    name: 'Clear Skies',
    description: 'Perfect conditions! Response times slightly improved.',
    effect: '-15% response time',
    severity: 'positive',
    duration: 120,
    icon: '☀️',
    multiplier: 0.85,
  },

  // Traffic Events
  {
    id: 'rush_hour',
    type: 'traffic',
    name: 'Rush Hour Traffic',
    description: 'Heavy congestion across all major routes.',
    effect: '+40% travel time',
    severity: 'negative',
    duration: 150,
    icon: '🚗',
    multiplier: 1.4,
  },
  {
    id: 'road_closure',
    type: 'traffic',
    name: 'Road Closure',
    description: 'Main Avenue closed due to construction. Detours required.',
    effect: 'Units rerouted',
    severity: 'neutral',
    duration: 120,
    icon: '🚧',
  },
  {
    id: 'clear_roads',
    type: 'traffic',
    name: 'Clear Roads',
    description: 'Unusually light traffic. Units moving fast!',
    effect: '-25% travel time',
    severity: 'positive',
    duration: 90,
    icon: '🛣️',
    multiplier: 0.75,
  },

  // Multi-Incident Events
  {
    id: 'multi_car',
    type: 'multi_incident',
    name: 'Multi-Vehicle Pileup',
    description: '5-car pileup on highway! Multiple units needed immediately.',
    effect: 'Spawns 3 emergency calls',
    severity: 'critical',
    duration: 60,
    icon: '💥',
  },
  {
    id: 'building_fire',
    type: 'multi_incident',
    name: 'Structure Fire Spreading',
    description: 'Fire has spread to adjacent buildings. All-hands emergency!',
    effect: 'Mission difficulty +50%',
    severity: 'critical',
    duration: 90,
    icon: '🔥',
    multiplier: 1.5,
    affectedServices: ['fire'],
  },
  {
    id: 'mass_casualty',
    type: 'multi_incident',
    name: 'Mass Casualty Incident',
    description: 'Major incident with multiple injuries. EMS units needed.',
    effect: 'All EMS units auto-dispatched',
    severity: 'critical',
    duration: 120,
    icon: '🏥',
    affectedServices: ['ems'],
  },

  // Power & Infrastructure
  {
    id: 'power_outage',
    type: 'power_outage',
    name: 'City-Wide Power Outage',
    description: 'Blackout affecting traffic lights and communication systems.',
    effect: '+25% all response times',
    severity: 'negative',
    duration: 120,
    icon: '🔌',
    multiplier: 1.25,
  },
  {
    id: 'generator_boost',
    type: 'power_outage',
    name: 'Backup Generator Online',
    description: 'Station generators activated. Units deploy faster.',
    effect: '-30% dispatch time',
    severity: 'positive',
    duration: 60,
    icon: '🔋',
    multiplier: 0.7,
  },

  // Hazard Events
  {
    id: 'hazmat',
    type: 'hazard',
    name: 'Hazmat Spill',
    description: 'Chemical spill near residential area. Specialized response required.',
    effect: 'Fire units needed + credits bonus',
    severity: 'negative',
    duration: 90,
    icon: '☣️',
    affectedServices: ['fire'],
  },
  {
    id: 'gas_leak',
    type: 'hazard',
    name: 'Gas Leak Detected',
    description: 'Major gas leak reported. Risk of explosion!',
    effect: 'Multiple fire calls',
    severity: 'critical',
    duration: 60,
    icon: '💨',
    affectedServices: ['fire'],
  },

  // Bonus Events
  {
    id: 'overtime_pay',
    type: 'bonus',
    name: 'Overtime Budget Approved',
    description: 'City council approved overtime funding!',
    effect: '+50% credits for 60 seconds',
    severity: 'positive',
    duration: 60,
    icon: '💰',
    multiplier: 1.5,
  },
  {
    id: 'training_drill',
    type: 'bonus',
    name: 'Training Drill Bonus',
    description: 'Complete a mission during drill for double XP!',
    effect: '2x XP reward',
    severity: 'positive',
    duration: 90,
    icon: '🎯',
    multiplier: 2,
  },
  {
    id: 'volunteer_help',
    type: 'bonus',
    name: 'Volunteer Responder',
    description: 'Off-duty personnel reporting for duty!',
    effect: 'Free unit for 60s',
    severity: 'positive',
    duration: 60,
    icon: '🤝',
  },
];

const SEVERITY_STYLES = {
  positive: { bg: 'bg-dispatch-green/20', border: 'border-dispatch-green/30', text: 'text-dispatch-green' },
  neutral: { bg: 'bg-dispatch-yellow/20', border: 'border-dispatch-yellow/30', text: 'text-dispatch-yellow' },
  negative: { bg: 'bg-dispatch-orange/20', border: 'border-dispatch-orange/30', text: 'text-dispatch-orange' },
  critical: { bg: 'bg-dispatch-red/20', border: 'border-dispatch-red/30', text: 'text-dispatch-red' },
};

// ── Event History Panel ──
interface EventHistoryProps {
  events: Array<{ event: RandomEvent; timestamp: number }>;
  isOpen: boolean;
  onClose: () => void;
}

function EventHistory({ events, isOpen, onClose }: EventHistoryProps) {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-20 right-4 z-[40] bg-gray-900/95 backdrop-blur-xl border border-gray-700/50
                 rounded-xl shadow-2xl p-3 w-56 max-h-[300px] overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-white">Event History</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded transition-colors">
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </div>

      <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-[11px] text-gray-600 text-center py-4">No events yet</p>
        ) : (
          events.map((item, i) => {
            const styles = SEVERITY_STYLES[item.event.severity];
            return (
              <div key={i} className={`p-2 rounded-lg ${styles.bg} border ${styles.border}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{item.event.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-semibold ${styles.text} truncate`}>{item.event.name}</p>
                    <p className="text-[11px] text-gray-500">{item.event.effect}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

/**
 * Drop events whose duration has elapsed (v0.22.16, extended to every event
 * type). Every spawned event carries a spawn stamp, so traffic, power,
 * bonus, and multi-incident events now share the weather lifecycle: they
 * clear themselves once their window closes instead of lingering until a
 * manual dismiss. An event without a spawn stamp is kept (defensive — old
 * code paths). Pure so the expiry rule is testable.
 */
export function pruneExpiredEvents(events: RandomEvent[], now: number): RandomEvent[] {
  return events.filter((e) => typeof e.startedAt !== 'number' || now - e.startedAt < e.duration * 1000);
}

// ── Main Random Events Hook ──
export function useRandomEvents(isGameActive: boolean) {
  const { addNotification } = useNotifications();
  const [activeEvents, setActiveEvents] = useState<RandomEvent[]>([]);
  const [eventHistory, setEventHistory] = useState<Array<{ event: RandomEvent; timestamp: number }>>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Spawn random events
  useEffect(() => {
    if (!isGameActive) return;

    const spawnEvent = () => {
      // Don't stack too many events
      if (activeEvents.length >= 2) return;

      const event = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];

      // Check if already active
      if (activeEvents.some(e => e.id === event.id)) return;

      // Every event stamps its spawn time so ALL types auto-expire after
      // their duration (v0.22.16) — weather also feeds the Alerts-tab
      // countdown; traffic/power/bonus/multi-incident just clear themselves
      // once their window closes, matching the weather lifecycle.
      const stamped = { ...event, startedAt: Date.now() };
      setActiveEvents(prev => [...prev, stamped]);
      setEventHistory(prev => [...prev.slice(-10), { event, timestamp: Date.now() }]);

      addNotification({
        type: event.severity === 'critical' ? 'error' : event.severity === 'positive' ? 'success' : 'warning',
        title: `${event.icon} ${event.name}`,
        message: event.effect,
        icon: event.icon,
        duration: 5000,
      });
    };

    // Random interval between 30-90 seconds
    const interval = setInterval(spawnEvent, 30000 + Math.random() * 60000);
    return () => clearInterval(interval);
  }, [isGameActive, activeEvents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every event auto-expires once its duration elapses (the durations were
  // always defined but never enforced — a storm, rush hour, or blackout would
  // linger until manually dismissed). Weather feeds the Alerts-tab countdown;
  // all other types clear themselves the same way (v0.22.16).
  useEffect(() => {
    const t = setInterval(() => {
      setActiveEvents(prev => pruneExpiredEvents(prev, Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Remove expired events (manual dismissal)
  const dismissEvent = useCallback((eventId: string) => {
    setActiveEvents(prev => prev.filter(e => e.id !== eventId));
  }, []);

  // Get effects for calculations
  const getActiveEffects = useCallback(() => {
    const effects = {
      responseTimeMultiplier: 1,
      travelTimeMultiplier: 1,
      creditsMultiplier: 1,
      xpMultiplier: 1,
      spawnRateMultiplier: 1,
    };

    activeEvents.forEach(event => {
      if (event.multiplier) {
        if (event.type === 'weather' || event.type === 'traffic' || event.type === 'power_outage') {
          effects.responseTimeMultiplier *= event.multiplier;
          effects.travelTimeMultiplier *= event.multiplier;
        }
        if (event.type === 'bonus') {
          effects.creditsMultiplier *= event.multiplier;
          effects.xpMultiplier *= event.multiplier;
        }
        if (event.type === 'multi_incident') {
          effects.spawnRateMultiplier *= event.multiplier;
        }
      }
    });

    return effects;
  }, [activeEvents]);

  return {
    activeEvents,
    eventHistory,
    showHistory,
    setShowHistory,
    dismissEvent,
    getActiveEffects,
  };
}

// ── Exported Component ──
interface RandomEventsProps {
  activeEvents: RandomEvent[];
  eventHistory: Array<{ event: RandomEvent; timestamp: number }>;
  showHistory: boolean;
  onToggleHistory: () => void;
  onDismissEvent: (id: string) => void;
}

export function RandomEvents({ activeEvents, eventHistory, showHistory, onToggleHistory, onDismissEvent }: RandomEventsProps) {
  // Event pop-ups removed to avoid blocking gameplay. Active events remain visible in the history panel and via toasts.
  return (
    <>
      <EventHistory
        events={eventHistory}
        isOpen={showHistory}
        onClose={onToggleHistory}
      />
    </>
  );
}
