// ============================================
// Dispatch HQ — Photo Gallery (Batch 3e, feature 17)
// Profile gallery of incident snapshots. Each snapshot stores share-card
// DATA (not a PNG); this modal re-renders it through the ONE existing
// renderer (lib/shareCard renderShareCard) — no second renderer exists.
// Export/download goes through the edition's existing shareCardPng path
// (main: clipboard-first PNG; Reddit: PNG export, no social-post intent).
// ============================================

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Download, Trash2, X } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { renderShareCard, shareCardPng, CARD_WIDTH, CARD_HEIGHT, type ShareCardData } from '@/lib/shareCard';
import { useNotifications } from './NotificationCenter';
import { playClick } from '../utils/sound';

function SnapshotCanvas({ card }: { card: ShareCardData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    // No logo: the painter's DHQ monogram fallback renders instead, so the
    // gallery never depends on a network logo fetch.
    renderShareCard(canvas, card, null);
  }, [card]);
  return <canvas ref={ref} className="w-full h-auto rounded-lg border border-gray-700/50" />;
}

export function PhotoGalleryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const snapshots = useGameStore((s) => s.snapshots);
  const removeSnapshot = useGameStore((s) => s.removeSnapshot);
  const { addNotification } = useNotifications();

  const handleDownload = async (card: ShareCardData, id: string) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;
      renderShareCard(canvas, card, null);
      const outcome = await shareCardPng(canvas, `dispatch-hq-snapshot-${id}.png`);
      addNotification({
        type: 'success',
        title: outcome === 'clipboard' ? 'Snapshot copied' : 'Snapshot downloaded',
        message: outcome === 'clipboard' ? 'Image copied to clipboard.' : 'PNG saved to your downloads.',
        icon: '📸',
      });
    } catch {
      addNotification({
        type: 'error',
        title: 'Export failed',
        message: "Couldn't create the image — try again.",
        icon: '⚠️',
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
          >
            <div className="px-6 pt-6 pb-5 border-b border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-dispatch-cyan/20 border border-dispatch-cyan/30 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-dispatch-cyan" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white tracking-wide">PHOTO GALLERY</h2>
                  <p className="text-[11px] text-gray-400">
                    {snapshots.length === 0 ? 'No snapshots yet — save one from the shift report.' : `${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'} (newest last)`}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              {snapshots.length === 0 && (
                <p className="text-sm text-gray-400 leading-relaxed">
                  Snapshots capture a shift moment as a share card and keep it in your profile gallery
                  (persisted in your save, up to 12). Open a shift report and tap “Save Snapshot to Gallery”.
                </p>
              )}
              {[...snapshots].reverse().map((snap) => (
                <div key={snap.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white truncate">{snap.title}</p>
                    <p className="text-[11px] text-gray-500 shrink-0 ml-2">
                      {new Date(snap.capturedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <SnapshotCanvas card={snap.card} />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { playClick(); void handleDownload(snap.card, snap.id); }}
                      className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-dispatch-cyan/20 border border-dispatch-cyan/30 text-white text-xs font-semibold hover:bg-dispatch-cyan/30 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Export PNG
                    </button>
                    <button
                      onClick={() => { playClick(); removeSnapshot(snap.id); }}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 pb-6 pt-2 shrink-0">
              <button
                onClick={() => { playClick(); onClose(); }}
                className="w-full p-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Close Gallery
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
