// ============================================
// Dispatch HQ — Shared Radio Message Event Bus
// ============================================
// Lets any component post radio traffic to the Radio Comms panel.

import type { DialogueMessage } from '@/lib/radioDialogueEngine';

export interface RadioMessageEvent {
  from: string;
  to?: string | 'all';
  text: string;
  type: 'dispatch' | 'unit' | 'broadcast' | 'system';
  service?: 'police' | 'fire' | 'ems';
  sequence?: DialogueMessage[];
  dispatchKey?: string;
  fromUnitId?: string;
  toUnitId?: string;
}

const dispatchedKeys = new Set<string>();

export function broadcastRadioMessage(msg: RadioMessageEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('radio-message', { detail: msg }));
}

/** Broadcast an entire conversation sequence in real-time. */
export function broadcastRadioSequence(sequence: DialogueMessage[], dispatchKey?: string) {
  broadcastRadioMessage({ from: 'Dispatch', to: 'all', text: '', type: 'system', sequence, dispatchKey });
}

/** Deduplicate a keyed dispatch event (e.g. one radio assignment per unit+mission). */
export function broadcastRadioOnce(key: string, msg: RadioMessageEvent) {
  if (dispatchedKeys.has(key)) return;
  dispatchedKeys.add(key);
  broadcastRadioMessage({ ...msg, dispatchKey: key });
}

export function clearRadioDispatchKey(key?: string) {
  if (key) dispatchedKeys.delete(key);
  else dispatchedKeys.clear();
}

export function wasRadioKeyDispatched(key: string) {
  return dispatchedKeys.has(key);
}

export function markRadioKeyDispatched(key: string) {
  dispatchedKeys.add(key);
}
