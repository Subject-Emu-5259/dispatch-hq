// ============================================
// Dispatch HQ — Pause Screen
// ============================================
// In-game pause overlay with resume, settings, and quit options.

import { motion, AnimatePresence } from 'framer-motion';
import { Play, Settings, Home, RotateCcw, ClipboardList, MapPinned, BookOpen, Newspaper, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { SettingsModal } from './SettingsModal';
import { ShiftReportModal } from './ShiftReportModal';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { currentVersion } from '@/data/releaseNotes';
import { saveGame, getActiveSlot, SLOT_LABELS, hadSaveAuthFailure } from '../hooks/useSaveSystem';
import { Save, SaveAll } from 'lucide-react';
import { playClick } from '../utils/sound';
import { TUTORIAL_STEP_COUNT } from './OnboardingOverlay';
import { itchPromoLabel } from '@/lib/itchPromo';

interface PauseScreenProps {
  isOpen: boolean;
  onResume: () => void;
  onQuit: () => void;
  /** Open the city picker in relocate mode (v0.21.0) — move your command to a new city. */
  onRelocate?: () => void;
  /** Replay the onboarding tutorial from step 1 (v0.22.x). */
  onReplayTutorial?: () => void;
}

export function PauseScreen({ isOpen, onResume, onQuit, onRelocate, onReplayTutorial }: PauseScreenProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showShiftReport, setShowShiftReport] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleQuit() {
    playClick();
    onQuit();
  }

  async function handleSave() {
    playClick();
    setSaving(true);
    try {
      const ok = await saveGame();
      setMessage(
        ok
          ? `Saved to ${SLOT_LABELS[getActiveSlot()]}`
          : hadSaveAuthFailure()
            ? 'Session expired — sign back in from the profile menu'
            : 'Save failed — try again in a moment'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex items-center justify-center"
          onClick={onResume}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl p-8 w-full max-w-sm max-h-[88vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="text-center mb-6">
              <img
                src="/logo.png?v=13"
                alt="Dispatch HQ"
                className="w-16 h-16 rounded-full object-cover border border-gray-700/60 shadow-lg mx-auto mb-3"
              />
              <h2 className="text-xl font-black text-white">PAUSED</h2>
              <p className="text-xs text-gray-500 mt-1">Dispatch operations suspended</p>
            </div>

            {/* Menu */}
            <div className="space-y-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { playClick(); onResume(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-dispatch-green/20 border border-dispatch-green/30
                           hover:bg-dispatch-green/30 transition-colors group"
              >
                <Play className="w-5 h-5 text-dispatch-green" />
                <div className="text-center flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-dispatch-green transition-colors">
                    Resume
                  </p>
                  <p className="text-[10px] text-gray-500">Continue dispatch operations</p>
                </div>
              </motion.button>

              <button
                onClick={() => { playClick(); setShowSettings(true); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                                 hover:bg-gray-800/60 transition-colors group">
                <Settings className="w-5 h-5 text-gray-400" />
                <div className="text-center flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-dispatch-cyan transition-colors">
                    Settings
                  </p>
                  <p className="text-[10px] text-gray-500">Adjust preferences</p>
                </div>
              </button>

              <button
                onClick={() => { playClick(); setShowShiftReport(true); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                                 hover:bg-gray-800/60 transition-colors group">
                <ClipboardList className="w-5 h-5 text-amber-400" />
                <div className="text-center flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                    Shift Report
                  </p>
                  <p className="text-[10px] text-gray-500">Session stats for this shift</p>
                </div>
              </button>

              {onReplayTutorial && (
                <button
                  onClick={() => { playClick(); onReplayTutorial(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                             hover:bg-gray-800/60 transition-colors group">
                  <BookOpen className="w-5 h-5 text-dispatch-cyan" />
                  <div className="text-center flex-1">
                    <p className="text-sm font-semibold text-white group-hover:text-dispatch-cyan transition-colors">
                      Replay Tutorial
                    </p>
                    <p className="text-[10px] text-gray-500">Walk the {TUTORIAL_STEP_COUNT}-step tour again anytime</p>
                  </div>
                </button>
              )}

              <button
                onClick={() => { playClick(); setShowReleaseNotes(true); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                           hover:bg-gray-800/60 transition-colors group">
                <Newspaper className="w-5 h-5 text-dispatch-cyan" />
                <div className="text-center flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-dispatch-cyan transition-colors">
                    What's New
                  </p>
                  <p className="text-[10px] text-gray-500">Latest release notes · v{currentVersion()}</p>
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-dispatch-cyan/15 text-dispatch-cyan border border-dispatch-cyan/30 font-bold uppercase shrink-0">
                  new
                </span>
              </button>

              <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                                 hover:bg-gray-800/60 transition-colors group">
                <RotateCcw className="w-5 h-5 text-gray-400" />
                <div className="text-center flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-dispatch-yellow transition-colors">
                    Restart
                  </p>
                  <p className="text-[10px] text-gray-500">Start a new dispatch session</p>
                </div>
              </button>

              {onRelocate && (
                <button
                  data-tutorial="relocate"
                  onClick={() => { playClick(); onRelocate(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                             hover:bg-gray-800/60 transition-colors group"
                >
                  <MapPinned className="w-5 h-5 text-violet-400" />
                  <div className="text-center flex-1">
                    <p className="text-sm font-semibold text-white group-hover:text-violet-400 transition-colors">
                      Relocate Command
                    </p>
                    <p className="text-[10px] text-gray-500">Move your fleet to a new city (level-gated)</p>
                  </div>
                </button>
              )}

              <button
                onClick={handleQuit}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                           hover:bg-red-900/30 hover:border-red-500/30 transition-colors group"
              >
                <Home className="w-5 h-5 text-gray-400 group-hover:text-dispatch-red" />
                <div className="text-center flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-dispatch-red transition-colors">
                    Quit to Menu
                  </p>
                  <p className="text-[10px] text-gray-500">Return to main menu</p>
                </div>
              </button>

              {/* Play on itch.io — platform promo link (matches the main-menu widget) */}
              <a
                href="https://agreatgame.itch.io/dispatch-hq"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30
                           hover:bg-gray-800/60 transition-colors group"
              >
                <ExternalLink className="w-5 h-5 text-dispatch-red" />
                <div className="text-center flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-dispatch-red transition-colors">
                    {itchPromoLabel()}
                  </p>
                  <p className="text-[10px] text-gray-500">Desktop apps for Mac, Windows &amp; Linux</p>
                </div>
              </a>
            </div>

  
            {/* Save Progress — the active slot is managed from the main menu */}
            <div className="mt-4 border-t border-gray-800 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                  <Save className="w-3.5 h-3.5 text-dispatch-cyan" /> Save Progress
                </p>
                <span className="text-[9px] text-gray-500 font-mono">
                  {SLOT_LABELS[getActiveSlot()]} · autosave on
                </span>
              </div>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-dispatch-cyan/15 border border-dispatch-cyan/30 text-dispatch-cyan text-[11px] font-bold hover:bg-dispatch-cyan/25 disabled:opacity-40 transition-colors"
              >
                <SaveAll className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save Now'}
              </button>
              <p className="text-[9px] text-gray-600 mt-1.5">
                Manage slots (load / delete / start new) from the main menu → Load Game.
              </p>
              {message && <p className={`text-[10px] mt-2 ${message.startsWith('Saved') ? 'text-dispatch-green' : 'text-amber-400'}`}>{message}</p>}
            </div>
          {/* Shortcut hint */}
            <p className="text-center text-[10px] text-gray-700 mt-6">
              Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-500 font-mono text-[9px]">Esc</kbd> to resume
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    <ShiftReportModal isOpen={showShiftReport} onClose={() => setShowShiftReport(false)} />
    <ReleaseNotesModal isOpen={showReleaseNotes} onClose={() => setShowReleaseNotes(false)} />
    </>
  );
}
