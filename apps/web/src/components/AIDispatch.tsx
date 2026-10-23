// ============================================
// Dispatch HQ — AI Dispatch Assistant
// ============================================
// Rule-based dispatch assistant with one-click recommended dispatches.
// No external AI needed; all suggestions are derived from live game state.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, Radio, X, Loader2, Cpu, AlertTriangle, CheckCircle2, Plus, Zap } from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import { isTraining } from '../lib/training';
import type { Mission, Unit } from '@dispatch-hq/shared';
import { fetchDrivingRoute } from '../utils/routing';
import { haversineKm } from '../utils/roadPathfinding';
import { crewReadiness } from '@/lib/personnel';

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface Recommendation {
  mission: Mission;
  units: Unit[];
  missingTypes: string[];
}

interface AIDispatchProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AIDispatch({ isOpen, onClose }: AIDispatchProps) {
  const { missions, units, stations, selectedCity, selectedService, updateMission, updateUnit } = useGameStore();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeMissions = useMemo(
    () => missions.filter(m => m.status !== 'completed' && m.status !== 'failed'),
    [missions]
  );

  const recommendations = useMemo<Recommendation[]>(() => {
    const available = units.filter(u => u.status === 'available' && u.position && !isTraining(u));
    return activeMissions
      .map(mission => buildRecommendation(mission, available, stations))
      .filter(r => r.units.length > 0 || r.missingTypes.length > 0)
      .sort((a, b) => b.mission.difficulty - a.mission.difficulty);
  }, [activeMissions, units, stations]);

  // Initial greeting when first opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'Dispatch Assistant online. I monitor active calls, match units to requirements, and can dispatch recommended fleets with one click.',
        timestamp: Date.now(),
      }]);
    }
  }, [isOpen]); // eslint-disable-line

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendQuery = useCallback(() => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }]);
    setLoading(true);

    setTimeout(() => {
      const response = generateLocalResponse(userMsg, missions, units, stations, selectedCity, selectedService, recommendations);
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
      setLoading(false);
    }, 250);
  }, [input, loading, missions, units, stations, selectedCity, selectedService, recommendations]);

  const handleDispatchRecommendation = useCallback(async (rec: Recommendation) => {
    if (!rec.units.length) return;
    setLoading(true);
    const results = await Promise.allSettled(
      rec.units.map(async unit => {
        if (!unit.position) return null;
        const route = await fetchDrivingRoute(unit.position, rec.mission.location, unit.speed || 13.9);
        if (!route?.waypoints || route.waypoints.length < 2) return null;
        updateUnit(unit.id, {
          status: 'en_route',
          missionId: rec.mission.id,
          destination: rec.mission.location,
          eta: route.durationSec,
          etaTotal: route.durationSec,
          waypoints: route.waypoints,
          routeDistanceKm: route.distanceKm,
        });
        return unit.id;
      })
    );

    const dispatched = results
      .map(r => (r.status === 'fulfilled' ? r.value : null))
      .filter((id): id is string => Boolean(id));

    if (dispatched.length) {
      updateMission(rec.mission.id, {
        status: 'en_route',
        assignedUnits: [...new Set([...rec.mission.assignedUnits, ...dispatched])],
      });
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: `Dispatched ${dispatched.length} unit(s) to ${rec.mission.name}. Estimated arrivals are shown in the dispatch board.`,
          timestamp: Date.now(),
        },
      ]);
    } else {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Could not route any units to ${rec.mission.name}. Try again when the map server is reachable.`, timestamp: Date.now() },
      ]);
    }
    setLoading(false);
  }, [updateMission, updateUnit]);

  const quickActions = [
    { label: 'Triage active calls', icon: '🚨' },
    { label: 'Suggest patrol routes', icon: '🚗' },
    { label: 'Cross-service assist?', icon: '🤝' },
    { label: 'Dispatch recommended', icon: '⚡' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className="absolute top-12 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-10 z-[35] w-[min(88vw,24rem)] bg-gray-900 border-l border-gray-800/50 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-dispatch-cyan/20 border border-dispatch-cyan/30 flex items-center justify-center">
                <Brain className="w-4 h-4 text-dispatch-cyan" />
              </div>
              <div>
                <p className="text-sm font-bold text-white flex items-center gap-1">
                  Dispatch Assistant <Cpu className="w-3 h-3 text-dispatch-yellow" />
                </p>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <p className="text-[9px] text-gray-500">Rule-based</p>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Live recommendations */}
          <div className="border-b border-gray-800/50 max-h-[35%] overflow-y-auto">
            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Live Recommendations
            </div>
            {recommendations.length === 0 ? (
              <div className="px-3 pb-3 text-[10px] text-gray-500">
                No active calls need units right now.
              </div>
            ) : (
              <div className="px-3 pb-3 space-y-2">
                {recommendations.map(rec => (
                  <div
                    key={rec.mission.id}
                    className="rounded-lg border border-gray-700/50 bg-gray-800/40 p-2"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{rec.mission.name}</p>
                        <p className="text-[9px] text-gray-500 truncate">
                          {rec.mission.category} · diff {rec.mission.difficulty}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDispatchRecommendation(rec)}
                        disabled={loading || rec.units.length === 0}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-dispatch-cyan/20 border border-dispatch-cyan/30 text-dispatch-cyan text-[10px] font-bold hover:bg-dispatch-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-3 h-3" /> {rec.units.length}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {rec.units.slice(0, 4).map(u => (
                        <span key={u.id} className="px-1.5 py-0.5 rounded-full bg-gray-700/50 border border-gray-600/40 text-[9px] text-gray-300 truncate max-w-[6rem]">
                          {u.name}
                        </span>
                      ))}
                      {rec.missingTypes.length > 0 && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-900/30 border border-red-500/30 text-[9px] text-red-300">
                          <AlertTriangle className="w-2.5 h-2.5" /> Need {rec.missingTypes.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}>
                {msg.role === 'system' ? (
                  <div className="text-[10px] text-gray-400 text-center px-2 py-1 rounded bg-gray-800/30 max-w-[90%]">
                    {msg.content}
                  </div>
                ) : (
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-dispatch-cyan/20 text-cyan-100 border border-dispatch-cyan/30'
                      : 'bg-gray-800/60 text-gray-200 border border-gray-700/40'
                  }`}>
                    {msg.role === 'assistant' && <Radio className="w-3 h-3 text-dispatch-cyan mb-1 inline-block mr-1 flex-shrink-0" />}
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 text-dispatch-cyan animate-spin" />
                  <span className="text-xs text-gray-500">Analyzing...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick suggestions */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {quickActions.map(s => (
                <button
                  key={s.label}
                  onClick={() => setInput(s.label)}
                  className="px-2 py-1 text-[10px] rounded-full bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-800/50 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendQuery(); }}
              placeholder="Ask the dispatch assistant..."
              className="flex-1 bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-cyan/50"
            />
            <button
              onClick={sendQuery}
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg bg-dispatch-cyan/20 border border-dispatch-cyan/30 text-dispatch-cyan hover:bg-dispatch-cyan/30 disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Build a recommendation: choose the closest available units that satisfy requirements.
function buildRecommendation(mission: Mission, available: Unit[], stations: any[]): Recommendation {
  // Gather already assigned unit IDs for this mission.
  const alreadyAssigned = new Set(mission.assignedUnits);

  // Pool excluding already-assigned units.
  const pool = available.filter(u => !alreadyAssigned.has(u.id));

  // Readiness-aware dispatch (v0.21.0): for critical calls (difficulty >= 7)
  // the assistant prefers fresh crews — a burned-out crew rolls out slower, so
  // the sharpest responders go to the worst incidents. Routine calls stay
  // distance-first, and with Shift Pressure off every crew is equally fresh.
  const readiness = new Map<string, number>();
  for (const u of pool) {
    const station = stations.find((s: any) => s.id === u.stationId);
    const crew = (station?.employees || []).filter((e: any) => (u.crewIds || []).includes(e.id));
    readiness.set(u.id, crewReadiness(crew)?.avgEffectiveness ?? 1);
  }
  const critical = mission.difficulty >= 7;
  const sortCandidates = (arr: Unit[]) => [...arr].sort((a, b) => {
    if (critical) {
      const ra = readiness.get(a.id) ?? 1;
      const rb = readiness.get(b.id) ?? 1;
      if (Math.abs(ra - rb) > 0.01) return rb - ra;
    }
    return distanceToMission(a, mission) - distanceToMission(b, mission);
  });

  const selected: Unit[] = [];
  const missingTypes: string[] = [];

  if (!mission.requirements || mission.requirements.length === 0) {
    // No explicit requirement: pick the single closest (or freshest) unit.
    const closest = sortCandidates(pool)[0];
    if (closest) selected.push(closest);
  } else {
    mission.requirements.forEach(req => {
      const count = req.count || 1;

      const alreadyOfType = Array.from(alreadyAssigned).filter(id => {
        const u = available.find(x => x.id === id);
        return u?.type === req.unitType;
      }).length + selected.filter(u => u.type === req.unitType).length;

      const need = Math.max(0, count - alreadyOfType);
      const matched = sortCandidates(pool.filter(u => u.type === req.unitType)).slice(0, need);

      selected.push(...matched);
      matched.forEach(u => {
        const idx = pool.findIndex(x => x.id === u.id);
        if (idx >= 0) pool.splice(idx, 1);
      });

      if (matched.length < need) missingTypes.push(`${need - matched.length}×${req.unitType}`);
    });
  }

  return { mission, units: selected, missingTypes };
}

function distanceToMission(unit: Unit, mission: Mission): number {
  if (!unit.position) return Infinity;
  return haversineKm(unit.position, mission.location);
}

// Offline rule-based assistant response engine
function generateLocalResponse(
  query: string,
  missions: Mission[],
  units: Unit[],
  stations: any[],
  selectedCity: any,
  selectedService: any,
  recommendations: Recommendation[],
): string {
  const q = query.toLowerCase();
  const activeMissions = missions.filter(m => m.status !== 'completed' && m.status !== 'failed');
  const availableUnits = units.filter(u => u.status === 'available' && !isTraining(u));
  const busyUnits = units.filter(u => u.status !== 'available' || isTraining(u));

  if (q.includes('triage') || q.includes('priority')) {
    const sorted = [...activeMissions].sort((a, b) => b.difficulty - a.difficulty);
    if (sorted.length === 0) return 'No active calls to triage. All clear.';
    return `Priority triage (${sorted.length} active calls):\n${sorted.map((m, i) => `${i + 1}. ${m.name} — Difficulty ${m.difficulty}, ${m.category.toUpperCase()}. ${m.assignedUnits.length > 0 ? 'Units assigned.' : 'NEEDS UNITS.'}`).join('\n')}`;
  }

  if (q.includes('patrol')) {
    if (availableUnits.length === 0) return 'No available units for patrol. All units are busy.';
    return `Patrol suggestions for ${availableUnits.length} available units:\n${availableUnits.slice(0, 5).map(u => `• ${u.name} (${u.type}) — Patrol near ${stations.find((s: any) => s.id === u.stationId)?.name || 'station'}`).join('\n')}\n\nUnits follow real road paths via OSRM routing with a grid fallback.`;
  }

  if (q.includes('cross') || q.includes('assist')) {
    const crossService = activeMissions.filter(m => m.difficulty >= 4);
    return `Cross-service coordination: Fire, police, and EMS coexist and assist each other. Fire handles suppression/rescue, police handles perimeter/traffic control, EMS handles medical. Auto-assist triggers when a call requires multiple unit types.${crossService.length > 0 ? `\n\nHigh-difficulty calls needing cross-service backup:\n${crossService.map(m => `• ${m.name} (${m.category}, diff ${m.difficulty})`).join('\n')}` : '\n\nNo high-difficulty calls currently requiring cross-service backup.'}`;
  }

  if (q.includes('dispatch') || q.includes('assign') || q.includes('recommended') || q.includes('⚡')) {
    if (recommendations.length === 0) {
      if (activeMissions.length === 0) return 'No active calls requiring dispatch.';
      return `${activeMissions.length} calls are active, but no available units match their needs. Build or recall units to unlock recommendations.`;
    }
    const total = recommendations.reduce((sum, r) => sum + r.units.length, 0);
    return `${recommendations.length} call(s) have recommended dispatches (${total} unit slot(s)). Click the +N button next to a call to send those units immediately.`;
  }

  // Default: situation report
  const serviceMap = activeMissions.reduce((acc: Record<string, number>, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {});
  const breakdown = Object.entries(serviceMap).map(([cat, n]) => `${cat}: ${n}`).join(', ') || 'none';
  const recText = recommendations.length
    ? `\n\n${recommendations.length} recommended dispatch group(s) are ready to send.`
    : '';
  return `Situation report — ${selectedCity?.name || 'Unknown'} (${selectedService || 'all'}):\n• ${activeMissions.length} active calls (${breakdown})\n• ${availableUnits.length} units available, ${busyUnits.length} busy\n• ${stations.length} stations operational${recText}\n\nAsk about triage, patrol routes, dispatch assignments, or cross-service coordination.`;
}
