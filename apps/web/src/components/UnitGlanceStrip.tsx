// ============================================
// Dispatch HQ — Unit glance strip (staged batch, Addition 8)
// ============================================
// The at-a-glance row for a unit card: service, station, level, rank,
// readiness, and speed — as wrapping chips. The old card header packed
// the name + three badges on one non-wrapping row, so a long name in the
// narrow sidebar pushed badges off the card; this row wraps (flex-wrap)
// instead of overflowing, and every chip truncates. Pure presentational:
// no store access, so harnesses can render it and assert content + layout.

import { Gauge } from 'lucide-react';

export interface UnitGlanceStripProps {
  service: 'fire' | 'police' | 'ems';
  serviceLabel: string;
  stationName: string;
  level: number;
  rank: string;
  xpToNext: number | null;
  readiness: { label: string; pct: number } | null;
  speedMph: number;
}

const SERVICE_TONE: Record<string, string> = {
  fire: 'bg-red-500/10 text-red-400 border-red-500/25',
  police: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  ems: 'bg-green-500/10 text-green-400 border-green-500/25',
};

export function UnitGlanceStrip({
  service, serviceLabel, stationName, level, rank, xpToNext, readiness, speedMph,
}: UnitGlanceStripProps) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${SERVICE_TONE[service]}`}>
        {serviceLabel}
      </span>
      <span className="text-[11px] text-gray-400 truncate max-w-[110px]" title={stationName}>
        {stationName}
      </span>
      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 shrink-0">
        Lv {level}
      </span>
      <span
        className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/25 shrink-0"
        title={xpToNext != null ? `${xpToNext} XP to next rank` : 'Max rank'}
      >
        {rank.toUpperCase()}
      </span>
      {readiness && (
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shrink-0">
          {readiness.label} · {readiness.pct}%
        </span>
      )}
      <span className="text-[11px] text-gray-500 flex items-center gap-1 shrink-0">
        <Gauge className="w-2.5 h-2.5" /> {speedMph} mph
      </span>
    </div>
  );
}
