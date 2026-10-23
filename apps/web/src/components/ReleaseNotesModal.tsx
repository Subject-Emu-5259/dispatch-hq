// ============================================
// Dispatch HQ — Release Notes Modal
// ============================================
// Shared "What's New" view used by the main menu AND the pause menu, so
// players in a session can read the latest release without quitting to the
// main menu. Driven by the same RELEASE_NOTES data as everywhere else.
//
// The modal is STATE-GATED on `isOpen` (v0.23.1 hotfix): before, the prop
// was accepted but never read, so the overlay was permanently mounted over
// the menu and gameplay and could never be closed — "stuck, can't exit,
// cleared cookies, still there". Opening the notes also marks the version
// seen (releaseSeen contract) so the What's New unread dot clears.

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, X } from 'lucide-react';
import { RELEASE_NOTES, currentVersion } from '@/data/releaseNotes';
import { markReleaseSeen } from '@/lib/releaseSeen';
import { useGameStore } from '@/stores/gameStore';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReleaseNotesModal({ isOpen, onClose }: ReleaseNotesModalProps) {
  const playerId = useGameStore((s) => s.player?.id);

  // The What's New unread dot clears the moment the notes open (releaseSeen
  // contract): record this version as seen for the current player, once.
  useEffect(() => {
    if (isOpen) markReleaseSeen(playerId, currentVersion());
  }, [isOpen, playerId]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Newspaper className="w-5 h-5 text-dispatch-cyan" />
            <h2 className="text-lg font-bold text-white">Release Notes</h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-dispatch-cyan/15 text-dispatch-cyan border border-dispatch-cyan/30 font-bold">
              v{currentVersion()}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg" aria-label="Close release notes">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="overflow-y-auto pr-1 space-y-4">
          {RELEASE_NOTES.map((note, i) => (
            <div key={i} className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white">{note.title}</h3>
                <span className="text-[10px] text-gray-500">{note.version}</span>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">{note.date}</p>
              <ul className="space-y-1">
                {note.items.map((item, j) => (
                  <li key={j} className="text-xs text-gray-300 flex items-start gap-2">
                    <span className="text-dispatch-red mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-[10px] text-gray-600 mt-4">
          More updates coming. Keep dispatching.
        </p>
      </motion.div>
    </motion.div>
  );
}
