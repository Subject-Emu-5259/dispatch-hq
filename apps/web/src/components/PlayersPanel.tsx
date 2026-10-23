// ============================================
// Dispatch HQ — Commanders Online Panel
// ============================================
// Clickable surface behind the floating online chip: the live roster of
// connected commanders (level, city, what they're doing), fed by the WS
// presence broadcasts. Honors the same three states as the chip — Online,
// Offline / Offline Mode, and Maintenance — so the panel always tells the
// truth about the online/offline system (v0.22.17).

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Wifi, MapPin, Globe2 } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { loadSettings } from '@/utils/settings';
import { haversineKm } from '@/utils/roadPathfinding';
import type { OnlinePlayerPresence, PresenceActivity } from '@dispatch-hq/shared';

/** A map viewport center + radius, as carried by presence. */
export interface ViewportRef { lat: number; lng: number; radiusKm: number }

/**
 * "Near you" test (v0.22.18): a commander is nearby when they're in the same
 * city as me, or their viewport overlaps mine (center distance under the sum
 * of radii plus a small overlap buffer). Mirrors the relay fan-out geometry.
 */
export function presenceIsNear(
  p: OnlinePlayerPresence,
  me: { city: string | null; view: ViewportRef | null },
): boolean {
  if (p.city && me.city && p.city === me.city) return true;
  if (!me.view || !p.view) return false;
  const d = haversineKm(me.view, p.view);
  return d < me.view.radiusKm + (p.view.radiusKm ?? 5) + 1;
}

/** Sort nearby commanders first (level desc within each group). */
export function sortPresenceNearYou(
  players: OnlinePlayerPresence[],
  me: { city: string | null; view: ViewportRef | null },
): { near: OnlinePlayerPresence[]; far: OnlinePlayerPresence[] } {
  const near = players.filter((p) => presenceIsNear(p, me));
  const far = players.filter((p) => !presenceIsNear(p, me));
  const byLevel = (a: OnlinePlayerPresence, b: OnlinePlayerPresence) =>
    b.level - a.level || a.username.localeCompare(b.username);
  return { near: near.sort(byLevel), far: far.sort(byLevel) };
}

const ACTIVITY_META: Record<PresenceActivity, { label: string; icon: string; chip: string }> = {
  in_mission: { label: 'In a mission', icon: '🚨', chip: 'bg-red-500/15 text-red-400 border-red-500/30' },
  patrolling: { label: 'Patrolling', icon: '🚔', chip: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  idle: { label: 'Idle', icon: '💤', chip: 'bg-gray-700/40 text-gray-400 border-gray-600/40' },
};

export function PlayersPanel({ onClose }: { onClose: () => void }) {
  const onlinePlayers = useGameStore((s) => s.onlinePlayers);
  const onlineCount = useGameStore((s) => s.onlineCount);
  const wsConnected = useGameStore((s) => s.wsConnected);
  const maintenance = useGameStore((s) => s.maintenance);
  const me = useGameStore((s) => s.player);
  const myCity = useGameStore((s) => s.selectedCity?.name ?? null);
  const myViewport = useGameStore((s) => s.myViewport);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const state: 'online' | 'offline' | 'maintenance' = maintenance ? 'maintenance' : wsConnected ? 'online' : 'offline';
  // "Near you" sort (v0.22.18): same-city or viewport-overlapping commanders
  // surface first, using the viewport data the relay already fans out.
  const { near, far } = sortPresenceNearYou(onlinePlayers, { city: myCity, view: myViewport });
  const rows = [...near, ...far];

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-950/95 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Commanders Online
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                state === 'maintenance'
                  ? 'bg-amber-900/50 border-amber-500/40 text-amber-300'
                  : state === 'online'
                    ? 'bg-green-900/50 border-green-500/40 text-green-300'
                    : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}>
                {state === 'maintenance' ? 'Maintenance' : state === 'online' ? `${onlineCount} online` : 'Offline'}
              </span>
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {state === 'maintenance'
                ? 'Online services paused by the founder — single-player continues.'
                : state === 'online'
                  ? 'Live roster — updates every ~10 seconds via WebSocket.'
                  : loadSettings().onlineMode
                    ? 'Reconnecting to the dispatch server…'
                    : 'Online Gameplay is off — flip it on in Settings → Network.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[58vh] overflow-y-auto p-2">
          {state === 'maintenance' ? (
            <StateRow icon="🛠️" title="Maintenance" desc="The founder paused the online layer. Your single-player campaign keeps running and saving — check back soon." />
          ) : state === 'offline' ? (
            <StateRow
              icon="📴"
              title="Offline"
              desc={loadSettings().onlineMode
                ? 'Lost the connection to the dispatch server — it reconnects automatically when possible.'
                : 'You chose a private session. Other commanders won\'t appear until Online Gameplay is on.'}
            />
          ) : rows.length === 0 ? (
            <StateRow icon="🛰️" title="No commanders yet" desc="You're the first one on duty — the roster fills as others connect." />
          ) : (
            <>
              {near.length > 0 && (
                <SectionHeader
                  icon={<MapPin className="w-2.5 h-2.5" />}
                  label={`Near you${far.length > 0 ? ` (${near.length})` : ''}`}
                />
              )}
              <ul className="space-y-1">
                {near.map((p) => (
                  <PlayerRow key={p.playerId} p={p} isMe={p.playerId === me?.id} near />
                ))}
              </ul>
              {far.length > 0 && (
                <SectionHeader icon={<Globe2 className="w-2.5 h-2.5" />} label={`Other commanders (${far.length})`} />
              )}
              <ul className="space-y-1">
                {far.map((p) => (
                  <PlayerRow key={p.playerId} p={p} isMe={p.playerId === me?.id} />
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/40 flex items-center gap-1.5">
          <Wifi className="w-3 h-3 text-gray-600 shrink-0" />
          <p className="text-[9px] text-gray-600 leading-snug">
            Presence is server-based — activity reflects each fleet's live status (missions, patrol, idle).
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function PlayerRow({ p, isMe, near }: { p: OnlinePlayerPresence; isMe: boolean; near?: boolean }) {
  const act = ACTIVITY_META[p.activity] ?? ACTIVITY_META.idle;
  return (
    <li className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-900/60 transition-colors">
      <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[11px] font-bold text-dispatch-cyan shrink-0">
        {(p.username || '?').charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-white truncate">
          {p.username || 'Commander'}
          {isMe && <span className="ml-1 text-[9px] text-gray-500 font-normal">(you)</span>}
          {near && (
            <span className="ml-1.5 text-[8px] px-1 py-px rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-semibold uppercase">near you</span>
          )}
        </p>
        <p className="text-[9px] text-gray-500 truncate">{p.city ?? 'City unset'}</p>
      </div>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold shrink-0">
        Lv {p.level}
      </span>
      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold shrink-0 whitespace-nowrap ${act.chip}`}>
        {act.icon} {act.label}
      </span>
    </li>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <p className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[9px] uppercase tracking-wider text-gray-500 font-semibold">
      {icon}
      {label}
    </p>
  );
}

function StateRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 px-6 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="text-xs font-semibold text-white">{title}</p>
      <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>
    </div>
  );
}
