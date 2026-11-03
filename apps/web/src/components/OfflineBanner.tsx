// ============================================
// Dispatch HQ — Offline Banner + Queued-Save Indicator (Batch 3d polish)
// ============================================
// No navigator.onLine handling existed in either edition: offline play
// degraded to mirror + retry toasts only. This banner listens to the
// real online/offline events and counts queued saves (the save system
// dispatches dhq-save-queued on an offline failure).

import { useEffect, useState } from 'react';
import { SAVE_QUEUED_EVENT } from '@/lib/saveFailure';

export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const goOnline = () => { setOnline(true); setQueued(0); };
    const goOffline = () => setOnline(false);
    const onQueued = () => setQueued((q) => q + 1);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener(SAVE_QUEUED_EVENT, onQueued);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener(SAVE_QUEUED_EVENT, onQueued);
    };
  }, []);

  if (online && queued === 0) return null;
  return (
    <div className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-[11px] text-amber-200">
      <span>📡</span>
      {online
        ? <span>Back online — queued saves will retry.</span>
        : <span>You&apos;re offline — progress is kept in this browser{queued > 0 ? ` · ${queued} save${queued === 1 ? '' : 's'} queued` : ''}.</span>}
    </div>
  );
}
