// ============================================
// Dispatch HQ — Collapsible Sidebar
// ============================================

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Plus, Building2,
  Flame, Truck, Radio, ChevronDown, ChevronUp,
  Shield, AlertTriangle,
  Trophy, MessageSquare, Crown, Send, User,
  Copy, RefreshCw, UserX, Lock, Handshake, Landmark,
} from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { wsClient } from '@/lib/wsClient';
import { chatLineMatchesFilter, type ChatFilter } from '@/lib/chatFilter';
import { fetchFriendLeaderboard, fetchMyAlliance, createAlliance, joinAlliance, leaveAlliance, fetchAllianceDirectory, fetchAllianceChat, postAllianceChat, getAllianceInvite, regenerateAllianceInvite, joinAllianceByCode, kickAllianceMember, setAllianceMemberRole, transferAllianceLeadership, updateAllianceListing, requestAllianceJoin, fetchAllianceJoinRequests, approveAllianceJoin, rejectAllianceJoin, fetchAllianceLeaderboard, fetchAllianceLeaderboardDetail, fetchSeasonalLeaderboard, type FriendLeaderboardResponse, type FriendLeaderboardEntry, type AllianceSummary, type AllianceDirectoryEntry, type AllianceJoinRequest, type AllianceLeaderboardResponse, type AllianceLeaderboardDetail, type SeasonalContestResponse, type SeasonalContestEntry } from '@/lib/apiClient';
import { relevantSeasonalEvent, seasonalStatus, seasonalWindowLabel, SEASONAL_EVENTS, type SeasonalEvent } from '@/lib/seasonal';
import { missionService } from '@/lib/rewards';
import type { Station, Unit } from '@dispatch-hq/shared';
import { MissionCard } from './MissionCard';
import { UnitPanel } from './UnitPanel';
import { FOUNDER_EMAIL } from '@/lib/founder';
// On-demand modal is code-split (v0.22.3 perf pass) — only mounts while open.
const StationDetailModal = lazy(() => import('./StationDetailModal').then((m) => ({ default: m.StationDetailModal })));
import { STATION_CONFIGS, STATION_LEVELS, UNIT_CONFIGS, perkAdjustedRadius } from '@dispatch-hq/shared';
import { stationUnitsFor, resolveUnitPurchase } from '@/lib/unitPurchase';
import { getUnitMaxSpeedMph, getUnitCostMultiplier, getEliteStatMultiplier, getStationBuildCostMultiplier } from '@/lib/techTree';
import { ALLIANCE_LEVELS, ALLIANCE_MIN_LEVEL, allianceLevelFor, allianceProgress, nextAllianceLevel } from '@dispatch-hq/shared';
import { levelProgress, lifetimeXpOf } from '@/utils/levelProgress';
import { useNotifications } from './NotificationCenter';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeSection?: Section;
  onSelectUnit?: (unit: Unit) => void;
}

type Section = 'stations' | 'missions' | 'units' | 'employees' | 'leaderboard' | 'chat' | 'alliance';

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  type: 'system' | 'user' | 'dispatch' | 'psa' | 'notice' | 'message';
  timestamp: number;
}

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  level: number;
  xp: number;
  /** Real lifetime XP (curve total to reach the level + remainder). */
  lifetimeXp?: number;
  credits: number;
  missionsCompleted: number;
  mutualAidAnswered?: number;
}

function leaderboardAvatar(seed: string, index: number): string {
  const icons = ['👨‍🚒', '👩‍🚒', '🧑‍🚒', '🚒', '🔥', '🚨', '💨', '🪜', '👮', '🚑'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return icons[(hash + index) % icons.length];
}


export function Sidebar({ isOpen, onToggle, activeSection, onSelectUnit }: SidebarProps) {
  const {
    stations, missions, setBuildModalOpen, setBuildPoiModalOpen, player, units,
    addUnit, updateStation, updatePlayer, selectedService,
    myAlliance, setMyAlliance, showAlliesOnMap, setShowAlliesOnMap,
    onlineCount,
  } = useGameStore();
  const { addNotification } = useNotifications();
  const { levelXp, xpForNext, atMaxLevel } = levelProgress(player);

  const [expandedSection, setExpandedSection] = useState<Section | null>(activeSection || 'missions');
  const [buyingForStation, setBuyingForStation] = useState<string | null>(null);
  const [viewingStation, setViewingStation] = useState<Station | null>(null);
  const [, setUpgradingStation] = useState<string | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'Dispatch HQ',
      text: '📡 Dispatch Center online. All units standing by for calls.',
      type: 'system',
      timestamp: Date.now(),
    },
  ]);

  // Load recent chat history from the server (Phase 3 persistent chat).
  useEffect(() => {
    let mounted = true;
    fetch('/api/chat?room=global&limit=50', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then(({ messages }: { messages?: any[] }) => {
        if (mounted && messages && messages.length > 0) {
          const mapped: ChatMessage[] = messages
            .filter((m) => m.id && !seenChatIds.current.has(m.id))
            .map((m) => { seenChatIds.current.add(m.id); return {
              id: m.id,
              sender: m.senderName || 'Commander',
              text: m.text,
              type: m.type === 'system' || m.type === 'user' || m.type === 'dispatch' || m.type === 'psa' || m.type === 'notice' || m.type === 'message' ? m.type : 'user',
              timestamp: new Date(m.createdAt).getTime(),
            }; });
          setChatMessages((prev) => [...mapped, ...prev.filter((m) => m.id !== 'welcome')]);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);
  const [chatInput, setChatInput] = useState('');
  // Public chat filter (v0.22.x): All / Players only / HQ only — hides or
  // isolates system-style lines (System, Dispatch, PSA, Notice, Dispatch HQ)
  // without removing them from the feed. Session-local; the feed itself is
  // never mutated, so widening the filter brings everything back.
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardSort, setLeaderboardSort] = useState<'xp' | 'credits' | 'missions' | 'mutual_aid'>('xp');
  const [leaderboardTab, setLeaderboardTab] = useState<'global' | 'friends' | 'alliances' | 'seasonal'>('global');
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [friendBoardError, setFriendBoardError] = useState(false);
  const [friendBoardRefresh, setFriendBoardRefresh] = useState(0);
  const [allianceBoard, setAllianceBoard] = useState<AllianceLeaderboardResponse | null>(null);
  const [seasonalBoard, setSeasonalBoard] = useState<SeasonalContestResponse | null>(null);
  const [seasonalBoardError, setSeasonalBoardError] = useState(false);
  const [seasonalBoardRefresh, setSeasonalBoardRefresh] = useState(0);
  const [allianceBoardSort, setAllianceBoardSort] = useState<'xp' | 'weekly'>('xp');
  const [allianceBoardError, setAllianceBoardError] = useState(false);
  const [expandedAllianceId, setExpandedAllianceId] = useState<string | null>(null);
  const [allianceDetail, setAllianceDetail] = useState<AllianceLeaderboardDetail | null>(null);
  const [allianceDetailLoading, setAllianceDetailLoading] = useState(false);
  // Mirrors expandedAllianceId so a slow detail fetch can't overwrite a newer
  // expansion (two fetches racing would otherwise show the wrong breakdown).
  const expandedAllianceIdRef = useRef<string | null>(null);
  // Alliance state
  const [allianceDirectory, setAllianceDirectory] = useState<AllianceDirectoryEntry[]>([]);
  const [allianceChat, setAllianceChat] = useState<Array<{ id: string; senderName: string; text: string; createdAt: string }>>([]);
  // Read receipts: messageId → readerIds whose clients confirmed delivery.
  // A non-empty set turns the sender's ✓ into ✓✓ (only counts other members).
  // Ephemeral live WS state by design: it never reconciles with the 8s poll,
  // so after a reload past confirmations show only ✓, and messages sent via
  // the REST fallback can't reach ✓✓ (recipients get those via poll, no ack).
  const [chatReceipts, setChatReceipts] = useState<Map<string, Set<string>>>(new Map());
  // Typing presence: playerId → display name + expiry; live entries render
  // as 'X is typing…' until the idle timeout expires (or they send a message).
  const [typers, setTypers] = useState<Map<string, { name: string; until: number }>>(new Map());
  const [allianceChatInput, setAllianceChatInput] = useState('');
  const [allianceNameInput, setAllianceNameInput] = useState('');
  const [allianceTagInput, setAllianceTagInput] = useState('');
  const [allianceJoinInput, setAllianceJoinInput] = useState('');
  const [allianceBusy, setAllianceBusy] = useState(false);
  const [allianceError, setAllianceError] = useState<string | null>(null);
  const [allianceInviteCode, setAllianceInviteCode] = useState<string | null>(null);
  const [allianceJoinCodeInput, setAllianceJoinCodeInput] = useState('');
  // Debounce WS sends so a same-frame double-click can't fire twice.
  const lastAllianceSendAt = useRef(0);
  // Throttle typing events (~1.5s) — keystrokes are frequent, the wire isn't.
  const lastAllianceTypingAt = useRef(0);
  // Recruitment board state
  const [allianceRequests, setAllianceRequests] = useState<AllianceJoinRequest[]>([]);
  const [listingDesc, setListingDesc] = useState('');
  const [listingMinLevel, setListingMinLevel] = useState(1);
  const [listingRecruiting, setListingRecruiting] = useState(false);
  const [listingDirty, setListingDirty] = useState(false);
  // Mirrors listingDirty for the 8s poll closure (refs stay fresh; state would
  // be stale) so a healthy poll never resets in-progress listing edits.
  const listingDirtyRef = useRef(false);
  // Unread alliance chat: live messages that arrived while the panel was
  // closed show a badge on the section header until it's opened.
  const [allianceUnread, setAllianceUnread] = useState(0);
  const allianceUnreadRef = useRef(0);
  // Unread global chat — same pattern as alliance, plus a toast when the whole
  // sidebar is closed so a message is never missed entirely.
  const [chatUnread, setChatUnread] = useState(0);
  const chatUnreadRef = useRef(0);
  const expandedSectionRef = useRef(expandedSection);
  useEffect(() => { expandedSectionRef.current = expandedSection; }, [expandedSection]);
  // Fresh sidebar visibility for the []-deps WS listener (toast only when the
  // sidebar is fully closed).
  const sidebarOpenRef = useRef(isOpen);
  useEffect(() => { sidebarOpenRef.current = isOpen; }, [isOpen]);
  // Fresh username for the []-deps WS listener (own-message echoes must not
  // count as unread).
  const usernameRef = useRef(player?.username);
  useEffect(() => { usernameRef.current = player?.username; }, [player?.username]);
  // Fresh player id for the []-deps WS listener (self-receipts never count
  // toward ✓✓ — even your own second tab acking your message).
  const playerIdRef = useRef(player?.id);
  useEffect(() => { playerIdRef.current = player?.id; }, [player?.id]);

  // Alliances unlock at Level ALLIANCE_MIN_LEVEL — founder is always exempt.
  const isFounder = player?.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
  const allianceUnlocked = isFounder || (player?.level ?? 0) >= ALLIANCE_MIN_LEVEL;
  const seenChatIds = useRef<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const allianceChatEndRef = useRef<HTMLDivElement>(null);

  // Load alliance membership + directory + chat when the section opens, and
  // poll chat so members see each other's messages live while the panel is open.
  useEffect(() => {
    if (expandedSection !== 'alliance') return;
    // Opening the panel counts everything as read.
    allianceUnreadRef.current = 0;
    setAllianceUnread(0);
    let cancelled = false;
    const loadAll = () => {
      Promise.all([fetchMyAlliance(), fetchAllianceDirectory().catch(() => [] as AllianceDirectoryEntry[])])
        .then(([mine, directory]) => {
          if (cancelled) return;
          setAllianceError(null); // a healthy refresh clears any stale error
          setMyAlliance(mine.alliance);
          setAllianceDirectory(directory);
          if (mine.alliance) {
            getAllianceInvite()
              .then((inv) => { if (!cancelled) setAllianceInviteCode(inv.code); })
              .catch(() => {});
            const myMember = mine.alliance.members?.find((m) => m.playerId === player?.id);
            const myRole = myMember?.role ?? 'member';
            if (myRole === 'leader' && !listingDirtyRef.current) {
              setListingDesc(mine.alliance.description ?? '');
              setListingMinLevel(mine.alliance.minLevel ?? 1);
              setListingRecruiting(Boolean(mine.alliance.recruiting));
            }
            if (myRole === 'leader' || myRole === 'officer') {
              fetchAllianceJoinRequests()
                .then((requests) => { if (!cancelled) setAllianceRequests(requests); })
                .catch(() => {});
            } else {
              setAllianceRequests([]);
            }
            return fetchAllianceChat()
              .then((chat) => {
                if (cancelled) return;
                // Merge instead of replacing so a WS-delivered message that
                // landed just before this poll response is never clobbered;
                // the poll copy wins on id conflicts, then sort chronologically.
                setAllianceChat((prev) => {
                  const incoming = chat.messages ?? [];
                  const byId = new Map<string, any>();
                  for (const m of [...prev, ...incoming]) byId.set(m.id, m);
                  return [...byId.values()].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                  );
                });
                // Hydrate persisted read receipts from the poll so ✓✓ survives
                // reloads and REST-fallback messages reconcile. Self ids are
                // excluded — a receipt can never count the sender, matching
                // the live WS fan-in (playerIdRef guard).
                const myId = player?.id;
                if (myId) {
                  setChatReceipts((prev) => {
                    const incoming = chat.messages ?? [];
                    let next = prev;
                    for (const m of incoming) {
                      const readers = (m.readers ?? []).filter((rid: string) => rid !== myId);
                      if (readers.length === 0) continue;
                      const merged = new Set(prev.get(m.id) ?? []);
                      let changed = false;
                      for (const rid of readers) {
                        if (!merged.has(rid)) { merged.add(rid); changed = true; }
                      }
                      if (!changed) continue;
                      if (next === prev) next = new Map(prev);
                      next.set(m.id, merged);
                    }
                    return next;
                  });
                }
              })
              .catch(() => {});
          }
          setAllianceInviteCode(null);
          return undefined;
        })
        .catch(() => { if (!cancelled) setAllianceError('Could not load alliance data'); });
    };
    loadAll();
    const poll = setInterval(loadAll, 8000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [expandedSection, setMyAlliance]);

  // Auto-scroll chat; opening the visible panel counts everything as read.
  // Reset only while the sidebar is actually open — a hidden panel keeps its
  // unread badge until the player sees it.
  useEffect(() => {
    if (expandedSection === 'chat' && isOpen) {
      chatUnreadRef.current = 0;
      setChatUnread(0);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, expandedSection, isOpen]);

  useEffect(() => {
    if (activeSection) setExpandedSection(activeSection);
  }, [activeSection]);

  const toggleSection = (section: Section) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  // Load live chat messages from WebSocket broadcast layer.
  useEffect(() => {
    const unChat = wsClient.onMessage('chat', (message: any) => {
      if (!message || message.type !== 'chat') return;
      const id = message.id;
      if (!id || seenChatIds.current.has(id)) return;
      seenChatIds.current.add(id);
      // Incoming messages while the Chat section is collapsed count as unread
      // (your own broadcast echo is the exception). If the entire sidebar is
      // closed — no matter which section was expanded in the hidden panel —
      // surface a toast too so a message is never missed.
      if (message.sender !== usernameRef.current) {
        const panelHidden = !sidebarOpenRef.current;
        if (expandedSectionRef.current !== 'chat' || panelHidden) {
          chatUnreadRef.current += 1;
          setChatUnread(chatUnreadRef.current);
        }
        if (panelHidden) {
          addNotification({
            type: 'info',
            title: 'New Chat Message',
            message: `${message.sender || 'Commander'}: ${String(message.text ?? '').slice(0, 80)}`,
            icon: '💬',
            duration: 4000,
          });
        }
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id,
          sender: message.sender || 'Commander',
          text: String(message.text ?? ''),
          type: message.kind === 'psa' || message.kind === 'notice' || message.kind === 'message' ? message.kind : 'user',
          timestamp: new Date(message.timestamp ?? Date.now()).getTime(),
        },
      ]);
    });
    return () => unChat();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The filtered view for the Public Chat list: 'players' keeps only real
  // commander lines, 'hq' keeps only system-style broadcasts, 'all' shows
  // everything. Applied to the last 30 lines like the original render.
  const visibleChat = chatMessages
    .filter((msg) => chatLineMatchesFilter(msg.type, chatFilter))
    .slice(-30);

  // Load global leaderboard from the server.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leaderboard?sort=${leaderboardSort}&limit=50`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then(({ entries }: { entries?: LeaderboardEntry[] }) => {
        if (!cancelled && entries) setLeaderboardEntries(entries);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leaderboardSort]);

  // Load the Friends comparison whenever the Friends tab is opened.
  useEffect(() => {
    if (expandedSection !== 'leaderboard' || leaderboardTab !== 'friends') return;
    let cancelled = false;
    setFriendBoardError(false);
    setFriendLeaderboard(null);
    fetchFriendLeaderboard()
      .then((data) => { if (!cancelled) setFriendLeaderboard(data); })
      .catch(() => { if (!cancelled) setFriendBoardError(true); });
    return () => { cancelled = true; };
  }, [expandedSection, leaderboardTab, friendBoardRefresh]);

  // Load the Alliance board whenever the tab opens or its sort changes.
  useEffect(() => {
    if (expandedSection !== 'leaderboard' || leaderboardTab !== 'alliances') return;

    let cancelled = false;
    setAllianceBoardError(false);
    setAllianceBoard(null);
    fetchAllianceLeaderboard(allianceBoardSort)
      .then((data) => { if (!cancelled) setAllianceBoard(data); })
      .catch(() => { if (!cancelled) setAllianceBoardError(true); });
    return () => { cancelled = true; };
  }, [expandedSection, leaderboardTab, allianceBoardSort]);

  // Load the Seasonal contest board for the relevant event when the tab opens.
  useEffect(() => {
    if (expandedSection !== 'leaderboard' || leaderboardTab !== 'seasonal') return;
    const ev = relevantSeasonalEvent();
    if (!ev || seasonalStatus(ev) === 'upcoming') {
      setSeasonalBoard(null);
      setSeasonalBoardError(false);
      return;
    }
    let cancelled = false;
    setSeasonalBoardError(false);
    setSeasonalBoard(null);
    fetchSeasonalLeaderboard(ev.id)
      .then((data) => { if (!cancelled) setSeasonalBoard(data); })
      .catch(() => { if (!cancelled) setSeasonalBoardError(true); });
    return () => { cancelled = true; };
  }, [expandedSection, leaderboardTab, seasonalBoardRefresh]);

  const handleExpandAlliance = async (allianceId: string) => {
    if (expandedAllianceIdRef.current === allianceId) {
      expandedAllianceIdRef.current = null;
      setExpandedAllianceId(null);
      setAllianceDetail(null);
      return;
    }
    expandedAllianceIdRef.current = allianceId;
    setExpandedAllianceId(allianceId);
    setAllianceDetail(null);
    setAllianceDetailLoading(true);
    try {
      const detail = await fetchAllianceLeaderboardDetail(allianceId);
      if (expandedAllianceIdRef.current !== allianceId) return; // expanded something else meanwhile
      setAllianceDetail(detail);
    } catch {
      if (expandedAllianceIdRef.current === allianceId) setExpandedAllianceId(null);
    } finally {
      if (expandedAllianceIdRef.current === allianceId) setAllianceDetailLoading(false);
    }
  };

  const handleSendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !player) return;

    if (wsClient.isConnected()) {
      wsClient.send({ type: 'chat', room: 'global', message: text });
    } else {
      fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: 'global', text }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const serverMessage = data?.message;
          if (serverMessage && serverMessage.id && !seenChatIds.current.has(serverMessage.id)) {
            seenChatIds.current.add(serverMessage.id);
            setChatMessages((prev) => [
              ...prev,
              {
                id: serverMessage.id,
                sender: serverMessage.senderName || player.username || 'Commander',
                text: serverMessage.text,
                type: 'user',
                timestamp: new Date(serverMessage.createdAt ?? Date.now()).getTime(),
              },
            ]);
          }
        });
    }

    setChatInput('');
  }, [chatInput, player]);

  const activeMissions = missions.filter((m) => m.status !== 'completed' && m.status !== 'failed');

  // Board split mirrors the Dispatch Board: the department the player runs vs.
  // Mutual Aid requests (disaster waves, partner agencies) whose calls belong
  // to another service — labeled, never silently mixed into the main queue.
  const mainMissions = selectedService
    ? activeMissions.filter((m) => missionService(m) === selectedService)
    : activeMissions;
  const mutualAidMissions = selectedService
    ? activeMissions.filter((m) => missionService(m) !== selectedService)
    : [];

  const handleCreateAlliance = async () => {
    const name = allianceNameInput.trim();
    if (!name || allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      const res = await createAlliance(name, allianceTagInput.trim());
      setMyAlliance(res.alliance);
      setAllianceNameInput('');
      setAllianceTagInput('');
      setAllianceChat([]);
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not create alliance');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleJoinAlliance = async () => {
    const name = allianceJoinInput.trim();
    if (!name || allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      const res = await joinAlliance(name);
      setMyAlliance(res.alliance);
      setAllianceJoinInput('');
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not join alliance');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleLeaveAlliance = async () => {
    if (allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      await leaveAlliance();
      setMyAlliance(null);
      setAllianceChat([]);
      setChatReceipts(new Map());
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not leave alliance');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleSendAllianceChat = async () => {
    const text = allianceChatInput.trim();
    if (!text || !myAlliance || allianceBusy) return;
    if (wsClient.isConnected()) {
      // Live path: the server persists the message and broadcasts it back to
      // every connected member (sender included), so it renders instantly.
      const now = Date.now();
      if (now - lastAllianceSendAt.current < 300) return;
      lastAllianceSendAt.current = now;
      wsClient.sendAllianceChat(text);
      setAllianceChatInput('');
      return;
    }
    // REST fallback when the socket is down — the next poll reconciles.
    setAllianceBusy(true);
    try {
      await postAllianceChat(text);
      setAllianceChatInput('');
      const chat = await fetchAllianceChat();
      setAllianceChat(chat.messages ?? []);
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not send message');
    } finally {
      setAllianceBusy(false);
    }
  };

  // Broadcast a throttled typing event while the member is composing. The
  // empty-check lives in the input's onChange (it has the fresh value).
  const handleAllianceTyping = useCallback(() => {
    if (!myAlliance) return;
    const now = Date.now();
    if (now - lastAllianceTypingAt.current < 1500) return;
    lastAllianceTypingAt.current = now;
    wsClient.sendAllianceTyping();
  }, [myAlliance]);

  // Live alliance chat over WebSocket: messages arrive instantly instead of
  // on the 8s poll. The server only delivers to members of the sender's
  // alliance, so no client-side membership check is needed; ids dedupe
  // against anything the poll already brought in.
  useEffect(() => {
    const un = wsClient.onMessage('alliance_chat', (msg: any) => {
      if (!msg || msg.type !== 'alliance_chat' || !msg.id) return;
      // Live messages while the panel is closed count as unread (your own
      // broadcast echo is the exception).
      if (expandedSectionRef.current !== 'alliance' && msg.sender !== usernameRef.current) {
        allianceUnreadRef.current += 1;
        setAllianceUnread(allianceUnreadRef.current);
      }
      // Acknowledge delivery so the sender's client can show ✓✓. Your own
      // broadcast echo is never acked (it would be a self-receipt).
      if (msg.sender !== usernameRef.current && msg.allianceId) {
        wsClient.sendAllianceReceipt(msg.id, msg.allianceId);
      }
      // A delivered message means the sender stopped typing — drop their
      // indicator immediately instead of waiting out the idle timeout.
      if (msg.sender) {
        setTypers((prev) => {
          const next = new Map(prev);
          for (const [pid, t] of next) if (t.name === msg.sender) next.delete(pid);
          return next.size === prev.size ? prev : next;
        });
      }
      setAllianceChat((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id,
          senderName: String(msg.sender ?? 'Commander'),
          text: String(msg.text ?? ''),
          createdAt: String(msg.timestamp ?? new Date().toISOString()),
        }];
      });
    });
    return () => un();
  }, []);

  // Read-receipt fan-in: each member's ack is broadcast back through the
  // alliance channel; the sender collects who confirmed per message.
  useEffect(() => {
    const un = wsClient.onMessage('alliance_chat_receipt', (msg: any) => {
      if (!msg || msg.type !== 'alliance_chat_receipt' || !msg.messageId) return;
      if (msg.readerId === playerIdRef.current) return;
      setChatReceipts((prev) => {
        const readers = prev.get(msg.messageId);
        if (readers?.has(msg.readerId)) return prev;
        const next = new Map(prev);
        next.set(msg.messageId, new Set(readers ?? []).add(msg.readerId));
        return next;
      });
    });
    return () => un();
  }, []);

  // Typing presence fan-in: each event refreshes the member's expiry; the
  // stale per-event timeout no-ops (its `until` no longer matches) so a typist
  // who keeps typing is never cut off mid-composition.
  useEffect(() => {
    const timers = new Set<number>();
    const un = wsClient.onMessage('alliance_typing', (msg: any) => {
      if (!msg || msg.type !== 'alliance_typing' || !msg.playerId) return;
      if (msg.playerId === playerIdRef.current) return;
      const until = Date.now() + 3500;
      setTypers((prev) => {
        const next = new Map(prev);
        next.set(msg.playerId, { name: String(msg.username ?? 'Someone'), until });
        return next;
      });
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setTypers((prev) => {
          const cur = prev.get(msg.playerId);
          if (!cur || cur.until !== until) return prev;
          const next = new Map(prev);
          next.delete(msg.playerId);
          return next;
        });
      }, 3600);
      timers.add(timer);
    });
    return () => {
      un();
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);


  const handleJoinByCode = async () => {
    const code = allianceJoinCodeInput.trim().toUpperCase();
    if (!code || allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      const res = await joinAllianceByCode(code);
      setMyAlliance(res.alliance);
      setAllianceJoinCodeInput('');
      getAllianceInvite().then((inv) => setAllianceInviteCode(inv.code)).catch(() => {});
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Invalid invite code');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleRegenerateInvite = async () => {
    if (allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      const inv = await regenerateAllianceInvite();
      setAllianceInviteCode(inv.code);
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not rotate invite code');
    } finally {
      setAllianceBusy(false);
    }
  };

  // After any member action, refresh the alliance (roster + own role) so the
  // panel reflects the new state immediately.
  const refreshAlliance = useCallback(async () => {
    try {
      const mine = await fetchMyAlliance();
      setMyAlliance(mine.alliance);
    } catch { /* keep current state */ }
  }, [setMyAlliance]);

  const handleKickMember = async (targetId: string, username: string) => {
    if (allianceBusy) return;
    if (!window.confirm(`Kick ${username} from the alliance? They will need a new invite to return.`)) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      await kickAllianceMember(targetId);
      await refreshAlliance();
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not kick member');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleSetRole = async (targetId: string, role: 'officer' | 'member') => {
    if (allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      await setAllianceMemberRole(targetId, role);
      await refreshAlliance();
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not change role');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleTransferLeadership = async (targetId: string) => {
    if (allianceBusy) return;
    if (!window.confirm('Transfer leadership to this member? You will become an officer.')) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      await transferAllianceLeadership(targetId);
      await refreshAlliance();
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not transfer leadership');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleUpdateListing = async () => {
    if (allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      const res = await updateAllianceListing({
        description: listingDesc,
        minLevel: listingMinLevel,
        recruiting: listingRecruiting,
      });
      setMyAlliance(res.alliance);
      setListingDirty(false);
      listingDirtyRef.current = false;
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not update listing');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleRequestJoin = async (allianceId: string) => {
    if (allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      await requestAllianceJoin(allianceId);
      setAllianceDirectory((prev) =>
        prev.map((a) => (a.id === allianceId ? { ...a, requested: true } : a)),
      );
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not send request');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleApproveJoin = async (requestId: string) => {
    if (allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      await approveAllianceJoin(requestId);
      setAllianceRequests((prev) => prev.filter((r) => r.id !== requestId));
      await refreshAlliance(); // roster grew — reflect the new member count
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not approve request');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleRejectJoin = async (requestId: string) => {
    if (allianceBusy) return;
    setAllianceBusy(true);
    setAllianceError(null);
    try {
      await rejectAllianceJoin(requestId);
      setAllianceRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err: any) {
      setAllianceError(err?.message ?? 'Could not decline request');
    } finally {
      setAllianceBusy(false);
    }
  };

  const handleBuyUnit = (stationId: string, unitTypeKey: string) => {
    const config = UNIT_CONFIGS[unitTypeKey];
    if (!config || !player) return;

    const station = stations.find(s => s.id === stationId);
    if (!station) return;
    // Correction build: one purchase decision for both buy surfaces. This
    // also fixes a pre-existing gap: Sidebar-bought units never got a
    // jurisdiction (they silently defaulted to city, even for troopers).
    const result = resolveUnitPurchase({
      station,
      unitTypeKey,
      ownerId: player.id,
      credits: player.credits,
      unitCostMultiplier: getUnitCostMultiplier(),
    });
    if (!result.ok) return;
    const cost = result.cost;

    const newUnit = {
      ...result.unit,
      type: unitTypeKey as any,
      position: { ...station.position, lat: station.position.lat + (Math.random() - 0.5) * 0.001, lng: station.position.lng + (Math.random() - 0.5) * 0.001 },
      speed: config.speed * getEliteStatMultiplier(),
      currentSpeed: 0,
      lastPosition: { ...station.position, lat: station.position.lat + (Math.random() - 0.5) * 0.001, lng: station.position.lng + (Math.random() - 0.5) * 0.001 },
      lastPositionAt: Date.now(),
    };

    addUnit(newUnit);
    updateStation(stationId, { unitCount: (station.unitCount || 0) + 1 });
    updatePlayer({ credits: player.credits - cost });
    setBuyingForStation(null);

    addNotification({ type: 'success', title: `${config.name} Purchased`, message: `${config.name} is now stationed`, icon: config.icon, duration: 3000 });
  };

  const handleUpgradeStation = (stationId: string) => {
    const station = stations.find(s => s.id === stationId);
    if (!station || !player) return;

    const currentLevel = station.level;
    const nextLevel = STATION_LEVELS.find(l => l.level === currentLevel + 1);
    if (!nextLevel) return;
    const upgradeCost = Math.round(nextLevel.cost * getStationBuildCostMultiplier());
    if (player.credits < upgradeCost) return;

    updatePlayer({ credits: player.credits - upgradeCost });
    updateStation(stationId, {
      level: nextLevel.level,
      capacity: nextLevel.capacity,
      coverageRadius: perkAdjustedRadius(nextLevel.coverageRadius, station),
    });

    addNotification({ type: 'success', title: `${station.name} Upgraded!`, message: `Now Level ${nextLevel.level} — capacity: ${nextLevel.capacity} units`, icon: '⬆️', duration: 4000 });
    setUpgradingStation(null);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-12 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-16 left-0 z-[40] w-[85vw] max-w-96 bg-gray-900/95 
                       backdrop-blur-md border-r border-gray-800/50 
                       flex flex-col overflow-hidden"
          >
            <div className="p-3 border-b border-gray-800/50 flex items-center justify-between">
              <button
                onClick={onToggle}
                className="p-1.5 rounded-md hover:bg-gray-800 transition-colors"
                title="Close sidebar"
              >
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
              <div className="flex items-center gap-1">
                <Shield className="w-4 h-4 text-dispatch-red" />
                <span className="text-xs font-semibold text-gray-300">Dispatch Center</span>
              </div>
              <div className="w-7" />
            </div>

            <div className="p-3 border-b border-gray-800/50 space-y-2">
              <button
                data-tutorial="build-station"
                onClick={() => setBuildModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 
                           bg-dispatch-red hover:bg-red-700 text-white text-sm font-semibold 
                           rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-red-500/20"
              >
                <Plus className="w-4 h-4" />
                Build Station
              </button>
              <button
                data-tutorial="place-landmark"
                onClick={() => setBuildPoiModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 
                           bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold 
                           border border-gray-700/60 rounded-lg transition-all active:scale-[0.98]"
                title="Hand-place landmarks (schools, parks, the hospital…) that missions anchor to"
              >
                <Landmark className="w-4 h-4" />
                Place Landmark
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <SectionHeader
                title="Active Missions"
                count={mainMissions.length}
                icon={<Radio className="w-4 h-4" />}
                isExpanded={expandedSection === 'missions'}
                onClick={() => toggleSection('missions')}
                accentColor="text-amber-400"
              />
              <AnimatePresence>
                {expandedSection === 'missions' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2">
                      {activeMissions.length === 0 ? (
                        <EmptyState
                          icon={<Flame className="w-6 h-6" />}
                          title="No active missions"
                          subtitle="Build a station to start receiving emergency calls"
                        />
                      ) : (
                        <>
                          {mainMissions.slice(0, 15).map((mission, index) => (
                            <MissionCard key={mission.id} mission={mission} index={index} />
                          ))}
                          {/* Mutual Aid — partner-agency calls (disasters, cross-service) */}
                          {mutualAidMissions.length > 0 && (
                            <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 overflow-hidden">
                              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 border-b border-blue-500/20">
                                <Handshake className="w-3 h-3 text-blue-300 shrink-0" />
                                <p className="text-[11px] font-bold text-blue-200">
                                  Mutual Aid — {mutualAidMissions.length} partner request{mutualAidMissions.length > 1 ? 's' : ''}
                                </p>
                              </div>
                              <div className="p-2 space-y-2">
                                {mutualAidMissions.slice(0, 15).map((mission, index) => (
                                  <MissionCard key={mission.id} mission={mission} index={index} isMutualAid />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <SectionHeader
                title="Stations"
                count={stations.length}
                icon={<Building2 className="w-4 h-4" />}
                isExpanded={expandedSection === 'stations'}
                onClick={() => toggleSection('stations')}
                accentColor="text-dispatch-red"
              />
              <AnimatePresence>
                {expandedSection === 'stations' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2">
                      {stations.length === 0 ? (
                        <EmptyState
                          icon={<Building2 className="w-6 h-6" />}
                          title="No stations yet"
                          subtitle={`Build your first ${selectedService === 'police' ? 'police' : selectedService === 'ems' ? 'EMS' : 'fire'} station to start responding to calls`}
                        />
                      ) : (
                        stations.map((station) => {
                          const config = STATION_CONFIGS[station.type];
                          const isFull = (station.unitCount || 0) >= station.capacity;
                          return (
                            <div key={station.id} className="bg-gray-800/60 rounded-lg border border-gray-700/30 overflow-hidden">
                              <div className="p-3 cursor-pointer hover:bg-gray-800/80 transition-all"
                                   onClick={() => setViewingStation(station)}>
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-dispatch-red/20 flex items-center justify-center shrink-0">
                                    <span className="text-xl">{config?.icon || '🚒'}</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-white truncate">{station.name}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {config?.name || station.type} • Level {station.level}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all ${
                                            isFull ? 'bg-amber-500' : 'bg-dispatch-red'
                                          }`}
                                          style={{ width: `${((station.unitCount || 0) / station.capacity) * 100}%` }}
                                        />
                                      </div>
                                      <span className="text-[11px] text-gray-500">
                                        {station.unitCount || 0}/{station.capacity}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setBuyingForStation(buyingForStation === station.id ? null : station.id); }}
                                    className="p-1.5 rounded-md hover:bg-gray-700/60 transition-colors shrink-0"
                                    title="Station actions"
                                  >
                                    <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${
                                      buyingForStation === station.id ? 'rotate-180' : ''
                                    }`} />
                                  </button>
                                </div>
                              </div>

                              <AnimatePresence>
                                {buyingForStation === station.id && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-gray-700/50 overflow-hidden"
                                  >
                                    <div className="p-2 space-y-1.5">
                                      {station.level < 5 && (() => {
                                        const nextLevel = STATION_LEVELS.find(l => l.level === station.level + 1);
                                        if (!nextLevel) return null;
                                        const canAffordUpgrade = (player?.credits || 0) >= nextLevel.cost;
                                        return (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleUpgradeStation(station.id); }}
                                            disabled={!canAffordUpgrade}
                                            className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-left transition-colors mb-1 ${
                                              canAffordUpgrade ? 'bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30' : 'opacity-40 cursor-not-allowed'
                                            }`}
                                          >
                                            <span className="text-sm">⬆️</span>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[11px] text-purple-300 font-medium">Upgrade to Level {nextLevel.level}</p>
                                              <p className="text-[11px] text-gray-500">Capacity: {station.capacity} → {nextLevel.capacity} units</p>
                                            </div>
                                            <span className="text-[11px] text-purple-400 font-mono shrink-0">
                                              💰{nextLevel.cost.toLocaleString()}
                                            </span>
                                          </button>
                                        );
                                      })()}                                          
                                      {isFull && (
                                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-500/10 rounded-md">
                                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                                          <p className="text-[11px] text-amber-400">Station at capacity</p>
                                        </div>
                                      )}
                                      {stationUnitsFor(station.type).map((unitTypeKey) => {
                                        const unitConfig = Array.isArray(UNIT_CONFIGS) ? UNIT_CONFIGS.find((c) => c.type === unitTypeKey) : UNIT_CONFIGS[unitTypeKey];
                                        if (!unitConfig) return null;
                                        const canAffordUnit = (player?.credits || 0) >= unitConfig.cost;
                                        return (
                                          <button
                                            key={unitConfig.type}
                                            onClick={(e) => { e.stopPropagation(); if (canAffordUnit && !isFull) handleBuyUnit(station.id, unitConfig.type); }}
                                            disabled={!canAffordUnit || isFull}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                                              canAffordUnit && !isFull
                                                ? 'hover:bg-gray-700/60'
                                                : 'opacity-40 cursor-not-allowed'
                                            }`}
                                          >
                                            <Truck className="w-3.5 h-3.5 text-gray-400" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[11px] text-gray-300 font-medium">{unitConfig.name}</p>
                                              <p className="text-[11px] text-gray-600">Max: {getUnitMaxSpeedMph(unitConfig.speed)} mph</p>
                                            </div>
                                            <span className="text-[11px] text-amber-400 font-mono shrink-0">
                                              💰{unitConfig.cost.toLocaleString()}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <SectionHeader
                title="Units"
                count={units.length}
                icon={<Truck className="w-4 h-4" />}
                isExpanded={expandedSection === 'units'}
                onClick={() => toggleSection('units')}
                accentColor="text-dispatch-green"
              />
              <AnimatePresence>
                {expandedSection === 'units' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-1 pb-3">
                      {units.length === 0 ? (
                        <EmptyState
                          icon={<Truck className="w-6 h-6" />}
                          title="No units yet"
                          subtitle="Build a station to receive your first units"
                        />
                      ) : (
                        <UnitPanel onUnitClick={onSelectUnit} />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* === Leaderboard — Real Data === */}
              <SectionHeader
                title="Leaderboard"
                count={leaderboardEntries.length}
                icon={<Trophy className="w-4 h-4" />}
                isExpanded={expandedSection === 'leaderboard'}
                onClick={() => toggleSection('leaderboard')}
                accentColor="text-amber-400"
              />
              <AnimatePresence>
                {expandedSection === 'leaderboard' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2">
                      {/* Tab switch: Global vs Friends vs Alliances vs Seasonal */}
                      <div className="flex items-center gap-1.5 px-3 pb-2">
                        {(['global', 'friends', 'alliances', 'seasonal'] as const).map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setLeaderboardTab(tab)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-colors ${
                              leaderboardTab === tab
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-gray-800/50 text-gray-500 hover:text-gray-300 border border-transparent'
                            }`}
                          >
                            {tab === 'friends' ? '👥 Friends' : tab === 'alliances' ? '⚔️ Alliances' : tab === 'seasonal' ? '🎆 Seasonal' : '🌐 Global'}
                          </button>
                        ))}
                      </div>

                      {leaderboardTab === 'friends' ? (
                        <FriendComparison
                          me={friendLeaderboard?.me ?? null}
                          friends={friendLeaderboard?.friends ?? []}
                          loading={!friendLeaderboard && !friendBoardError}
                          error={friendBoardError}
                          onRetry={() => setFriendBoardRefresh((n) => n + 1)}
                        />
                      ) : leaderboardTab === 'seasonal' ? (
                        <SeasonalBoard
                          event={relevantSeasonalEvent()}
                          data={seasonalBoard}
                          loading={!seasonalBoard && !seasonalBoardError && seasonalStatus(relevantSeasonalEvent() ?? SEASONAL_EVENTS[0]) !== 'upcoming'}
                          error={seasonalBoardError}
                          onRetry={() => setSeasonalBoardRefresh((n) => n + 1)}
                        />
                      ) : leaderboardTab === 'alliances' ? (
                        <AllianceBoard
                          data={allianceBoard}
                          loading={!allianceBoard && !allianceBoardError}
                          error={allianceBoardError}
                          sort={allianceBoardSort}
                          setSort={setAllianceBoardSort}
                          myAllianceId={myAlliance?.id ?? null}
                          expandedId={expandedAllianceId}
                          onExpand={handleExpandAlliance}
                          detail={allianceDetail}
                          detailLoading={allianceDetailLoading}
                          playerId={player?.id ?? ''}
                        />
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 px-3 pb-2">
                            {(['xp', 'credits', 'missions', 'mutual_aid'] as const).map((sort) => (
                              <button
                                key={sort}
                                onClick={() => setLeaderboardSort(sort)}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                                  leaderboardSort === sort ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800/50 text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {sort}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 px-3 py-2 bg-dispatch-red/10 border border-dispatch-red/30 rounded-lg mb-2">
                            <Crown className="w-4 h-4 text-amber-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">
                                {player?.username || 'Commander'}
                                <span className="ml-1.5 text-[11px] px-1.5 py-px rounded-full bg-amber-500/25 text-amber-300 font-bold align-middle">You</span>
                              </p>
                              <p className="text-[11px] text-gray-400">
                                Level {player?.level || 1} • {missions.filter((m) => m.status === 'completed').length} missions completed
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-amber-400 font-mono">
                                {leaderboardSort === 'credits' ? `${(player?.credits || 0).toLocaleString()} cr`
                                  : leaderboardSort === 'missions' ? `${missions.filter((m) => m.status === 'completed').length} msn`
                                  : leaderboardSort === 'mutual_aid' ? `${leaderboardEntries.find((e) => e.playerId === player?.id)?.mutualAidAnswered ?? 0} aid`
                                  : `${lifetimeXpOf(player).toLocaleString()} XP`}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {atMaxLevel ? 'max level' : `${levelXp.toLocaleString()} / ${xpForNext.toLocaleString()} into Lv ${player?.level || 1}`}
                              </p>
                            </div>
                          </div>
                          {leaderboardEntries.map((entry) => {
                            const medalIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
                            const isMe = !!player?.id && entry.playerId === player.id;
                            // Show the metric matching the active sort; the xp
                            // board displays real lifetime XP, not the remainder.
                            const sortValue =
                              leaderboardSort === 'credits' ? `${entry.credits.toLocaleString()} cr`
                              : leaderboardSort === 'missions' ? `${entry.missionsCompleted ?? 0} msn`
                              : leaderboardSort === 'mutual_aid' ? `${entry.mutualAidAnswered ?? 0} aid`
                              : `${(entry.lifetimeXp ?? entry.xp ?? 0).toLocaleString()} XP`;
                            return (
                              <div
                                key={entry.playerId}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                                  isMe ? 'bg-amber-500/10 border border-amber-500/30' : 'hover:bg-gray-800/60'
                                }`}
                              >
                                <span className="w-5 text-center text-xs">
                                  {medalIcon || <span className="text-[11px] text-gray-500 font-mono">#{entry.rank}</span>}
                                </span>
                                <span className="text-sm">{leaderboardAvatar(entry.playerId, entry.rank - 1)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] text-gray-300 font-medium truncate">
                                    {entry.username}
                                    {isMe && (
                                      <span className="ml-1.5 text-[11px] px-1.5 py-px rounded-full bg-amber-500/25 text-amber-300 font-bold align-middle">You</span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-gray-600">Lv.{entry.level} • {entry.missionsCompleted ?? 0} missions</p>
                                </div>
                                <span className="text-[11px] text-amber-400 font-mono shrink-0">
                                  {sortValue}
                                </span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* === Alliance === */}
              <SectionHeader
                title="Alliance"
                count={myAlliance ? 1 : 0}
                icon={<Crown className="w-4 h-4" />}
                isExpanded={expandedSection === 'alliance'}
                onClick={() => toggleSection('alliance')}
                accentColor="text-purple-400"
                badge={allianceUnread}
              />
              <AnimatePresence>
                {expandedSection === 'alliance' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2">
                      {allianceError && (
                        <div className="px-2 py-1.5 bg-red-500/10 border border-red-500/30 rounded-md text-[11px] text-red-400">
                          {allianceError}
                        </div>
                      )}
                      {myAlliance ? (
                        <AllianceDetail
                          alliance={myAlliance}
                          chat={allianceChat}
                          chatInput={allianceChatInput}
                          setChatInput={setAllianceChatInput}
                          onSend={handleSendAllianceChat}
                          onLeave={handleLeaveAlliance}
                          busy={allianceBusy}
                          chatEndRef={allianceChatEndRef}
                          showAlliesOnMap={showAlliesOnMap}
                          setShowAlliesOnMap={setShowAlliesOnMap}
                          inviteCode={allianceInviteCode}
                          onRegenerateInvite={handleRegenerateInvite}
                          onKick={handleKickMember}
                          onSetRole={handleSetRole}
                          onTransfer={handleTransferLeadership}
                          me={player?.id ?? ''}
                          myUsername={player?.username || 'Commander'}
                          chatReceipts={chatReceipts}
                          typerNames={[...typers.values()].filter((t) => t.until > Date.now()).map((t) => t.name)}
                          onTyping={handleAllianceTyping}
                          listingDesc={listingDesc}
                          setListingDesc={(v) => { setListingDesc(v); setListingDirty(true); listingDirtyRef.current = true; }}
                          listingMinLevel={listingMinLevel}
                          setListingMinLevel={(v) => { setListingMinLevel(v); setListingDirty(true); listingDirtyRef.current = true; }}
                          listingRecruiting={listingRecruiting}
                          setListingRecruiting={(v) => { setListingRecruiting(v); setListingDirty(true); listingDirtyRef.current = true; }}
                          onUpdateListing={handleUpdateListing}
                          listingBusy={allianceBusy}
                          requests={allianceRequests}
                          onApprove={handleApproveJoin}
                          onReject={handleRejectJoin}
                        />
                      ) : allianceUnlocked ? (
                        <AllianceJoin
                          nameInput={allianceNameInput}
                          setNameInput={setAllianceNameInput}
                          tagInput={allianceTagInput}
                          setTagInput={setAllianceTagInput}
                          joinInput={allianceJoinInput}
                          setJoinInput={setAllianceJoinInput}
                          codeInput={allianceJoinCodeInput}
                          setCodeInput={setAllianceJoinCodeInput}
                          onCreate={handleCreateAlliance}
                          onJoin={handleJoinAlliance}
                          onJoinByCode={handleJoinByCode}
                          busy={allianceBusy}
                          directory={allianceDirectory}
                          onRequestJoin={handleRequestJoin}
                          playerLevel={player?.level ?? 1}
                        />
                      ) : (
                        <AllianceLocked level={player?.level ?? 1} isFounder={isFounder} />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* === Public Chat === */}
              <SectionHeader
                title="Public Chat"
                count={chatMessages.length}
                icon={<MessageSquare className="w-4 h-4" />}
                isExpanded={expandedSection === 'chat'}
                onClick={() => toggleSection('chat')}
                accentColor="text-blue-400"
                badge={chatUnread}
              />
              <AnimatePresence>
                {expandedSection === 'chat' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 flex flex-col h-72">
                      <div className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-500">
                        <span className={`w-1.5 h-1.5 rounded-full ${onlineCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                        <span className="font-semibold uppercase tracking-wider">
                          {onlineCount > 0 ? `${onlineCount} commander${onlineCount === 1 ? '' : 's'} online` : 'Public chat'}
                        </span>
                        <span className="text-gray-700">·</span>
                        <span>HQ broadcasts land here</span>
                      </div>

                      {/* Filter: All / Players only / HQ only (v0.22.x) — hide
                          or isolate system-style lines without losing them.
                          Session-local; the feed is never mutated. */}
                      <div className="flex items-center gap-1 mb-2">
                        {([
                          { id: 'all', label: 'All', title: 'Show everything' },
                          { id: 'players', label: 'Players', title: 'Only player messages' },
                          { id: 'hq', label: 'HQ', title: 'Only HQ / system broadcasts' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setChatFilter(opt.id)}
                            title={opt.title}
                            aria-pressed={chatFilter === opt.id}
                            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
                              chatFilter === opt.id
                                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                                : 'bg-gray-800/40 border-gray-700/40 text-gray-500 hover:bg-gray-800/70 hover:text-gray-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 mb-2 pr-1">
                        {visibleChat.length === 0 ? (
                          <p className="text-center text-[11px] text-gray-600 py-8">
                            {chatFilter === 'players'
                              ? 'No player messages yet — be the first to talk'
                              : chatFilter === 'hq'
                              ? 'No HQ broadcasts yet'
                              : 'No messages yet'}
                          </p>
                        ) : visibleChat.map((msg) => {
                          const own = msg.type === 'user' && msg.sender === player?.username;
                          const bubble =
                            msg.type === 'system' ? 'bg-gray-800/80 text-gray-300 border border-gray-700/50' :
                            msg.type === 'dispatch' ? 'bg-dispatch-red/10 text-dispatch-red border border-dispatch-red/30' :
                            msg.type === 'psa' ? 'bg-amber-500/10 text-amber-200 border border-amber-500/40' :
                            msg.type === 'notice' ? 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/40' :
                            msg.type === 'message' ? 'bg-blue-500/10 text-blue-200 border border-blue-500/40' :
                            'bg-blue-500/20 text-blue-200 border border-blue-500/30';
                          const label =
                            msg.type === 'psa' ? '🚨 PSA' :
                            msg.type === 'notice' ? '📢 Notice' :
                            msg.type === 'message' ? '✉️ Dispatch HQ' :
                            msg.type === 'dispatch' ? 'Dispatch' :
                            msg.type === 'system' ? 'System' : '';
                          return (
                            <div key={msg.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
                              <div className={`max-w-[92%] px-2.5 py-1.5 rounded-lg text-xs ${bubble}`}>
                                <p className="text-[11px] font-semibold text-gray-400 mb-0.5">
                                  {label ? <span className="mr-1">{label}</span> : null}
                                  {msg.sender}
                                </p>
                                <p>{msg.text}</p>
                              </div>
                              <span className="text-[11px] text-gray-600 mt-0.5">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })}
                        <div ref={chatEndRef} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                          placeholder={`Message the city${player ? '' : ' — sign in to chat'}...`}
                          disabled={!player}
                          className="flex-1 bg-gray-800/80 border border-gray-700/50 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
                        />
                        <button
                          onClick={handleSendChat}
                          disabled={!chatInput.trim() || !player}
                          className="p-1.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 disabled:opacity-30 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-gray-800/50 p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-dispatch-red to-amber-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {player?.username?.[0] || 'D'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{player?.username || 'Commander'}</p>
                  <p className="text-[11px] text-gray-500">Level {player?.level || 1}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-amber-400 font-mono">
                    {(player?.credits || 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-500">credits</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {viewingStation && (
        <Suspense fallback={null}>
          <StationDetailModal
            station={viewingStation}
            units={units}
            onClose={() => setViewingStation(null)}
          />
        </Suspense>
      )}
    </>
  );
}

function SectionHeader({
  title,
  count,
  icon,
  isExpanded,
  onClick,
  accentColor,
  badge,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  isExpanded: boolean;
  onClick: () => void;
  accentColor: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/30 
                 hover:bg-gray-800/30 transition-colors"
    >
      <span className={accentColor}>{icon}</span>
      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex-1 text-left">
        {title}
      </span>
      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 font-mono">
        {count}
      </span>
      {badge ? (
        <span className="min-w-4 h-4 px-1 rounded-full bg-dispatch-red text-white text-[11px] font-bold flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      {isExpanded ? (
        <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
      )}
    </button>
  );
}

/**
 * Friends tab — head-to-head against your social graph. Each row shows calls
 * run, clearance rate, and global rank, plus a "this week" tally and whether
 * that friend is ahead of you this ISO week.
 */
function FriendComparison({ me, friends, loading, error, onRetry }: {
  me: FriendLeaderboardEntry | null;
  friends: FriendLeaderboardEntry[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="text-center py-6 text-gray-600">
        <p className="text-xs font-medium">Couldn't load friends</p>
        <button
          onClick={onRetry}
          className="mt-2 text-[11px] text-amber-400 hover:text-amber-300 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-6 text-gray-600">
        <p className="text-xs font-medium">Loading friends…</p>
      </div>
    );
  }

  if (!me && friends.length === 0) {
    return (
      <div className="text-center py-6 text-gray-600">
        <div className="mx-auto mb-2 opacity-40 text-xl">👥</div>
        <p className="text-xs font-medium">No friends yet</p>
        <p className="text-[11px] text-gray-700 mt-0.5">
          Add friends from your profile to compare shift stats
        </p>
      </div>
    );
  }

  const myWeekly = me?.weekly.cleared ?? 0;
  const all = [
    ...(me ? [{ ...me, isMe: true }] : []),
    ...friends.map((f) => ({ ...f, isMe: false })),
  ];

  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 text-[11px] text-gray-600 uppercase tracking-wider">
        This week — who's ahead
      </div>
      {all.map((entry) => {
        const delta = entry.weekly.cleared - myWeekly;
        const ahead = delta > 0;
        const behind = delta < 0;
        return (
          <div
            key={entry.playerId}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
              entry.isMe
                ? 'bg-dispatch-red/10 border border-dispatch-red/30'
                : 'hover:bg-gray-800/60'
            }`}
          >
            <span className="w-5 text-center text-[11px] text-gray-500 font-mono">#{entry.rank}</span>
            <span className="text-sm">{leaderboardAvatar(entry.playerId, entry.rank - 1)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-300 font-medium truncate">
                {entry.username}
                {entry.isMe && <span className="ml-1 text-[11px] text-amber-400 font-semibold">(You)</span>}
              </p>
              <p className="text-[11px] text-gray-600">
                {entry.callsRun} calls • {entry.clearanceRate}% clear
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-amber-400 font-mono">
                {entry.weekly.cleared} <span className="text-[11px] text-gray-600">wk</span>
              </p>
              {entry.isMe ? (
                <p className="text-[11px] text-gray-600">this week</p>
              ) : (
                <p className={`text-[11px] font-semibold ${ahead ? 'text-emerald-400' : behind ? 'text-gray-600' : 'text-gray-500'}`}>
                  {ahead ? `▲ +${delta}` : behind ? `▼ ${delta}` : '— tied'}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Alliance tab — rank guilds by shared XP or weekly cleared calls, with an
 * expandable per-member contribution breakdown. Your own alliance glows.
 */
function AllianceBoard({ data, loading, error, sort, setSort, myAllianceId, expandedId, onExpand, detail, detailLoading, playerId }: {
  data: AllianceLeaderboardResponse | null;
  loading: boolean;
  error: boolean;
  sort: 'xp' | 'weekly';
  setSort: (s: 'xp' | 'weekly') => void;
  myAllianceId: string | null;
  expandedId: string | null;
  onExpand: (allianceId: string) => void;
  detail: AllianceLeaderboardDetail | null;
  detailLoading: boolean;
  playerId: string;
}) {
  if (error) {
    return (
      <div className="text-center py-6 text-gray-600">
        <p className="text-xs font-medium">Couldn't load alliances</p>
        <p className="text-[11px] text-gray-700 mt-0.5">Try again in a moment</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-6 text-gray-600">
        <p className="text-xs font-medium">Loading alliances…</p>
      </div>
    );
  }

  if (!data || data.alliances.length === 0) {
    return (
      <div className="text-center py-6 text-gray-600">
        <div className="mx-auto mb-2 opacity-40 text-xl">⚔️</div>
        <p className="text-xs font-medium">No alliances yet</p>
        <p className="text-[11px] text-gray-700 mt-0.5">
          Be the first to found one from the Alliance section
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-3 pb-2">
        {(['xp', 'weekly'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              sort === s
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-gray-800/50 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {s === 'xp' ? '⚔️ Shared XP' : '📅 Weekly clears'}
          </button>
        ))}
      </div>
      <div className="px-3 pb-1 text-[11px] text-gray-600 uppercase tracking-wider">
        Top alliances · week {data.weekKey}
      </div>
      {data.alliances.map((a) => {
        const mine = a.id === myAllianceId;
        const expanded = a.id === expandedId;
        const topContributor = a.contributors[0]?.username;
        return (
          <div
            key={a.id}
            className={`mx-1 rounded-lg border ${
              mine
                ? 'bg-purple-500/10 border-purple-500/40'
                : 'bg-gray-800/40 border-gray-700/30'
            }`}
          >
            <button
              onClick={() => onExpand(a.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-700/30 transition-colors text-left"
            >
              <span className="w-5 text-center text-xs">
                {a.rank === 1 ? '🥇' : a.rank === 2 ? '🥈' : a.rank === 3 ? '🥉' : (
                  <span className="text-[11px] text-gray-500 font-mono">#{a.rank}</span>
                )}
              </span>
              <span className="text-sm">⚔️</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-300 font-medium truncate">
                  {a.name}
                  {mine && <span className="ml-1 text-[11px] text-purple-400 font-semibold">(You)</span>}
                </p>
                <p className="text-[11px] text-gray-600">
                  {a.tag ? `${a.tag} · ` : ''}{a.memberCount}/{a.memberCap} members · Lv {a.level}
                  {a.recruiting && <span className="text-emerald-400"> · ● recruiting</span>}
                  {topContributor && <span className="text-gray-600"> · 🔥 {topContributor}</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-purple-300 font-mono">
                  {sort === 'weekly' ? `${a.weeklyCleared} cleared` : `${a.xp.toLocaleString()} XP`}
                </p>
                <p className="text-[11px] text-gray-600">
                  {sort === 'weekly' ? `${a.weeklyCallsRun} calls this week` : `${a.weeklyCleared} cleared this week`}
                </p>
              </div>
              <ChevronDown className={`w-3 h-3 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
              <div className="px-2 pb-2 pt-1 border-t border-gray-700/30 space-y-1">
                {detailLoading ? (
                  <p className="text-[11px] text-gray-600 px-1">Loading contributions…</p>
                ) : detail ? (
                  <>
                    <p className="text-[11px] text-gray-500 px-1 pb-0.5">
                      👑 Led by {detail.alliance.leaderName} — member contributions this week
                    </p>
                    {detail.members.map((m) => (
                      <div
                        key={m.playerId}
                        className={`flex items-center gap-2 px-2 py-1 rounded-md ${
                          m.playerId === playerId ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-gray-800/50 border border-gray-700/30'
                        }`}
                      >
                        <span className="w-4 text-center text-[11px]">
                          {m.role === 'leader' ? '👑' : m.role === 'officer' ? '⭐' : '•'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-300 font-medium truncate">
                            {m.username}
                            {m.playerId === playerId && <span className="ml-1 text-[11px] text-purple-400 font-semibold">(You)</span>}
                          </p>
                          <p className="text-[11px] text-gray-600">Lv {m.level} · {m.missionsCompleted} missions</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-emerald-400 font-mono">{m.weeklyCleared} cleared</p>
                          <p className="text-[11px] text-gray-600">{m.weeklyCallsRun} calls</p>
                        </div>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AllianceLocked({ level, isFounder }: { level: number; isFounder: boolean }) {
  const remaining = Math.max(0, ALLIANCE_MIN_LEVEL - level);
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-4 text-center space-y-2">
      <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
        <Lock className="w-4 h-4 text-amber-400" />
      </div>
      <p className="text-xs font-bold text-white">Alliances locked</p>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        {isFounder
          ? 'You are the founder — alliances are unlocked for your account at any level.'
          : `Unlock at Level ${ALLIANCE_MIN_LEVEL}. ${remaining > 0 ? `${remaining} level${remaining === 1 ? '' : 's'} to go — keep responding to calls to rank up.` : ''}`}
      </p>
      <div className="pt-1 flex items-center justify-center gap-1.5">
        {Array.from({ length: ALLIANCE_MIN_LEVEL }, (_, i) => i + 1).map((l) => (
          <span
            key={l}
            className={`w-1.5 h-1.5 rounded-full ${level >= l ? 'bg-amber-400' : 'bg-gray-700'}`}
            title={`Level ${l}`}
          />
        ))}
      </div>
      <p className="text-[11px] text-gray-600">
        Alliances bring shared XP, member caps, map reveal, and reward bonuses.
      </p>
    </div>
  );
}

function AllianceXpPanel({ alliance }: { alliance: AllianceSummary }) {
  const xp = alliance.xp ?? 0;
  const current = allianceLevelFor(xp);
  const next = nextAllianceLevel(xp);
  const progress = allianceProgress(xp);
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">
          {current.icon} Level {current.level} — Shared XP
        </p>
        <span className="text-[11px] text-purple-300 font-mono">
          {xp.toLocaleString()} XP
        </span>
      </div>
      <div className="h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400 transition-all duration-500"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-600">
        {next
          ? `${(next.xpThreshold - xp).toLocaleString()} XP to Level ${next.level}`
          : 'Max level reached'}
      </p>
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {ALLIANCE_LEVELS.map((l) => {
          const unlocked = xp >= l.xpThreshold;
          return (
            <div
              key={l.level}
              className={`rounded-md border px-1.5 py-1 text-center ${
                unlocked
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-gray-800/40 border-gray-700/40 opacity-60'
              }`}
            >
              <p className="text-[11px] font-bold text-white">{l.icon} Lv {l.level}</p>
              <p className="text-[11px] text-gray-500 leading-tight">
                {l.memberCap} members • {l.revealKm}km map reveal • +{Math.round((l.commanderBonus - 1) * 100)}% rewards
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-600">
        Missions completed by members feed shared XP — 25% of each mission's XP goes to the alliance.
      </p>
    </div>
  );
}

function AllianceDetail({ alliance, chat, chatInput, setChatInput, onSend, onLeave, busy, chatEndRef, showAlliesOnMap, setShowAlliesOnMap, inviteCode, onRegenerateInvite, onKick, onSetRole, onTransfer, me, myUsername, chatReceipts, typerNames, onTyping, listingDesc, setListingDesc, listingMinLevel, setListingMinLevel, listingRecruiting, setListingRecruiting, onUpdateListing, listingBusy, requests, onApprove, onReject }: {
  alliance: AllianceSummary;
  chat: Array<{ id: string; senderName: string; text: string; createdAt: string }>;
  chatInput: string;
  setChatInput: (v: string) => void;
  onSend: () => void;
  onLeave: () => void;
  busy: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  showAlliesOnMap: boolean;
  setShowAlliesOnMap: (v: boolean) => void;
  inviteCode: string | null;
  onRegenerateInvite: () => void;
  onKick: (playerId: string, username: string) => void;
  onSetRole: (playerId: string, role: 'officer' | 'member') => void;
  onTransfer: (playerId: string) => void;
  me: string;
  myUsername: string;
  chatReceipts: Map<string, Set<string>>;
  typerNames: string[];
  onTyping: () => void;
  listingDesc: string;
  setListingDesc: (v: string) => void;
  listingMinLevel: number;
  setListingMinLevel: (v: number) => void;
  listingRecruiting: boolean;
  setListingRecruiting: (v: boolean) => void;
  onUpdateListing: () => void;
  listingBusy: boolean;
  requests: AllianceJoinRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}) {
  const myMember = alliance.members?.find((m) => m.playerId === me);
  const myRole = myMember?.role ?? 'member';
  const isLeader = myRole === 'leader';
  const isOfficer = myRole === 'officer';

  // Chat scroll state: only auto-follow new messages while pinned to the
  // bottom; otherwise a jump-to-latest button appears.
  const [chatAtBottom, setChatAtBottom] = useState(true);
  const initialScrolled = useRef(false);
  // Initial scroll on open waits for the expand animation (0.2s) to finish,
  // so the view actually lands on the newest message.
  useEffect(() => {
    const t = setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 220);
    return () => clearTimeout(t);
  }, [chatEndRef]);
  // Follow new messages only while pinned to the bottom (reading history is
  // never yanked).
  useEffect(() => {
    if (initialScrolled.current) {
      if (chatAtBottom) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      initialScrolled.current = true;
    }
  }, [chat, chatAtBottom, chatEndRef]);

  const canKick = (member: AllianceSummary['members'][number]) => {
    if (member.playerId === me) return false;
    if (isLeader) return true;
    if (isOfficer) return member.role === 'member';
    return false;
  };
  const canSetRole = (member: AllianceSummary['members'][number]) =>
    isLeader && member.playerId !== me;

  const copyInvite = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
    } catch { /* clipboard may be blocked */ }
  };

  return (
    <div className="space-y-2">
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-purple-400" />
          <p className="text-sm font-bold text-white truncate">{alliance.name}</p>
          {alliance.tag && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
              {alliance.tag}
            </span>
          )}
          <span className="ml-auto text-[11px] text-purple-300 font-mono">LVL {alliance.level}</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Led by {alliance.leaderName} • {alliance.memberCount} member{alliance.memberCount === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-1.5 mt-2">
          <button
            onClick={() => setShowAlliesOnMap(!showAlliesOnMap)}
            className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
              showAlliesOnMap
                ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                : 'bg-gray-800/60 text-gray-400 border border-gray-700/50 hover:text-gray-200'
            }`}
          >
            {showAlliesOnMap ? '✓ Showing allies on map' : 'Show allies on map'}
          </button>
          <button
            onClick={onLeave}
            disabled={busy}
            className="px-2 py-1.5 rounded-md text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Invite code — shareable, leader can rotate it */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
          Invite Code — share this to recruit
        </p>
        {inviteCode ? (
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-center font-mono text-sm font-bold tracking-[0.2em] text-purple-300 bg-gray-900/70 border border-purple-500/30 rounded-md py-1.5 select-all">
              {inviteCode}
            </span>
            <button
              onClick={copyInvite}
              title="Copy invite code"
              className="p-2 rounded-md bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            {isLeader && (
              <button
                onClick={onRegenerateInvite}
                disabled={busy}
                title="Rotate invite code"
                className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-gray-600">Loading invite code…</p>
        )}
        {!isLeader && (
          <p className="text-[11px] text-gray-600 mt-1">Only the leader can rotate the code.</p>
        )}
      </div>

      {/* Alliance XP + level perks */}
      <AllianceXpPanel alliance={alliance} />

      {/* Recruitment listing — leader manages what the board shows */}
      {isLeader && (
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5 space-y-2">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">📣 Recruitment Listing</p>
          <textarea
            value={listingDesc}
            onChange={(e) => setListingDesc(e.target.value.slice(0, 500))}
            placeholder="Describe your alliance — focus, activity, vibe (max 500)"
            rows={2}
            className="w-full bg-gray-800/80 border border-gray-700/50 rounded-md px-2 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 resize-none"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-400">Min level</label>
            <input
              type="number"
              min={1}
              max={50}
              value={listingMinLevel}
              onChange={(e) => setListingMinLevel(Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1))))}
              className="w-16 bg-gray-800/80 border border-gray-700/50 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-purple-500/50"
            />
            <button
              onClick={() => setListingRecruiting(!listingRecruiting)}
              className={`ml-auto px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                listingRecruiting
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-gray-800/60 text-gray-500 border-gray-700/50 hover:text-gray-300'
              }`}
            >
              {listingRecruiting ? '● Recruiting' : '○ Not recruiting'}
            </button>
          </div>
          <button
            onClick={onUpdateListing}
            disabled={listingBusy}
            className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
          >
            {listingBusy ? 'Saving…' : 'Save listing'}
          </button>
        </div>
      )}

      {/* Join requests — leader approves/declines, officers can view */}
      {(isLeader || isOfficer) && (
        <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider px-1 pb-1">
            Join Requests — {requests.length}
          </p>
          {requests.length === 0 ? (
            <p className="text-[11px] text-gray-600 px-1 pb-0.5">No pending requests right now.</p>
          ) : (
            <div className="space-y-1">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-800/50 border border-gray-700/30">
                  <span className="text-sm">👤</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-300 font-medium truncate">{r.username}</p>
                    <p className="text-[11px] text-gray-600">Level {r.level}</p>
                  </div>
                  {isLeader && (
                    <>
                      <button
                        onClick={() => onApprove(r.id)}
                        disabled={listingBusy}
                        title="Approve request"
                        className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-30 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => onReject(r.id)}
                        disabled={listingBusy}
                        title="Decline request"
                        className="px-2 py-1 rounded-md text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-30 transition-colors"
                      >
                        Decline
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roster with role badges + management controls (leader/officer) */}
      <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider px-1 pb-1">
          Members — {alliance.memberCount}
        </p>
        <div className="space-y-1">
          {alliance.members.map((m) => {
            const kickable = canKick(m);
            const roleable = canSetRole(m);
            const roleIcon = m.role === 'leader' ? '👑' : m.role === 'officer' ? '⭐' : '•';
            const isMe = m.playerId === me;
            return (
              <div key={m.playerId} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-800/50 border border-gray-700/30">
                <span className="w-4 text-center text-[11px]">{roleIcon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-300 font-medium truncate">
                    {m.username}
                    {isMe && <span className="ml-1 text-[11px] text-purple-400 font-semibold">(You)</span>}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    {m.role} • Lv{m.level}
                  </p>
                </div>
                {isLeader && !isMe && (
                  <button
                    onClick={() => onTransfer(m.playerId)}
                    disabled={busy}
                    title="Transfer leadership"
                    className="p-1 rounded hover:bg-purple-500/20 text-purple-400 transition-colors disabled:opacity-30"
                  >
                    <Crown className="w-3 h-3" />
                  </button>
                )}
                {roleable && (
                  <button
                    onClick={() => onSetRole(m.playerId, m.role === 'officer' ? 'member' : 'officer')}
                    disabled={busy}
                    title={m.role === 'officer' ? 'Demote to member' : 'Promote to officer'}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border transition-colors disabled:opacity-30 ${
                      m.role === 'officer'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    }`}
                  >
                    {m.role === 'officer' ? 'Demote' : 'Promote'}
                  </button>
                )}
                {kickable && (
                  <button
                    onClick={() => onKick(m.playerId, m.username)}
                    disabled={busy}
                    title="Kick from alliance"
                    className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-30"
                  >
                    <UserX className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative bg-gray-800/60 border border-gray-700/50 rounded-lg p-2 flex flex-col h-48">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider px-1 pb-1">Alliance Chat</p>
        <div
          className="flex-1 overflow-y-auto space-y-1.5 mb-1.5 pr-1"
          onScroll={(e) => {
            const el = e.currentTarget;
            setChatAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
          }}
        >
          {chat.length === 0 ? (
            <p className="text-[11px] text-gray-600 px-1">No messages yet — say hello to your squad.</p>
          ) : (
            chat.slice(-30).map((m) => {
              const confirmed = (chatReceipts.get(m.id)?.size ?? 0) > 0;
              return (
                <div key={m.id} className="text-[11px]">
                  <span className="text-purple-300 font-semibold">{m.senderName}: </span>
                  <span className="text-gray-300">{m.text}</span>
                  {m.senderName === myUsername && (
                    <span
                      className={`ml-1 select-none ${confirmed ? 'text-emerald-400' : 'text-gray-600'}`}
                      title={confirmed ? 'Delivered — another member received it' : 'Sent'}
                    >
                      {confirmed ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>
        {!chatAtBottom && (
          <button
            onClick={() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            title="Jump to latest"
            className="absolute bottom-12 right-3 w-7 h-7 rounded-full bg-purple-500/90 hover:bg-purple-400 text-white shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all active:scale-90"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
        {typerNames.length > 0 && (
          <p className="text-[11px] text-purple-300/80 italic px-1 pb-1 select-none">
            {typerNames.slice(0, 2).join(', ')}{typerNames.length > 2 ? ` +${typerNames.length - 2} more` : ''}
            {' '}{typerNames.length === 1 ? 'is' : 'are'} typing…
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => { setChatInput(e.target.value); if (e.target.value.trim()) onTyping(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
            placeholder="Message the alliance..."
            className="flex-1 bg-gray-800/80 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
          />
          <button
            onClick={onSend}
            disabled={!chatInput.trim() || busy}
            className="p-1.5 rounded-md bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 disabled:opacity-30 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AllianceJoin({ nameInput, setNameInput, tagInput, setTagInput, joinInput, setJoinInput, codeInput, setCodeInput, onCreate, onJoin, onJoinByCode, busy, directory, onRequestJoin, playerLevel }: {
  nameInput: string;
  setNameInput: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  joinInput: string;
  setJoinInput: (v: string) => void;
  codeInput: string;
  setCodeInput: (v: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onJoinByCode: () => void;
  busy: boolean;
  directory: AllianceDirectoryEntry[];
  onRequestJoin: (allianceId: string) => void;
  playerLevel: number;
}) {
  return (
    <div className="space-y-2">
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5">
        <p className="text-[11px] font-semibold text-gray-300 mb-1.5">⚔️ Found an alliance</p>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Alliance name"
          className="w-full bg-gray-800/80 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 mb-1.5"
        />
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="Tag (optional, max 8)"
          className="w-full bg-gray-800/80 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 mb-1.5"
        />
        <button
          onClick={onCreate}
          disabled={!nameInput.trim() || busy}
          className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
        >
          {busy ? 'Creating...' : 'Create alliance'}
        </button>
      </div>

      <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5 space-y-2">
        <div>
          <p className="text-[11px] font-semibold text-gray-300 mb-1.5">🎟️ Join with an invite code</p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 12))}
              onKeyDown={(e) => { if (e.key === 'Enter') onJoinByCode(); }}
              placeholder="e.g. FIRE42HQ"
              className="flex-1 font-mono bg-gray-800/80 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 uppercase tracking-widest"
            />
            <button
              onClick={onJoinByCode}
              disabled={!codeInput.trim() || busy}
              className="px-2 py-1.5 rounded-md text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
            >
              Join with code
            </button>
          </div>
        </div>
        <div className="border-t border-gray-700/40 pt-2">
          <p className="text-[11px] font-semibold text-gray-300 mb-1.5">🤝 …or join by name</p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onJoin(); }}
              placeholder="Alliance name"
              className="flex-1 bg-gray-800/80 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
            />
            <button
              onClick={onJoin}
              disabled={!joinInput.trim() || busy}
              className="px-2 py-1.5 rounded-md text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
            >
              Join
            </button>
          </div>
        </div>
      </div>

      {directory.length > 0 && (
        <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider px-1 pb-1.5">
            📣 Recruitment Board — request to join
          </p>
          <div className="space-y-1.5">
            {directory.map((a) => {
              const tooLow = playerLevel < a.minLevel;
              return (
                <div
                  key={a.id}
                  className={`rounded-md border p-2 space-y-1.5 ${
                    a.recruiting
                      ? 'bg-purple-500/5 border-purple-500/30'
                      : 'bg-gray-800/50 border-gray-700/40 opacity-80'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">⚔️</span>
                    <p className="text-[11px] text-gray-200 font-semibold truncate flex-1">{a.name}</p>
                    {a.tag && <span className="text-[11px] text-purple-300 font-mono">{a.tag}</span>}
                    <span className="text-[11px] text-gray-500">LVL {a.level}</span>
                  </div>
                  {a.description && (
                    <p className="text-[11px] text-gray-500 leading-snug">{a.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-gray-500">
                      {a.memberCount}/{a.memberCap} members
                    </span>
                    {a.openSlots > 0 && (
                      <span className="text-emerald-400 font-medium">{a.openSlots} open</span>
                    )}
                    <span className="ml-auto text-gray-600">min LVL {a.minLevel}</span>
                  </div>
                  <button
                    onClick={() => onRequestJoin(a.id)}
                    disabled={busy || a.requested || tooLow || !a.recruiting}
                    className={`w-full px-2 py-1.5 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-40 ${
                      a.requested
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30'
                    }`}
                  >
                    {a.requested
                      ? 'Requested ✓ — awaiting approval'
                      : tooLow
                        ? `Requires Level ${a.minLevel}`
                        : a.recruiting
                          ? 'Request to join'
                          : 'Not recruiting'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center py-5 text-gray-600">
      <div className="mx-auto mb-2 opacity-40">{icon}</div>
      <p className="text-xs font-medium">{title}</p>
      <p className="text-[11px] text-gray-700 mt-0.5">{subtitle}</p>
    </div>
  );
}

/*
 * Seasonal tab — the holiday-window clears contest. While an event is live it
 * shows live standings + your rank; after the window closes (standings stay
 * visible ~10 days) it shows the final board with the winner's badge. When no
 * event is active or recent, an "up next" card lists the next window.
 */
function SeasonalBoard({ event, data, loading, error, onRetry }: {
  event: SeasonalEvent | null;
  data: SeasonalContestResponse | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (!event) {
    return (
      <div className="text-center py-6 text-gray-600">
        <p className="text-xs font-medium">No seasonal events scheduled</p>
      </div>
    );
  }

  const status = seasonalStatus(event);

  if (status === 'upcoming') {
    return (
      <div className="text-center py-6 text-gray-600">
        <div className="mx-auto mb-2 opacity-40 text-2xl">{event.icon}</div>
        <p className="text-xs font-medium text-white">{event.name}</p>
        <p className="text-[11px] text-gray-700 mt-0.5">
          Up next · {seasonalWindowLabel(event)} — clear the most calls to win the 🏆
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-gray-600">
        <p className="text-xs font-medium">Couldn't load the contest</p>
        <button onClick={onRetry} className="mt-2 text-[11px] text-amber-400 hover:text-amber-300 underline">
          Try again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-6 text-gray-600">
        <p className="text-xs font-medium">Loading contest…</p>
      </div>
    );
  }

  const live = status === 'live';
  const entries: SeasonalContestEntry[] = data?.entries ?? [];
  const me = data?.me ?? null;
  const winner = data?.winner ?? null;
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null);

  return (
    <div className="space-y-1">
      <div className="px-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">{event.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{event.name} Contest</p>
            <p className="text-[11px] text-gray-600">
              {seasonalWindowLabel(event)} · {live ? 'LIVE' : 'FINAL'}
            </p>
          </div>
        </div>
        {winner && (
          <div className="mt-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <span className="text-base">🏆</span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-amber-300 truncate">{winner.username} won the {event.name} contest!</p>
              <p className="text-[11px] text-gray-500">{winner.calls} calls cleared · July 4th Champion badge</p>
            </div>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-6 text-gray-600">
          <p className="text-xs font-medium">{live ? 'No clears yet — go dispatch!' : 'No one entered this contest'}</p>
        </div>
      ) : (
        entries.map((entry) => {
          const isMe = me?.playerId === entry.playerId;
          const rankMedal = medal(entry.rank);
          return (
            <div
              key={entry.playerId}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                isMe ? 'bg-dispatch-red/10 border border-dispatch-red/30' : 'hover:bg-gray-800/60'
              }`}
            >
              <span className="w-5 text-center text-[11px] text-gray-500 font-mono">
                {rankMedal ?? `#${entry.rank}`}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-medium truncate ${isMe ? 'text-dispatch-red' : 'text-gray-200'}`}>
                  {entry.username} {isMe && '· you'}
                </p>
                <p className="text-[11px] text-gray-600">Level {entry.level}</p>
              </div>
              <span className="text-[11px] font-mono text-amber-300 shrink-0">
                {entry.callsCleared}
                {(entry.cityClears ?? 0) > 0 && (
                  <span className="text-[11px] text-sky-400/80 ml-1">+{entry.cityClears} city</span>
                )}
              </span>
            </div>
          );
        })
      )}

      {live && me && (me.totalClears ?? me.callsCleared) > 0 && me.rank != null && (
        <div className="px-3 pt-1 text-[11px] text-gray-600">
          You're #{me.rank} with {(me.totalClears ?? me.callsCleared)}{' '}
          {(me.totalClears ?? me.callsCleared) === 1 ? 'call' : 'calls'} cleared
          {(me.cityClears ?? 0) > 0 && <> ({me.cityClears} by the city)</>}
        </div>
      )}
    </div>
  );
}