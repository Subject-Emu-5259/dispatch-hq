// ============================================
// Dispatch HQ — Alliance Unit Loans
// ============================================
// Phase 4 of the v1.0 co-op endgame: lend units to alliance members temporarily.
// Shows active loans, loan creation form with member picker, and countdown timers.

import { useState, useEffect, useCallback } from 'react';
import {
  fetchLoans,
  createLoan,
  returnLoan,
  recallLoan,
  type AllianceLoanEntry,
} from '@/lib/apiClient';

interface AllianceLoansProps {
  currentPlayerId: string;
  members: Array<{ playerId: string; username: string; level: number }>;
  memberRole: string;
  /** Pre-fill the unit type selector (e.g. when clicking "Lend to Ally" from the Unit Roster) */
  prefillType?: string | null;
  /** Called when prefillType is consumed so the parent can clear it */
  onPrefillConsumed?: () => void;
}

// ── Unit types available for lending ──────────────────────────────────────────
const UNIT_TYPES = [
  { type: 'Engine', emoji: '🚒', label: 'Fire Engine' },
  { type: 'Ladder', emoji: '🧯', label: 'Ladder Truck' },
  { type: 'Rescue', emoji: '🚐', label: 'Rescue Unit' },
  { type: 'EMS', emoji: '🚑', label: 'Ambulance' },
  { type: 'Squad', emoji: '🚔', label: 'Police Squad' },
  { type: 'Patrol', emoji: '🚓', label: 'Patrol Car' },
  { type: 'Helicopter', emoji: '🚁', label: 'Helicopter' },
  { type: 'Hazmat', emoji: '☢️', label: 'Hazmat Unit' },
];

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function AllianceLoans({ currentPlayerId, members, memberRole, prefillType, onPrefillConsumed }: AllianceLoansProps) {
  const [loans, setLoans] = useState<AllianceLoanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Loan creation form
  const [borrowerId, setBorrowerId] = useState('');
  const [unitType, setUnitType] = useState('');
  const [unitName, setUnitName] = useState('');
  const [duration, setDuration] = useState('120');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Countdown refresh
  const [, setTick] = useState(0);

  const otherMembers = members.filter((m) => m.playerId !== currentPlayerId);

  const load = useCallback(async () => {
    try {
      const res = await fetchLoans();
      setLoans(res.loans ?? []);
    } catch {
      // Silently fail — loans might not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply prefill from parent (e.g. "Lend to Ally" from Unit Roster)
  useEffect(() => {
    if (prefillType) {
      setUnitType(prefillType);
      onPrefillConsumed?.();
    }
  }, [prefillType, onPrefillConsumed]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tick every 30s for countdown
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const myLoans = loans.filter(
    (l) => l.lenderId === currentPlayerId || l.borrowerId === currentPlayerId,
  );
  const lentOut = myLoans.filter((l) => l.lenderId === currentPlayerId);
  const borrowed = myLoans.filter((l) => l.borrowerId === currentPlayerId);

  const handleCreate = async () => {
    if (!borrowerId) {
      setError('Select a borrower');
      return;
    }
    if (!unitType) {
      setError('Select a unit type');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await createLoan({
        borrowerId,
        unitType,
        unitName: unitName || undefined,
        durationMinutes: parseInt(duration, 10) || 120,
      });
      const loan = res.loan;
      setSuccess(
        `Loaned ${loan.unitType}${loan.unitName ? ` "${loan.unitName}"` : ''} to ${loan.borrowerName} for ${loan.durationMinutes}min!`,
      );
      setBorrowerId('');
      setUnitType('');
      setUnitName('');
      setDuration('120');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create loan');
    } finally {
      setCreating(false);
    }
  };

  const handleReturn = async (loanId: string) => {
    try {
      await returnLoan(loanId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to return loan');
    }
  };

  const handleRecall = async (loanId: string) => {
    try {
      await recallLoan(loanId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recall loan');
    }
  };

  const canLoan = members.length >= 2; // need at least one other member

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
        <span>🔄</span>
        <span>Unit Loans</span>
        {myLoans.length > 0 && (
          <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
            {myLoans.length} active
          </span>
        )}
      </div>

      {/* Create loan form */}
      {canLoan && (
        <div className="space-y-2 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-xs text-white/50 uppercase tracking-wider">Lend a Unit</div>

          {/* Borrower picker */}
          <select
            value={borrowerId}
            onChange={(e) => setBorrowerId(e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="">Select borrower…</option>
            {otherMembers.map((m) => (
              <option key={m.playerId} value={m.playerId}>
                {m.username} (Lv.{m.level})
              </option>
            ))}
          </select>

          {/* Unit type */}
          <select
            value={unitType}
            onChange={(e) => setUnitType(e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="">Select unit type…</option>
            {UNIT_TYPES.map((u) => (
              <option key={u.type} value={u.type}>
                {u.emoji} {u.label}
              </option>
            ))}
          </select>

          {/* Unit name (optional) */}
          <input
            type="text"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder="Unit name (optional)"
            className="w-full bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/30"
          />

          {/* Duration */}
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="120">2 hours (default)</option>
            <option value="240">4 hours (max)</option>
          </select>

          {/* Error/success */}
          {error && <div className="text-xs text-red-400">{error}</div>}
          {success && <div className="text-xs text-green-400">{success}</div>}

          <button
            onClick={() => void handleCreate()}
            disabled={creating || !borrowerId || !unitType}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium py-1.5 rounded transition-colors"
          >
            {creating ? 'Creating…' : '🔄 Lend Unit'}
          </button>
        </div>
      )}

      {/* Borrowed units */}
      {borrowed.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-white/50 uppercase tracking-wider">Borrowed Units</div>
          {borrowed.map((loan) => (
            <div
              key={loan.id}
              className="flex items-center justify-between p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg"
            >
              <div className="text-sm">
                <span className="text-blue-300 font-medium">{loan.unitType}</span>
                {loan.unitName && <span className="text-white/50"> "{loan.unitName}"</span>}
                <span className="text-white/40"> from {loan.lenderName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-300 tabular-nums">
                  ⏱ {formatCountdown(loan.expiresAt)}
                </span>
                <button
                  onClick={() => void handleReturn(loan.id)}
                  className="text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 px-2 py-0.5 rounded"
                >
                  Return
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lent-out units */}
      {lentOut.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-white/50 uppercase tracking-wider">Lent Out</div>
          {lentOut.map((loan) => (
            <div
              key={loan.id}
              className="flex items-center justify-between p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg"
            >
              <div className="text-sm">
                <span className="text-amber-300 font-medium">{loan.unitType}</span>
                {loan.unitName && <span className="text-white/50"> "{loan.unitName}"</span>}
                <span className="text-white/40"> → {loan.borrowerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-300 tabular-nums">
                  ⏱ {formatCountdown(loan.expiresAt)}
                </span>
                {(memberRole === 'officer' || memberRole === 'founder') && (
                  <button
                    onClick={() => void handleRecall(loan.id)}
                    className="text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 px-2 py-0.5 rounded"
                  >
                    Recall
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No loans state */}
      {!loading && myLoans.length === 0 && (
        <div className="text-center py-4 text-sm text-white/30">
          No active loans. Lend a unit to an alliance member!
        </div>
      )}

      {loading && (
        <div className="text-center py-4 text-sm text-white/30">Loading loans…</div>
      )}
    </div>
  );
}
