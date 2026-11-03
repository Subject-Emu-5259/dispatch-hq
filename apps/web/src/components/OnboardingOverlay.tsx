// ============================================
// Dispatch HQ — Onboarding Tutorial Flow
// (v0.22.4: visual-card restyle to match Help & FAQ — icon chips, gradient
//  header, tip/kbd lines, real spotlight cutout on highlighted UI)
// ============================================

import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, X, Siren, Building2, CarFront, Radio, Trophy, Lightbulb,
  PencilLine, Radar, MapPinned, Landmark, HeartPulse, Plane, type LucideIcon,
} from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import { playSuccess } from '../utils/sound';
import { markTutorialCompleted } from '../lib/tutorialSeen';
import { startTutorialCampaign, TUTORIAL_MISSION_CHAIN } from '../lib/batch3e';

interface TutorialStep {
  id: string;
  title: string;
  message: string;
  icon: LucideIcon;
  tint: string; // icon-chip color classes (Help & FAQ style)
  tip?: string; // extra "did you know" line under the message
  keys?: string[]; // keyboard chips (Help & FAQ style)
  highlight?: string; // CSS selector to spotlight
  position: 'center' | 'top-left' | 'bottom-center' | 'bottom-right';
  action?: 'build_station' | 'buy_unit' | 'dispatch' | 'open_unit_panel' | 'open_poi_builder';
  completionCheck?: () => boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Dispatch HQ!',
    message: 'You are now in command. Build stations, deploy units, and respond to emergencies across the city.',
    icon: Siren,
    tint: 'bg-dispatch-cyan/15 text-dispatch-cyan',
    tip: 'This quick tour takes about two minutes — you can skip it at any time.',
    position: 'center',
  },
  {
    id: 'build_station',
    title: 'Build Your First Station',
    message: 'Tap "Build Station" to construct your first emergency station — this is where your units live.',
    icon: Building2,
    tint: 'bg-dispatch-red/15 text-dispatch-red',
    highlight: '[data-tutorial="build-station"]',
    position: 'top-left',
    action: 'build_station',
  },
  {
    id: 'buy_unit',
    title: 'Purchase a Unit',
    message: 'Now expand your station: click the expand arrow on your station card to recruit your first unit.',
    icon: CarFront,
    tint: 'bg-amber-500/15 text-amber-400',
    tip: 'Fire, police, and EMS units each excel at different call types.',
    position: 'top-left',
    action: 'buy_unit',
  },
  {
    id: 'dispatch',
    title: 'Dispatch to Emergency',
    message: 'A mission has appeared! Click its card to view the details, then dispatch your nearest unit to respond.',
    icon: Radio,
    tint: 'bg-green-500/15 text-green-400',
    tip: 'Faster response times earn bigger speed bonuses.',
    position: 'center',
    action: 'dispatch',
  },
  {
    id: 'rename_unit',
    title: 'Name Your Unit',
    message: 'Click your unit on the map to open its info panel, then tap the pencil to give it a call sign — “Engine 7” beats “engine_7”.',
    icon: PencilLine,
    tint: 'bg-violet-500/15 text-violet-400',
    tip: 'Unit names persist in your save, so your fleet keeps its identity across sessions.',
    highlight: '[data-tutorial="rename-unit"]',
    position: 'top-left',
    action: 'open_unit_panel',
  },
  {
    id: 'patrol_hotspot',
    title: 'Patrol Crime Hot Zones',
    message: 'Free units can patrol on their own. Open a unit’s panel, pick a mode — “Crime hotspot” focuses the neighborhoods with the most calls — then hit START PATROL.',
    icon: Radar,
    tint: 'bg-blue-500/15 text-blue-400',
    tip: 'Patrolling units spot new incidents on their own, keeping the city covered between missions.',
    highlight: '[data-tutorial="start-patrol"]',
    position: 'top-left',
    action: 'open_unit_panel',
    completionCheck: () => useGameStore.getState().patrolRoutes.length > 0,
  },
  {
    id: 'place_landmark',
    title: 'Place Your First Landmark',
    message: 'Cities come alive with places: open the Place Landmark builder, pick a type — a school, park, or gas station — then click the map where it should go. Landmarks anchor the missions that spawn around them.',
    icon: Landmark,
    tint: 'bg-sky-500/15 text-sky-400',
    tip: 'The builder is open for you now — choose a landmark and click anywhere in the city to drop it. If you close it, the Place Landmark button in the sidebar reopens it.',
    position: 'bottom-right',
    action: 'open_poi_builder',
    highlight: '[data-tutorial="place-landmark"]',
    completionCheck: () => useGameStore.getState().placedPois.length > 0,
  },
  {
    id: 'place_hospital',
    title: 'Build the City General Hospital',
    message: 'Now the heart of your EMS operation: pick “City General Hospital” in the same builder and place it on the map. EMS patients drive to YOUR hospital\'s ER — and the helipad for critical airlifts comes next.',
    icon: HeartPulse,
    tint: 'bg-emerald-500/15 text-emerald-400',
    tip: 'The hospital costs $6,000 — if you can\'t afford it yet, skip ahead and build it anytime from the same button.',
    position: 'bottom-right',
    action: 'open_poi_builder',
    highlight: '[data-tutorial="place-landmark"]',
    completionCheck: () => useGameStore.getState().hospital != null,
  },
  {
    id: 'place_helipad',
    title: 'Build the Air Ambulance Helipad',
    message: 'Critical patients fly straight to YOUR pad: pick “Air Ambulance Helipad” in the same builder and place it near the hospital. When a critical call comes in, the transporting unit becomes a helicopter and flies to the pad at ~200 km/h.',
    icon: Plane,
    tint: 'bg-amber-500/15 text-amber-400',
    tip: 'The helipad costs $2,000 — if you can\'t afford it yet, skip ahead and build it anytime from the same button.',
    position: 'bottom-right',
    action: 'open_poi_builder',
    highlight: '[data-tutorial="place-landmark"]',
    completionCheck: () => useGameStore.getState().helipad != null,
  },
  {
    id: 'relocate_city',
    title: 'Relocate Your Command',
    message: 'One city is just the start: pause the game (Esc) and pick “Relocate Command” to move your fleet to a new city. Relocation is level-gated and costs credits scaled to your fleet size.',
    icon: MapPinned,
    tint: 'bg-violet-500/15 text-violet-400',
    tip: 'Each city has its own neighborhoods, stations, and crime patterns — the arc continues as you rank up.',
    highlight: '[data-tutorial="relocate"]',
    position: 'bottom-center',
  },
  {
    id: 'complete',
    title: "You're Ready!",
    message: 'Your unit is responding. Build, dispatch, patrol, and grow across cities — good luck, Commander!',
    icon: Trophy,
    tint: 'bg-amber-500/15 text-amber-400',
    tip: 'Find the full guide any time under your profile → Help & FAQ.',
    position: 'center',
  },
];

// Shared step count so other surfaces (pause menu, help) can advertise the
// tour length without hardcoding — the tour grew 8 → 11 steps as features
// landed, and the pause menu previously drifted to a stale "8-step" label.
export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

/**
 * Sentinel written to the store (and the save) when the tour is finished or
 * skipped: any value >= 0 is a mid-tour step to resume; -1 means "done", so a
 * reload/Continue never resurrects the tour for a commander who completed it.
 */
export const ONBOARDING_STEP_DONE = -1;

/** Pure clamp for the persisted step — guards corruption and out-of-range
 * values (e.g. a step index from a save written by a future, longer tour). */
export function clampTutorialStep(raw: number | null | undefined, stepCount: number = TUTORIAL_STEP_COUNT): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  if (raw < 0) return ONBOARDING_STEP_DONE;
  return Math.min(Math.floor(raw), stepCount - 1);
}

/**
 * Percentage through the tour for the mini progress ring: 0% on the first
 * step, 100% on the last. Pure so the ring and its tests share one source.
 */
export function tourPercent(step: number, count: number): number {
  if (typeof step !== 'number' || !Number.isFinite(step)) return 0;
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 1) return 100;
  const pct = (Math.max(0, step) / (count - 1)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Completion-celebration trigger (v0.22.x): should the confetti fire on this
 * step? True only when the ring first hits 100% — i.e. the final step — and
 * the caller enforces the one-shot rule with its ref. Pure so the "ring first
 * hits 100%" rule is testable without rendering the overlay.
 */
export function shouldCelebrateTourStep(step: number, count: number): boolean {
  return tourPercent(step, count) >= 100;
}

/** Mini circular progress ring around the step counter (v0.22.x) — the fill
 * tracks how far through the tour the commander is at a glance. */
function TourProgressRing({ step, count }: { step: number; count: number }) {
  const pct = tourPercent(step, count);
  const size = 20;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 shrink-0"
      aria-hidden="true"
    >
      {/* Track */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-700/80" />
      {/* Progress — dashoffset sweeps the arc from 0% to 100% through the tour */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="stroke-dispatch-red transition-all duration-300"
      />
    </svg>
  );
}

// ── Tour-complete confetti (v0.22.x) ────────────────────────────────────────
// A small, tasteful burst when the ring first hits 100% (the "You're Ready!"
// step). Pure CSS/framer-motion — no canvas, no dependency. The particles are
// deterministic (fixed angles + seeded delays) so it renders identically every
// time instead of reshuffling on each re-render.
const CONFETTI_COLORS = ['#F87171', '#FBBF24', '#34D399', '#22D3EE', '#A78BFA', '#F9FAFB'];
const CONFETTI_COUNT = 14;

function TourConfetti({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="tour-confetti"
          className="pointer-events-none absolute inset-0 overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
            const angle = (i / CONFETTI_COUNT) * Math.PI * 2;
            const dist = 60 + ((i * 37) % 45); // 60–104px, spread by index
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist * 0.75 - 24;
            const rotate = ((i * 91) % 360) - 180;
            const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            const size = 5 + (i % 3) * 2; // 5–9px
            return (
              <motion.span
                key={i}
                className="absolute rounded-sm"
                style={{
                  left: '50%',
                  top: '45%',
                  width: size,
                  height: size * 0.6,
                  background: color,
                  boxShadow: `0 0 6px ${color}66`,
                }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
                animate={{ x: dx, y: dy, opacity: 0, rotate, scale: 0.6 }}
                transition={{ duration: 0.9 + (i % 4) * 0.12, ease: 'easeOut' }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface OnboardingOverlayProps {
  onComplete: () => void;
  /** Step to resume at (v0.22.x) — comes from the persisted save; the store
   * is the fallback so the tour also resumes when the overlay is remounted
   * without a prop (e.g. the pause-menu replay path passing its own value). */
  initialStep?: number;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingOverlay({ onComplete, initialStep }: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(() =>
    clampTutorialStep(initialStep ?? useGameStore.getState().onboardingStep ?? 0),
  );
  // Batch 3e onboarding campaign: finishing the tour offers the guided
  // first-shift mission chain (tutorial mission pool in lib/batch3e).
  // Skipping the tour skips the campaign offer too — skip means skip.
  const [showCampaignIntro, setShowCampaignIntro] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [spotlight, setSpotlight] = useState<Rect | null>(null);
  // Completion celebration (v0.22.x): fires ONCE when the ring first hits
  // 100% (the "You're Ready!" step). A ref guards against re-firing if the
  // player dot-jumps back and forward again — the confetti stays a one-time
  // reward per tour, not a repeatable animation.
  const [celebrate, setCelebrate] = useState(false);
  const celebratedRef = useRef(false);
  const { stations, units, missions, isBuildPoiModalOpen } = useGameStore();

  const step = TUTORIAL_STEPS[currentStep];
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  // Subtle completion celebration: when the ring first reaches 100% (the
  // final step), pop a small confetti burst on the card + a success blip.
  useEffect(() => {
    if (shouldCelebrateTourStep(currentStep, TUTORIAL_STEPS.length) && !celebratedRef.current) {
      celebratedRef.current = true;
      setCelebrate(true);
      playSuccess();
      const t = setTimeout(() => setCelebrate(false), 2200);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  // Spotlight cutout: track the highlighted element (the sidebar may still be
  // animating in, so poll while the step is active). Falls back to no
  // spotlight when the selector matches nothing — the card still shows.
  // For the landmark / hospital / helipad steps the spotlight points at the
  // Place Landmark button, but only while the builder is CLOSED: the builder
  // auto-opens on step activation, and once a player closes it the spotlight
  // guides them straight back to the sidebar button instead of relying solely
  // on the auto-open (v0.22.17).
  useEffect(() => {
    if (!step?.highlight || isBuildPoiModalOpen) {
      setSpotlight(null);
      return;
    }
    let el: Element | null = null;
    const update = () => {
      el = document.querySelector(step.highlight as string);
      if (!el) {
        setSpotlight(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSpotlight({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    update();
    const interval = setInterval(update, 300);
    return () => {
      clearInterval(interval);
      setSpotlight(null);
    };
  }, [step?.id, isBuildPoiModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance when actions or completion checks are satisfied
  useEffect(() => {
    if ((!step?.action && !step?.completionCheck) || isDismissing) return;

    const check = () => {
      if (step.completionCheck?.()) {
        advanceStep();
        return;
      }
      switch (step.action) {
        case 'build_station':
          if (stations.length > 0) advanceStep();
          break;
        case 'buy_unit':
          if (units.length > 0) advanceStep();
          break;
        case 'dispatch':
          if (missions.some(m => m.status === 'en_route' || m.status === 'in_progress')) advanceStep();
          break;
      }
    };

    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [currentStep, stations, units, missions, step, isDismissing]);

  // Steps that teach unit-panel features (rename, patrol) auto-open the first
  // unit's info panel so the spotlight lands immediately. App.tsx listens for
  // this event and selects the unit (which mounts the panel).
  useEffect(() => {
    if (step?.action !== 'open_unit_panel') return;
    const unit = useGameStore.getState().units[0];
    if (unit) {
      window.dispatchEvent(new CustomEvent('dhq:tutorial-select-unit', { detail: { unitId: unit.id } }));
    }
  }, [step?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Landmark / hospital / helipad steps auto-open the Place Landmark builder
  // so the new commander lands straight in the pick-a-type screen instead of
  // hunting the sidebar button. The modal closes after each placement, so
  // each step re-opens it fresh.
  useEffect(() => {
    if (step?.action !== 'open_poi_builder') return;
    useGameStore.getState().setBuildPoiModalOpen(true);
  }, [step?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the tour position (v0.22.x): every advance — button, dot-jump, or
  // auto-advance — writes the step to the store, which rides into the autosave
  // and the tab-close beacon. -1 (done) is written on completion/skip so a
  // reload never restarts a finished tour.
  useEffect(() => {
    useGameStore.getState().setOnboardingStep(currentStep);
  }, [currentStep]);

  const advanceStep = () => {
    if (isLastStep) {
      // Tour finished via the final step (not via Skip): offer the guided
      // first-shift chain instead of closing straight into free play — but
      // only once per campaign (an active/completed chain never re-offers).
      const camp = useGameStore.getState().tutorialCampaign;
      if (!camp.active && camp.completedAt == null && !showCampaignIntro) {
        setShowCampaignIntro(true);
        return;
      }
      handleComplete();
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, TUTORIAL_STEPS.length - 1));
    }
  };

  const handleComplete = () => {
    useGameStore.getState().setOnboardingStep(ONBOARDING_STEP_DONE);
    // Per-account marker (v0.22.x): finishing OR skipping the tour marks the
    // account as tutored, so future campaigns never auto-show it again.
    // Replay Tutorial in the pause menu stays available for veterans.
    markTutorialCompleted(useGameStore.getState().player?.id);
    setIsDismissing(true);
    setTimeout(() => onComplete(), 400);
  };

  const handleSkip = () => {
    handleComplete();
  };

  return (
    <AnimatePresence>
      {showCampaignIntro ? (
        <motion.div
          key="campaign-intro"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[85] bg-black/40 flex items-center justify-center p-4"
        >
          <div className="w-[380px] max-w-[calc(100vw-2rem)] bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-gray-800/60 bg-gradient-to-br from-dispatch-cyan/15 via-gray-900 to-dispatch-red/10">
              <h3 className="text-sm font-bold text-white leading-tight">🎓 Guided First Shift</h3>
              <p className="text-[11px] text-gray-400 mt-1">Three tutorial calls, in order. Clear each type and the chain advances — your grades land in the shift report replay tab.</p>
            </div>
            <div className="p-5 space-y-3">
              {TUTORIAL_MISSION_CHAIN.map((step, i) => (
                <div key={step.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700/40">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-dispatch-red/20 border border-dispatch-red/40 text-dispatch-red text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">{step.name}</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-0.5">{step.hint}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 px-5 pb-4">
              <button
                onClick={handleComplete}
                className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Not now
              </button>
              <div className="flex-1" />
              <button
                onClick={() => {
                  useGameStore.getState().setTutorialCampaign(startTutorialCampaign());
                  handleComplete();
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-dispatch-red hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-red-500/20"
              >
                Start First Shift
              </button>
            </div>
          </div>
        </motion.div>
      ) : !isDismissing && (
        <>
          {/* Backdrop overlay — pointer-events-none so users can still interact with the game */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/40 pointer-events-none"
          />

          {/* Spotlight cutout: a transparent window over the highlighted UI,
              with a dark shadow flooding everything outside it */}
          {spotlight && step.highlight && (
            <motion.div
              key={`spotlight-${step.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed z-[81] pointer-events-none rounded-xl ring-2 ring-dispatch-red/70"
              style={{
                top: spotlight.top,
                left: spotlight.left,
                width: spotlight.width,
                height: spotlight.height,
                boxShadow: '0 0 0 9999px rgba(2,6,23,0.55)',
              }}
            />
          )}

          {/* Tutorial card — Help & FAQ visual language. Steps with a
              spotlight are anchored just below the highlighted element so the
              card never covers the thing it is pointing at. */}
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed z-[85] pointer-events-none"
            style={
              step.highlight && spotlight
                ? {
                    top: Math.max(8, Math.min(spotlight.top + spotlight.height + 16, (typeof window !== 'undefined' ? window.innerHeight : 720) - 330)),
                    left: Math.max(8, Math.min(spotlight.left, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 400)),
                  }
                : step.position === 'center'
                ? { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
                : step.position === 'top-left'
                ? { top: 80, left: 16 }
                : step.position === 'bottom-right'
                ? { bottom: 80, right: 16 }
                : { insetInline: 0, bottom: 80, display: 'flex', justifyContent: 'center', paddingInline: 16 }
            }
          >
            <div className={`pointer-events-auto max-w-[calc(100vw-2rem)] ${step.position === 'bottom-right' ? 'w-[300px]' : 'w-[380px]'}`}>
              <div className="bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header — gradient banner + icon chip (Help & FAQ style) */}
                <div className="relative px-5 pt-4 pb-3 border-b border-gray-800/60 bg-gradient-to-br from-dispatch-red/15 via-gray-900 to-dispatch-cyan/10">
                  {/* One-time confetti burst when the tour ring first hits 100% */}
                  <TourConfetti show={celebrate} />
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${step.tint}`}>
                      <step.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-white leading-tight">{step.title}</h3>
                      <div className="inline-flex items-center gap-1.5 mt-1">
                        {/* Circular progress ring — % through the tour at a glance */}
                        <TourProgressRing step={currentStep} count={TUTORIAL_STEPS.length} />
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-dispatch-red/15 border border-dispatch-red/40 text-[11px] font-bold text-dispatch-red">
                          Step {currentStep + 1} of {TUTORIAL_STEPS.length} · {tourPercent(currentStep, TUTORIAL_STEPS.length)}%
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleSkip}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      title="Skip tutorial"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Progress dots — click a dot to jump to that step */}
                  <div className="flex items-center gap-1.5 mt-3">
                    {TUTORIAL_STEPS.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCurrentStep(i)}
                        title={`Jump to step ${i + 1}`}
                        aria-label={`Go to step ${i + 1} of ${TUTORIAL_STEPS.length}`}
                        className={`group flex-1 rounded-full py-1.5 transition-opacity ${
                          i === currentStep ? 'opacity-100' : 'opacity-60 hover:opacity-90'
                        }`}
                      >
                        <div
                          className={`h-1 rounded-full transition-all duration-300 ${
                            i <= currentStep ? 'bg-dispatch-red' : 'bg-gray-700 group-hover:bg-gray-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <p className="text-sm text-gray-300 leading-relaxed">{step.message}</p>
                  {step.tip && (
                    <div className="flex items-start gap-2 mt-3 px-2.5 py-2 rounded-lg bg-gray-800/50 border border-gray-700/40">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-gray-400 leading-relaxed">{step.tip}</p>
                    </div>
                  )}
                  {step.keys && step.keys.length > 0 && (
                    <div className="flex items-center gap-1 mt-3">
                      {step.keys.map((k) => (
                        <kbd key={k} className="px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-300 text-[11px] font-mono border border-gray-600/40">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-5 pb-4">
                  <button
                    onClick={handleSkip}
                    className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Skip Tutorial
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={advanceStep}
                    className="flex items-center gap-1.5 px-4 py-2 bg-dispatch-red hover:bg-red-600
                               text-white text-xs font-semibold rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-red-500/20"
                  >
                    {isLastStep ? 'Start Playing!' : 'Continue'}
                    {!isLastStep && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
