// ============================================
// Dispatch HQ — City Selection Start Screen
// ============================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGameStore, type CityData } from '../stores/gameStore';
import type { ServiceType } from '@dispatch-hq/shared';
import { STATION_CONFIGS } from '@dispatch-hq/shared';
import { boundaryForCityData } from '@/data/cityBoundaries';
import {
  isCityUnlocked,
  lockedUntilLabel,
  relocateCost,
  RELOCATE_BASE_COST,
  RELOCATE_PER_STATION,
  RELOCATE_PER_UNIT,
} from '@/lib/cityProgression';
import { itchPromoLabel } from '@/lib/itchPromo';
import { adoptCity } from '@/lib/adoptedCities';
import { getCityTrait } from '@/lib/cityTraits';

interface GeocodingResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  boundingbox?: string[];
  importance: number;
  class?: string;
  address?: { country?: string; city?: string; state?: string; town?: string; village?: string };
}

interface CitySelectionScreenProps {
  onGameStart: () => void;
  /** 'new' = fresh campaign (menu → new game); 'relocate' = moving an existing command mid-campaign (Pause menu). */
  mode?: 'new' | 'relocate';
  /** Only used in relocate mode — returns to the game without moving. */
  onCancelRelocate?: () => void;
}

const SERVICE_OPTIONS: { type: ServiceType; label: string; icon: string; color: string; description: string }[] = [
  {
    type: 'fire',
    label: 'Fire Department',
    icon: '🚒',
    color: '#DC2626',
    description: 'Respond to fires, hazmat incidents, and rescue operations',
  },
  {
    type: 'police',
    label: 'Police Department',
    icon: '🚔',
    color: '#2563EB',
    description: 'Handle crimes, pursuits, and law enforcement operations',
  },
  {
    type: 'ems',
    label: 'EMS / Ambulance',
    icon: '🚑',
    color: '#16A34A',
    description: 'Provide medical care and transport patients',
  },
];

const POPULAR_CITIES: CityData[] = [
  { name: 'West Memphis, AR', state: 'AR', country: 'US', lat: 35.1465, lng: -90.1845, population: 25402 },
  { name: 'Memphis, TN', state: 'TN', country: 'US', lat: 35.1495, lng: -90.049, bounds: [[34.994374, -90.308366], [35.263108, -89.637089]], population: 633104 },
  { name: 'Nashville, TN', state: 'TN', country: 'US', lat: 36.1627, lng: -86.7816, bounds: [[35.967785, -87.054766], [36.405496, -86.515588]], population: 689447 },
  { name: 'Little Rock, AR', state: 'AR', country: 'US', lat: 34.7465, lng: -92.2896, bounds: [[34.625807, -92.521494], [34.821607, -92.150768]], population: 202591 },
  { name: 'St. Louis, MO', state: 'MO', country: 'US', lat: 38.62722, lng: -90.19778, bounds: [[38.47722, -90.39778], [38.77722, -89.99778]], population: 281754 },
  { name: 'Dallas, TX', state: 'TX', country: 'US', lat: 32.78306, lng: -96.80667, bounds: [[32.63306, -97.00667], [32.93306, -96.60667]], population: 1308652 },
  { name: 'Atlanta, GA', state: 'GA', country: 'US', lat: 33.749, lng: -84.38798, bounds: [[33.599, -84.58798], [33.899, -84.18798]], population: 498715 },
  { name: 'Seattle, WA', state: 'WA', country: 'US', lat: 47.60621, lng: -122.33207, bounds: [[47.45621, -122.53207], [47.75621, -122.13207]], population: 737015 },
  { name: 'New York City', country: 'US', lat: 40.7128, lng: -74.006, bounds: [[40.4774, -74.2591], [40.9176, -73.7004]], population: 8336817 },
  { name: 'Los Angeles', country: 'US', lat: 34.0522, lng: -118.2437, bounds: [[33.7036, -118.6682], [34.3373, -118.1553]], population: 3979576 },
  { name: 'Chicago', country: 'US', lat: 41.8781, lng: -87.6298, bounds: [[41.6445, -87.9073], [42.0230, -87.5240]], population: 2693976 },
  { name: 'Houston', country: 'US', lat: 29.7604, lng: -95.3698, bounds: [[29.5230, -95.8256], [30.1547, -95.0097]], population: 2304580 },
  { name: 'London', country: 'GB', lat: 51.5074, lng: -0.1278, bounds: [[51.2868, -0.5104], [51.6919, 0.3340]], population: 8982000 },
  { name: 'Tokyo', country: 'JP', lat: 35.6762, lng: 139.6503, bounds: [[35.5315, 139.5856], [35.8173, 139.9032]], population: 13960000 },
  { name: 'Paris', country: 'FR', lat: 48.8566, lng: 2.3522, bounds: [[48.5158, 2.2242], [49.0470, 2.8282]], population: 2161000 },
  { name: 'Sydney', country: 'AU', lat: -33.8688, lng: 151.2093, bounds: [[-34.1100, 150.5200], [-33.5700, 151.3400]], population: 5312183 },
  { name: 'Toronto', country: 'CA', lat: 43.6532, lng: -79.3832, bounds: [[43.5800, -79.6393], [43.8555, -79.1164]], population: 2794356 },
  { name: 'Berlin', country: 'DE', lat: 52.52, lng: 13.405, bounds: [[52.3388, 13.0884], [52.6755, 13.7612]], population: 3645000 },
];

function formatPopulation(pop?: number): string {
  if (!pop) return '';
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(0)}K`;
  return pop.toString();
}

function estimateCityBounds(lat: number, lng: number): [[number, number], [number, number]] {
  // Rough estimate: ±0.05 degrees (~5km)
  const delta = 0.05;
  return [
    [lat - delta, lng - delta],
    [lat + delta, lng + delta],
  ];
}

export function CitySelectionScreen({ onGameStart, mode = 'new', onCancelRelocate }: CitySelectionScreenProps) {
  const isRelocating = mode === 'relocate';
  const [step, setStep] = useState<'city' | 'service' | 'briefing'>('city');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CityData | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    setSelectedCity: setStoreCity,
    setSelectedService: setStoreService,
    resetNewGame,
    setMapBounds,
    setPlayer,
    updatePlayer,
    relocateCity,
  } = useGameStore();
  // Live fleet/account state for the relocation cost + briefing (v0.21.1).
  const player = useGameStore((s) => s.player);
  const stationCount = useGameStore((s) => s.stations.length);
  const unitCount = useGameStore((s) => s.units.length);
  // Level gate for relocating: the campaign's live commander level decides
  // which cities are reachable when moving an existing command.
  const commanderLevel = useGameStore.getState().player?.level ?? 1;

  const searchCities = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      // Same-origin geocode proxy (servers/game-server/src/routes/mapData.ts) —
      // the browser never talks to Nominatim directly; the server caches.
      const res = await fetch(
        `/geocode/search?q=${encodeURIComponent(q)}&format=json&limit=8&addressdetails=1&featuretype=city`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) throw new Error('Search failed');
      const data: GeocodingResult[] = await res.json();
      setResults(data);
    } catch (err) {
      setError('Search failed. Try selecting a popular city below.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchCities(value), 500);
  }, [searchCities]);

  const handleCitySelect = (city: CityData) => {
    if (isRelocating && !isCityUnlocked(city.name, commanderLevel)) {
      setError(`${lockedUntilLabel(city.name)} — keep climbing the ranks to relocate here.`);
      return;
    }
    setError(null);
    const precise = boundaryForCityData(city);
    if (precise) {
      city.bounds = precise.bounds;
      city.boundary = precise.rings;
    }
    // Batch 3b adopt-a-city: a searched city (not on the popular roster)
    // becomes a persistent home base with local progression — not a
    // one-off visit. Roster cities are already permanent and skip this.
    if (!POPULAR_CITIES.some((c) => c.name === city.name)) {
      const st = useGameStore.getState();
      st.setAdoptedCities(adoptCity(st.adoptedCities, city));
    }
    setSelectedCity(city);
    setStep('service');
  };

  const handleServiceSelect = (service: ServiceType) => {
    setSelectedService(service);
  };

  const handleStartGame = () => {
    if (!selectedCity || !selectedService) return;

    if (isRelocating) {
      // Relocate: review the move (briefing) before committing — cost is
      // fleet-sized and the screen shows what carries over vs. resets.
      setStep('briefing');
      return;
    }

    // Capture the authenticated identity BEFORE resetNewGame nulls the player.
    // A fresh campaign resets gameplay state, never the account identity — the
    // placeholder below is only for the legacy offline path. Clobbering the
    // identity here hid the founder Admin Console entry (gated on the player
    // email) and showed a dummy email in the profile dropdown.
    const identity = useGameStore.getState().player;

    // Start a fresh campaign: clear previous state first
    resetNewGame();

    // Set bounds
    const bounds = selectedCity.bounds || estimateCityBounds(selectedCity.lat, selectedCity.lng);
    setStoreCity(selectedCity);
    setStoreService(selectedService);
    setMapBounds(bounds);

    // Seed criminal records for this city
    useGameStore.getState().seedCriminalRecords(selectedCity);

    // Initialize player — keep the authenticated id/username/email so the
    // profile dropdown always shows the real account; only the campaign's
    // gameplay stats reset to fresh-start values.
    setPlayer({
      id: identity?.id ?? 'player_1',
      username: identity?.username ?? 'Commander',
      email: identity?.email ?? 'commander@dispatchhq.com',
      credits: 10000,
      coins: 0,
      xp: 0,
      level: 1,
      isPremium: identity?.isPremium ?? false,
      createdAt: identity?.createdAt ?? new Date().toISOString(),
      lastActive: new Date().toISOString(),
    });

    // Seed criminal records for the selected city / agency
    useGameStore.getState().seedCriminalRecords(selectedCity);

    onGameStart();
  };

  const handleConfirmRelocate = () => {
    if (!selectedCity || !selectedService || !player) return;
    const cost = relocateCost(stationCount, unitCount);
    if (player.credits < cost) {
      setError(`Not enough credits — relocating costs ${cost.toLocaleString()} and you have ${player.credits.toLocaleString()}.`);
      return;
    }
    const bounds = selectedCity.bounds || estimateCityBounds(selectedCity.lat, selectedCity.lng);
    updatePlayer({ credits: player.credits - cost });
    relocateCity(selectedCity, selectedService, bounds);
    onGameStart();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      {/* Background with animated gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-dispatch-red/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-dispatch-blue/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-4">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white tracking-tight">
            Dispatch<span className="text-dispatch-red">HQ</span>
          </h1>
          <p className="text-gray-400 text-sm mt-2">{isRelocating ? 'Move your command to a new city' : 'Command the Chaos. Save the City.'}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-8 h-1 rounded-full transition-all duration-300 ${step === 'city' ? 'bg-dispatch-red' : 'bg-dispatch-red/50'}`} />
          <div className={`w-8 h-1 rounded-full transition-all duration-300 ${step === 'service' ? 'bg-dispatch-blue' : 'bg-gray-700'}`} />
          {isRelocating && (
            <div className={`w-8 h-1 rounded-full transition-all duration-300 ${step === 'briefing' ? 'bg-violet-400' : 'bg-gray-700'}`} />
          )}
        </div>

        {/* City Selection Step */}
        {step === 'city' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-white text-center">
              {isRelocating ? 'Relocate Your Command' : 'Choose Your City'}
            </h2>
            {isRelocating && (
              <p className="text-gray-400 text-xs text-center -mt-2">
                Your fleet, career, and credits carry over — missions and patrol routes reset for the new city.
              </p>
            )}

            {/* Search Input */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                🔍
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search for a city..."
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white
                           placeholder-gray-500 focus:outline-none focus:border-dispatch-red focus:ring-1
                           focus:ring-dispatch-red/50 transition-all"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-dispatch-red border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search Results */}
            {results.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {results.map((r) => {
                  const parts = r.display_name.split(', ');
                  const name = parts[0];
                  const region = parts.slice(1, 3).join(', ');
                  return (
                    <button
                      key={r.place_id}
                      onClick={() => {
                        const city: CityData = {
                          name,
                          state: r.address?.state,
                          country: r.address?.country || '',
                          lat: parseFloat(r.lat),
                          lng: parseFloat(r.lon),
                          population: undefined,
                        };
                        const precise = boundaryForCityData(city);
                        if (precise) {
                          city.bounds = precise.bounds;
                          city.boundary = precise.rings;
                        }
                        handleCitySelect(city);
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700/50
                                 border-b border-gray-700/50 last:border-0 transition-colors text-left"
                    >
                      <span className="text-lg">📍</span>
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{name}</div>
                        <div className="text-gray-400 text-xs truncate">{region}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <p className="text-amber-400 text-xs text-center">{error}</p>
            )}

            {/* Popular Cities */}
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 font-semibold">Popular Cities</p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_CITIES.map((city) => {
                  const locked = isRelocating && !isCityUnlocked(city.name, commanderLevel);
                  const lockLabel = locked ? lockedUntilLabel(city.name) : null;
                  const trait = getCityTrait(city.name);
                  return (
                    <button
                      key={city.name}
                      onClick={() => handleCitySelect(city)}
                      disabled={locked}
                      className={`px-3 py-2.5 bg-gray-800/60 border border-gray-700/50
                                 rounded-lg text-left transition-all group
                                 ${locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800 hover:border-gray-600'}`}
                    >
                      <div className={`text-white text-sm font-medium truncate ${locked ? '' : 'group-hover:text-dispatch-red transition-colors'}`}>
                        {city.name} {locked && '🔒'}
                      </div>
                      <div className="text-gray-500 text-xs">
                        {lockLabel ?? (
                          <>{city.country} {city.population ? `• ${formatPopulation(city.population)}` : ''}</>
                        )}
                      </div>
                      {trait && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="inline-block px-1.5 py-0.5 text-[11px] font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {trait.name}
                          </span>
                          <span className="text-[11px] text-gray-500 truncate">
                            {trait.description}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Service Selection Step */}
        {step === 'service' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Choose Your Service</h2>
              <p className="text-gray-400 text-sm mt-1">
                Building in <span className="text-dispatch-red font-semibold">{selectedCity?.name}</span>
              </p>
            </div>

            <div className="space-y-3">
              {SERVICE_OPTIONS.map((svc) => (
                <button
                  key={svc.type}
                  onClick={() => handleServiceSelect(svc.type)}
                  className={`w-full px-5 py-4 rounded-xl border-2 transition-all duration-200 text-left flex items-center gap-4 group
                    ${selectedService === svc.type
                      ? 'border-dispatch-red bg-gray-800 ring-1 ring-dispatch-red/30'
                      : 'border-gray-700 bg-gray-800/40 hover:border-gray-600 hover:bg-gray-800/70'
                    }`}
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ backgroundColor: `${svc.color}20`, border: `1px solid ${svc.color}40` }}
                  >
                    {svc.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-bold text-base">{svc.label}</div>
                    <div className="text-gray-400 text-xs mt-0.5">{svc.description}</div>
                  </div>
                  {selectedService === svc.type && (
                    <div className="ml-auto text-dispatch-red text-xl">✓</div>
                  )}
                </button>
              ))}
            </div>

            {/* Back + Start buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep('city'); setSelectedService(null); }}
                className="px-4 py-3 bg-gray-800 text-gray-400 hover:text-white border border-gray-700
                           rounded-xl font-medium transition-colors"
              >
                ← Back
              </button>
              {isRelocating && onCancelRelocate && (
                <button
                  onClick={onCancelRelocate}
                  className="px-4 py-3 bg-gray-800 text-gray-400 hover:text-white border border-gray-700
                             rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleStartGame}
                disabled={!selectedService}
                className={`flex-1 py-3 rounded-xl font-bold text-white text-base transition-all duration-200
                  ${selectedService
                    ? 'bg-dispatch-red hover:bg-red-600 shadow-lg shadow-dispatch-red/20 hover:shadow-dispatch-red/30'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
              >
                {isRelocating ? 'Review Move →' : 'Start Dispatching →'}
              </button>
            </div>
          </div>
        )}

        {/* Play on itch.io — platform promo badge (matches the main-menu widget) */}
        <a
          href="https://agreatgame.itch.io/dispatch-hq"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block rounded-xl border border-gray-800/60 bg-gray-800/30 px-4 py-3
                     text-center transition-colors hover:border-dispatch-red/40 hover:bg-gray-800/50 group"
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-dispatch-red transition-colors">
            🎮 {itchPromoLabel()}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Desktop apps for Mac, Windows &amp; Linux —{' '}
            <span className="text-emerald-400 font-semibold">web version is FREE</span>
          </p>
        </a>

        {/* Relocation Briefing Step (v0.21.1) */}
        {isRelocating && step === 'briefing' && selectedCity && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">New City Briefing</h2>
              <p className="text-gray-400 text-sm mt-1">
                Relocating to <span className="text-dispatch-red font-semibold">{selectedCity.name}</span> · {selectedService === 'fire' ? 'Fire Department' : selectedService === 'police' ? 'Police Department' : 'EMS / Ambulance'}
              </p>
            </div>

            {/* Carries over vs. resets */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">✓ Carries Over</p>
                <ul className="space-y-1 text-[11px] text-gray-300">
                  <li>Level &amp; XP ({player?.level ?? 1})</li>
                  <li>Credits &amp; coins</li>
                  <li>{stationCount} stations — repositioned (levels &amp; perks kept)</li>
                  <li>{unitCount} units — fleet &amp; liveries kept</li>
                  <li>Crew — fatigue, morale, traits</li>
                  <li>Career stats, alliance, settings</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">↻ Resets</p>
                <ul className="space-y-1 text-[11px] text-gray-300">
                  <li>Active missions &amp; patrol routes</li>
                  <li>Inmates, patients, investigations</li>
                  <li>Criminal records — reseeded for {selectedCity.name}</li>
                </ul>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="p-3 rounded-xl bg-gray-800/60 border border-gray-700/50">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Relocation Cost</p>
              <div className="space-y-1 text-[11px] text-gray-300">
                <div className="flex justify-between"><span>Base</span><span className="font-mono">{RELOCATE_BASE_COST.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>{stationCount} station{stationCount === 1 ? '' : 's'} × {RELOCATE_PER_STATION.toLocaleString()}</span><span className="font-mono">{(stationCount * RELOCATE_PER_STATION).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>{unitCount} unit{unitCount === 1 ? '' : 's'} × {RELOCATE_PER_UNIT.toLocaleString()}</span><span className="font-mono">{(unitCount * RELOCATE_PER_UNIT).toLocaleString()}</span></div>
                <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5 text-sm font-bold">
                  <span className="text-white">Total</span>
                  <span className={`font-mono ${(player?.credits ?? 0) >= relocateCost(stationCount, unitCount) ? 'text-dispatch-green' : 'text-red-400'}`}>
                    {relocateCost(stationCount, unitCount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500"><span>Your credits</span><span className="font-mono">{(player?.credits ?? 0).toLocaleString()}</span></div>
              </div>
            </div>

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep('service'); setError(null); }}
                className="px-4 py-3 bg-gray-800 text-gray-400 hover:text-white border border-gray-700
                           rounded-xl font-medium transition-colors"
              >
                ← Back
              </button>
              {onCancelRelocate && (
                <button
                  onClick={onCancelRelocate}
                  className="px-4 py-3 bg-gray-800 text-gray-400 hover:text-white border border-gray-700
                             rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleConfirmRelocate}
                disabled={(player?.credits ?? 0) < relocateCost(stationCount, unitCount)}
                className={`flex-1 py-3 rounded-xl font-bold text-white text-base transition-all duration-200
                  ${(player?.credits ?? 0) >= relocateCost(stationCount, unitCount)
                    ? 'bg-dispatch-red hover:bg-red-600 shadow-lg shadow-dispatch-red/20 hover:shadow-dispatch-red/30'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
              >
                Relocate for {relocateCost(stationCount, unitCount).toLocaleString()} credits
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}