// ============================================
// Dispatch HQ — Radio Comms System
// ============================================
// Real-time dispatch communications powered by the radio dialogue engine.
// Generates context-aware traffic across unit↔dispatch, unit↔unit,
// supervisor checks, cross-service coordination, and player command responses.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Send, AlertTriangle, Users, Bell, Volume2,
  MessageSquare, ChevronDown, Filter, Wifi, WifiOff,
} from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { UNIT_CONFIGS } from '@dispatch-hq/shared';
import { broadcastRadioMessage } from '@/utils/radioEvents';
import { playRadioBeep } from '@/utils/sound';
import {
  transitionConversation,
  setRadioCityContext,
  getUnitServiceType,
  type DialogueMessage,
} from '@/lib/radioDialogueEngine';
import {
  statusReport,
  idleChatter,
  commandResponse,
  followUpExchange,
  dialogueSummary,
} from '@/lib/radioDialogueEngine.lazy';
import { patrolZonesForCity } from '@/lib/patrol/patrolZones';

export type RadioMessage = DialogueMessage & { id: string; timestamp: string };

function fmtTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function toRadioMessage(msg: DialogueMessage, id: number): RadioMessage {
  return { ...msg, id: `radio-${id}`, timestamp: fmtTime() };
}

const SEQUENCE_SPACING_MS = 650;

function scheduleMessages(
  addMessages: (m: DialogueMessage[]) => void,
  msgs: DialogueMessage[],
  baseDelayMs = 0,
  spacingMs = SEQUENCE_SPACING_MS,
) {
  if (msgs.length === 0) return;
  msgs.forEach((msg, idx) => {
    setTimeout(() => addMessages([msg]), baseDelayMs + idx * spacingMs);
  });
}

export function RadioComms() {
  const { units, missions, selectedCity, mapBounds } = useGameStore();
  const [messages, setMessages] = useState<RadioMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'police' | 'fire' | 'ems'>('all');
  const [selectedUnit, setSelectedUnit] = useState<string | 'all'>('all');
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [showServiceFilter, setShowServiceFilter] = useState(false);
  const [autoChatter, setAutoChatter] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef(0);
  const prevUnitsRef = useRef<Record<string, string>>({});
  const seenDispatchKeysRef = useRef<Set<string>>(new Set());
  const handledKeysAtRef = useRef<Map<string, number>>(new Map());

  const activeUnits = useMemo(() => units.filter(u => u.status !== 'available'), [units]);

  const addMessages = useCallback((msgs: DialogueMessage[]) => {
    if (msgs.length === 0) return;
    setMessages(prev => {
      const next = [...prev];
      for (const m of msgs) {
        next.push(toRadioMessage(m, messageIdRef.current++));
      }
      return next.slice(-400);
    });
  }, []);

  const addMessage = useCallback((msg: DialogueMessage) => addMessages([msg]), [addMessages]);

  // Listen for global radio events from UDC / MissionCard / SelectedUnitPanel / App.
  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      playRadioBeep(); // radio key-up beep for every incoming transmission

      if (detail.dispatchKey) {
        if (seenDispatchKeysRef.current.has(detail.dispatchKey)) return;
        seenDispatchKeysRef.current.add(detail.dispatchKey);
        handledKeysAtRef.current.set(detail.dispatchKey, Date.now());
      }

      if (detail.sequence && Array.isArray(detail.sequence)) {
        scheduleMessages(addMessages, detail.sequence as DialogueMessage[]);
        return;
      }

      addMessage({
        from: detail.from || 'Dispatch',
        to: detail.to || 'all',
        text: detail.text || '',
        type: detail.type || 'unit',
        service: detail.service,
        fromUnitId: detail.fromUnitId,
        toUnitId: detail.toUnitId,
      });
    };
    window.addEventListener('radio-message', listener);
    return () => window.removeEventListener('radio-message', listener);
  }, [addMessage, addMessages]);

  // Detect real-time unit status transitions and generate full, staggered conversations.
  // Skip when an explicit radio sequence was already broadcast for this transition.
  useEffect(() => {
    const prev = prevUnitsRef.current;
    // Helipad presence drives air-ambulance dialogue (v0.22.18): when the
    // commander has placed one, airlift-capable missions talk like helicopters.
    const helipadName = useGameStore.getState().helipad?.name;
    const EXPLICIT_WINDOW_MS = 2500;
    const wasHandledRecently = (key: string) => {
      const ts = handledKeysAtRef.current.get(key);
      return !!ts && Date.now() - ts < EXPLICIT_WINDOW_MS;
    };
    const hasAssignKey = (unitId: string) =>
      Array.from(handledKeysAtRef.current.keys()).some(k => k.startsWith(`assign:${unitId}:`) && wasHandledRecently(k));

    units.forEach(unit => {
      const last = prev[unit.id];
      if (last === unit.status) return;

      if (last === 'returning' && unit.status === 'available') {
        const svc = getUnitServiceType(unit.type);
        addMessage({
          from: unit.name,
          fromUnitId: unit.id,
          to: 'Dispatch',
          text: `${svc === 'police' ? '10-8' : svc === 'fire' ? '10-8' : '10-8'}, ${unit.name} back in service.`,
          type: 'unit',
          service: svc,
        });
      } else if (last === 'available' && unit.status === 'patrolling') {
        if (wasHandledRecently(`patrol:${unit.id}`)) return;
        scheduleMessages(addMessages, Array.from(transitionConversation(last || 'available', unit.status, unit, units, missions, helipadName)));
      } else if (unit.status === 'en_route') {
        if (hasAssignKey(unit.id)) return;
        const conv = Array.from(transitionConversation(last || 'available', unit.status, unit, units, missions, helipadName));
        scheduleMessages(addMessages, conv);
      } else if (unit.status === 'returning') {
        if (wasHandledRecently(`return:${unit.id}`)) return;
        const conv = Array.from(transitionConversation(last || 'available', unit.status, unit, units, missions, helipadName));
        scheduleMessages(addMessages, conv);
      } else {
        const conv = Array.from(transitionConversation(last || 'available', unit.status, unit, units, missions, helipadName));
        scheduleMessages(addMessages, conv);
      }
      prev[unit.id] = unit.status;
    });
    prevUnitsRef.current = prev;
  }, [units, missions, addMessage, addMessages]);

  // Keep the dialogue engine pointed at the real map: when the selected city
  // / map bounds change, rebuild the zone grid and feed it to the engine so
  // radio traffic names actual streets and neighborhoods. POI context is the
  // PLAYER-PLACED set (v0.22.12).
  useEffect(() => {
    if (selectedCity && mapBounds) {
      setRadioCityContext(
        patrolZonesForCity({ bounds: mapBounds, boundary: selectedCity.boundary ?? null }),
        selectedCity.name,
        useGameStore.getState().placedPois,
      );
    } else {
      setRadioCityContext(null, undefined, null);
    }
  }, [selectedCity, mapBounds]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Periodic status reports — units must keep dispatch informed while in the
  // field. Roughly half the time this is a dispatcher follow-up exchange that
  // checks what/when/where on a real street in the unit's current zone.
  useEffect(() => {
    if (!autoChatter || activeUnits.length === 0) return;
    const id = setInterval(() => {
      const unit = activeUnits[Math.floor(Math.random() * activeUnits.length)];
      const helipadName = useGameStore.getState().helipad?.name;
      const traffic = Math.random() > 0.45
        ? followUpExchange(unit, units, missions, helipadName)
        : statusReport(unit, units, missions, helipadName);
      scheduleMessages(addMessages, traffic);
    }, 12000 + Math.floor(Math.random() * 8000));
    return () => clearInterval(id);
  }, [autoChatter, activeUnits, units, missions, addMessages]);

  // Idle / partner / cross-service chatter.
  useEffect(() => {
    if (!autoChatter || activeUnits.length === 0) return;
    const id = setInterval(() => {
      const unit = activeUnits[Math.floor(Math.random() * activeUnits.length)];
      const helipadName = useGameStore.getState().helipad?.name;
      scheduleMessages(addMessages, idleChatter(unit, units, missions, helipadName));
    }, 5000 + Math.floor(Math.random() * 7000));
    return () => clearInterval(id);
  }, [autoChatter, activeUnits, units, missions, addMessages]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    const target: string = broadcastMode ? 'all' : (selectedUnit === 'all' ? 'all' : selectedUnit);
    addMessage({
      from: 'Dispatch',
      to: target,
      text,
      type: broadcastMode ? 'broadcast' : 'dispatch',
      service: serviceFilter === 'all' ? undefined : serviceFilter,
    });
    setInputText('');

    // Generate realistic, multi-reply unit responses to the typed command.
    const targets = broadcastMode || selectedUnit === 'all'
      ? activeUnits.slice(0, 4)
      : units.filter(u => u.id === selectedUnit);

    targets.forEach((unit, idx) => {
      const replies = commandResponse(text, unit, units, missions);
      scheduleMessages(addMessages, replies, 400 + idx * 350);
    });
  }, [inputText, broadcastMode, selectedUnit, serviceFilter, units, activeUnits, missions, addMessage, addMessages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  useEffect(() => {
    setMessages(prev => {
      if (prev.length > 0) return prev;
      return [toRadioMessage({
        from: 'System',
        to: 'all',
        text: `📻 ${dialogueSummary()} AI chatter active as units patrol and respond.`,
        type: 'system',
      }, messageIdRef.current++)];
    });
  }, [addMessages]);

  const filteredMessages = messages.filter(m => {
    if (serviceFilter !== 'all' && m.service !== serviceFilter) return false;
    if (selectedUnit !== 'all' && m.fromUnitId !== selectedUnit && m.toUnitId !== selectedUnit) return false;
    if (broadcastMode && m.type !== 'broadcast') return false;
    return true;
  });

  const SERVICE_FILTERS = [
    { id: 'all' as const, label: 'All Services', color: 'text-gray-400' },
    { id: 'police' as const, label: '🚔 Police', color: 'text-blue-400' },
    { id: 'fire' as const, label: '🚒 Fire', color: 'text-red-400' },
    { id: 'ems' as const, label: '🚑 EMS', color: 'text-green-400' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="px-2 py-1.5 border-b border-gray-800/40 bg-gray-800/20 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              onClick={() => setShowServiceFilter(!showServiceFilter)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-gray-800/60 text-gray-400 hover:text-white transition-colors"
            >
              <Filter className="w-3 h-3" />
              <span>{SERVICE_FILTERS.find(f => f.id === serviceFilter)?.label || 'All'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showServiceFilter && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-gray-900 border border-gray-700/40 rounded-lg shadow-xl z-50">
                {SERVICE_FILTERS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => { setServiceFilter(f.id); setShowServiceFilter(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-gray-800 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      serviceFilter === f.id ? 'bg-gray-800 text-white' : 'text-gray-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={selectedUnit}
            onChange={e => setSelectedUnit(e.target.value)}
            className="px-2 py-1 rounded text-[9px] bg-gray-800/60 text-gray-400 border border-gray-700/30 focus:outline-none focus:border-dispatch-red/50"
          >
            <option value="all">All Units</option>
            {units.map(unit => {
              const config = UNIT_CONFIGS[unit.type];
              return (
                <option key={unit.id} value={unit.id}>
                  {config?.icon} {unit.name}
                </option>
              );
            })}
          </select>

          <button
            onClick={() => setBroadcastMode(!broadcastMode)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-all ${
              broadcastMode
                ? 'bg-dispatch-red/20 text-dispatch-red border border-dispatch-red/30'
                : 'bg-gray-800/60 text-gray-400 hover:text-white'
            }`}
          >
            <Bell className="w-3 h-3" />
            <span>Broadcast</span>
          </button>

          <button
            onClick={() => setAutoChatter(!autoChatter)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-all ${
              autoChatter
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-800/60 text-gray-500'
            }`}
          >
            {autoChatter ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{autoChatter ? 'Live' : 'Muted'}</span>
          </button>

          <div className="flex-1" />
          <span className="text-[8px] text-gray-600">
            {filteredMessages.length} messages
          </span>
        </div>
      </div>

      {/* Message Log */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-600">
            <Radio className="w-6 h-6 mb-2" />
            <p className="text-xs text-gray-400">Radio is quiet</p>
            <p className="text-[10px] text-gray-600 mt-1">Traffic will appear when units are in the field</p>
          </div>
        ) : (
          filteredMessages.map((msg, i) => {
            const isLast = i === filteredMessages.length - 1;
            const isSelf = msg.from === 'Dispatch' || msg.from === 'System';
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-md text-[10px] ${
                  msg.type === 'broadcast'
                    ? 'bg-dispatch-red/10 border border-dispatch-red/20'
                    : msg.type === 'dispatch'
                    ? 'bg-blue-500/10 border border-blue-500/20'
                    : msg.type === 'system'
                    ? 'bg-gray-800/20 border border-gray-700/30'
                    : 'bg-gray-800/40'
                } ${isSelf ? 'ml-4' : ''}`}
                ref={isLast ? logEndRef : undefined}
              >
                <span className="text-[8px] text-gray-600 font-mono shrink-0 mt-0.5 w-14">
                  {msg.timestamp}
                </span>

                {msg.type === 'broadcast' && <Bell className="w-3 h-3 text-dispatch-red shrink-0 mt-0.5" />}
                {msg.type === 'dispatch' && <MessageSquare className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />}
                {msg.type === 'unit' && <Radio className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />}
                {msg.type === 'system' && <AlertTriangle className="w-3 h-3 text-gray-500 shrink-0 mt-0.5" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-semibold ${
                      msg.type === 'broadcast' ? 'text-dispatch-red' :
                      msg.type === 'dispatch' ? 'text-blue-400' :
                      msg.type === 'system' ? 'text-gray-500' :
                      'text-amber-400'
                    }`}>
                      {msg.from}
                    </span>
                    <span className="text-gray-600">→</span>
                    <span className="text-gray-400 text-[9px]">
                      {msg.to === 'all' ? 'All Units' : msg.to}
                    </span>
                    {msg.type === 'broadcast' && (
                      <span className="text-[8px] px-1 py-0 rounded bg-dispatch-red/20 text-dispatch-red font-medium">ALL</span>
                    )}
                  </div>
                  <p className="text-gray-300 mt-0.5 leading-relaxed">{msg.text}</p>
                </div>

                {msg.service && (
                  <span className={`text-[8px] px-1 py-0 rounded shrink-0 ${
                    msg.service === 'police' ? 'bg-blue-500/10 text-blue-400' :
                    msg.service === 'fire' ? 'bg-red-500/10 text-red-400' :
                    'bg-green-500/10 text-green-400'
                  }`}>
                    {msg.service === 'police' ? '🚔' : msg.service === 'fire' ? '🚒' : '🚑'}
                  </span>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-2 border-t border-gray-800/40 bg-gray-900/80 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={broadcastMode ? 'Broadcast to all units...' : 'Type radio message...'}
            className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] bg-gray-800/80 border transition-all focus:outline-none ${
              broadcastMode
                ? 'border-dispatch-red/30 text-white placeholder-gray-600 focus:border-dispatch-red/50'
                : 'border-gray-700/30 text-gray-300 placeholder-gray-600 focus:border-gray-600/50'
            }`}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim()}
            className={`p-1.5 rounded-lg transition-all ${
              broadcastMode
                ? 'bg-dispatch-red/20 text-dispatch-red hover:bg-dispatch-red/30'
                : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        {broadcastMode && (
          <div className="flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3 h-3 text-dispatch-red" />
            <p className="text-[9px] text-dispatch-red/80">
              Broadcasting to all active units. Message will be received by {activeUnits.length} unit(s) in the field.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
