// CountyJailPanel.tsx
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, UserX, ShieldCheck, Scale, Clock, Calendar, Search, DoorOpen, X } from 'lucide-react';
import { broadcastRadioMessage } from '@/utils/radioEvents';
import { useGameStore } from '@/stores/gameStore';
import { jailCapacity, jailOccupancy } from '@/lib/jailCapacity';
import { decideJailBooking } from '@/lib/capacityDecisions';
import { topStatuteForCharges, sentenceAndBailForCharges } from '@/lib/chargeStatutes';
import type { Inmate } from '@dispatch-hq/shared';

const statusBadge: Record<string, string> = {
  booking: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  awaiting_trial: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  housed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  released: 'bg-gray-800 text-gray-400 border-gray-700',
  transferred: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

function formatDuration(ms: number) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hrs = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
}

export default function CountyJailPanel() {
  const { inmates, releaseInmate, selectedCity, player, updatePlayer, updateInmate } = useGameStore();
  const stations = useGameStore((s) => s.stations);
  const [view, setView] = useState<'current' | 'released'>('current');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Inmate | null>(null);

  const handleRelease = (inmate: Inmate) => {
    releaseInmate(inmate.id);
    broadcastRadioMessage({
      from: selectedCity?.name ? `${selectedCity.name} County Jail` : 'County Jail',
      to: 'Dispatch',
      text: `${inmate.firstName} ${inmate.lastName} — booking ${inmate.bookingNumber} — released. Time served: ${formatDuration(Date.now() - (inmate.bookingTime || Date.now()))}.`,
      type: 'dispatch',
      service: 'police',
    });
    setSelected((sel) => (sel?.id === inmate.id ? null : sel));
  };

  // Staged batch: pay bail (player credits) and the minimal court hearing.
  // Hearing outcome is risk-weighted; guilty re-sentences from the game
  // statute table, dismissed releases. No trial sim, no new panel.
  const handlePayBail = (inmate: Inmate) => {
    if (!player || player.credits < inmate.bailAmount) return;
    updatePlayer({ credits: player.credits - inmate.bailAmount });
    releaseInmate(inmate.id);
    broadcastRadioMessage({
      from: selectedCity?.name ? `${selectedCity.name} County Jail` : 'County Jail',
      to: 'Dispatch',
      text: `${inmate.firstName} ${inmate.lastName} — booking ${inmate.bookingNumber} — released on $${inmate.bailAmount.toLocaleString()} bail.`,
      type: 'dispatch',
      service: 'police',
    });
    setSelected(null);
  };

  const handleHearing = (inmate: Inmate) => {
    const guiltyChance = inmate.riskLevel === 'violent' ? 0.95 : inmate.riskLevel === 'high' ? 0.8 : inmate.riskLevel === 'medium' ? 0.5 : 0.3;
    if (Math.random() < guiltyChance) {
      const resentence = sentenceAndBailForCharges(inmate.charges, inmate.riskLevel);
      updateInmate(inmate.id, {
        status: 'held', verdict: 'guilty',
        // New sentence, new count: a hearing held mid-sentence re-sentences
        // and resets days served to 0.
        daysServed: 0,
        ...(resentence ? { sentenceDays: resentence.sentenceDays, bailAmount: resentence.bailAmount } : {}),
      });
      broadcastRadioMessage({
        from: selectedCity?.name ? `${selectedCity.name} County Court` : 'County Court',
        to: 'Dispatch',
        text: `Court verdict: ${inmate.firstName} ${inmate.lastName} — guilty. Sentence per game code ${topStatuteForCharges(inmate.charges)?.code ?? 'DHQ'}.`,
        type: 'dispatch',
        service: 'police',
      });
    } else {
      updateInmate(inmate.id, { verdict: 'dismissed' });
      releaseInmate(inmate.id);
      broadcastRadioMessage({
        from: selectedCity?.name ? `${selectedCity.name} County Court` : 'County Court',
        to: 'Dispatch',
        text: `Court verdict: ${inmate.firstName} ${inmate.lastName} — case dismissed, released.`,
        type: 'dispatch',
        service: 'police',
      });
    }
    setSelected(null);
  };

  const filtered = useMemo(() => {
    const list = inmates.filter((i) => (view === 'current' ? i.status !== 'released' : i.status === 'released'));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => `${i.lastName} ${i.firstName} ${i.bookingNumber} ${i.charges.join(' ')}`.toLowerCase().includes(q));
  }, [inmates, query, view]);

  const counts = useMemo(() => {
    const current = inmates.filter((i) => i.status !== 'released').length;
    const released = inmates.filter((i) => i.status === 'released').length;
    return { current, released };
  }, [inmates]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/5 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Building2 className="w-4 h-4 text-dispatch-red" />
            County Jail Roster
          </div>
          <div className="text-[11px] text-gray-500">{jailOccupancy(inmates)} / {jailCapacity(stations)} housed</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {(() => { const d = decideJailBooking(jailOccupancy(inmates), jailCapacity(stations)); return d.action === 'transfer' ? '⚠️ Jail full — next booking transfers out-of-county (half progression credit).' : `Next booking housed · ${d.cellsFree} cells free`; })()}
          </div>
        </div>
        {/* Staged batch: the jail is operated by the County Sheriff's Office. */}
        <div className="text-[11px] text-gray-500 mt-1">Operated by the County Sheriff&apos;s Office</div>
        <div className="mt-2 flex items-center gap-2">
          {[
            ['current', `Current Inmates (${counts.current})`],
            ['released', `Released (${counts.released})`],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k as 'current' | 'released')}
              className={`text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${
                view === k ? 'bg-dispatch-red text-white border-dispatch-red' : 'bg-gray-900/50 text-gray-400 border-white/10 hover:bg-gray-800'
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
              placeholder="Search inmates..."
              className="w-full bg-gray-950 border border-white/10 rounded-lg pl-8 pr-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/50"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {view === 'current' && counts.current === 0 && (
          <div className="text-center py-10 text-gray-500">
            <DoorOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <div className="text-sm">No inmates currently housed.</div>
            <div className="text-[11px] mt-1">Book subjects from the Criminal Records tab or officer actions.</div>
          </div>
        )}
        {filtered.map((inmate) => (
          <InmateCard
            key={inmate.id}
            inmate={inmate}
            selected={selected?.id === inmate.id}
            onRelease={() => handleRelease(inmate)}
            onSelect={() => setSelected(selected?.id === inmate.id ? null : inmate)}
          />
        ))}
      </div>

      {selected && (
        <div
          className="absolute inset-0 z-[60] bg-gray-950/70 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-white/10 bg-gray-900/95 p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-white">{selected.lastName}, {selected.firstName}</h3>
                <p className="text-[11px] text-gray-500">Booking #{selected.bookingNumber}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="bg-gray-950/60 border border-white/5 rounded-lg p-2"><div className="text-[11px] text-gray-500">DOB</div><div className="text-gray-200">{selected.dateOfBirth}</div></div>
              <div className="bg-gray-950/60 border border-white/5 rounded-lg p-2"><div className="text-[11px] text-gray-500">Bail</div><div className="text-gray-200">${selected.bailAmount.toLocaleString()}</div></div>
              <div className="bg-gray-950/60 border border-white/5 rounded-lg p-2"><div className="text-[11px] text-gray-500">Sentence</div><div className="text-gray-200">{selected.sentenceDays} days</div>
                {selected.status === 'held' && selected.verdict === 'guilty' && (
                  <div className="text-[11px] text-gray-400 mt-0.5">{selected.daysServed ?? 0} / {selected.sentenceDays} days served</div>
                )}
              </div>
              <div className="bg-gray-950/60 border border-white/5 rounded-lg p-2"><div className="text-[11px] text-gray-500">Cell Block</div><div className="text-gray-200">{selected.cellBlock}</div></div>
            </div>
            <div className="text-xs text-gray-500 mb-1">Charges</div>
            <div className="flex flex-wrap gap-1 mb-4">
              {selected.charges.map((c, i) => (
                <span key={i} className="text-[11px] px-2 py-1 rounded bg-gray-950 text-gray-300 border border-white/10">{c}</span>
              ))}
            </div>
            {/* Staged batch: statute + disposition from the game code table. */}
            {(() => { const st = topStatuteForCharges(selected.charges); return st ? (
              <div className="text-[11px] text-gray-400 mb-2">
                Game code {st.code} · {st.class} · statute range {st.sentenceMinDays}–{st.sentenceMaxDays} days, bail ${st.bailMin.toLocaleString()}–${st.bailMax.toLocaleString()}
                {selected.bookedByJurisdiction ? ` · booked by ${selected.bookedByJurisdiction} jurisdiction` : ''}
              </div>
            ) : null; })()}
            <div className="text-[11px] text-gray-400 mb-3">
              Disposition: {selected.status === 'transferred' ? 'Transferred (jail at capacity)' : selected.verdict === 'guilty' ? 'Court: guilty — sentence per game code' : selected.verdict === 'dismissed' ? 'Court: dismissed' : 'Court: hearing pending'}
            </div>
            {selected.status !== 'released' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handlePayBail(selected)}
                  disabled={!player || player.credits < selected.bailAmount}
                  className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium disabled:opacity-40"
                >
                  Pay Bail (${selected.bailAmount.toLocaleString()})
                </button>
                {(!selected.verdict || selected.verdict === 'pending') && selected.status !== 'transferred' && (
                  <button
                    onClick={() => handleHearing(selected)}
                    className="flex-1 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium"
                  >
                    Hold Court Hearing
                  </button>
                )}
              </div>
            )}
            {selected.status !== 'released' && (
              <button
                onClick={() => handleRelease(selected)}
                className="w-full mt-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-white/10 text-xs font-medium"
              >
                Release Inmate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardBadge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {text}
    </span>
  );
}

function InmateCard({
  inmate,
  selected,
  onRelease,
  onSelect,
}: {
  inmate: Inmate;
  selected: boolean;
  onRelease: () => void;
  onSelect: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gray-900/50 border rounded-xl p-2.5 hover:border-white/10 transition-colors cursor-pointer ${selected ? 'border-dispatch-red/60 bg-dispatch-red/5' : 'border-white/5'}`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white truncate">{inmate.lastName}, {inmate.firstName}</span>
            <span className="text-[11px] text-gray-500">Booking #{inmate.bookingNumber}</span>
          </div>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[11px] text-gray-500 mb-0.5 flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> DOB</div>
              <div className="text-gray-200">{inmate.dateOfBirth}</div>
            </div>
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[11px] text-gray-500 mb-0.5 flex items-center gap-1"><Scale className="w-2.5 h-2.5" /> Bail</div>
              <div className="text-gray-200">${inmate.bailAmount.toLocaleString()}</div>
            </div>
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[11px] text-gray-500 mb-0.5 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Served</div>
              <div className="text-gray-200">{formatDuration(Date.now() - inmate.bookingTime)}</div>
            </div>
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[11px] text-gray-500 mb-0.5 flex items-center gap-1"><UserX className="w-2.5 h-2.5" /> Sentence</div>
              <div className="text-gray-200">{inmate.sentenceDays} days</div>
              {inmate.status === 'held' && inmate.verdict === 'guilty' && (
                <div className="text-[11px] text-gray-400 mt-0.5">{inmate.daysServed ?? 0} / {inmate.sentenceDays} days served</div>
              )}
            </div>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Charges</div>
            <div className="flex flex-wrap gap-1">
              {inmate.charges.map((c, i) => (
                <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-white/10">{c}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
          <CardBadge text={inmate.status} cls={statusBadge[inmate.status]} />
          {inmate.status === 'released' && (
            <span className="text-[11px] text-gray-500">{formatDuration(Date.now() - (inmate.bookingTime || Date.now()))} ago</span>
          )}
          {inmate.status !== 'released' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRelease(); }}
              className="text-[11px] mt-0.5 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-white/10 transition-colors"
            >
              Release
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
