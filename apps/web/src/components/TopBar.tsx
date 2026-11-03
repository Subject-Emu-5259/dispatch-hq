// ============================================
// Dispatch HQ — Top Navigation Bar
// ============================================

import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Radio, MessageSquare, Building2,
  Trophy, Map, Settings, Bell, Menu,
  Moon, Sun, User, LogOut, Pause, MoreHorizontal,
  HelpCircle, Volume2, VolumeX,
  Phone, Cpu, Layers, Bug, Activity, Keyboard, BookOpen, ShieldCheck, Users,
  CloudRain, CloudFog, Flame, Radar, TriangleAlert,
  X, Compass, Zap, Handshake, Mail,
  Wifi, Wrench, Hospital, Plane, Landmark, Gift, Clock, ArrowLeftRight, Inbox,
  GraduationCap, Globe, BadgeDollarSign,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useNotifications } from './NotificationCenter';
import { DisasterStatusChip } from './DisasterBanner';
import { FOUNDER_EMAIL } from '@/lib/founder';
// Code-split heavy panels (v0.18.0/0.22.3 perf passes) — the on-demand
// modals only mount while open, so their boundaries are invisible.
const AdminPanel = lazy(() => import('./AdminPanel').then((m) => ({ default: m.AdminPanel })));
const SettingsModal = lazy(() => import('./SettingsModal').then((m) => ({ default: m.SettingsModal })));
const ProfileModal = lazy(() => import('./ProfileModal').then((m) => ({ default: m.ProfileModal })));
const BugReportModal = lazy(() => import('./BugReport').then((m) => ({ default: m.default })));
const SocialPanel = lazy(() => import('./SocialPanel').then((m) => ({ default: m.SocialPanel })));
import { playClick, playHover } from '@/utils/sound';
import { loadSettings, toggleSoundEnabled, subscribeSettings, displayEmailFor } from '@/utils/settings';
import { clockLabel, isNight } from '@/lib/gameClock';
import { activeSeasonalEvent } from '@/lib/seasonal';
import { fetchSeasonalLeaderboard } from '@/lib/apiClient';
import { rankForLevel } from '@dispatch-hq/shared';
import { missionService } from '@/lib/rewards';

const SERVICE_STATION_ICONS: Record<string, string> = {
  fire: '🚒',
  police: '🚔',
  ems: '🚑',
};

const SERVICE_CREW_ICONS: Record<string, string> = {
  fire: '🧑‍🚒',
  police: '👮',
  ems: '🧑‍⚕️',
};

const SERVICE_BADGE: Record<string, { icon: string; color: string }> = {
  fire: { icon: '🔥', color: 'text-orange-400' },
  police: { icon: '🛡️', color: 'text-blue-400' },
  ems: { icon: '🩺', color: 'text-green-400' },
};

function StationIcon({ service, className = 'w-4 h-4' }: { service?: 'fire' | 'police' | 'ems' | null; className?: string }) {
  const cfg = SERVICE_BADGE[service || 'fire'];
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <Building2 className="w-full h-full text-gray-300" />
      <span className={`absolute -bottom-0.5 -right-0.5 text-[7px] leading-none ${cfg.color}`}>{cfg.icon}</span>
    </div>
  );
}

type NavTab = 'missions' | 'stations' | 'units' | 'employees' | 'leaderboard' | 'chat';

interface TopBarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onMenuToggle: () => void;
  showCAD: boolean;
  onToggleCAD: () => void;
  showTechTree: boolean;
  onToggleTechTree: () => void;
  showFogOfWar: boolean;
  onToggleFogOfWar: () => void;
  showPatrolHeat: boolean;
  onTogglePatrolHeat: () => void;
  showStationCoverage: boolean;
  onToggleStationCoverage: () => void;
  showCoverageGap: boolean;
  onToggleCoverageGap: () => void;
  onNotifications?: () => void;
  onLogout?: () => void;
  onOpenUnit?: (unitId: string) => void;
  onPause?: () => void;
}

export function TopBar({
  activeTab, onTabChange, onMenuToggle,
  showCAD, onToggleCAD, showTechTree, onToggleTechTree,
  showFogOfWar, onToggleFogOfWar, showPatrolHeat, onTogglePatrolHeat,
  showStationCoverage, onToggleStationCoverage,
  showCoverageGap, onToggleCoverageGap, onNotifications,
  onLogout, onOpenUnit, onPause,
}: TopBarProps) {
  const {
    missions, isDarkMode, toggleDarkMode,
    mapStyle, setMapStyle, player, selectedService,
    units, stations, selectMission, selectStation,
    gameMinutes, weather,
  } = useGameStore();

  // Virtual game clock — see lib/gameClock (1 real min = 30 game min).
  const night = isNight(gameMinutes);
  // Active weather event (synced from RandomEvents) — shown in the clock chip.
  const hasWeather = weather !== 'clear';
  const { unreadCount, inboxUnread } = useNotifications();

  const stationIcon = SERVICE_STATION_ICONS[selectedService || 'fire'] || '🚒';

  const NAV_ITEMS = [
    { id: 'missions', label: 'Missions', icon: Radio, badge: true },
    { id: 'stations', label: 'Stations', icon: () => <StationIcon service={selectedService || 'fire'} className="w-3.5 h-3.5" /> },
    { id: 'units', label: 'Units', icon: () => <span className="text-base">{stationIcon}</span> },
    { id: 'employees', label: 'Crew', icon: () => <span className="text-base">{SERVICE_CREW_ICONS[selectedService || 'police']}</span> },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
  ];

  const [showProfile, setShowProfile] = useState(false);
  const [showMapStyles, setShowMapStyles] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);

  // Live seasonal contest (v0.21.2): while a holiday window is active, show
  // the event + the player's current rank in the top bar, refreshed every 60s
  // so a new clear moves you up without reopening the leaderboard.
  const liveSeasonal = activeSeasonalEvent();
  const [seasonalRank, setSeasonalRank] = useState<number | null>(null);
  useEffect(() => {
    if (!liveSeasonal) {
      setSeasonalRank(null);
      return;
    }
    let live = true;
    const refresh = () => {
      fetchSeasonalLeaderboard(liveSeasonal.id)
        .then((res) => {
          if (live) setSeasonalRank(res.me.rank);
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [liveSeasonal?.id]);
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTabId>('start');
  const [showAdmin, setShowAdmin] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => loadSettings().soundEnabled);
  const searchRef = useRef<HTMLDivElement>(null);

  // Keep the mute icon in sync when Settings (or the CAD console mute) flips
  // the global sound flag from another surface (v0.22 mute fix).
  useEffect(() => subscribeSettings((s) => setSoundEnabled(s.soundEnabled)), []);

  const handleSoundToggle = () => {
    // Compute from the live setting — the local state may be stale if the
    // settings cache hydrated after mount (see toggleSoundEnabled).
    const next = toggleSoundEnabled().soundEnabled;
    setSoundEnabled(next);
    if (next) playClick();
  };

  const profileRef = useRef<HTMLDivElement>(null);
  const mapStyleRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Department-only call badge: cross-service Mutual Aid requests live in
  // their own labeled section and must not inflate your department's count.
  const activeMissionCount = missions.filter(
    (m) => (m.status === 'active' || m.status === 'dispatching')
      && (!selectedService || missionService(m) === selectedService)
  ).length;

  // Profile identity + rank (v0.14.1). Founder email is gated client-side so the
  // Admin Console item only appears for the founder; the server still enforces it.
  const isFounder = player?.email?.toLowerCase() === FOUNDER_EMAIL;
  // Hide synthetic guest emails (guest_xxx@dispatchhq.game) behind a friendly label.
  const displayEmail = displayEmailFor(player);
  const rank = rankForLevel(player?.level ?? 1, selectedService ?? undefined);
  const avatarEmoji = loadSettings().avatarEmoji || '🚨';

  // Global quick-search across units, stations, and missions.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return null;
    const matches = <T extends { name: string }>(arr: T[]) =>
      arr.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 5);
    const unitHits = matches(units);
    const stationHits = matches(stations);
    const missionHits = matches(missions.filter((m) => m.status !== 'completed' && m.status !== 'failed'));
    if (unitHits.length === 0 && stationHits.length === 0 && missionHits.length === 0) {
      return { units: [], stations: [], missions: [] };
    }
    return { units: unitHits, stations: stationHits, missions: missionHits };
  }, [searchQuery, units, stations, missions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
      if (mapStyleRef.current && !mapStyleRef.current.contains(e.target as Node)) {
        setShowMapStyles(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pickSearchResult = (kind: 'unit' | 'station' | 'mission', id: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    if (kind === 'unit') {
      onOpenUnit?.(id);
    } else if (kind === 'station') {
      selectStation(id);
      onTabChange('stations');
    } else {
      selectMission(id);
      onTabChange('missions');
    }
  };

  // ── Help & FAQ cards (built in-component so card actions can reach the
  //    bug-reporter modal and the founder contact) ──
  const helpCards: Record<HelpTabId, HelpCardData[]> = {
    start: [
      { icon: Compass, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Pick a city & service', desc: 'Choose a department, build a station, and recruit units from the Stations tab.' },
      { icon: Building2, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'Dispatch from anywhere', desc: 'Click a mission marker on the map, then send units from the Dispatch Center or the unit panel.' },
      { icon: Radar, tint: 'bg-amber-500/15 text-amber-400', title: 'Patrol hot zones', desc: 'Patrol units cover the city automatically. Toggle the Crime Heat overlay to spot hot neighborhoods — click a zone to focus patrols there.' },
      { icon: Clock, tint: 'bg-blue-500/15 text-blue-400', title: 'Patrol lifecycle', desc: 'Set shift length (2–8 min) and post-mission behavior (return / patrol / auto) in Settings → Patrol Lifecycle. Units take a 60s rest break between shifts.' },
      { icon: Users, tint: 'bg-purple-500/15 text-purple-400', title: 'Crew your fleet', desc: 'Crew units with personnel from the Crew tab; Dispatchers stay at the station running comms.' },
      { icon: ShieldCheck, tint: 'bg-green-500/15 text-green-400', title: 'Enforce the law', desc: 'Clear police & traffic calls to arrest suspects — they get booked at the County Jail.' },
      { icon: Trophy, tint: 'bg-amber-500/15 text-amber-400', title: 'Climb the ranks', desc: 'Rookie to Chief as you level up — higher ranks multiply mission rewards, with per-service titles.' },
      { icon: BookOpen, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Shift Report', desc: 'End every shift with the debrief — per-zone heat, patrol coverage, crew fatigue, CPU-handled calls, and a shareable recap card.' },
      { icon: Gift, tint: 'bg-emerald-500/15 text-emerald-400', title: 'Daily login bonus', desc: 'Claim free coins on the main menu every day — Commander members get 5 coins, free players get 2. The bonus resets at midnight UTC.' },
      { icon: BadgeDollarSign, tint: 'bg-amber-500/15 text-amber-400', title: 'Shop & membership', desc: 'Tap the coin balance to open the Shop — buy Commander membership ($9.99/mo) for ×2 credits and ×2 training speed, or grab coin packs for instant upgrades. Try promo code WELCOME-50 for 50 free coins.' },
    ],
    gameplay: [
      { icon: CloudRain, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Weather shifts tactics', desc: 'Storms boost water and road rescues, fog slows response times, heatwaves drive medical calls.' },
      { icon: TriangleAlert, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'City-wide disasters', desc: 'Tornadoes, floods, and wildfires spawn zone-targeted mission waves — tune how often in Settings.' },
      { icon: Activity, tint: 'bg-green-500/15 text-green-400', title: 'The recovery phase', desc: 'After a disaster, recovery calls (damage assessment, displaced residents, debris) roll out until the city returns to normal.' },
      { icon: GraduationCap, tint: 'bg-purple-500/15 text-purple-400', title: 'Train your units', desc: 'Send a unit to training from its station — it returns with a higher level and clears calls faster.' },
      { icon: ArrowLeftRight, tint: 'bg-blue-500/15 text-blue-400', title: 'Relocate Command', desc: 'Move your fleet to another city from the pause menu (level-gated). A briefing shows exactly what carries over before you commit — cost scales with fleet size.' },
      { icon: Globe, tint: 'bg-emerald-500/15 text-emerald-400', title: 'City traits shape gameplay', desc: 'Every city has a unique trait that changes how it plays: Paris has Urban Density (more fires), London has Congestion Zone (slower response), Tokyo has Megacity Pulse (faster spawns). City choice is strategy, not just flavor.' },
      { icon: Radio, tint: 'bg-amber-500/15 text-amber-400', title: 'City-flavored radio', desc: 'Radio dispatch sounds like the city you\'re in — London says \'Acknowledged\', Paris says \'Reçu\', Tokyo says \'Shōchi\', Berlin says \'Verstanden\'. Call signs, codes, and dispatcher names change too.' },
    ],
    aid: [
      { icon: Handshake, tint: 'bg-blue-500/15 text-blue-400', title: 'Cross-service calls', desc: 'Partner-agency requests land in the blue Mutual Aid section of the Dispatch Board — never mixed silently into your queue.' },
      { icon: Zap, tint: 'bg-amber-500/15 text-amber-400', title: '25% bonus', desc: 'Answering a Mutual Aid request pays a 25% bonus and counts toward the Mutual Aid leaderboard stat.' },
      { icon: Cpu, tint: 'bg-purple-500/15 text-purple-400', title: 'Let the city answer', desc: 'Enable "City Answers Mutual Aid Calls" in Settings and partner-agency calls are handled by simulated units for a token payout.' },
    ],
    facilities: [
      { icon: Landmark, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Place Landmarks', desc: 'Build POIs (schools, parks, gas stations, government buildings) from the Place Landmark button — they anchor new EMS, fire, and police calls with radio callouts.' },
      { icon: Hospital, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'City General Hospital', desc: 'Build the ER and EMS transports patients there. Beds grow with call volume, and overflow diverts to the next city\u2019s trauma center.' },
      { icon: Plane, tint: 'bg-blue-500/15 text-blue-400', title: 'Air Ambulance Helipad', desc: 'Critical patients only airlift when you build the helipad — Remote Rescue and Highway Trauma calls bring the criticals for a faster flight to your pad.' },
      { icon: Radar, tint: 'bg-green-500/15 text-green-400', title: 'Coverage & gaps', desc: 'Toggle Station Coverage to see each station\u2019s effective radius (perks included), or Coverage Gaps to spot neighborhoods beyond every station\u2019s reach.' },
      { icon: Building2, tint: 'bg-amber-500/15 text-amber-400', title: 'Stations & upgrades', desc: 'Build fire, police, and EMS stations on the map — each has 5 upgrade levels that grow capacity, crew, and response radius.' },
    ],
    online: [
      { icon: Wifi, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Online Gameplay', desc: 'Multiplayer runs on the Dispatch HQ server: other commanders\u2019 units appear on your map, with live chat and presence. Toggle it in Settings → Network — Off is a private single-player session that keeps saving either way.' },
      { icon: Wrench, tint: 'bg-amber-500/15 text-amber-400', title: 'Maintenance mode', desc: 'When the founder pauses online services, your status chip turns amber and the multiplayer layer pauses — your single-player campaign keeps running untouched.' },
      { icon: Users, tint: 'bg-purple-500/15 text-purple-400', title: 'See other commanders', desc: 'Online players\u2019 units stream as live markers on your map through the viewport relay, and their stations show up nearby.' },
      { icon: MessageSquare, tint: 'bg-green-500/15 text-green-400', title: 'Alliance chat', desc: 'Alliance messages fly over the live channel with typing indicators and ✓✓ read receipts — and completing missions feeds shared alliance XP.' },
      { icon: Handshake, tint: 'bg-blue-500/15 text-blue-400', title: 'Recruitment board', desc: 'Leaders post listings with a tag, description, and min-level requirement — browse the directory and request to join an open alliance.' },
      { icon: Users, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'Co-op dispatch', desc: 'Shared missions broadcast in real time to your alliance — respond from the Alliance tab. When an ally clears a call, you see a CLEARED BY badge. Level 2+ to view the board, Level 3+ to dispatch, Level 4+ for cross-service.' },
      { icon: Inbox, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Inbox', desc: 'Admin broadcasts (PSAs, notices, messages) land as durable inbox messages — the bell icon shows your unread count.' },
    ],
    social: [
      { icon: User, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Your profile', desc: 'Rank, career records, and an editable display name + avatar.' },
      { icon: Users, tint: 'bg-purple-500/15 text-purple-400', title: 'Friends', desc: 'Search a dispatch username from the Friends panel and send a request — compare weekly stats head-to-head.' },
      { icon: Trophy, tint: 'bg-amber-500/15 text-amber-400', title: 'Leaderboards', desc: 'Compete on the global boards, climb alliance standings, and chase seasonal contest badges.' },
      { icon: Trophy, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'Seasonal contests', desc: 'Holiday windows run live contests — every cleared call counts toward the badge, and your rank updates in the top bar.' },
      { icon: Gift, tint: 'bg-amber-500/15 text-amber-400', title: 'Promo codes', desc: 'Redeem founder-distributed bonus codes (XP, credits, coins, levels) right from the profile dropdown.' },
    ],
    shortcuts: [
      { icon: Keyboard, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Pause / resume', desc: 'Freeze or continue the game at any moment.', keys: ['Esc'] },
      { icon: Keyboard, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Quick save', desc: 'Save the campaign manually — progress also autosaves every minute.', keys: ['Ctrl', 'S'] },
      { icon: Map, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'Mission markers', desc: 'Click any mission marker on the map for full details and one-tap dispatch of the nearest units.' },
    ],
    support: [
      { icon: Zap, tint: 'bg-amber-500/15 text-amber-400', title: 'Speed pays', desc: 'Clear missions with time to spare to earn a speed bonus.' },
      { icon: TriangleAlert, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'Don\u2019t let calls pile up', desc: 'Unresolved calls escalate and can generate Aftermath follow-ups.' },
      { icon: Cpu, tint: 'bg-purple-500/15 text-purple-400', title: 'Right tool, right call', desc: 'Match unit types to mission requirements for faster clearance.' },
      { icon: Bell, tint: 'bg-dispatch-cyan/15 text-dispatch-cyan', title: 'Stay alerted', desc: 'Turn on desktop notifications in Settings for critical calls while you\u2019re away.' },
      {
        icon: Bug, tint: 'bg-dispatch-red/15 text-dispatch-red', title: 'Found a bug?', desc: 'Tell the team exactly what happened — triage status shows up in your report.',
        action: { label: 'Open the bug reporter', onClick: () => { setShowHelp(false); setShowBugReport(true); } },
      },
      {
        icon: Mail, tint: 'bg-blue-500/15 text-blue-400', title: 'Talk to the founder', desc: 'Direct line to the Dispatch HQ team for feedback and feature ideas.',
        action: { label: 'Email the founder', onClick: () => { window.location.href = `mailto:${FOUNDER_EMAIL}`; } },
      },
    ],
  };

  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-50 h-12 bg-gray-950/90 backdrop-blur-md border-b border-gray-800/50">
        <div className="relative flex items-center h-full px-3 gap-2">
          {/* Left: Logo + Menu */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onMenuToggle}
              className="p-2 sm:p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Toggle sidebar"
            >
              <Menu className="w-4 h-4 text-gray-300" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <img
                src="/logo.png?v=13"
                alt=""
                className="w-6 h-6 rounded-full object-cover border border-gray-700/60"
              />
              {/* Wordmark is icon-only on tablets (md–lg) so the labeled tab strip
                  fits next to the clock + profile; full wordmark at lg+. */}
              <h1 className="hidden lg:inline font-bold text-sm text-white leading-tight">Dispatch HQ</h1>
            </div>
          </div>

          {/* Center: Navigation Tabs — labels from md+ (v0.29.1): tightened
              (11px type + tighter padding) until xl, where the full desktop
              chrome returns and tabs get normal sizing. max-w-full + overflow
              is a safety net so a seasonal/disaster chip can never push the
              right controls off-screen — worst case the strip scrolls. */}
          <nav className="flex-1 flex items-center justify-center min-w-0">
            <div className="hidden md:flex items-center gap-1 xl:gap-1.5 bg-gray-800/60 backdrop-blur-sm rounded-xl px-1 py-1 border border-gray-700/30 max-w-full overflow-x-auto">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id as NavTab)}
                    onMouseEnter={playHover}
                    title={item.label}
                    className={`relative flex items-center gap-1 px-1.5 xl:px-3 py-1.5 rounded-lg text-[11px] xl:text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-dispatch-red text-white shadow-lg shadow-red-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    {item.id === 'missions' ? (
                      <Radio className="w-3.5 h-3.5" />
                    ) : item.id === 'leaderboard' ? (
                      <Trophy className="w-3.5 h-3.5" />
                    ) : item.id === 'chat' ? (
                      <MessageSquare className="w-3.5 h-3.5" />
                    ) : item.id === 'stations' ? (
                      <StationIcon service={selectedService || 'fire'} className="w-3.5 h-3.5" />
                    ) : item.id === 'employees' ? (
                      <span className="text-sm">{SERVICE_CREW_ICONS[selectedService || 'police']}</span>
                    ) : (
                      <item.icon />
                    )}
                    <span className="hidden md:inline">{item.label}</span>

                    {item.badge && activeMissionCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-amber-500 text-[11px] font-bold text-gray-900 rounded-full">
                        {activeMissionCount > 99 ? '99+' : activeMissionCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Right: Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Secondary system toggles — full desktop chrome only at xl+; phones,
                tablets, AND compact desktops (md–xl) use the More menu so the labeled
                tab strip fits. */}
            <div className="hidden xl:flex items-center gap-0.5">
            {/* System Toggles */}
            <button
              onClick={onToggleCAD}
              className={`p-1.5 rounded-lg transition-colors ${showCAD ? 'bg-dispatch-red/20 text-dispatch-red' : 'hover:bg-white/10 text-gray-500'}`}
              title="CAD System"
              aria-label="CAD System"
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleTechTree}
              className={`p-1.5 rounded-lg transition-colors ${showTechTree ? 'bg-dispatch-cyan/20 text-dispatch-cyan' : 'hover:bg-white/10 text-gray-500'}`}
              title="Tech Tree"
              aria-label="Tech Tree"
            >
              <Cpu className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleFogOfWar}
              className={`p-1.5 rounded-lg transition-colors ${showFogOfWar ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-white/10 text-gray-500'}`}
              title="Fog of War"
              aria-label="Fog of War"
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={onTogglePatrolHeat}
              className={`p-1.5 rounded-lg transition-colors ${showPatrolHeat ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-gray-500'}`}
              title="Crime Heat"
              aria-label="Crime Heat"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleStationCoverage}
              className={`p-1.5 rounded-lg transition-colors ${showStationCoverage ? 'bg-dispatch-cyan/20 text-dispatch-cyan' : 'hover:bg-white/10 text-gray-500'}`}
              title="Station Coverage"
              aria-label="Station Coverage"
            >
              <Radar className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleCoverageGap}
              className={`p-1.5 rounded-lg transition-colors ${showCoverageGap ? 'bg-red-500/20 text-red-400' : 'hover:bg-white/10 text-gray-500'}`}
              title="Coverage Gaps"
              aria-label="Coverage Gaps"
            >
              <TriangleAlert className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-gray-700/50 mx-1" />

            {/* Bug Report */}
            <button
              onClick={() => setShowBugReport(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-500 hover:text-amber-400"
              title="Report a Bug"
              aria-label="Report a Bug"
            >
              <Bug className="w-4 h-4" />
            </button>

            {/* Global Quick Search */}
            <div className="relative" ref={searchRef}>
              <button
                onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}
                className={`p-1.5 rounded-lg transition-colors ${searchOpen ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-gray-400'}`}
                title="Quick Search (units, stations, missions)"
                aria-label="Quick Search"
              >
                <Search className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[260px] z-50 overflow-hidden"
                  >
                    <div className="px-2 py-1.5 border-b border-gray-700">
                      <input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search units, stations, calls…"
                        className="w-full bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/60"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {searchQuery.trim().length < 2 ? (
                        <p className="px-3 py-2 text-[11px] text-gray-500">Type at least 2 characters…</p>
                      ) : searchResults && searchResults.units.length + searchResults.stations.length + searchResults.missions.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-gray-500">No matches found.</p>
                      ) : searchResults && (
                        <>
                          {searchResults.units.length > 0 && (
                            <SearchGroup label="Units">
                              {searchResults.units.map((u) => (
                                <SearchItem key={u.id} icon="🚛" text={u.name} sub={u.type.replace(/_/g, ' ')} onClick={() => pickSearchResult('unit', u.id)} />
                              ))}
                            </SearchGroup>
                          )}
                          {searchResults.stations.length > 0 && (
                            <SearchGroup label="Stations">
                              {searchResults.stations.map((s) => (
                                <SearchItem key={s.id} icon="🏢" text={s.name} sub={s.type.replace(/_/g, ' ')} onClick={() => pickSearchResult('station', s.id)} />
                              ))}
                            </SearchGroup>
                          )}
                          {searchResults.missions.length > 0 && (
                            <SearchGroup label="Calls">
                              {searchResults.missions.map((m) => (
                                <SearchItem key={m.id} icon="🚨" text={m.name} sub={m.category} onClick={() => pickSearchResult('mission', m.id)} />
                              ))}
                            </SearchGroup>
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>

            {/* Game clock chip — virtual day/night + active weather (see lib/gameClock & lib/weather).
                Full chip on sm+; icon-only on phones to save space. */}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-bold select-none ${
                weather === 'storm'
                  ? 'bg-blue-950/70 border-blue-500/40 text-blue-200'
                  : weather === 'fog'
                    ? 'bg-gray-800/80 border-gray-500/40 text-gray-200'
                    : weather === 'heatwave'
                      ? 'bg-orange-950/60 border-orange-500/40 text-orange-200'
                      : night
                        ? 'bg-indigo-950/70 border-indigo-500/30 text-indigo-200'
                        : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
              }`}
              title={
                weather === 'storm' ? 'Severe thunderstorm — road & water calls up, EMS/police busier'
                  : weather === 'fog' ? 'Dense fog — units respond slower'
                  : weather === 'heatwave' ? 'Heat wave — medical calls up'
                  : night ? 'Night shift — fewer calls, more serious ones'
                  : 'Day shift'
              }
            >
              {weather === 'storm' ? <CloudRain className="w-3 h-3" />
                : weather === 'fog' ? <CloudFog className="w-3 h-3" />
                : weather === 'heatwave' ? <Flame className="w-3 h-3" />
                : night ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              <span className="font-mono">{clockLabel(gameMinutes)}</span>
              <span className="text-gray-500 hidden xl:inline">·</span>
              <span className="uppercase tracking-wider text-[11px] hidden xl:inline">
                {weather === 'storm' ? 'Storm' : weather === 'fog' ? 'Fog' : weather === 'heatwave' ? 'Heat' : night ? 'Night' : 'Day'}
              </span>
            </div>

            {/* Live seasonal contest chip — event + current rank at a glance (v0.21.2) */}
            {liveSeasonal && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-dispatch-red/15 border-dispatch-red/30 text-dispatch-red text-[11px] font-bold select-none"
                title={`${liveSeasonal.name} contest — every cleared call counts; rank refreshes live`}
              >
                <span className="text-xs leading-none">{liveSeasonal.icon}</span>
                <span className="hidden xl:inline uppercase tracking-wider text-[11px]">Contest</span>
                {seasonalRank !== null && (
                  <span className="font-mono">#{seasonalRank}</span>
                )}
              </div>
            )}

            {/* Active disaster chip — compact, non-blocking replacement for the
                floating banner; click opens the Notifications tab (v0.22.13). */}
            <DisasterStatusChip onOpen={onNotifications} />

            {/* Pause — touch tiers only (phones + tablets; Esc works on desktop) */}
            <button
              onClick={onPause}
              className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Pause"
              aria-label="Pause"
            >
              <Pause className="w-4 h-4 text-gray-400" />
            </button>

            {/* More menu — phones + tablets + compact desktops (below xl): overflow for
                secondary toggles that only fit the full desktop chrome at xl+ */}
            <div className="relative xl:hidden" ref={moreRef}>
              <button
                onClick={() => { setShowMore(!showMore); setShowProfile(false); }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400"
                title="More options"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showMore && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[220px] z-50 overflow-hidden py-1"
                  >
                    <MoreItem icon={<Phone className="w-3.5 h-3.5" />} label="CAD System" active={showCAD} onClick={() => { setShowMore(false); onToggleCAD(); }} />
                    <MoreItem icon={<Cpu className="w-3.5 h-3.5" />} label="Tech Tree" active={showTechTree} onClick={() => { setShowMore(false); onToggleTechTree(); }} />
                    <MoreItem icon={<Layers className="w-3.5 h-3.5" />} label="Fog of War" active={showFogOfWar} onClick={() => { setShowMore(false); onToggleFogOfWar(); }} />
                    <MoreItem icon={<Activity className="w-3.5 h-3.5" />} label="Crime Heat" active={showPatrolHeat} onClick={() => { setShowMore(false); onTogglePatrolHeat(); }} />
                    <MoreItem icon={<Radar className="w-3.5 h-3.5" />} label="Station Coverage" active={showStationCoverage} onClick={() => { setShowMore(false); onToggleStationCoverage(); }} />
                    <MoreItem icon={<TriangleAlert className="w-3.5 h-3.5" />} label="Coverage Gaps" active={showCoverageGap} onClick={() => { setShowMore(false); onToggleCoverageGap(); }} />
                    <MoreItem icon={<Map className="w-3.5 h-3.5" />} label={`Map Style: ${mapStyle}`} onClick={() => { setMapStyle(mapStyle === 'dark' ? 'light' : mapStyle === 'light' ? 'satellite' : 'dark'); setShowMore(false); }} />
                    <MoreItem icon={soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />} label={soundEnabled ? 'Mute Sound' : 'Unmute Sound'} onClick={() => { handleSoundToggle(); setShowMore(false); }} />
                    <MoreItem icon={isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />} label={isDarkMode ? 'Light Mode' : 'Dark Mode'} onClick={() => { toggleDarkMode(); setShowMore(false); }} />
                    <MoreItem icon={<Bug className="w-3.5 h-3.5" />} label="Report a Bug" onClick={() => { setShowMore(false); setShowBugReport(true); }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={onNotifications}
              className="relative p-2 sm:p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-gray-400" />
              {unreadCount + inboxUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-dispatch-red text-[11px] font-bold text-white rounded-full border border-gray-950">
                  {unreadCount + inboxUnread > 99 ? '99+' : unreadCount + inboxUnread}
                </span>
              )}
            </button>

            {/* Desktop-only system controls (phones + tablets + compact desktops use the More menu) */}
            <div className="hidden xl:flex items-center gap-0.5">
            <button
              onClick={handleSoundToggle}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={soundEnabled ? 'Mute sound' : 'Unmute sound'}
              aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-gray-400" /> : <VolumeX className="w-4 h-4 text-gray-500" />}
            </button>

            {/* Map Style Dropdown */}
            <div className="relative" ref={mapStyleRef}>
              <button
                onClick={() => { setShowMapStyles(!showMapStyles); setShowProfile(false); }}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-500"
                title="Map style"
                aria-label="Map style"
              >
                <Map className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showMapStyles && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-1 min-w-[120px] z-50"
                  >
                    {(['dark', 'light', 'satellite'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => { setMapStyle(style); setShowMapStyles(false); }}
                        className={`w-full px-3 py-1.5 text-xs rounded-md text-left transition-colors capitalize ${
                          mapStyle === style ? 'bg-dispatch-red text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                      >
                        {style === 'dark' ? '🌙 ' : style === 'light' ? '☀️ ' : '🛰️ '}{style}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={toggleDarkMode}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-gray-400" /> : <Moon className="w-4 h-4 text-gray-400" />}
            </button>
            </div>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => { setShowProfile(!showProfile); setShowMapStyles(false); }}
                className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-sm hover:ring-2 hover:ring-white/20 transition-all"
                title={player?.username ?? 'Profile'}
              >
                {avatarEmoji}
              </button>

              <AnimatePresence>
                {showProfile && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[200px] z-50 overflow-hidden"
                  >
                    <div className="px-3 py-3 border-b border-gray-700 bg-gray-800/50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-xl">
                          {avatarEmoji}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-white">{player?.username || 'Commander'}</p>
                            {isFounder && (
                              <span className="px-1 py-px rounded bg-dispatch-red/20 border border-dispatch-red/40 text-[11px] font-bold text-dispatch-red uppercase tracking-wider">
                                Founder
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate max-w-[140px]">{displayEmail || 'Guest account'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px]">{rank.icon}</span>
                            <span className="text-[11px] text-white">{rank.title}</span>
                            <span className="text-[11px] text-gray-500">· Lv {player?.level || 1}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="py-1">
                      <ProfileMenuItem icon={<User className="w-3.5 h-3.5" />} label="Profile" onClick={() => { setShowProfileModal(true); setShowProfile(false); }} />
                      <ProfileMenuItem icon={<Users className="w-3.5 h-3.5" />} label="Friends" onClick={() => { setShowSocial(true); setShowProfile(false); }} />
                      <ProfileMenuItem icon={<Settings className="w-3.5 h-3.5" />} label="Settings" onClick={() => { setShowSettings(true); setShowProfile(false); }} />
                      <ProfileMenuItem icon={<HelpCircle className="w-3.5 h-3.5" />} label="Help & FAQ" onClick={() => { setShowHelp(true); setShowProfile(false); }} />
                      {isFounder && (
                        <ProfileMenuItem icon={<ShieldCheck className="w-3.5 h-3.5 text-dispatch-red" />} label="Admin Console" onClick={() => { setShowAdmin(true); setShowProfile(false); }} />
                      )}
                    </div>
                    <div className="border-t border-gray-700 py-1">
                      <ProfileMenuItem icon={<LogOut className="w-3.5 h-3.5" />} label="Log Out" danger onClick={() => { setShowProfile(false); onLogout?.(); }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Shared Settings Modal — full dispatch settings incl. patrol tuning */}
      <Suspense fallback={null}>
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </Suspense>

      {/* Admin Console — founder-gated (item only renders for the founder email) */}
      <Suspense fallback={null}>
        <AdminPanel isOpen={showAdmin} onClose={() => setShowAdmin(false)} />
      </Suspense>

      {/* Profile + Social */}
      <Suspense fallback={null}>
        <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <SocialPanel isOpen={showSocial} onClose={() => setShowSocial(false)} />
      </Suspense>

      {/* Bug Report Modal */}
      <AnimatePresence>
        {showBugReport && (
          <Suspense fallback={null}>
            <BugReportModal isOpen={showBugReport} onClose={() => setShowBugReport(false)} />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Help & FAQ Modal — tabbed help center */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header — gradient banner + tabs */}
              <div className="relative px-5 pt-5 pb-4 border-b border-gray-800/60 bg-gradient-to-br from-dispatch-red/15 via-gray-900 to-dispatch-cyan/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dispatch-red to-dispatch-cyan flex items-center justify-center shadow-lg shadow-dispatch-red/20">
                      <HelpCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white leading-tight">Help & FAQ</h2>
                      <p className="text-[11px] text-gray-400 mt-0.5">Everything you need to command your city</p>
                    </div>
                  </div>
                  <button onClick={() => setShowHelp(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tab bar */}
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {HELP_TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setHelpTab(t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        helpTab === t.id
                          ? 'bg-dispatch-red/20 text-white ring-1 ring-dispatch-red/40'
                          : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      }`}
                    >
                      <t.icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards per tab */}
              <div className="p-5 max-h-[55vh] overflow-y-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={helpTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="grid gap-2.5 md:grid-cols-2"
                  >
                    {helpCards[helpTab].map((card) => (
                      <HelpCard key={card.title} {...card} />
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 border-t border-gray-800/60 flex items-center justify-between gap-3">
                <button
                  onClick={() => { setShowHelp(false); setShowBugReport(true); }}
                  className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-dispatch-cyan transition-colors"
                >
                  <Bug className="w-3 h-3" />
                  Found a problem? Report it
                </button>
                <button onClick={() => setShowHelp(false)} className="px-4 py-1.5 bg-dispatch-red hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors">
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 pt-1 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-600">{label}</p>
      {children}
    </div>
  );
}

function SearchItem({ icon, text, sub, onClick }: { icon: string; text: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/60 hover:text-white transition-colors text-left"
    >
      <span className="text-sm shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{text}</span>
        <span className="block text-[11px] text-gray-500 truncate capitalize">{sub}</span>
      </span>
    </button>
  );
}

function ProfileMenuItem({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${danger ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'}`}>
      {icon}
      {label}
    </button>
  );
}

function MoreItem({ icon, label, onClick, active = false }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors ${active ? 'text-dispatch-red bg-dispatch-red/10' : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'}`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {active && <span className="w-1.5 h-1.5 rounded-full bg-dispatch-red" />}
    </button>
  );
}

// ── Help & FAQ (visual help center) ──────────────────────────────────────────

type HelpTabId = 'start' | 'gameplay' | 'aid' | 'facilities' | 'online' | 'social' | 'shortcuts' | 'support';

interface HelpCardData {
  icon: LucideIcon;
  tint: string; // icon-chip color classes
  title: string;
  desc: string;
  keys?: string[]; // keyboard chips
  action?: { label: string; onClick: () => void };
}

const HELP_TABS: { id: HelpTabId; label: string; icon: LucideIcon }[] = [
  { id: 'start', label: 'Getting Started', icon: Compass },
  { id: 'gameplay', label: 'Gameplay', icon: TriangleAlert },
  { id: 'aid', label: 'Mutual Aid', icon: Handshake },
  { id: 'facilities', label: 'Build Your City', icon: Building2 },
  { id: 'online', label: 'Online & Multiplayer', icon: Wifi },
  { id: 'social', label: 'Social', icon: Users },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'support', label: 'Tips & Support', icon: BookOpen },
];

function HelpCard({ icon: Icon, tint, title, desc, keys, action }: HelpCardData) {
  return (
    <div className="rounded-xl border border-gray-700/40 bg-gray-800/40 p-3 transition-colors hover:border-gray-600/60 hover:bg-gray-800/70">
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-white leading-tight">{title}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
          {keys && (
            <div className="flex items-center gap-1 mt-1.5">
              {keys.map((k) => (
                <kbd key={k} className="px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-300 text-[11px] font-mono border border-gray-600/40">{k}</kbd>
              ))}
            </div>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-dispatch-cyan hover:text-cyan-300 transition-colors"
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


