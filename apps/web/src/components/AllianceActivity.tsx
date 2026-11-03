// ============================================
// Dispatch HQ — Alliance Activity Feed
// ============================================
// Phase 5 of the v1.0 co-op endgame: a unified timeline of alliance resource
// events (treasury deposits, gifts, station builds, loans). Shows a reverse-
// chronological feed with icons, player names, and timestamps.

import { useState, useEffect, useCallback } from 'react';
import { fetchActivity, type ActivityEvent } from '@/lib/apiClient';

interface AllianceActivityProps {
  currentPlayerId: string;
}

// ── Event type → icon + color mapping ────────────────────────────────────────
const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  treasury_deposit:  { icon: '💰', color: 'text-green-400', bg: 'bg-green-500/10' },
  treasury_withdraw: { icon: '💸', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  gift_sent:         { icon: '🎁', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  gift_received:     { icon: '🎁', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  station_built:     { icon: '🏗️', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  station_upgraded:  { icon: '⬆️', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  station_claimed:   { icon: '🏠', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  loan_created:      { icon: '🔄', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  loan_returned:     { icon: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  loan_recalled:     { icon: '⏪', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  loan_expired:      { icon: '⏰', color: 'text-red-400', bg: 'bg-red-500/10' },
};

function formatTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function AllianceActivity({ currentPlayerId }: AllianceActivityProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const LIMIT = 30;

  const load = useCallback(async (reset = false) => {
    const offset = reset ? 0 : page * LIMIT;
    try {
      const res = await fetchActivity(LIMIT, offset);
      const newEvents = res.events ?? [];
      setEvents((prev) => (reset ? newEvents : [...prev, ...newEvents]));
      setHasMore(offset + LIMIT < (res.total ?? 0));
      if (reset) setPage(0);
    } catch {
      // Silently fail — activity might not exist yet
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => void load(true), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const loadMore = () => {
    setPage((p) => p + 1);
    void load(false);
  };

  if (loading && events.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <span>📋</span>
          <span>Activity Feed</span>
        </div>
        <p className="text-xs text-gray-500 text-center py-8">Loading activity…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <span>📋</span>
          <span>Activity Feed</span>
        </div>
        <p className="text-xs text-gray-500 text-center py-8">No activity yet. Start using alliance features to see events here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <span>📋</span>
          <span>Activity Feed</span>
          <span className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full">
            {events.length} events
          </span>
        </div>
        <button
          onClick={() => void load(true)}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Timeline */}
      <div className="space-y-1 relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-white/5" />

        {events.map((event) => {
          const config = EVENT_CONFIG[event.eventType] ?? { icon: '•', color: 'text-gray-400', bg: 'bg-gray-500/10' };
          const isOwn = event.playerId === currentPlayerId;
          return (
            <div
              key={event.id}
              className={`relative flex items-start gap-3 p-2 rounded-lg transition-colors hover:bg-white/[0.02] ${isOwn ? 'bg-white/[0.02]' : ''}`}
            >
              {/* Icon badge */}
              <div className={`relative z-10 w-8 h-8 rounded-full ${config.bg} flex items-center justify-center text-sm flex-shrink-0`}>
                {config.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-300 leading-tight">
                  <span className={`font-semibold ${isOwn ? 'text-blue-400' : 'text-white/80'}`}>
                    {event.playerName}
                  </span>
                  {' '}
                  <span className="text-gray-400">{event.summary}</span>
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  {formatTimeAgo(event.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full text-center text-[11px] text-gray-500 hover:text-gray-300 py-2 transition-colors"
        >
          Load more…
        </button>
      )}
    </div>
  );
}
