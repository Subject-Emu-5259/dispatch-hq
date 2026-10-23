// ============================================
// Dispatch HQ — Save Slots Modal (main menu)
// ============================================
// The Load Game screen: three fixed campaign slots (Slot 1–3) with live
// previews (city, service, level, credits, missions, game clock). Doubles as
// the slot picker for starting a New Campaign — empty slots get "Start Here",
// occupied ones offer a two-step overwrite so no campaign dies by accident.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HardDrive, Trash2, Play, Plus, MapPin, Star, Coins, Siren, Shield, Flame, Heart } from 'lucide-react';
import {
  refreshSaveSlots, listSaveSlots, getActiveSlot,
  SLOT_LABELS, type SaveSlotId, type SaveSlotInfo,
} from '@/hooks/useSaveSystem';
import type { ServiceType } from '@dispatch-hq/shared';

interface SaveSlotsModalProps {
  isOpen: boolean;
  mode: 'load' | 'new';
  onClose: () => void;
  onLoad: (slot: SaveSlotId) => void;
  onStartNew: (slot: SaveSlotId) => void;
  onDelete: (slot: SaveSlotId) => void;
}

const EMPTY_SLOT: SaveSlotInfo[] = [
  { slot: '1', label: 'Slot 1', exists: false, createdAt: null, updatedAt: null, preview: null },
  { slot: '2', label: 'Slot 2', exists: false, createdAt: null, updatedAt: null, preview: null },
  { slot: '3', label: 'Slot 3', exists: false, createdAt: null, updatedAt: null, preview: null },
];

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** In-game clock readout for a save's gameMinutes (campaign starts 06:00). */
function gameClockLabel(gameMinutes: number): string {
  if (!Number.isFinite(gameMinutes) || gameMinutes < 0) return '—';
  const total = 6 * 30 + gameMinutes;
  const day = Math.floor(total / 1440) + 1;
  const hm = total % 1440;
  const hh = String(Math.floor(hm / 60)).padStart(2, '0');
  const mm = String(Math.floor(hm % 60)).padStart(2, '0');
  return `Day ${day} · ${hh}:${mm}`;
}

function serviceMeta(service: string | null) {
  if (service === 'fire') return { icon: <Flame className="w-3.5 h-3.5 text-orange-400" />, label: 'Fire' };
  if (service === 'ems') return { icon: <Heart className="w-3.5 h-3.5 text-green-400" />, label: 'EMS' };
  if (service === 'police') return { icon: <Shield className="w-3.5 h-3.5 text-blue-400" />, label: 'Police' };
  return null;
}

export function SaveSlotsModal({ isOpen, mode, onClose, onLoad, onStartNew, onDelete }: SaveSlotsModalProps) {
  const [slots, setSlots] = useState<SaveSlotInfo[]>(EMPTY_SLOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<SaveSlotId | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SaveSlotId | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<SaveSlotId | null>(null);
  const [offline, setOffline] = useState(false);

  const sync = async () => {
    try {
      await refreshSaveSlots();
      setSlots(listSaveSlots());
      setOffline(false);
    } catch {
      setSlots(EMPTY_SLOT);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setConfirmDelete(null);
      setConfirmOverwrite(null);
      void sync();
    }
  }, [isOpen, mode]);

  const activeSlot = getActiveSlot();

  const handleDelete = async (slot: SaveSlotId) => {
    setBusy(slot);
    try {
      await onDelete(slot);
      await sync();
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-dispatch-cyan" />
                <div>
                  <h2 className="text-lg font-bold text-white">{mode === 'load' ? 'Load Game' : 'New Campaign'}</h2>
                  <p className="text-[10px] text-gray-500">
                    {mode === 'load'
                      ? 'Choose a saved dispatch career to resume'
                      : 'Pick a slot for the fresh career — autosave writes here'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {offline && (
              <p className="mt-3 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                Dispatch cloud unreachable — slot data may be stale. Saves still land locally and will sync when you're back online.
              </p>
            )}

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-24 rounded-xl bg-gray-800/50 border border-gray-700/30 animate-pulse" />
                  ))}
                </div>
              ) : (
                slots.map((info) => {
                  const isActive = info.slot === activeSlot;
                  const preview = info.preview;
                  const svc = serviceMeta(preview?.service ?? null);
                  const deleting = busy === info.slot;
                  const showDeleteConfirm = confirmDelete === info.slot;
                  const showOverwriteConfirm = confirmOverwrite === info.slot;
                  return (
                    <div
                      key={info.slot}
                      className={`rounded-xl border p-3 transition-colors ${
                        isActive && info.exists
                          ? 'border-dispatch-cyan/40 bg-cyan-500/5'
                          : 'border-gray-700/40 bg-gray-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">{SLOT_LABELS[info.slot]}</span>
                          {info.exists ? (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Save
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-500 border border-gray-600/40">
                              Empty
                            </span>
                          )}
                          {isActive && info.exists && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                              Current
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-gray-500">{info.exists && info.updatedAt ? timeAgo(info.updatedAt) : ''}</span>
                      </div>

                      {info.exists && preview ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                          <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-1.5">
                            <p className="text-gray-600 flex items-center gap-1"><MapPin className="w-3 h-3" /> City</p>
                            <p className="text-gray-300 font-semibold truncate">{preview.city || '—'}</p>
                          </div>
                          <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-1.5">
                            <p className="text-gray-600 flex items-center gap-1">{svc ? svc.icon : <Siren className="w-3 h-3" />} Service</p>
                            <p className="text-gray-300 font-semibold">{svc?.label ?? '—'}</p>
                          </div>
                          <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-1.5">
                            <p className="text-gray-600 flex items-center gap-1"><Star className="w-3 h-3" /> Level</p>
                            <p className="text-gray-300 font-semibold">{preview.level} <span className="text-gray-600">· {preview.missionsCompleted} calls</span></p>
                          </div>
                          <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-1.5">
                            <p className="text-gray-600 flex items-center gap-1"><Coins className="w-3 h-3" /> Credits</p>
                            <p className="text-gray-300 font-semibold">{preview.credits.toLocaleString()}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-600">
                          {mode === 'new' ? 'Start a fresh dispatch career in this slot.' : 'No campaign saved here yet.'}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-3 gap-2">
                        <span className="text-[9px] text-gray-600 font-mono">
                          {info.exists && preview ? gameClockLabel(preview.gameMinutes) : '—'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {info.exists && (
                            <>
                              <button
                                onClick={async () => {
                                  if (mode === 'new' && !showOverwriteConfirm) {
                                    setConfirmOverwrite(info.slot);
                                    return;
                                  }
                                  if (mode === 'new' && showOverwriteConfirm) {
                                    setConfirmOverwrite(null);
                                    onClose();
                                    onStartNew(info.slot);
                                    return;
                                  }
                                  onClose();
                                  onLoad(info.slot);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-dispatch-cyan/20 border border-dispatch-cyan/40 text-dispatch-cyan text-[11px] font-bold hover:bg-dispatch-cyan/30 disabled:opacity-40 transition-colors"
                              >
                                {mode === 'load' ? 'Load' : showOverwriteConfirm ? 'Overwrite?' : 'Overwrite'}
                              </button>
                              {showDeleteConfirm ? (
                                <button
                                  onClick={() => void handleDelete(info.slot)}
                                  disabled={deleting}
                                  className="px-2 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-bold hover:bg-red-500/30 disabled:opacity-40"
                                >
                                  {deleting ? '…' : 'Confirm'}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(info.slot)}
                                  title="Delete save"
                                  className="p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/40 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                          {!info.exists && mode === 'new' && (
                            <button
                              onClick={() => { onClose(); onStartNew(info.slot); }}
                              className="px-3 py-1.5 rounded-lg bg-dispatch-green/20 border border-dispatch-green/40 text-dispatch-green text-[11px] font-bold hover:bg-dispatch-green/30 transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Start Here
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <p className="text-center text-[10px] text-gray-600 mt-5 flex items-center justify-center gap-1.5">
              <Play className="w-3 h-3" /> Continue resumes your current slot · autosave runs every minute
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
