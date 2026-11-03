// ============================================
// Dispatch HQ — Main Menu
// ============================================
// Central menu screen with Play, Settings, Credits, and New Game options.

import { useLayoutEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Siren, Play, Settings, Trophy, Volume2,
  Monitor, Palette, RotateCcw, ChevronRight, Star,
  Shield, Flame, Heart, X, Save, Newspaper, ExternalLink,
  PlayCircle, Clapperboard, GraduationCap, LogOut,
} from 'lucide-react';
import { DailyBonusBanner } from './DailyBonusBanner';
import { ChallengeTracker } from './ChallengeTracker';
import type { LucideIcon } from 'lucide-react';

import { useGameStore } from '@/stores/gameStore';
import { formatTimer } from '@/utils/timeFormat';
import { rankForLevel } from '@dispatch-hq/shared';
import { GuestUpgradeCard } from './GuestUpgradeCard';
import { SaveSlotsModal } from './SaveSlotsModal';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { RELEASE_NOTES, currentVersion } from '@/data/releaseNotes';
import { getActiveSlot, listSaveSlots, type SaveSlotId } from '@/hooks/useSaveSystem';
import { TUTORIAL_STEP_COUNT } from './OnboardingOverlay';
import { TUTORIAL_MISSION_CHAIN } from '@/lib/batch3e';
import { itchPromoLabel } from '@/lib/itchPromo';

// One-time guest-upgrade prompt: keyed by guest id so a brand-new guest (or a
// guest who logs out and back in as a different identity) is offered again,
// while a dismissed prompt never nags the same device+guest twice.
const upgradeDismissKey = (guestId?: string) => `dhq_upgrade_prompt_dismissed_${guestId ?? 'anon'}`;

interface MainMenuProps {
  onContinue: () => void;
  onPlay: () => void;
  onSettings: () => void;
  onNewCampaign?: (slot?: SaveSlotId) => void;
  onLoadGame: (slot: SaveSlotId) => void;
  onDeleteSlot: (slot: SaveSlotId) => void;
  hasSave?: boolean;
  onLogout: () => void;
}

const MENU_ITEMS = [
  { id: 'continue', label: 'Continue Dispatch', icon: Play, color: 'text-dispatch-green', description: 'Return to active operations' },
  { id: 'load', label: 'Load Game', icon: Save, color: 'text-dispatch-cyan', description: 'Choose a saved campaign — Slots 1–3' },
  { id: 'new', label: 'New Campaign', icon: RotateCcw, color: 'text-dispatch-cyan', description: 'Start a fresh dispatch career' },
  { id: 'release-notes', label: 'Release Notes', icon: Newspaper, color: 'text-dispatch-cyan', description: "See what's new in Dispatch HQ" },
  { id: 'stats', label: 'Dispatch Records', icon: Trophy, color: 'text-dispatch-orange', description: 'View your career statistics' },
  { id: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-400', description: 'Configure dispatch preferences' },
];

// ── Community links — the game's official page, reachable right from the menu ──
const SOCIAL_LINKS = [
  {
    id: 'reddit',
    label: 'Reddit',
    handle: 'r/DispatchHQ',
    href: 'https://www.reddit.com/r/DispatchHQ/',
    color: '#FF4500',
    hoverBg: 'hover:bg-[#FF4500]/20',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.688 0-1.248.561-1.248 1.25 0 .687.56 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.561-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.25a.328.328 0 0 0 0-.463.33.33 0 0 0-.463 0c-.692.692-1.695.447-2.267-.25a.336.336 0 0 0-.256-.094z" />
      </svg>
    ),
  },
];

function fmtTime(seconds: number): string {
  // Records keep their own guard (unset = Infinity); the clock itself is the
  // shared formatter so fractional response times never render as decimals.
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return formatTimer(seconds);
}

type StatsRow = { label: string; value: string; icon: LucideIcon };

function buildStats(
  player: { level: number } | null,
  career: { missionsCompleted: number; totalCreditsEarned: number; bestResponseTime: number },
  shift: { missionsCompleted: number },
  rankLabel: string,
): StatsRow[] {
  return [
    { label: 'Rank', value: rankLabel, icon: Star },
    { label: 'Missions Completed', value: String(career.missionsCompleted), icon: Shield },
    { label: 'Total Credits Earned', value: career.totalCreditsEarned.toLocaleString(), icon: Trophy },
    { label: 'Current Level', value: String(player?.level ?? 1), icon: Siren },
    { label: 'Best Response Time', value: fmtTime(career.bestResponseTime), icon: Shield },
    { label: 'This Shift', value: `${shift.missionsCompleted} cleared`, icon: Shield },
  ];
}

export function MainMenu({ onContinue, onPlay, onSettings, onNewCampaign, onLoadGame, onDeleteSlot, hasSave, onLogout }: MainMenuProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showSlots, setShowSlots] = useState(false);
  const [slotsMode, setSlotsMode] = useState<'load' | 'new'>('load');

  // Real career records from the game store — shown in the Dispatch Records modal.
  const player = useGameStore((s) => s.player);
  const career = useGameStore((s) => s.career);
  const shift = useGameStore((s) => s.shift);
  const selectedService = useGameStore((s) => s.selectedService);
  const rank = rankForLevel(player?.level ?? 1, selectedService ?? undefined);
  const STATS = buildStats(player, career, shift, `${rank.icon} ${rank.title}`);

  // One-time upgrade offer: only for guests, and only until dismissed (per
  // guest id). The initializer deliberately does NOT depend on isGuest — the
  // player can hydrate a tick after first render, and the render gate below
  // (isGuest && showUpgradePrompt) decides visibility every frame anyway.
  const isGuest = player?.email ? player.email.toLowerCase().startsWith('guest_') : false;
  const [showUpgradePrompt, setShowUpgradePrompt] = useState<boolean>(() => {
    // If the id isn't hydrated yet, fall back to the shared anon key so a
    // dismissed prompt can't reappear across reloads.
    return !localStorage.getItem(player?.id ? upgradeDismissKey(player.id) : upgradeDismissKey(undefined));
  });
  // Keeps the card mounted after a successful upgrade so the confirmation
  // renders — the email swap flips isGuest false, which would otherwise hide
  // the card before the success message is ever seen.
  const [upgradeDone, setUpgradeDone] = useState(false);

  // Once the real id hydrates, honor a dismissal recorded for that guest.
  // useLayoutEffect runs before paint, so a returning guest with a dismissed
  // prompt never sees it flash on screen during the hydration frame.
  useLayoutEffect(() => {
    if (player?.id && localStorage.getItem(upgradeDismissKey(player.id))) {
      setShowUpgradePrompt(false);
    }
  }, [player?.id]);

  // Continue is always shown; disabled when no save exists so players know it's available.
  const visibleMenuItems = MENU_ITEMS;

  // Tutorial progress on the active (Continue) slot: the save preview carries
  // the tour step (0..N-1 mid-tour, -1 done), so the Continue card can tell a
  // player a half-finished tour is waiting before they resume (v0.22.x). Reads
  // the refreshSaveSlots cache — App re-renders this screen when slots load.
  const activePreview = listSaveSlots().find((s) => s.slot === getActiveSlot())?.preview ?? null;
  const tourStep = activePreview?.onboardingStep ?? -1;
  const tourWaiting = tourStep >= 0 && tourStep < TUTORIAL_STEP_COUNT;
  // Batch 3e: first-run flag + campaign progress on the menu. A fresh
  // account (no save) is told the tour ends in a guided first shift; a
  // mid-campaign return to the menu shows the chain's current step.
  const tutorialCampaign = useGameStore((st) => st.tutorialCampaign);
  const campaignStep = tutorialCampaign.active
    ? TUTORIAL_MISSION_CHAIN[tutorialCampaign.stepIndex] ?? null
    : null;

  return (
    <motion.div
      className="fixed inset-0 z-[90] bg-gray-950 flex"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Left side — Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-dispatch-red/10 via-dispatch-red/5 to-transparent" />

        {/* Animated background elements */}
        <div className="absolute inset-0">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-32 h-32 rounded-full border border-dispatch-red/10"
              initial={{
                x: `${20 + i * 15}%`,
                y: `${10 + i * 12}%`,
                scale: 0.5 + i * 0.2,
              }}
              animate={{
                scale: [0.5 + i * 0.2, 0.7 + i * 0.2, 0.5 + i * 0.2],
                opacity: [0.1, 0.2, 0.1],
              }}
              transition={{
                duration: 4 + i,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full">
          

          <motion.div
            initial={{ y: -20, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', damping: 18, stiffness: 200 }}
            className="mb-6"
          >
            <img
              src="/logo.png?v=13"
              alt="Dispatch HQ"
              className="w-28 h-28 rounded-full object-cover border-2 border-gray-700/60 shadow-2xl shadow-dispatch-red/20"
            />
          </motion.div>

          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-5xl font-black text-white tracking-tight"
          >
            DISPATCH <span className="text-dispatch-red">HQ</span>
          </motion.h1>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-gray-500 text-sm mt-2 font-medium"
          >
            Emergency Dispatch Simulation
          </motion.p>

          {/* Decorative service icons */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex gap-4 mt-8"
          >
            {[Flame, Shield, Heart].map((Icon, i) => (
              <motion.div
                key={i}
                className="w-10 h-10 rounded-xl bg-gray-800/60 border border-gray-700/30
                           flex items-center justify-center"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
              >
                <Icon className={`w-5 h-5 ${
                  i === 0 ? 'text-dispatch-red' : i === 1 ? 'text-dispatch-blue' : 'text-dispatch-green'
                }`} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right side — Menu */}
      {/* Outer pane scrolls when the column is taller than the window (the full
          guest card + menu + stats easily exceed short viewports). The inner
          column uses margin:auto (m-auto) — it centers when it fits, and
          top-aligns + scrolls when it doesn't, so no content is ever cut off. */}
      <div className="w-full lg:w-1/2 flex flex-col items-center overflow-y-auto py-8">
        <div className="w-full flex flex-col items-center m-auto px-8">
        {/* Mobile logo */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="lg:hidden mb-4 text-center"
        >
          <img
            src="/logo.png?v=13"
            alt="Dispatch HQ"
            className="w-20 h-20 rounded-full object-cover border border-gray-700/50 shadow-xl mx-auto mb-3"
          />
          <h1 className="text-2xl font-black text-white">
            DISPATCH <span className="text-dispatch-red">HQ</span>
          </h1>
        </motion.div>

        {/* One-time guest upgrade offer */}
        {/* NOTE: no height: 0→auto animation here. Under macOS/iOS Reduce Motion,
            framer-motion jumps height animations instantly (type: false) and the
            'auto' measurement taken at mount resolves too small, so overflow-hidden
            clipped the card to a stub (email/password/button hidden). A plain
            slide+fade keeps the reveal without the fragile height animation. */}
        <AnimatePresence>
          {(isGuest || upgradeDone) && showUpgradePrompt && (
            <motion.div
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className="w-full max-w-xs mb-6"
            >
              <div className="rounded-xl border border-amber-500/30 bg-gray-900/70 backdrop-blur-sm shadow-lg shadow-amber-500/5 p-1.5">
                <GuestUpgradeCard
                  onDismiss={() => {
                    localStorage.setItem(upgradeDismissKey(player?.id), '1');
                    setShowUpgradePrompt(false);
                  }}
                  // Let the success confirmation render for a moment before the
                  // card collapses — the identity swap hides it via isGuest too.
                  onUpgraded={() => {
                    setUpgradeDone(true);
                    window.setTimeout(() => {
                      setShowUpgradePrompt(false);
                      setUpgradeDone(false);
                    }, 2600);
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Daily login bonus */}
        <div className="w-full max-w-xs">
          <DailyBonusBanner />
        </div>

        {/* Batch 3d: daily + weekly challenges */}
        <div className="w-full max-w-xs">
          <ChallengeTracker coinRewards />
        </div>

        {/* Menu items */}
        <div className="w-full max-w-xs space-y-2">
          {visibleMenuItems.map((item, index) => (
            <motion.button
              key={item.id}
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              disabled={item.id === 'continue' && !hasSave}
              onClick={() => {
                if (item.id === 'continue' && !hasSave) return;
                if (item.id === 'continue') onContinue();
                else if (item.id === 'load') { setSlotsMode('load'); setShowSlots(true); }
                else if (item.id === 'new') { setSlotsMode('new'); setShowSlots(true); }
                else if (item.id === 'settings') onSettings();
                else if (item.id === 'stats') setShowStats(true);
                else if (item.id === 'release-notes') setShowReleaseNotes(true);
              }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border
                         ${item.id === 'continue' && !hasSave
                           ? 'bg-gray-800/20 border-gray-800/30 opacity-50 cursor-not-allowed'
                           : 'bg-gray-800/40 border-gray-700/30 hover:border-gray-600/50 hover:bg-gray-800/60 group'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                hoveredItem === item.id ? 'bg-gray-700/60' : 'bg-gray-800/60'
              }`}>
                <item.icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-dispatch-red transition-colors">
                  {item.label}
                </p>
                <p className="text-[11px] text-gray-500 truncate">{item.description}</p>
                {item.id === 'continue' && campaignStep && (
                  <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md
                                    bg-dispatch-cyan/10 border border-dispatch-cyan/30
                                    text-[11px] font-bold text-dispatch-cyan">
                    🎓 First Shift — step {tutorialCampaign.stepIndex + 1} of {TUTORIAL_MISSION_CHAIN.length}: {campaignStep.name}
                  </span>
                )}
                {item.id === 'new' && !hasSave && (
                  <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md
                                    bg-dispatch-cyan/10 border border-dispatch-cyan/30
                                    text-[11px] font-bold text-dispatch-cyan">
                    🎓 First run — the tour ends with a guided first shift
                  </span>
                )}
                {item.id === 'continue' && tourWaiting && (
                  <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md
                                    bg-amber-500/10 border border-amber-500/30
                                    text-[11px] font-bold text-amber-400">
                    <GraduationCap className="w-3 h-3" />
                    Step {tourStep + 1} of {TUTORIAL_STEP_COUNT} — tour in progress
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
            </motion.button>
          ))}
        </div>

        {/* Watch Trailer — the gameplay walkthrough, right from the menu */}
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.65 }}
          onClick={() => setShowTrailer(true)}
          className="w-full max-w-xs mt-6 flex items-center gap-3 p-3 rounded-xl
                     border border-dispatch-red/30 bg-dispatch-red/10
                     hover:bg-dispatch-red/20 hover:border-dispatch-red/50
                     transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-dispatch-red/20 flex items-center justify-center">
            <PlayCircle className="w-5 h-5 text-dispatch-red" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white group-hover:text-dispatch-red transition-colors">
              Watch Trailer
            </p>
            <p className="text-[11px] text-gray-400">60-second walkthrough — real gameplay</p>
          </div>
          <ChevronRight className="w-4 h-4 text-dispatch-red/60 group-hover:text-dispatch-red transition-colors" />
        </motion.button>

        {/* Community — official Reddit page */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="w-full max-w-xs mt-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-2">Community</p>
          <div className="grid grid-cols-1 gap-2">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/40 border border-gray-700/30
                            transition-all hover:border-gray-500/60 ${social.hoverBg} group`}
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: social.color }}
                >
                  {social.icon}
                </span>
                <span className="text-left min-w-0">
                  <span className="block text-[11px] font-semibold text-white group-hover:text-dispatch-red transition-colors truncate">
                    {social.label}
                  </span>
                  <span className="block text-[11px] text-gray-500 truncate">{social.handle}</span>
                </span>
                <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-gray-400 ml-auto shrink-0 transition-colors" />
              </a>
            ))}
          </div>
        </motion.div>

        {/* Play on itch.io — platform promo widget (responsive: the 552px embed
            is scaled to the menu column so nothing clips on phones or desktop) */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="w-full max-w-xs mt-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-2">
            {itchPromoLabel()}
          </p>
          <div
            className="overflow-hidden rounded-xl border border-gray-800/50 bg-gray-800/20"
            style={{ height: 97 }}
          >
            <iframe
              title="Dispatch HQ on itch.io"
              frameBorder="0"
              src="https://itch.io/embed/4854287"
              width="552"
              height="167"
              className="origin-top-left"
              style={{ transform: 'scale(0.58)', transformOrigin: 'top left' }}
            >
              <a href="https://agreatgame.itch.io/dispatch-hq">Dispatch HQ by AGreatGame</a>
            </iframe>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 leading-snug">
            <span className="text-emerald-400 font-semibold">Web version is FREE.</span>{' '}
            A membership program and coin purchases for gamers are coming in a future update.
          </p>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="w-full max-w-xs mt-6 grid grid-cols-2 gap-2"
        >
          {STATS.slice(0, 4).map((stat, i) => (
            <div key={i} className="bg-gray-800/30 border border-gray-800/50 rounded-lg p-3 text-center">
              <stat.icon className="w-4 h-4 text-gray-600 mx-auto mb-1" />
              <p className="text-sm font-bold text-white">{stat.value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Account — signed-in identity + sign out (easy access from the menu) */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="w-full max-w-xs mt-6 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-800/30 border border-gray-800/50"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600">Signed in as</p>
            <p className="text-xs font-semibold text-gray-300 truncate">{player?.username || player?.email || 'Commander'}</p>
          </div>
          <button
            onClick={onLogout}
            title="Log out of this account"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[11px] font-semibold hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Out
          </button>
        </motion.div>

        {/* Version — auto-derives from the latest release note so it never goes stale */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-[11px] text-gray-700 mt-8 font-mono"
        >
          v{currentVersion()} • Built with ❤️ by Dispatch HQ Team
        </motion.p>
        </div>
      </div>

      {/* Stats Modal */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowStats(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-dispatch-yellow" />
                  <h2 className="text-lg font-bold text-white">Dispatch Records</h2>
                </div>
                <button onClick={() => setShowStats(false)} className="p-1 hover:bg-gray-800 rounded-lg">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3">
                {STATS.map((stat, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-800/40 rounded-xl">
                    <div className="flex items-center gap-3">
                      <stat.icon className="w-5 h-5 text-gray-500" />
                      <span className="text-sm text-gray-300">{stat.label}</span>
                    </div>
                    <span className="text-sm font-bold text-white">{stat.value}</span>
                  </div>
                ))}
              </div>

              <p className="text-center text-[11px] text-gray-600 mt-6">
                Stats persist across sessions when connected to the server.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load Game / New Campaign slot picker */}
      <SaveSlotsModal
        isOpen={showSlots}
        mode={slotsMode}
        onClose={() => setShowSlots(false)}
        onLoad={(slot) => onLoadGame(slot)}
        onStartNew={(slot) => { onNewCampaign ? onNewCampaign(slot) : onPlay(); }}
        onDelete={(slot) => onDeleteSlot(slot)}
      />

      {/* Trailer Modal */}
      <AnimatePresence>
        {showTrailer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowTrailer(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl p-4 w-full max-w-3xl"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Clapperboard className="w-5 h-5 text-dispatch-red" />
                  <h2 className="text-lg font-bold text-white">Dispatch HQ — Trailer</h2>
                </div>
                <button onClick={() => setShowTrailer(false)} className="p-1 hover:bg-gray-800 rounded-lg">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <video
                src="/trailer.mp4"
                poster="/trailer-poster.jpg"
                controls
                autoPlay
                playsInline
                className="w-full rounded-xl bg-black aspect-video"
              />
              <p className="text-center text-[11px] text-gray-600 mt-3">
                Real gameplay — West Memphis to Nashville. Command the chaos. Save the city.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Release Notes Modal — shared with the pause menu */}
      <ReleaseNotesModal isOpen={showReleaseNotes} onClose={() => setShowReleaseNotes(false)} />
    </motion.div>
  );
}