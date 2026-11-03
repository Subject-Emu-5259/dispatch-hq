// ============================================
// Dispatch HQ — Build Station Modal
// ============================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Check, AlertTriangle, Handshake } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { playStationBuilt } from '@/utils/sound';
import { STATION_CONFIGS, stationServiceFor, partnerStationDiscountForLevel } from '@dispatch-hq/shared';
import { getStationBuildCost } from '@/lib/techTree';
import { generateInitialRoster } from '@/lib/employees';
import type { Station, GeoPoint } from '@dispatch-hq/shared';

interface BuildStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingLocation: GeoPoint | null;
}

const SERVICE_TYPES: Record<string, string[]> = {
  fire: ['fire_station'],
  police: ['police_station'],
  ems: ['ems_station'],
};

const DEPARTMENT_LABEL: Record<'fire' | 'police' | 'ems', string> = {
  fire: 'Fire Dept',
  police: 'Police Dept',
  ems: 'EMS',
};

export function BuildStationModal({ isOpen, onClose, pendingLocation }: BuildStationModalProps) {
  const { addStation, player, selectedService } = useGameStore();
  const [step, setStep] = useState<'type' | 'location' | 'confirm'>('type');
  const [selectedType, setSelectedType] = useState<string>(() => {
    const defaults = SERVICE_TYPES[selectedService || 'fire'];
    return defaults ? defaults[0] : 'fire_station';
  });
  const [stationName, setStationName] = useState('');

  const config = STATION_CONFIGS[selectedType] || STATION_CONFIGS.fire_station;
  const isPartner = !!selectedService && stationServiceFor(selectedType) !== selectedService;
  // Effective build cost: e2 tech discount applies to all builds; partner
  // stations stack the level-gated Mutual Aid discount (see techTree).
  const buildCost = getStationBuildCost(selectedType, selectedService, player?.level ?? 1);
  const partnerDiscount = isPartner ? partnerStationDiscountForLevel(player?.level ?? 1) : 0;

  // Update default type when service changes
  useEffect(() => {
    if (step === 'type' && selectedService) {
      const defaults = SERVICE_TYPES[selectedService];
      if (defaults) setSelectedType(defaults[0]);
    }
  }, [selectedService, step]);

  // When user clicks map, auto-advance to confirm
  useEffect(() => {
    if (pendingLocation && step === 'location') setStep('confirm');
  }, [pendingLocation, step]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) { setStep('type'); setStationName(''); }
  }, [isOpen]);

  const canAfford = (player?.credits || 0) >= buildCost;

  const handleBuild = () => {
    if (!pendingLocation || !player || !canAfford) return;

    const employeeCapacity = (config.baseCapacity || 4) + 4;
    const newStation: Station = {
      id: `station_${Date.now()}`,
      ownerId: player.id,
      type: selectedType as Station['type'],
      level: 1,
      name: stationName || `${config.name} ${Math.floor(Math.random() * 999)}`,
      position: pendingLocation,
      capacity: config.baseCapacity,
      unitCount: 0,
      coverageRadius: 1000,
      createdAt: new Date().toISOString(),
    };

    useGameStore.getState().updatePlayer({ credits: player.credits - buildCost });
    addStation(newStation);
    useGameStore.getState().updateStation(newStation.id, {
      employees: generateInitialRoster(newStation),
      employeeCapacity,
    });
    playStationBuilt();
    onClose();
  };

  // Every department's station is buildable in any city. The player's own
  // department is the default; the other two are labeled PARTNER stations so
  // a single-service city can raise fire/EMS stations (and vice versa) and
  // actually answer Mutual Aid requests instead of letting them expire.
  const availableTypes = Object.keys(STATION_CONFIGS);

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
                      <MapPin className="w-3.5 h-3.5 text-dispatch-red" />
                    </div>
                    <h3 className="font-bold text-sm">Step 2: Place Station</h3>
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
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Station Name</label>
                    <input
                      type="text"
                      value={stationName}
                      onChange={(e) => setStationName(e.target.value)}
                      placeholder={config.name}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 
                                 rounded-lg text-sm text-white placeholder-gray-500
                                 focus:outline-none focus:border-dispatch-red"
                    />
                  </div>

                  <div className="p-3 bg-dispatch-red/10 border border-dispatch-red/30 rounded-xl flex items-center gap-3">
                    <div className="w-9 h-9 bg-dispatch-red/20 rounded-full flex items-center justify-center shrink-0 animate-pulse">
                      <MapPin className="w-4 h-4 text-dispatch-red" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Click anywhere on the map below
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Choose a location near missions for fastest response
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
                  transform (y/scale entrance) can never override a Tailwind
                  translate class and push the panel off-center. */}
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
                      <MapPin className="w-4 h-4 text-dispatch-red" />
                    </div>
                    <h2 className="font-bold text-lg">Build Station</h2>
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
                      <p className="text-sm text-gray-400">Select station type:</p>
                      <p className="text-[11px] text-blue-300/80 flex items-center gap-1.5">
                        <Handshake className="w-3 h-3 shrink-0" />
                        Partner stations (blue) house other departments' units so you can answer their Mutual Aid calls.
                      </p>
                      
                      {availableTypes.map((typeKey) => {
                        const cfg = STATION_CONFIGS[typeKey];
                        if (!cfg) return null;
                        const isSelected = selectedType === typeKey;
                        const typeIsPartner = !!selectedService && stationServiceFor(typeKey) !== selectedService;
                        const typeCost = getStationBuildCost(typeKey, selectedService, player?.level ?? 1);
                        const typeDiscount = typeIsPartner ? partnerStationDiscountForLevel(player?.level ?? 1) : 0;
                        const affordable = (player?.credits || 0) >= typeCost;
                        return (
                          <button
                            key={typeKey}
                            onClick={() => { setSelectedType(typeKey); }}
                            disabled={!affordable}
                            className={`w-full p-4 border rounded-xl transition-all text-left ${
                              isSelected
                                ? 'bg-gray-800/60 border-dispatch-red/50 ring-1 ring-dispatch-red/30'
                                : affordable
                                  ? 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600'
                                  : 'bg-gray-800/20 border-gray-700/30 opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-3xl">{cfg.icon}</span>
                              <div className="flex-1">
                                <h3 className="font-semibold text-white">{cfg.name}</h3>
                                <p className="text-sm text-gray-400">{cfg.description}</p>
                                {typeIsPartner && (
                                  <p className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-[11px] font-bold text-blue-300">
                                    🤝 PARTNER · {DEPARTMENT_LABEL[stationServiceFor(typeKey)]}
                                    {typeDiscount > 0 ? ` · −${Math.round(typeDiscount * 100)}% Mutual Aid discount (Lv ${player?.level ?? 1}+)` : ' · answers Mutual Aid calls (+25%)'}
                                  </p>
                                )}
                                <p className="text-sm text-amber-400 font-mono mt-1">
                                  {typeDiscount > 0 && (
                                    <span className="line-through text-gray-600 mr-1.5">{cfg.baseCost.toLocaleString()}</span>
                                  )}
                                  💰 {typeCost.toLocaleString()} credits
                                </p>
                              </div>
                              {isSelected && <Check className="w-5 h-5 text-dispatch-red shrink-0" />}
                            </div>
                          </button>
                        );
                      })}

                      {/* Proceed button */}
                      <button
                        onClick={() => setStep('location')}
                        className="w-full py-3 bg-dispatch-red hover:bg-red-600 text-white font-semibold
                                   rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!canAfford}
                      >
                        Choose Location →
                      </button>                          {!canAfford && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          <p className="text-xs text-red-400">
                            Not enough credits. You need {buildCost.toLocaleString()} credits.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {step === 'confirm' && pendingLocation && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="p-4 bg-dispatch-red/10 border border-dispatch-red/30 rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl">{config.icon}</span>
                      <div>
                        <h3 className="font-semibold text-white">{stationName || config.name}</h3>
                        <p className="text-sm text-gray-400">{config.name}</p>
                        {isPartner && (
                          <p className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-[11px] font-bold text-blue-300">
                            🤝 Partner station — unlocks answering {DEPARTMENT_LABEL[stationServiceFor(selectedType)]} Mutual Aid calls
                            {partnerDiscount > 0 && ` · −${Math.round(partnerDiscount * 100)}% level discount applied`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-gray-400">Cost:</div>
                      <div className="text-amber-400 font-mono text-right">
                        {partnerDiscount > 0 && (
                          <span className="line-through text-gray-600 mr-1.5">{config.baseCost.toLocaleString()}</span>
                        )}
                        {buildCost.toLocaleString()}
                      </div>
                      <div className="text-gray-400">Capacity:</div>
                      <div className="text-white text-right">{config.baseCapacity} units</div>
                      <div className="text-gray-400">Your credits:</div>
                      <div className={`font-mono text-right ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                        {(player?.credits || 0).toLocaleString()}
                      </div>
                      <div className="text-gray-400">After build:</div>
                      <div className={`font-mono text-right ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                        {((player?.credits || 0) - buildCost).toLocaleString()}
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
                    <button onClick={handleBuild} disabled={!canAfford}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold 
                                  flex items-center justify-center gap-2 transition-colors ${
                        canAfford 
                          ? 'bg-dispatch-red text-white hover:bg-red-700' 
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}>
                      <Check className="w-4 h-4" />
                      Build ({buildCost.toLocaleString()} 💰)
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
