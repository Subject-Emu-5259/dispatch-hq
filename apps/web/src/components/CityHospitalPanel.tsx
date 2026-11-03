// ============================================
// Dispatch HQ — City Hospital Panel
// ============================================
// EMS counterpart to the County Jail: victims of EMS calls are admitted
// after transport, progress through treatment, and are discharged when
// ready. Lives in the Unified Dispatch Center (Hospital tab).

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HeartPulse, BedDouble, Search, Stethoscope, DoorOpen, AlertTriangle, Clock, MapPin, Building2, RefreshCw } from 'lucide-react';
import { broadcastRadioMessage } from '@/utils/radioEvents';
import { useGameStore } from '@/stores/gameStore';
import { useNotifications } from '@/components/NotificationCenter';
import {
  hospitalOccupancy, effectiveBeds, hospitalBedBonus, erStaffing, erStaffFatigue, patientOutcomesForShift,
  HOSPITAL_BUILD_COST, HOSPITAL_BEDS, wardLevel, wardUpgradeCost, applyWardUpgrade,
  WARD_BEDS_PER_LEVEL, HOSPITAL_WARD_MAX_LEVEL, STAFF_OVERWORK_THRESHOLD,
  NURSE_ROTATION_COST, applyNurseRotation,
} from '@/lib/hospital';
import type { Patient } from '@dispatch-hq/shared';
import { decideHospitalAdmission } from '@/lib/capacityDecisions';

const severityBadge: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  moderate: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  stable: 'bg-green-500/15 text-green-400 border-green-500/30',
};

const statusBadge: Record<string, string> = {
  admitted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  treated: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  discharged: 'bg-gray-800 text-gray-400 border-gray-700',
};

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function CityHospitalPanel() {
  const { patients, updatePatient, dischargePatient, selectedCity } = useGameStore();
  const [view, setView] = useState<'current' | 'discharged'>('current');
  const [query, setQuery] = useState('');

  // The ER only exists where the commander built it (v0.22.12). Before that,
  // EMS calls complete at the scene and this panel prompts the build.
  const hospital = useGameStore((s) => s.hospital);
  const setBuildPoiModalOpen = useGameStore((s) => s.setBuildPoiModalOpen);
  const stations = useGameStore((s) => s.stations);
  const shift = useGameStore((s) => s.shift);
  const player = useGameStore((s) => s.player);
  const updatePlayer = useGameStore((s) => s.updatePlayer);
  const setHospital = useGameStore((s) => s.setHospital);
  const recordShiftStats = useGameStore((s) => s.recordShiftStats);
  const { addNotification } = useNotifications();
  const occupied = hospitalOccupancy(patients);
  // ER depth (v0.22.12): beds grow with shift staffing (EMS calls cleared),
  // and staffing decays on long shifts as tired nurses rotate off (v0.22.16).
  // The EMS "Hospital Ward" perk (v0.24.0) adds its own beds on top.
  const perkBeds = hospitalBedBonus(stations);
  const beds = effectiveBeds(hospital, shift, Date.now(), stations);
  const staffing = erStaffing(shift, Date.now(), hospital);
  const staffFatigue = erStaffFatigue(shift, Date.now(), hospital);
  const nursesRotatingOff = staffFatigue >= STAFF_OVERWORK_THRESHOLD;
  // Nurse rotation (v0.22.17): the active counter to a marathon shift — pay
  // for a fresh nursing shift and the fatigue clock resets, bringing every
  // earned nurse (and the beds they keep open) straight back to the floor.
  const rotationCanAfford = (player?.credits ?? 0) >= NURSE_ROTATION_COST;

  const handleNurseRotation = () => {
    if (!hospital) return;
    const credits = player?.credits ?? 0;
    if (credits < NURSE_ROTATION_COST) return;
    updatePlayer({ credits: credits - NURSE_ROTATION_COST });
    const rotated = applyNurseRotation(hospital);
    if (rotated) {
      setHospital(rotated);
      addNotification({
        type: 'success',
        title: 'Nurse Rotation Complete',
        message: `A fresh shift just clocked in at ${rotated.name} — ER fatigue reset, all ${erStaffing(shift, Date.now(), rotated)} nurses back on the floor.`,
        icon: '🔄',
        duration: 4000,
      });
      broadcastRadioMessage({
        from: rotated.name,
        to: 'Dispatch',
        text: 'Nurse rotation complete — fresh shift on the ER floor. Capacity restored.',
        type: 'dispatch',
        service: 'ems',
      });
    }
  };
  // Ward expansion (v0.22.16): credits-bought base beds on top of the 40-bed
  // ward — overflow becomes a choice instead of only an EMS-clears grind.
  const ward = wardLevel(hospital);
  const nextWardCost = wardUpgradeCost(hospital);
  const wardCanAfford = nextWardCost !== null && (player?.credits ?? 0) >= nextWardCost;

  const handleWardUpgrade = () => {
    if (!hospital) return;
    const cost = wardUpgradeCost(hospital);
    const credits = player?.credits ?? 0;
    if (cost === null || credits < cost) return;
    updatePlayer({ credits: credits - cost });
    const upgraded = applyWardUpgrade(hospital);
    if (upgraded) {
      setHospital(upgraded);
      // Shift Report tally (v0.22.17): ward expansions bought this shift —
      // count, beds added, and credits spent — for the debrief story.
      recordShiftStats({
        wardExpansions: (shift.wardExpansions ?? 0) + 1,
        wardBedsAdded: (shift.wardBedsAdded ?? 0) + WARD_BEDS_PER_LEVEL,
        wardCreditsSpent: (shift.wardCreditsSpent ?? 0) + cost,
      });
      addNotification({
        type: 'success',
        title: 'Ward Expanded',
        message: `${upgraded.name} now holds ${upgraded.beds} base beds (+${WARD_BEDS_PER_LEVEL}). ${upgraded.beds + erStaffing(shift, Date.now(), upgraded)} with today's nursing staff.`,
        icon: '🏥',
        duration: 4000,
      });
      broadcastRadioMessage({
        from: upgraded.name,
        to: 'Dispatch',
        text: `Ward expansion complete — ${upgraded.beds} base beds now available. New admissions accepted.`,
        type: 'dispatch',
        service: 'ems',
      });
    }
  };
  // Per-shift recovery tally (v0.22.12): same shift-scoped milestone fold the
  // Shift Report debrief uses, so the Hospital tab header tells the recovery
  // story without opening the report — how many discharged after treatment
  // since the shift started, and how many are still in care right now.
  const shiftOutcomes = patientOutcomesForShift(patients, shift.startedAt ?? 0);

  const handleDischarge = (patient: Patient) => {
    dischargePatient(patient.id);
    broadcastRadioMessage({
      from: hospital?.name ?? (selectedCity?.name ? `${selectedCity.name} General Hospital` : 'City Hospital'),
      to: 'Dispatch',
      text: `${patient.firstName} ${patient.lastName} (${patient.roomNumber}) discharged — ${patient.condition}, ${patient.status === 'treated' ? 'treatment complete' : 'released against advice'}. Bed cleared.`,
      type: 'dispatch',
      service: 'ems',
    });
  };

  const filtered = useMemo(() => {
    const list = patients.filter((p) => (view === 'current' ? p.status !== 'discharged' : p.status === 'discharged'));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => `${p.lastName} ${p.firstName} ${p.condition} ${p.roomNumber}`.toLowerCase().includes(q));
  }, [patients, query, view]);

  const counts = useMemo(() => ({
    current: patients.filter((p) => p.status !== 'discharged').length,
    discharged: patients.filter((p) => p.status === 'discharged').length,
  }), [patients]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/5 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <HeartPulse className="w-4 h-4 text-dispatch-green" />
            {hospital?.name ?? 'City Hospital'}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <BedDouble className="w-3 h-3" /> {occupied}/{beds} beds
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-gray-900/60 text-gray-300"
              title={decideHospitalAdmission(occupied, beds).action === 'divert'
                ? 'ER full — the next patient diverts to the regional trauma center (−3 district trust).'
                : 'Beds open — the next patient is admitted here.'}
            >
              {(() => { const d = decideHospitalAdmission(occupied, beds); return d.action === 'divert' ? '⚠️ Next patient diverts (−3 trust)' : `Next patient admitted · ${d.bedsFree} free`; })()}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${nursesRotatingOff ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300'}`}
              title={nursesRotatingOff ? `ER shift fatigue ${staffFatigue}/100 — overworked nurses are rotating off the floor. Fewer beds are open.` : 'One nurse per EMS call cleared this shift. Nurses rotate off on long shifts.'}
            >
              <Stethoscope className="w-3 h-3" /> {staffing} nurses
            </span>
            {/* Nurse rotation — the active counter to marathon shifts (v0.22.17).
                Shows while fatigue has ANY buildup; the fatigue clock resets and
                every earned nurse comes back. Hidden on a fresh shift. */}
            {staffFatigue > 0 && hospital && (
              <button
                onClick={handleNurseRotation}
                disabled={!rotationCanAfford}
                title={`Pay ${NURSE_ROTATION_COST.toLocaleString()} credits for a fresh nursing shift — resets ER fatigue (${staffFatigue}/100) and brings every earned nurse back to the floor.`}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                  rotationCanAfford
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                    : 'border-white/10 bg-gray-900/50 text-gray-500 cursor-not-allowed'
                }`}
              >
                <RefreshCw className="w-3 h-3" /> Nurse Rotation — ${NURSE_ROTATION_COST.toLocaleString()} 💰
              </button>
            )}
            {nursesRotatingOff && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 animate-pulse"
                title="Same overwork rule as your crews — a marathon shift sends nurses home."
              >
                <AlertTriangle className="w-3 h-3" /> ER fatigued · nurses rotating off
              </span>
            )}
            {/* Per-shift recovery — recovered since the shift started, and in care now. */}
            {shiftOutcomes.recovered > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-500/25 bg-green-500/10 text-green-300" title="Patients discharged after treatment since this shift started">
                <DoorOpen className="w-3 h-3" /> {shiftOutcomes.recovered} recovered this shift
              </span>
            )}
            <span title="Patients currently admitted and being treated">{counts.current} in care now</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {[
            ['current', `Admitted (${counts.current})`],
            ['discharged', `Discharged (${counts.discharged})`],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k as 'current' | 'discharged')}
              className={`text-[10px] px-2 py-1.5 rounded-lg border transition-colors ${
                view === k ? 'bg-dispatch-green text-white border-dispatch-green' : 'bg-gray-900/50 text-gray-400 border-white/10 hover:bg-gray-800'
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
              placeholder="Search patients..."
              className="w-full bg-gray-950 border border-white/10 rounded-lg pl-8 pr-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-green/50"
            />
          </div>
        </div>
        {/* Ward expansion (v0.22.16): spend credits to raise the base ward so
            overflow is a choice, not only a grind of EMS clears. Effective
            beds = base ward + expansions + today's nursing staff. */}
        {hospital && (
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-violet-500/20 bg-violet-500/10 text-violet-300 text-[10px]"
              title={`Base ward: ${HOSPITAL_BEDS} beds + ${WARD_BEDS_PER_LEVEL} per upgrade. ${erStaffing(shift, Date.now(), hospital)} nurses from today's EMS clears add ${erStaffing(shift, Date.now(), hospital)} more.`}
            >
              <Building2 className="w-3 h-3" /> Ward Lv {ward}/{HOSPITAL_WARD_MAX_LEVEL} · {hospital.beds} base beds
            </span>
            {nextWardCost !== null ? (
              <button
                onClick={handleWardUpgrade}
                disabled={!wardCanAfford}
                title={`Add ${WARD_BEDS_PER_LEVEL} beds to the base ward. Effective capacity: ${hospital.beds + WARD_BEDS_PER_LEVEL + erStaffing(shift, Date.now(), hospital)} beds.`}
                className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                  wardCanAfford
                    ? 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border-violet-500/30'
                    : 'bg-gray-900/50 text-gray-500 border-white/10 cursor-not-allowed'
                }`}
              >
                <Building2 className="w-3 h-3" /> Upgrade Ward — {nextWardCost.toLocaleString()} 💰
              </button>
            ) : (
              <span className="text-[10px] text-emerald-300/90">Ward fully expanded (+{HOSPITAL_WARD_MAX_LEVEL * WARD_BEDS_PER_LEVEL} beds)</span>
            )}
            <span className="text-[9px] text-gray-500 ml-auto">+{WARD_BEDS_PER_LEVEL} beds per level</span>
          </div>
        )}
        {/* Hospital Ward perk (v0.24.0): EMS stations with the specialization
            raise effective beds — legible as its own chip so the bonus is not
            silently folded into the base ward. */}
        {hospital && perkBeds > 0 && (
          <div className="mt-2">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300 text-[10px]"
              title="From EMS stations that picked the Hospital Ward specialization."
            >
              <Building2 className="w-3 h-3" /> Hospital Ward perk (+{perkBeds} beds)
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* No ER built yet (v0.22.12): the hospital is player-placed. */}
        {!hospital && (
          <div className="text-center py-8 px-4">
            <HeartPulse className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <div className="text-sm text-white font-semibold">No hospital built yet</div>
            <div className="text-[10px] mt-1 text-gray-400 leading-relaxed">
              EMS calls complete at the scene until you place the City General Hospital on the map.
              Critical patients airlift only once you also build the Air Ambulance Helipad.
            </div>
            <button
              onClick={() => setBuildPoiModalOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-dispatch-green hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" /> Build Hospital ({HOSPITAL_BUILD_COST.toLocaleString()} 💰)
            </button>
          </div>
        )}
        {hospital && view === 'current' && counts.current === 0 && (
          <div className="text-center py-10 text-gray-500">
            <BedDouble className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <div className="text-sm">No patients admitted.</div>
            <div className="text-[10px] mt-1">Clear EMS calls to transport victims to the hospital.</div>
          </div>
        )}
        {hospital && filtered.map((patient) => (
          <PatientCard key={patient.id} patient={patient} onDischarge={() => handleDischarge(patient)} />
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

function PatientCard({ patient, onDischarge }: { patient: Patient; onDischarge: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/50 border border-white/5 rounded-xl p-2.5 hover:border-white/10 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white truncate">{patient.lastName}, {patient.firstName}</span>
            <span className="text-[9px] text-gray-500">Age {patient.age} · {patient.roomNumber}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <Stethoscope className="w-3 h-3 text-gray-500" />
            <span className="text-gray-300">{patient.condition}</span>
          </div>
          {patient.transportedBy && !patient.diverted && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-400/80">
              🚑 Delivered by {patient.transportedBy}
            </div>
          )}
          {patient.diverted && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-300/90">
              ↪ Diverted to {patient.divertedTo ?? 'the regional trauma center'} (ER full)
            </div>
          )}
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Admitted</div>
              <div className="text-gray-200">{formatDuration(Date.now() - patient.admitTime)} ago</div>
            </div>
            <div className="bg-gray-950/60 border border-white/5 rounded-lg p-1.5">
              <div className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1">
                {patient.status === 'treated' ? <Stethoscope className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />} Care
              </div>
              <div className="text-gray-200">
                {patient.status === 'treated' ? 'Ready for discharge' : patient.status === 'admitted' ? 'In treatment' : 'Discharged'}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
          <CardBadge text={patient.severity} cls={severityBadge[patient.severity]} />
          <CardBadge text={patient.status} cls={statusBadge[patient.status]} />
          {patient.diverted && (
            <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
              DIVERTED
            </span>
          )}
          {patient.status !== 'discharged' && (
            <button
              onClick={onDischarge}
              disabled={patient.status !== 'treated'}
              className={`text-[10px] mt-0.5 px-2 py-1 rounded border transition-colors ${
                patient.status === 'treated'
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
                  : 'bg-gray-800 text-gray-500 border-white/10 cursor-not-allowed'
              }`}
            >
              Discharge
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
