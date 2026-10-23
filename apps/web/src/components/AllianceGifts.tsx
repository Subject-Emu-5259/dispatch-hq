// ============================================
// Dispatch HQ — Alliance Credit Gifting
// ============================================
// Phase 2 of the v1.0 co-op endgame: send credits to alliance members with
// daily caps, gift messages, and a recent gift feed.

import { useState, useEffect, useCallback } from 'react';
import {
  sendGift,
  fetchGifts,
  fetchGiftCap,
  type GiftEntry,
} from '@/lib/apiClient';

interface AllianceGiftsProps {
  /** Current player's id — used to exclude self from the member picker. */
  currentPlayerId: string;
  /** Alliance members from the parent Alliance panel (name + id). */
  members: Array<{ playerId: string; username: string; level: number }>;
}

const GIFT_REASONS: Record<string, { emoji: string; label: string }> = {
  gift: { emoji: '🎁', label: 'Gift' },
};

export function AllianceGifts({ currentPlayerId, members }: AllianceGiftsProps) {
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [cap, setCap] = useState<{ dailyCap: number; used: number; remaining: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const otherMembers = members.filter((m) => m.playerId !== currentPlayerId);

  const load = useCallback(async () => {
    try {
      const [giftsRes, capRes] = await Promise.all([
        fetchGifts(20),
        fetchGiftCap(),
      ]);
      setGifts(giftsRes.gifts ?? []);
      setCap(capRes);
    } catch {
      // Silently fail — gifts might not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSend = async () => {
    const amt = parseInt(amount, 10);
    if (!receiverId) { setError('Select a recipient'); return; }
    if (isNaN(amt) || amt < 100) { setError('Minimum gift is 100 credits'); return; }
    if (amt > 50000) { setError('Maximum gift is 50,000 credits'); return; }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await sendGift(receiverId, amt, message || undefined);
      setSuccess(`Sent ${result.sent.toLocaleString()} credits to ${result.receiverName}!`);
      setAmount('');
      setMessage('');
      setReceiverId('');
      // Refresh gifts and cap
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send gift');
    } finally {
      setSending(false);
    }
  };

  const capPercent = cap ? Math.min(100, (cap.used / cap.dailyCap) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Daily Cap */}
      {cap && (
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Daily Gift Cap</span>
            <span>{cap.remaining.toLocaleString()} remaining</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${capPercent}%`,
                backgroundColor: capPercent > 80 ? '#ef4444' : capPercent > 50 ? '#f59e0b' : '#22c55e',
              }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1 text-right">
            {cap.used.toLocaleString()} / {cap.dailyCap.toLocaleString()} credits today
          </div>
        </div>
      )}

      {/* Send Gift Form */}
      <div className="bg-gray-800/50 rounded-lg p-3 space-y-3">
        <h4 className="text-sm font-medium text-white">Send Credits</h4>

        {/* Recipient Picker */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Recipient</label>
          <select
            value={receiverId}
            onChange={(e) => setReceiverId(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Select alliance member…</option>
            {otherMembers.map((m) => (
              <option key={m.playerId} value={m.playerId}>
                {m.username} (Lv.{m.level})
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Amount (credits)</label>
          <input
            type="number"
            min={100}
            max={50000}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100 – 50,000"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Quick Amounts */}
        <div className="flex gap-2">
          {[100, 500, 1000, 5000, 10000].map((q) => (
            <button
              key={q}
              onClick={() => setAmount(String(q))}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 py-1 rounded transition-colors"
            >
              {q >= 1000 ? `${q / 1000}K` : q}
            </button>
          ))}
        </div>

        {/* Message */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Message (optional)</label>
          <input
            type="text"
            maxLength={200}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Good luck, Commander!"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Status Messages */}
        {error && (
          <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2">{error}</div>
        )}
        {success && (
          <div className="text-green-400 text-xs bg-green-900/20 rounded px-3 py-2">{success}</div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={sending || !receiverId || !amount}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded transition-colors"
        >
          {sending ? 'Sending…' : '🎁 Send Gift'}
        </button>
      </div>

      {/* Recent Gifts */}
      <div className="bg-gray-800/50 rounded-lg p-3">
        <h4 className="text-sm font-medium text-white mb-2">Recent Gifts</h4>
        {loading ? (
          <div className="text-xs text-gray-400 py-2">Loading…</div>
        ) : gifts.length === 0 ? (
          <div className="text-xs text-gray-500 py-2">No gifts sent yet. Be the first!</div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {gifts.map((g) => {
              const reason = GIFT_REASONS[g.id] ?? GIFT_REASONS.gift;
              return (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className="text-lg">{reason.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white font-medium">{g.senderName}</span>
                    <span className="text-gray-400"> → </span>
                    <span className="text-white font-medium">{g.receiverName}</span>
                    <span className="text-yellow-400 ml-1">{g.amount.toLocaleString()} cr</span>
                  </div>
                  <span className="text-gray-500 whitespace-nowrap">
                    {new Date(g.createdAt).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
