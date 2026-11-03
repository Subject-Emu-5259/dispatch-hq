// ============================================
// Dispatch HQ — Districts Panel (Batch 3b)
// ============================================
// City progression + citizen satisfaction + adopted home bases, in the
// Unified Dispatch Center (Districts tab, all services — districts are
// city-level, not department-level). Follows the CityHospitalPanel /
// CountyJailPanel pattern: read the store, render status, no mutations
// from this panel itself (ratings move through play, adoption through
// city search).

import { useGameStore } from '@/stores/gameStore';
import {
  unlockedDistricts, lockedDistricts, satisfactionFor, callVolumeMultiplier, districtRewardMultiplier,
} from '@/lib/cityDistricts';
import { currentWaveStage } from '@/lib/disasterWaves';

export default function DistrictPanel() {
  const selectedCity = useGameStore((s) => s.selectedCity);
  const player = useGameStore((s) => s.player);
  const satisfaction = useGameStore((s) => s.districtSatisfaction);
  const adoptedCities = useGameStore((s) => s.adoptedCities);
  const disasterWave = useGameStore((s) => s.disasterWave);
  const activeDisaster = useGameStore((s) => s.activeDisaster);

  if (!selectedCity) {
    return <p className="text-[11px] text-gray-500 p-4">No city selected.</p>;
  }
  const level = player?.level ?? 1;
  const unlocked = unlockedDistricts(selectedCity.name, level);
  const locked = lockedDistricts(selectedCity.name, level);
  const waveStage = currentWaveStage(disasterWave);

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-[85vh]">
      <div>
        <h3 className="text-[13px] font-bold text-white">{selectedCity.name} — Districts</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">
          New districts open as you rank up. Faster responses raise a district&apos;s rating — happy districts
          call more and pay better; slow or failed responses cost trust.
        </p>
      </div>

      {activeDisaster && waveStage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-[11px] font-bold text-red-300">
            {activeDisaster.icon} {activeDisaster.name} — Stage {waveStage.stage} of {disasterWave!.stages.length}: {waveStage.district}
          </p>
          <p className="text-[11px] text-gray-300 mt-0.5">
            {waveStage.completed}/{waveStage.spawned} cleared · rewards ×{waveStage.rewardMult}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {unlocked.map((d) => {
          const rating = satisfactionFor(satisfaction, selectedCity.name, d);
          return (
            <div key={d} className="rounded-xl border border-white/5 bg-gray-900/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-white">{d}</span>
                <span className="text-[11px] text-gray-400">
                  Trust {rating} · calls ×{callVolumeMultiplier(rating)} · rewards ×{districtRewardMultiplier(rating).toFixed(2)}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full ${rating >= 60 ? 'bg-emerald-500' : rating >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${rating}%` }}
                />
              </div>
            </div>
          );
        })}
        {locked.map((d) => (
          <div key={d.name} className="rounded-xl border border-white/5 bg-gray-900/20 p-3 opacity-60">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-gray-300">{d.name}</span>
              <span className="text-[11px] text-gray-500">Unlocks at Level {d.unlockLevel}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-[12px] font-bold text-white mb-2">Adopted home bases</h4>
        {adoptedCities.length === 0 ? (
          <p className="text-[11px] text-gray-500">
            Search for any city on the city-select screen and it joins this list as a persistent home base
            with its own local level.
          </p>
        ) : (
          <div className="space-y-1.5">
            {adoptedCities.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-lg border border-white/5 bg-gray-900/40 px-3 py-2">
                <span className="text-[11px] text-white">{c.name}</span>
                <span className="text-[11px] text-gray-400">Local Lv {c.localLevel} · {c.missionsCompleted} clears</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
