// ============================================
// Dispatch HQ — Settings Modal
// ============================================

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Music, Gauge, Moon, Sun, Clock, Route, Zap, Wifi, WifiOff, Activity } from 'lucide-react';
import { loadSettings, saveSettings, DEFAULT_SOUND_CATEGORY_VOLUMES, type DispatchSettings } from '../utils/settings';
import { playChainComplete } from '../utils/sound';
import { ensureNotificationPermission } from '../utils/notify';
import { useGameStore } from '@/stores/gameStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setLocal] = useState<DispatchSettings>(loadSettings());

  useEffect(() => {
    if (isOpen) setLocal(loadSettings());
  }, [isOpen]);

  const patch = (partial: Partial<DispatchSettings>) => {
    const next = saveSettings(partial);
    setLocal(next);
  };
  const { isDarkMode: storeDark, toggleDarkMode } = useGameStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-dispatch-cyan/15 flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-dispatch-cyan" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Settings</h2>
                  <p className="text-[10px] text-gray-500">Audio, speed, patrol & accessibility</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-6 overflow-y-auto flex-1 min-h-0 overscroll-contain scroll-smooth">
              {/* Sound toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-5 h-5 text-dispatch-cyan" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-gray-500" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">Sound Effects</p>
                    <p className="text-[10px] text-gray-500">Alerts only — mission, pursuit & disaster tones</p>
                  </div>
                </div>
                <button
                  onClick={() => patch({ soundEnabled: !settings.soundEnabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.soundEnabled ? 'bg-dispatch-cyan' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      settings.soundEnabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Volume slider */}
              <div className={`space-y-2 transition-opacity ${settings.soundEnabled ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Volume</span>
                  <span className="text-xs font-mono text-gray-500">{Math.round(settings.soundVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.soundVolume}
                  disabled={!settings.soundEnabled}
                  onChange={(e) => patch({ soundVolume: Number(e.target.value) })}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dispatch-cyan"
                />
              </div>

              {/* Alert volume — the only remaining audible category */}
              <div className={`space-y-1.5 pt-4 border-t border-gray-800 transition-opacity ${settings.soundEnabled ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300">Alerts Volume</span>
                  <span className="text-[10px] font-mono text-gray-500">
                    {Math.round((settings.soundCategoryVolumes?.alert ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.soundCategoryVolumes?.alert ?? 1}
                  disabled={!settings.soundEnabled}
                  onChange={(e) => {
                    const next = {
                      ...(settings.soundCategoryVolumes ?? DEFAULT_SOUND_CATEGORY_VOLUMES),
                      alert: Number(e.target.value),
                    };
                    patch({ soundCategoryVolumes: next });
                  }}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <p className="text-[9px] text-gray-600 pt-0.5">Only alert tones play (missions, pursuits, disasters, completions). UI clicks, radio beeps and ambient were removed.</p>
              </div>

              {/* Test the alert cue */}
              <div className="pt-4 border-t border-gray-800">
                <p className="text-xs font-semibold text-gray-300 mb-2">Test Sounds</p>
                <button
                  disabled={!settings.soundEnabled}
                  onClick={() => playChainComplete()}
                  className="py-2 px-4 text-[11px] font-semibold rounded-lg border bg-gray-800/50 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Alert tone
                </button>
              </div>

                {/* Dark mode toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  {storeDark ? <Sun className="w-5 h-5 text-dispatch-cyan" /> : <Moon className="w-5 h-5 text-gray-500" />}
                  <div>
                    <p className="text-sm font-semibold text-white">Dark Mode</p>
                    <p className="text-[10px] text-gray-500">{storeDark ? 'Lights on' : 'Lights off'}</p>
                  </div>
                </div>
                <button
                  onClick={() => { patch({ darkMode: !settings.darkMode }); toggleDarkMode(); }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${storeDark ? 'bg-dispatch-cyan' : 'bg-gray-700'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${storeDark ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>


              {/* Music toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  <Music className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Music</p>
                    <p className="text-[10px] text-gray-500">Ambient dispatch radio (coming soon)</p>
                  </div>
                </div>
                <button
                  disabled
                  onClick={() => patch({ musicEnabled: !settings.musicEnabled })}
                  className="relative w-11 h-6 rounded-full bg-gray-700 opacity-50 cursor-not-allowed"
                >
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow" />
                </button>
              </div>

              {/* Game speed */}
              <div className="pt-4 border-t border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Simulation Speed</span>
                  <span className="text-xs font-mono text-gray-500">{(settings.gameSpeed * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.25}
                  value={settings.gameSpeed}
                  onChange={(e) => patch({ gameSpeed: Number(e.target.value) })}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dispatch-cyan"
                />
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>Slow</span>
                  <span>Normal</span>
                  <span>Fast</span>
                </div>
              </div>

              {/* Patrol lifecycle */}
              <div className="pt-4 border-t border-gray-800 space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <p className="text-sm font-semibold text-white">Patrol Lifecycle</p>
                </div>

                {/* Shift length */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Shift Length</span>
                    <span className="text-xs font-mono text-gray-500">{settings.patrolShiftMinutes} min</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={8}
                    step={0.5}
                    value={settings.patrolShiftMinutes}
                    onChange={(e) => patch({ patrolShiftMinutes: Number(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <p className="text-[10px] text-gray-600">How long a unit patrols before returning to the station for a 60s rest break.</p>
                </div>

                {/* Default post-mission behavior */}
                <div className="space-y-1.5">
                  <span className="text-xs text-gray-400">Default After Mission</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['auto', 'return', 'patrol'] as const).map((b) => (
                      <button
                        key={b}
                        onClick={() => {
                          patch({ defaultPostMissionBehavior: b });
                          useGameStore.getState().setDefaultPostMissionBehavior(b);
                        }}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                          settings.defaultPostMissionBehavior === b
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700/60'
                        }`}
                      >
                        {b === 'auto' ? 'Auto' : b === 'return' ? 'Return' : 'Patrol'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                    <Route className="w-3 h-3 shrink-0" />
                    <span>Auto weighs call volume — patrols more when the city is busy.</span>
                  </div>
                </div>
              </div>

              {/* Mission pacing */}
              <div className="pt-4 border-t border-gray-800 space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <p className="text-sm font-semibold text-white">Mission Pacing</p>
                </div>

                {/* Spawn cadence */}
                <div className="space-y-1.5">
                  <span className="text-xs text-gray-400">Call Cadence</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['relaxed', 'normal', 'intense'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => patch({ missionPace: p })}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                          settings.missionPace === p
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700/60'
                        }`}
                      >
                        {p === 'relaxed' ? 'Relaxed' : p === 'normal' ? 'Normal' : 'Intense'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600">How often new calls hit the board (Relaxed 20s · Normal 12s · Intense 6s).</p>
                </div>

                {/* Max active calls */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Max Active Calls</span>
                    <span className="text-xs font-mono text-gray-500">{settings.maxActiveMissions}</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={15}
                    step={1}
                    value={settings.maxActiveMissions}
                    onChange={(e) => patch({ maxActiveMissions: Number(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <p className="text-[10px] text-gray-600">The board never holds more calls than this (level scaling adds a little room).</p>
                </div>
              </div>

              {/* Disaster events */}
              <div className="pt-4 border-t border-gray-800 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Disaster Events</span>
                  <span className="text-base">🌪️</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(['off', 'rare', 'normal', 'frequent'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => patch({ disasterFrequency: f })}
                      className={`px-1 py-1.5 rounded-lg text-[10px] font-bold border transition-colors capitalize ${
                        settings.disasterFrequency === f
                          ? 'bg-red-500/20 border-red-500/50 text-red-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700/60'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600">
                  {settings.disasterFrequency === 'off'
                    ? 'Never — keep the city calm.'
                    : settings.disasterFrequency === 'rare'
                      ? 'Once in a while — a dramatic event is a treat.'
                      : settings.disasterFrequency === 'frequent'
                        ? 'Often — the city is always on edge.'
                        : 'Occasionally — the default balance.'}
                </p>
              </div>

              {/* CPU Mutual Aid (v0.22.2) */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="text-base">🏙️</span>
                  <div>
                    <p className="text-sm font-semibold text-white">City Answers Mutual Aid Calls</p>
                    <p className="text-[10px] text-gray-500">
                      Partner-agency calls (disaster waves, recovery) are handled by simulated city units for a small payout — build a partner station to answer them yourself for the full +25% bonus.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => patch({ cpuMutualAid: !settings.cpuMutualAid })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.cpuMutualAid ? 'bg-dispatch-red' : 'bg-gray-700'}`}
                  aria-pressed={settings.cpuMutualAid}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.cpuMutualAid ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Simulated Cross-Service Incidents (v0.22.8) */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="text-base">🏙️🤝</span>
                  <div>
                    <p className="text-sm font-semibold text-white">Simulated Cross-Service Incidents</p>
                    <p className="text-[10px] text-gray-500">
                      Other departments' calls appear across the city and the CPU resolves them — the city feels alive even with no partner station, and nothing piles up unanswerable. A built partner station still answers its own calls for the +25%.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => patch({ citySimCrossService: !settings.citySimCrossService })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.citySimCrossService ? 'bg-dispatch-red' : 'bg-gray-700'}`}
                  aria-pressed={settings.citySimCrossService}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.citySimCrossService ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Mutual Aid pace (v0.22.7) */}
              <div className="pt-4 border-t border-gray-800 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Mutual Aid Pace</span>
                  <span className="text-base">🤝</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(['off', 'rare', 'normal', 'frequent'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => patch({ mutualAidPace: f })}
                      className={`px-1 py-1.5 rounded-lg text-[10px] font-bold border transition-colors capitalize ${
                        settings.mutualAidPace === f
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700/60'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600">
                  {settings.mutualAidPace === 'off'
                    ? 'No partner calls — only your own department’s emergencies. Flip it on once a partner station is built.'
                    : settings.mutualAidPace === 'rare'
                      ? 'Partner calls show up now and then — mostly your own department.'
                      : settings.mutualAidPace === 'frequent'
                        ? 'Partner calls are common — the city leans on its neighbors.'
                        : 'Balanced mix of your calls and partner-agency requests.'}
                </p>
              </div>

              {/* Network (v0.23) — Online vs Offline gameplay */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  {settings.onlineMode ? (
                    <Wifi className="w-5 h-5 text-dispatch-cyan" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-gray-500" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">Online Gameplay</p>
                    <p className="text-[10px] text-gray-500">
                      Multiplayer — see other commanders and their units on the map, live chat & presence. Turn off for a private single-player session (offline mode is server-independent).
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => patch({ onlineMode: !settings.onlineMode })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.onlineMode ? 'bg-dispatch-cyan' : 'bg-gray-700'}`}
                  aria-label="Toggle online gameplay"
                  aria-pressed={settings.onlineMode}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.onlineMode ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>
              <p className="text-[9px] text-gray-600 pt-1">
                Online features run on the Dispatch HQ server (shared map, chat, presence). Your campaign always plays locally and keeps saving — the switch only controls the multiplayer layer.
              </p>

              {/* Co-op Auto-Respond (v0.40.0) */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="text-base">🤝</span>
                  <div>
                    <p className="text-sm font-semibold text-white">Auto-Respond Alliance Calls</p>
                    <p className="text-[10px] text-gray-500">
                      Automatically dispatch the nearest unit to shared alliance missions as they arrive. Turn off to triage manually.
                    </p>
                    <p className="text-[9px] text-amber-400/70 mt-0.5">Commander members get this enabled by default</p>
                  </div>
                </div>
                <button
                  onClick={() => patch({ autoRespondAlliance: !settings.autoRespondAlliance })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.autoRespondAlliance ? 'bg-purple-500' : 'bg-gray-700'}`}
                  aria-label="Toggle auto-respond to alliance missions"
                  aria-pressed={settings.autoRespondAlliance}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.autoRespondAlliance ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>

              {/* Shift pressure (v0.20.2) */}
              <div className="pt-4 border-t border-gray-800 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Shift Pressure</span>
                  <span className="text-base">💪</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['off', 'gentle', 'full'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => patch({ fatigueMode: f })}
                      className={`px-1 py-1.5 rounded-lg text-[10px] font-bold border transition-colors capitalize ${
                        settings.fatigueMode === f
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700/60'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600">
                  {settings.fatigueMode === 'off'
                    ? 'Off — crews never tire and fatigue never affects response.'
                    : settings.fatigueMode === 'gentle'
                      ? 'Gentle — fatigue builds at half speed; effects stay mild.'
                      : 'Full — long shifts tire crews and slow their response. The default.'}
                </p>
              </div>

              {/* Push notifications */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="text-base">🔔</span>
                  <div>
                    <p className="text-sm font-semibold text-white">Desktop Notifications</p>
                    <p className="text-[10px] text-gray-500">Alert you when a critical call needs units while you're away</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const next = !settings.pushEnabled;
                    if (next) {
                      const ok = await ensureNotificationPermission();
                      if (!ok) return;
                    }
                    patch({ pushEnabled: next });
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${settings.pushEnabled ? 'bg-amber-500' : 'bg-gray-700'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.pushEnabled ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>

              {/* Accessibility: colorblind-safe crime heat (v0.18.0) */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="text-base">🌈</span>
                  <div>
                    <p className="text-sm font-semibold text-white">Colorblind-Safe Crime Heat</p>
                    <p className="text-[10px] text-gray-500">Use a blue→orange heat palette that reads without red-green perception</p>
                  </div>
                </div>
                <button
                  onClick={() => patch({ colorblindHeat: !settings.colorblindHeat })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${settings.colorblindHeat ? 'bg-amber-500' : 'bg-gray-700'}`}
                  aria-label="Toggle colorblind-safe crime heat palette"
                  aria-pressed={settings.colorblindHeat}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.colorblindHeat ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>

              {/* Anonymous analytics (v0.24.0) — opt-in, off by default */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Share Anonymous Play Stats</p>
                    <p className="text-[10px] text-gray-500">
                      Send session length and mission counts (no personal data) to help balance the game. Off by default.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => patch({ analyticsEnabled: !settings.analyticsEnabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.analyticsEnabled ? 'bg-violet-500' : 'bg-gray-700'}`}
                  aria-label="Toggle anonymous analytics"
                  aria-pressed={settings.analyticsEnabled}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.analyticsEnabled ? 'translate-x-5' : ''}`}
                  />
                </button>
              </div>
            </div>

            <div className="p-5 border-t border-gray-800 shrink-0">
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-dispatch-cyan/20 hover:bg-dispatch-cyan/30 text-dispatch-cyan font-semibold rounded-xl
                           transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
