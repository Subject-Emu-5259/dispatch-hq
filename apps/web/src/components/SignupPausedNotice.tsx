// ============================================
// Dispatch HQ — Signup Paused Notice
// ============================================
// Shown on the register form and the guest-upgrade card while the founder's
// new-signup gate is CLOSED. Polls the PUBLIC /auth/signup-status endpoint
// (not founder-gated) so any visitor sees the pause message; when the founder
// armed an auto-reopen, shows a live countdown to it. Fetches on mount and
// re-checks on an interval so the notice appears/disappears without a reload.
//
// Renders null while signups are open.

import { useEffect, useState } from 'react';
import { fetchSignupStatus } from '@/lib/apiClient';

const POLL_MS = 30_000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'any moment now';
  const totalSec = Math.max(1, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function SignupPausedNotice({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<{ open: boolean; reopensAt: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const s = await fetchSignupStatus();
        if (mounted) {
          setStatus(s);
          setNow(Date.now());
        }
      } catch {
        // Offline / server hiccup — leave the notice hidden; the register
        // attempt itself will surface a real error if signups are closed.
      }
    };
    void check();
    const iv = setInterval(() => {
      void check();
      setNow(Date.now());
    }, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  if (!status || status.open) return null;

  const countdown = status.reopensAt ? formatCountdown(new Date(status.reopensAt).getTime() - now) : null;

  if (compact) {
    return (
      <p className="text-[10px] text-amber-400/90 leading-snug">
        <span className="font-semibold">New signups are temporarily paused.</span>{' '}
        {countdown
          ? <>Reopens in <span className="font-mono font-bold text-amber-300">{countdown}</span>.</>
          : 'Please check back later.'}
      </p>
    );
  }

  return (
    <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
      <p className="text-[11px] text-amber-300 leading-snug">
        <span className="font-bold uppercase tracking-wider text-[9px]">Signups paused</span>
        <br />
        New account creation is temporarily closed.
        {countdown
          ? <> Signups reopen in <span className="font-mono font-bold text-amber-200">{countdown}</span>.</>
          : ' Please check back later.'}
      </p>
    </div>
  );
}
