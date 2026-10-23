// ============================================
// Dispatch HQ — Build POI / Hospital Modal
// ============================================
// The commander hand-places the city's landmarks (v0.22.12): pick a POI type
// (or the City General Hospital / Air Ambulance Helipad), click the map to
// choose the spot, confirm the credit cost, and build. Every POI is a real
// named place that missions can anchor to — placed POIs are persisted in the
// save. The hospital and helipad are one per city: building either again
// moves it to the new spot.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Check, AlertTriangle, Landmark, HeartPulse, Trash2 } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { playStationBuilt } from '@/utils/sound';
import { clampToBoundary, isPointInBoundary } from '@/data/cityBoundaries';
import { POI_TYPE_META, POI_TYPES, POI_BUILD_COST, HOSPITAL_BUILD_COST, makePoi } from '@/lib/pois';
import { makeHospital, makeHelipad, HELIPAD_BUILD_COST } from '@/lib/hospital';
import type { GeoPoint } from '@dispatch-hq/shared';

interface BuildPoiModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingLocation: GeoPoint | null;
}

/** One per city — a build card with its own identity + cost. */
const HOSPITAL_CARD = { id: '__hospital__', label: 'City General Hospital', icon: '🏥', cost: HOSPITAL_BUILD_COST };
const HELIPAD_CARD = { id: '__helipad__', label: 'Air Ambulance Helipad', icon: '🚁', cost: HELIPAD_BUILD_COST };

export function BuildPoiModal({ isOpen, onClose, pendingLocation }: BuildPoiModalProps) {
  const { player, placePoi, setHospital, setHelipad, selectedCity, placedPois } = useGameStore();
  const [step, setStep] = useState<'type' | 'location' | 'confirm'>('type');
  const [selected, setSelected] = useState<string | null>(null);

  const isHospital = selected === HOSPITAL_CARD.id;
  const isHelipad = selected === HELIPAD_CARD.id;
  const cost = isHospital ? HOSPITAL_BUILD_COST : isHelipad ? HELIPAD_BUILD_COST : POI_BUILD_COST;
  const canAfford = (player?.credits || 0) >= cost;
  const meta = isHospital || isHelipad ? null : POI_TYPE_META[selected as keyof typeof POI_TYPE_META];
  // Second school placed → "… High School 2", etc.
  const ordinal = selected && !isHospital && !isHelipad
    ? placedPois.filter((p) => p.type === selected).length
    : 0;

  // When user clicks map, auto-advance to confirm
  useEffect(() => {
    if (pendingLocation && step === 'location') setStep('confirm');
  }, [pendingLocation, step]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) { setStep('type'); setSelected(null); }
  }, [isOpen]);

  const handlePlace = () => {
    if (!pendingLocation || !player || !selected || !canAfford) return;

    // Clamp the chosen spot to the real city limits so landmarks can never
    // land in a neighboring town (the v0.11.x heat-map lesson).
    const city = useGameStore.getState().selectedCity;
    let position = pendingLocation;
    if (city?.boundary && !isPointInBoundary(position, city.boundary)) {
      position = clampToBoundary(position, city.boundary, 60);
    }

    useGameStore.getState().updatePlayer({ credits: player.credits - cost });
    if (isHospital) {
      setHospital(makeHospital(city, position));
    } else if (isHelipad) {
      setHelipad(makeHelipad(city, position));
    } else {
      placePoi(makePoi(selected as Parameters<typeof makePoi>[0], position, city, ordinal));
    }
    playStationBuilt();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ===== LOCATION STEP: floating banner only, NO modal blocking map ===== */}
          {step === 'location' && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)]"
            >
              <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700/50 rounded-2xl shadow-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-dispatch-red/20 rounded-lg flex items-center justify-center">
                      <Landmark className="w-3.5 h-3.5 text-dispatch-red" />
                    </div>
                    <h3 className="font-bold text-sm">Step 2: Place {isHospital ? 'Hospital' : isHelipad ? 'Helipad' : 'Landmark'}</h3>
                  </div>
                  <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-3">
                  {['type', 'location', 'confirm'].map((s, i) => (
                    <div key={s} className="flex items-center gap-1 flex-1">
                      <div className={`h-1 flex-1 rounded-full transition-colors ${
                        ['type', 'location', 'confirm'].indexOf(step) >= i
                          ? 'bg-dispatch-red' : 'bg-gray-700'
                      }`} />
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="p-3 bg-dispatch-red/10 border border-dispatch-red/30 rounded-xl flex items-center gap-3">
                    <div className="w-9 h-9 bg-dispatch-red/20 rounded-full flex items-center justify-center shrink-0 animate-pulse">
                      <MapPin className="w-4 h-4 text-dispatch-red" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Click anywhere on the map below
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {isHospital
                          ? 'EMS units will transport patients here — keep it reachable by road'
                          : isHelipad
                            ? 'Critical patients airlift to this landing zone'
                            : 'Missions of this type will anchor to this landmark'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setStep('type')}
                      className="px-3 py-1.5 bg-gray-800 border border-gray-700 
                                 rounded-lg text-xs text-gray-300 hover:bg-gray-700 transition-colors">
                      ← Back
                    </button>
                    <button onClick={onClose}
                      className="px-3 py-1.5 bg-gray-800 border border-gray-700 
                                 rounded-lg text-xs text-gray-300 hover:bg-gray-700 transition-colors ml-auto">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ===== TYPE & CONFIRM STEPS: full modal ===== */}
          {step !== 'location' && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                onClick={onClose}
              />

              {/* Modal — wrapper centers with flexbox so framer-motion's inline
                  transform can never override a Tailwind translate class. */}
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="pointer-events-auto w-full max-w-[420px] max-h-[85vh]
                             bg-gray-900 border border-gray-700/50 rounded-2xl 
                             shadow-2xl flex flex-col overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-dispatch-red/20 rounded-lg flex items-center justify-center">
                        <Landmark className="w-4 h-4 text-dispatch-red" />
                      </div>
                      <h2 className="font-bold text-lg">Place Landmark</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Step indicator */}
                  <div className="flex items-center gap-2 px-4 pt-3">
                    {['type', 'location', 'confirm'].map((s, i) => (
                      <div key={s} className="flex items-center gap-1 flex-1">
                        <div className={`h-1 flex-1 rounded-full transition-colors ${
                          ['type', 'location', 'confirm'].indexOf(step) >= i
                            ? 'bg-dispatch-red' : 'bg-gray-700'
                        }`} />
                      </div>
                    ))}
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {step === 'type' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                        <p className="text-sm text-gray-400">
                          Choose what to build. Landmarks become real named places that missions anchor to.
                        </p>

                        {/* Hospital — special single-per-city build */}
                        <button
                          onClick={() => { setSelected(HOSPITAL_CARD.id); }}
                          disabled={!((player?.credits || 0) >= HOSPITAL_CARD.cost)}
                          className={`w-full p-4 border rounded-xl transition-all text-left ${
                            selected === HOSPITAL_CARD.id
                              ? 'bg-gray-800/60 border-emerald-500/50 ring-1 ring-emerald-500/30'
                              : 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">🏥</span>
                            <div className="flex-1">
                              <h3 className="font-semibold text-white flex items-center gap-2">
                                City General Hospital
                                <span className="px-1.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[9px] font-bold text-emerald-300">
                                  1 PER CITY
                                </span>
                              </h3>
                              <p className="text-sm text-gray-400">
                                EMS units transport patients to the ER here — critical patients airlift to its helipad.
                              </p>
                              <p className="text-sm text-amber-400 font-mono mt-1">
                                💰 {HOSPITAL_CARD.cost.toLocaleString()} credits
                              </p>
                            </div>
                            {selected === HOSPITAL_CARD.id && <Check className="w-5 h-5 text-dispatch-red shrink-0" />}
                          </div>
                        </button>

                        {/* Air Ambulance Helipad — separate player-placed landing zone (v0.22.12) */}
                        <button
                          onClick={() => { setSelected(HELIPAD_CARD.id); }}
                          disabled={!((player?.credits || 0) >= HELIPAD_CARD.cost)}
                          className={`w-full p-4 border rounded-xl transition-all text-left ${
                            selected === HELIPAD_CARD.id
                              ? 'bg-gray-800/60 border-amber-500/50 ring-1 ring-amber-500/30'
                              : 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">🚁</span>
                            <div className="flex-1">
                              <h3 className="font-semibold text-white flex items-center gap-2">
                                Air Ambulance Helipad
                                <span className="px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-[9px] font-bold text-amber-300">
                                  1 PER CITY
                                </span>
                              </h3>
                              <p className="text-sm text-gray-400">
                                Critical patients are airlifted to this landing zone — build it anywhere in the city.
                              </p>
                              <p className="text-sm text-amber-400 font-mono mt-1">
                                💰 {HELIPAD_CARD.cost.toLocaleString()} credits
                              </p>
                            </div>
                            {selected === HELIPAD_CARD.id && <Check className="w-5 h-5 text-dispatch-red shrink-0" />}
                          </div>
                        </button>

                        {/* POI type grid */}
                        <div className="grid grid-cols-2 gap-2">
                          {POI_TYPES.map((type) => {
                            const m = POI_TYPE_META[type];
                            const isSelected = selected === type;
                            return (
                              <button
                                key={type}
                                onClick={() => { setSelected(type); }}
                                disabled={!((player?.credits || 0) >= POI_BUILD_COST)}
                                className={`p-3 border rounded-xl transition-all text-left ${
                                  isSelected
                                    ? 'bg-gray-800/60 ring-1 ring-dispatch-red/30'
                                    : 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600'
                                }`}
                                style={isSelected ? { borderColor: `${m.color}66` } : undefined}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{m.icon}</span>
                                  <div className="min-w-0">
                                    <h3 className="font-semibold text-white text-xs truncate">{m.label}</h3>
                                    <p className="text-[10px] text-amber-400 font-mono">
                                      💰 {POI_BUILD_COST.toLocaleString()}
                                    </p>
                                  </div>
                                  {isSelected && <Check className="w-4 h-4 text-dispatch-red shrink-0 ml-auto" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Proceed button */}
                        <button
                          onClick={() => setStep('location')}
                          className="w-full py-3 bg-dispatch-red hover:bg-red-600 text-white font-semibold
                                     rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!selected || !canAfford}
                        >
                          Choose Location →
                        </button>
                        {selected && !canAfford && (
                          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <p className="text-xs text-red-400">
                              Not enough credits. You need {cost.toLocaleString()} credits.
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {step === 'confirm' && pendingLocation && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        <div className="p-4 bg-dispatch-red/10 border border-dispatch-red/30 rounded-xl">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-3xl">{isHospital ? '🏥' : isHelipad ? '🚁' : meta?.icon}</span>
                            <div>
                              <h3 className="font-semibold text-white">
                                {isHospital
                                  ? `${selectedCity?.name ?? 'City'} General Hospital`
                                  : isHelipad
                                    ? `${selectedCity?.name ?? 'City'} Air Ambulance Helipad`
                                    : (meta ? `${meta.label} — ${placedPois.filter((p) => p.type === selected).length + 1}` : '')}
                              </h3>
                              <p className="text-sm text-gray-400">
                                {isHospital
                                  ? 'EMS patients are transported to the ER here'
                                  : isHelipad
                                    ? 'Critical patients are airlifted here'
                                    : 'Missions of this type will anchor to this landmark'}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-gray-400">Cost:</div>
                            <div className="text-amber-400 font-mono text-right">{cost.toLocaleString()}</div>
                            <div className="text-gray-400">Your credits:</div>
                            <div className={`font-mono text-right ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                              {(player?.credits || 0).toLocaleString()}
                            </div>
                            <div className="text-gray-400">After build:</div>
                            <div className={`font-mono text-right ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                              {((player?.credits || 0) - cost).toLocaleString()}
                            </div>
                            <div className="text-gray-400">Location:</div>
                            <div className="text-white text-right font-mono text-xs">
                              {pendingLocation.lat.toFixed(4)}, {pendingLocation.lng.toFixed(4)}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => setStep('location')}
                            className="px-4 py-2 bg-gray-800 border border-gray-700 
                                       rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors">
                            ← Change
                          </button>
                          <button onClick={handlePlace} disabled={!canAfford}
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold 
                                        flex items-center justify-center gap-2 transition-colors ${
                              canAfford
                                ? 'bg-dispatch-red text-white hover:bg-red-700'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            }`}>
                            <Check className="w-4 h-4" />
                            Build ({cost.toLocaleString()} 💰)
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

/** Small inline action used by the map POI popover to remove a landmark. */
export function RemovePoiButton({ poiId, onDone }: { poiId: string; onDone?: () => void }) {
  const removePoi = useGameStore((s) => s.removePoi);
  return (
    <button
      onClick={() => { removePoi(poiId); onDone?.(); }}
      className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                 border border-red-500/30 bg-red-500/10 text-[10px] font-semibold text-red-300
                 hover:bg-red-500/20 transition-colors"
      title="Remove this landmark"
    >
      <Trash2 className="w-3 h-3" /> Remove landmark
    </button>
  );
}
