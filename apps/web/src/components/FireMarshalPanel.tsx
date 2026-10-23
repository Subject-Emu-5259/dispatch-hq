// ============================================
// Dispatch HQ — Fire Marshal Bureau Panel
// ============================================
// Fire counterpart to the County Jail: after a fire scene is cleared the
// marshal opens a cause investigation. Filing the report closes the case
// and pays the department a clearance fee. Lives in the Unified Dispatch
// Center (Fire Marshal tab).

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, FileSearch, MapPin, Search, Clock, BadgeCheck, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { broadcastRadioMessage } from '@/utils/radioEvents';
import { useGameStore } from '@/stores/gameStore';
import { investigationReward } from '@/lib/agencies';
import type { FireInvestigation } from '@dispatch-hq/shared';

const causeBadge: Record<string, string> = {
  Arson: 'bg-red-500/15 text-red-400 border-red-500/30',
  Electrical: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Accidental: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Unknown: 'bg-gray-800 text-gray-400 border-gray-700',
};

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function FireMarshalPanel() {
  const { investigations, closeInvestigation, updatePlayer, selectedCity } = useGameStore();
  const [view, setView] = useState<'open' | 'cleared'>('open');
  const [query, setQuery] = useState('');

  const handleFileReport = (inv: FireInvestigation) => {
    const reward = investigationReward(inv.difficulty);
    closeInvestigation(inv.id);
    updatePlayer({ credits: (useGameStore.getState().player?.credits ?? 0) + reward });
    broadcastRadioMessage({
      from: selectedCity?.name ? `${selectedCity.name} Fire Marshal` : 'Fire Marshal',
      to: 'Dispatch',
      text: `Cause determined on ${inv.structure} at ${inv.address}: ${inv.cause}. Case file closed — clearance fee $${reward.toLocaleString()} collected.`,
      type: 'dispatch',
      service: 'fire',
    });
  };

  const filtered = useMemo(() => {
    const list = investigations.filter((i) => (view === 'open' ? i.status === 'open' : i.status === 'cleared'));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => `${i.address} ${i.structure} ${i.cause}`.toLowerCase().includes(q));
  }, [investigations, query, view]);

  const counts = useMemo(() => ({
    open: investigations.filter((i) => i.status === 'open').length,
    cleared: investigations.filter((i) => i.status === 'cleared').length,
  }), [investigations]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/5 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Flame className="w-4 h-4 text-orange-400" />
            Fire Marshal Bureau
          </div>
          <div className="text-[10px] text-gray-500">{counts.open} open case{counts.open === 1 ? '' : 's'}</div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {[
            ['open', `Open Cases (${counts.open})`],
            ['cleared', `Cleared (${counts.cleared})`],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k as 'open' | 'cleared')}
              className={`text-[10px] px-2 py-1.5 rounded-lg border transition-colors ${
                view === k ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-900/50 text-gray-400 border-white/10 hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1 relative ml-2 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cases..."
              className="w-full bg-gray-950 border border-white/10 rounded-lg pl-8 pr-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {view === 'open' && counts.open === 0 && (
          <div className="text-center py-10 text-gray-500">
            <FileSearch className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <div className="text-sm">No open investigations.</div>
            <div className="text-[10px] mt-1">Clear fire scenes to open a marshal case on the cause.</div>
          </div>
        )}
        {filtered.map((inv) => (
          <InvestigationCard
            key={inv.id}
            inv={inv}
            reward={investigationReward(inv.difficulty)}
            onFileReport={() => handleFileReport(inv)}
          />
        ))}
      </div>
    </div>
  );
}

function CardBadge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {text}
    </span>
  );
}

function InvestigationCard({ inv, reward, onFileReport }: { inv: FireInvestigation; reward: number; onFileReport: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/50 border border-white/5 rounded-xl p-2.5 hover:border-white/10 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white truncate">{inv.structure}</span>
            <span className="text-[9px] text-gray-500">Lv {inv.difficulty}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-300">
            <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
            <span className="truncate">{inv.address}</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Opened</div>
              <div className="text-gray-200">{formatDuration(Date.now() - inv.openedAt)} ago</div>
            </div>
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1">
                {inv.status === 'open' ? <AlertTriangle className="w-2.5 h-2.5" /> : <BadgeCheck className="w-2.5 h-2.5" />} Status
              </div>
              <div className="text-gray-200">{inv.status === 'open' ? 'Under investigation' : 'Case closed'}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
          <CardBadge text={inv.cause} cls={causeBadge[inv.cause]} />
          {inv.status === 'open' && (
            <button
              onClick={onFileReport}
              className="text-[10px] mt-0.5 px-2 py-1 rounded bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 transition-colors flex items-center gap-1"
            >
              <ClipboardCheck className="w-3 h-3" /> File Report · ${reward.toLocaleString()}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
