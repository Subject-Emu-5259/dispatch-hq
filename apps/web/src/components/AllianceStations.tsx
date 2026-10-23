// ============================================
// Dispatch HQ — Alliance Shared Stations
// ============================================
// Phase 3 of the v1.0 co-op endgame: build/upgrade/claim stations from the
// alliance treasury. Shared stations belong to the alliance, not a player,
// and answer missions for any alliance member in the same city.

import { useState, useEffect, useCallback } from 'react';
import {
  fetchSharedStations,
  buildSharedStation,
  upgradeSharedStation,
  claimSharedStation,
  fetchTreasury,
  type SharedStationEntry,
} from '@/lib/apiClient';

const STATION_COSTS: Record<string, number> = {
  fire_station: 5000,
  police_station: 4000,
  ems_station: 4500,
};

const UPGRADE_COSTS: number[] = [0, 0, 12_500, 31_250, 78_125, 195_312];

const STATION_ICONS: Record<string, string> = {
  fire_station: '🚒',
  police_station: '🏢',
  ems_station: '🏥',
};

interface AllianceStationsProps {
  allianceLevel: number;
  memberRole: string;
}

export function AllianceStations({ allianceLevel, memberRole }: AllianceStationsProps) {
  const [stations, setStations] = useState<SharedStationEntry[]>([]);
  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showBuild, setShowBuild] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Build form
  const [buildType, setBuildType] = useState('fire_station');
  const [buildName, setBuildName] = useState('');

  const canManage = memberRole === 'leader' || memberRole === 'officer';

  const load = useCallback(async () => {
    try {
      const [stationsRes, treasuryRes] = await Promise.all([
        fetchSharedStations(),
        fetchTreasury(),
      ]);
      setStations(stationsRes.stations ?? []);
      setTreasuryBalance(treasuryRes.balance ?? 0);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleBuild = async () => {
    const cost = STATION_COSTS[buildType] ?? 5000;
    if (!buildName.trim()) { setError('Station name is required'); return; }

    setBuilding(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await buildSharedStation({
        stationType: buildType,
        name: buildName.trim(),
        lat: 0, // Center of current city (client should provide)
        lng: 0,
      });
      setSuccess(`Built "${result.station.name}" for ${result.costPaid.toLocaleString()} credits!`);
      setTreasuryBalance(result.treasuryBalance);
      setShowBuild(false);
      setBuildName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build station');
    } finally {
      setBuilding(false);
    }
  };

  const handleUpgrade = async (stationId: string) => {
    setBuilding(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await upgradeSharedStation(stationId);
      setTreasuryBalance(result.treasuryBalance);
      setSuccess(`Upgraded to Level ${result.newLevel} for ${result.costPaid.toLocaleString()} credits!`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade station');
    } finally {
      setBuilding(false);
    }
  };

  const handleClaim = async (stationId: string) => {
    setBuilding(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await claimSharedStation(stationId);
      setSuccess(`Claimed station for ${result.claimCost.toLocaleString()} credits! It's now yours.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim station');
    } finally {
      setBuilding(false);
    }
  };

  if (loading) {
    return <div className="text-xs text-gray-400 py-2">Loading shared stations…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Treasury Balance */}
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Treasury Balance</span>
          <span className="text-sm font-bold text-yellow-400">
            {treasuryBalance.toLocaleString()} 💰
          </span>
        </div>
      </div>

      {/* Build Button */}
      {canManage && (
        <button
          onClick={() => setShowBuild(!showBuild)}
          className="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded transition-colors"
        >
          {showBuild ? 'Cancel' : '🏗️ Build Shared Station'}
        </button>
      )}

      {/* Build Form */}
      {showBuild && (
        <div className="bg-gray-800/50 rounded-lg p-3 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Station Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(STATION_COSTS).map(([type, cost]) => (
                <button
                  key={type}
                  onClick={() => setBuildType(type)}
                  className={`text-xs py-2 rounded border transition-colors ${
                    buildType === type
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {STATION_ICONS[type]} {type.replace('_', ' ')}<br />
                  <span className="text-gray-400">{cost.toLocaleString()} 💰</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Station Name</label>
            <input
              type="text"
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
              placeholder="Alliance HQ"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleBuild}
            disabled={building || treasuryBalance < (STATION_COSTS[buildType] ?? 5000)}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded transition-colors"
          >
            {building ? 'Building…' : `Build for ${(STATION_COSTS[buildType] ?? 5000).toLocaleString()} 💰`}
          </button>
        </div>
      )}

      {/* Status Messages */}
      {error && <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2">{error}</div>}
      {success && <div className="text-green-400 text-xs bg-green-900/20 rounded px-3 py-2">{success}</div>}

      {/* Station List */}
      {stations.length === 0 ? (
        <div className="text-xs text-gray-500 py-2">No shared stations yet. Build one from the treasury!</div>
      ) : (
        <div className="space-y-2">
          {stations.map((s) => {
            const upgradeCost = s.level < 5 ? UPGRADE_COSTS[s.level + 1] ?? 0 : 0;
            return (
              <div key={s.id} className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{STATION_ICONS[s.type] ?? '🏢'}</span>
                    <div>
                      <div className="text-xs font-bold text-white">{s.name}</div>
                      <div className="text-[10px] text-gray-400">
                        L{s.level} · {s.type.replace('_', ' ')} · {s.unitCount}/{s.capacity} units
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canManage && s.level < 5 && treasuryBalance >= upgradeCost && (
                      <button
                        onClick={() => handleUpgrade(s.id)}
                        disabled={building}
                        className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
                      >
                        ⬆ {upgradeCost.toLocaleString()} 💰
                      </button>
                    )}
                    <button
                      onClick={() => handleClaim(s.id)}
                      disabled={building}
                      className="text-[10px] bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded transition-colors"
                    >
                      Claim (pay {(STATION_COSTS[s.type] ?? 5000).toLocaleString()})
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
