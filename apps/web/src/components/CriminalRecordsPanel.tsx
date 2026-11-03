import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, FileSearch, Calendar, Ruler, Weight, Globe, MapPin,
  AlertTriangle, UserRound, Gavel, ShieldCheck, X, Building2,
} from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { bookInmate } from '@/lib/jailCapacity';
import { broadcastRadioMessage } from '@/utils/radioEvents';
import type { CriminalRecord } from '@dispatch-hq/shared';

const riskStyles: Record<string, string> = {
  low: 'bg-green-500/10 text-green-400 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  violent: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const riskLabels: Record<string, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  violent: 'Violent Offender',
};

type FilterMode = 'all' | 'warrant' | 'violent' | 'high';

export default function CriminalRecordsPanel() {
  const records = useGameStore((s) => s.criminalRecords);
  const selectedCity = useGameStore((s) => s.selectedCity);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CriminalRecord | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const addInmate = useGameStore((s) => s.addInmate);
  const stations = useGameStore((s) => s.stations);
  const inmates = useGameStore((s) => s.inmates);

  const selectedCityName = useGameStore((s) => s.selectedCity?.name);
  const cityRecords = useMemo(() => {
    if (!selectedCityName) return records;
    return records.filter((r) => r.city === selectedCityName);
  }, [records, selectedCityName]);

  const filtered = useMemo(() => {
    let list = cityRecords;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = `${r.firstName} ${r.lastName} ${r.knownAliases.join(' ')} ${r.address} ${r.charges.join(' ')} ${r.warrantStatus}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if (filter === 'warrant') list = list.filter((r) => r.warrantStatus === 'active');
    if (filter === 'violent') list = list.filter((r) => r.riskLevel === 'violent');
    if (filter === 'high') list = list.filter((r) => r.riskLevel === 'high' || r.riskLevel === 'violent');
    return list.slice(0, 120);
  }, [cityRecords, query, filter]);

  const bookRecord = (record: CriminalRecord) => {
    if (!selectedCity) return;
    setSelected(null);
    const { inmate, transferred } = bookInmate(record, selectedCity.name, stations, inmates);
    addInmate(inmate);
    broadcastRadioMessage({
      from: selectedCity?.name ? `${selectedCity.name} PD` : 'Dispatch',
      to: 'All Units',
      text: transferred
        ? `County jail is at capacity — ${record.firstName} ${record.lastName} transferred to the regional detention center.`
        : `Booking completed for ${record.firstName} ${record.lastName} — ${record.charges.slice(0, 2).join(', ')}${record.charges.length > 2 ? '...' : ''}. Transport to county jail.`,
      type: 'broadcast',
      service: 'police',
    });
  };

  const flagRecord = (record: CriminalRecord) => {
    const charges = record.charges.slice(0, 2).join(', ') + (record.charges.length > 2 ? '...' : '');
    broadcastRadioMessage({
      from: 'Dispatch',
      to: 'All Units',
      text: `Be on the lookout: ${record.firstName} ${record.lastName}, DOB ${record.dateOfBirth}, ${record.address}. Warrant: ${record.warrantStatus}. Charges: ${charges}.`,
      type: 'broadcast',
      service: 'police',
    });
  };

  const onSelectRecord = (record: CriminalRecord) => {
    setSelected(record);
    if (record.warrantStatus === 'active') {
      broadcastRadioMessage({
        from: 'Dispatch',
        to: 'All Units',
        text: `Record check: ${record.firstName} ${record.lastName} has an active warrant for ${record.charges.slice(0, 2).join(', ')}${record.charges.length > 2 ? '...' : ''}. Use caution.`,
        type: 'broadcast',
        service: 'police',
      });
    } else if (record.riskLevel === 'violent' || record.riskLevel === 'high') {
      broadcastRadioMessage({
        from: 'Dispatch',
        to: 'All Units',
        text: `Record check: ${record.firstName} ${record.lastName} flagged as ${record.riskLevel} risk — prior arrests on file.`,
        type: 'broadcast',
        service: 'police',
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/5 bg-gray-900/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileSearch className="w-4 h-4 text-dispatch-red" />
            Criminal Records
          </div>
          <div className="text-[11px] text-gray-500">{filtered.length} shown</div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, alias, address, or charge..."
              className="w-full bg-gray-950 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/50"
            />
          </div>
          {(['all', 'warrant', 'violent', 'high'] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] px-2 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                filter === f ? 'bg-dispatch-red text-white border-dispatch-red' : 'bg-gray-900/50 text-gray-400 border-white/10 hover:bg-gray-800'
              }`}
            >
              {f === 'all' ? 'All' : f === 'warrant' ? 'Warrants' : f === 'violent' ? 'Violent' : 'High Risk'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-600">
            <FileSearch className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">No records match.</p>
          </div>
        )}
        {filtered.map((record) => (
          <RecordRow
            key={record.id}
            record={record}
            selected={selected?.id === record.id}
            onSelect={() => onSelectRecord(record)}
            onBook={() => bookRecord(record)}
            onFlag={() => flagRecord(record)}
          />
        ))}
      </div>

      <AnimatePresence>
        {selected && (
          <RecordDetailModal
            record={selected}
            onClose={() => setSelected(null)}
            onBook={() => bookRecord(selected)}
            onFlag={() => flagRecord(selected)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RecordRow({
  record,
  selected,
  onSelect,
  onBook,
  onFlag,
}: {
  record: CriminalRecord;
  selected: boolean;
  onSelect: () => void;
  onBook: () => void;
  onFlag: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full text-left bg-gray-900/40 border rounded-lg p-2.5 transition-colors ${
        selected ? 'border-dispatch-red/60 bg-dispatch-red/5' : 'border-white/5 hover:bg-gray-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button onClick={onSelect} className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center text-sm font-semibold text-gray-300 shrink-0">
            {record.firstName[0]}{record.lastName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-white truncate">{record.lastName}, {record.firstName}</span>
              <span className="text-[11px] text-gray-500">{record.dateOfBirth} • {record.citizenship}</span>
            </div>
            <div className="text-[11px] text-gray-400 truncate flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5 shrink-0" /> {record.address}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {record.charges.slice(0, 3).map((c, i) => (
                <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-white/5">{c}</span>
              ))}
              {record.charges.length > 3 && (
                <span className="text-[11px] text-gray-500">+{record.charges.length - 3}</span>
              )}
            </div>
          </div>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[11px] px-1.5 py-0.5 rounded border ${riskStyles[record.riskLevel]}`}>
            {riskLabels[record.riskLevel]}
          </span>
          {record.warrantStatus === 'active' && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> Warrant
            </span>
          )}
          <div className="flex items-center gap-1 mt-1">
            <button
              onClick={onFlag}
              className="text-[11px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
            >
              FLAG
            </button>
            <button
              onClick={onBook}
              className="text-[11px] px-2 py-1 rounded bg-dispatch-red/20 text-dispatch-red border border-dispatch-red/30 hover:bg-dispatch-red/30"
            >
              BOOK
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RecordDetailModal({
  record,
  onClose,
  onBook,
  onFlag,
}: {
  record: CriminalRecord;
  onClose: () => void;
  onBook: () => void;
  onFlag: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[60] bg-gray-950/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-gray-900/95 p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-white/10 flex items-center justify-center text-2xl font-bold text-white">
              {record.firstName[0]}{record.lastName[0]}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{record.lastName}, {record.firstName}</h3>
              <div className="text-[11px] text-gray-400">Record {record.id.split('_')[1]?.toUpperCase()} • {record.city}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] px-2 py-1 rounded border ${riskStyles[record.riskLevel]}`}>
              {riskLabels[record.riskLevel]}
            </span>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <InfoBox icon={<Calendar className="w-3 h-3" />} label="DOB" value={record.dateOfBirth} />
          <InfoBox icon={<Ruler className="w-3 h-3" />} label="Height" value={`${Math.floor(record.heightIn / 12)}' ${record.heightIn % 12}"`} />
          <InfoBox icon={<Weight className="w-3 h-3" />} label="Weight" value={`${record.weightLb} lb`} />
          <InfoBox icon={<Globe className="w-3 h-3" />} label="Citizenship" value={record.citizenship} />
          <div className="col-span-2 sm:col-span-3"><InfoBox icon={<MapPin className="w-3 h-3" />} label="Address" value={record.address} /></div>
          {record.knownAliases.length > 0 && (
            <div className="col-span-2 sm:col-span-3"><InfoBox icon={<UserRound className="w-3 h-3" />} label="Aliases" value={record.knownAliases.join(', ')} /></div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-1"><Gavel className="w-3 h-3" /> Charges</div>
          <div className="flex flex-wrap gap-1.5">
            {record.charges.map((c, i) => (
              <span key={i} className="text-[11px] px-2 py-1 rounded bg-gray-950 text-gray-300 border border-white/10">{c}</span>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="bg-gray-950 border border-white/5 rounded-lg p-2">
            <div className="text-[11px] text-gray-500 mb-0.5">Prior Arrests</div>
            <div className="text-base font-semibold text-white">{record.arrestCount}</div>
          </div>
          <div className="bg-gray-950 border border-white/5 rounded-lg p-2">
            <div className="text-[11px] text-gray-500 mb-0.5">Warrant Status</div>
            <div className={`text-sm font-semibold flex items-center gap-1 ${record.warrantStatus === 'active' ? 'text-red-400' : 'text-green-400'}`}>
              {record.warrantStatus === 'active' ? <AlertTriangle className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              {record.warrantStatus === 'active' ? 'Active Warrant' : 'No Active Warrant'}
            </div>
          </div>
        </div>

        {record.notes && (
          <div className="mt-3 bg-dispatch-red/5 border border-dispatch-red/20 rounded-lg p-2 text-xs text-gray-300">
            <div className="text-[11px] text-dispatch-red mb-0.5">Officer Notes</div>
            {record.notes}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onFlag} className="flex-1 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/30">
            Flag to All Units
          </button>
          <button onClick={onBook} className="flex-1 px-3 py-2 rounded-lg bg-dispatch-red text-white text-xs font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Book Into County Jail
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function InfoBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-950/60 border border-white/5 rounded-lg p-2 min-w-0">
      <div className="text-[11px] text-gray-500 mb-0.5 flex items-center gap-1 truncate">{icon}{label}</div>
      <div className="text-[11px] text-gray-200 truncate">{value}</div>
    </div>
  );
}
