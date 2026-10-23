// ============================================
// Dispatch HQ — Synthesized Sound Effects (v2)
// ============================================
// Pure Web Audio API — no external audio assets, nothing to license, nothing
// to download. Every cue routes through a category volume (ui / dispatch /
// alert / ambient) from DispatchSettings so players can balance independently.
//
// v2 design kit (see plans/v0.20.0-sound-and-polish.md):
//   • Frequency map — ui 800–1400 Hz sine; dispatch 440–1100 square/saw;
//     alert 500–1200 saw + shimmer; ambient 196–262 pad + filtered-noise hum.
//   • Tactility — clicks carry a tiny band-passed noise transient so
//     synthesized buttons feel physical, not digital.
//   • Stereo pan — clicks/hovers get a small random StereoPanner offset.
//   • Radio realism — dispatch tones start with a key-up squelch burst.
//   • Real siren wail — frequency-swept 500↔800 Hz instead of static blips.
//   • Spam throttle — per-cue minimum gaps so floods can't stack cues.

import { loadSettings } from './settings';
import type { SoundCategory } from './settings';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx!;
}

function nowish(): number {
  return getCtx().currentTime;
}

/**
 * Master gain for a category: soundEnabled × master volume × category volume.
 *
 * Only ALERT cues are audible (v0.23 sound pass): mission alerts, pursuits,
 * disasters, completions/failures, level-ups. The ui / dispatch / ambient
 * families — clicks, hovers, radio squelch, sirens, station chimes and the
 * city-hum bed — are muted at the source so no gameplay feedback noise plays
 * outside of alerts. The category sliders for them are gone from Settings,
 * but the cue functions remain exported so the codebase doesn't churn.
 */
function categoryGain(category: SoundCategory, base: number): number {
  const s = loadSettings();
  if (!s.soundEnabled) return 0;
  if (category !== 'alert') return 0;
  const cat = Math.max(0, Math.min(1, s.soundCategoryVolumes?.[category] ?? 1));
  return Math.max(0, Math.min(1, s.soundVolume)) * cat * base;
}

// ── Spam throttle ──────────────────────────
// Per-cue minimum real-time gap. Mission floods, rapid clicking, or chase
// radio bursts each get their own budget so cues never stack into a wall.
const LAST_PLAYED: Record<string, number> = {};

function throttled(key: string, minGapMs: number): boolean {
  const now = performance.now();
  if (now - (LAST_PLAYED[key] ?? -Infinity) < minGapMs) return false;
  LAST_PLAYED[key] = now;
  return true;
}

// ── Shared routing ─────────────────────────
// Gain envelope + optional stereo pan; returns the gain node (for scheduling
// later ramps on top). The envelope's decay is applied here so every cue
// fades out cleanly even when built from multiple oscillators.
function route(category: SoundCategory, gain: number, when: number, release: number, pan?: number): GainNode {
  const ctx = getCtx();
  const g = ctx.createGain();
  const vol = categoryGain(category, gain);
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.02, release));
  let dest: AudioNode = g;
  if (pan !== undefined && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    dest = p;
  }
  dest.connect(ctx.destination);
  return g;
}

function scheduleTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  when?: number,
  gain = 0.05,
  category: SoundCategory = 'ui',
  pan?: number,
  release?: number,
) {
  const ctx = getCtx();
  const t = when ?? ctx.currentTime;
  const vol = categoryGain(category, gain);
  if (vol <= 0) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const g = route(category, gain, t, release ?? Math.max(0.02, duration), pan);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + Math.max(0.05, duration) + 0.1);
}

/** Frequency sweep (linear ramp) — the siren wail primitive. */
function scheduleSweep(
  from: number,
  to: number,
  duration: number,
  type: OscillatorType = 'sawtooth',
  when?: number,
  gain = 0.05,
  category: SoundCategory = 'dispatch',
) {
  const ctx = getCtx();
  const t = when ?? ctx.currentTime;
  const vol = categoryGain(category, gain);
  if (vol <= 0) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.linearRampToValueAtTime(to, t + duration);
  const g = route(category, gain, t, duration + 0.05);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + duration + 0.12);
}

// Shared one-second noise buffer — reused by every noise burst so we don't
// allocate per cue.
let noiseBuffer: AudioBuffer | null = null;

function getNoise(): AudioBuffer {
  if (!noiseBuffer) {
    const ctx = getCtx();
    const len = Math.floor(ctx.sampleRate * 1.0);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Band-passed noise burst — squelch, key-up static, tactile ticks. */
function noiseBurst(
  duration: number,
  filterFreq: number,
  q = 1,
  when?: number,
  gain = 0.04,
  category: SoundCategory = 'ui',
  pan?: number,
) {
  const ctx = getCtx();
  const t = when ?? ctx.currentTime;
  const vol = categoryGain(category, gain);
  if (vol <= 0) return;
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFreq, t);
  filter.Q.value = q;
  const g = route(category, gain, t, duration, pan);
  src.connect(filter);
  filter.connect(g);
  src.start(t);
  src.stop(t + duration + 0.05);
}

/** Small random pan so UI sounds feel spatial, not mono-center. */
function jitterPan(): number {
  return (Math.random() * 2 - 1) * 0.2;
}

export function initAudio() {
  getCtx();
}

// ── UI family (800–1400 Hz sine, short) ────

export function playClick() {
  if (!throttled('click', 40)) return;
  const now = nowish();
  const pan = jitterPan();
  noiseBurst(0.015, 4000, 2, now, 0.02, 'ui', pan); // tactile tick
  scheduleTone(880, 0.045, 'sine', now, 0.028, 'ui', pan);
  scheduleTone(1320, 0.03, 'sine', now + 0.005, 0.012, 'ui', pan);
}

export function playHover() {
  if (!throttled('hover', 120)) return;
  const now = nowish();
  scheduleTone(1200, 0.03, 'sine', now, 0.014, 'ui', jitterPan());
}

/** Radio key-up squelch — the "police radio" texture before a transmission. */
export function playRadioSquelch() {
  if (!throttled('squelch', 250)) return;
  const now = nowish();
  noiseBurst(0.07, 2100, 3, now, 0.035, 'dispatch');
  scheduleTone(1800, 0.04, 'sine', now, 0.01, 'dispatch');
}

// ── Dispatch family (440–1100 Hz, square/saw) ──

export function playDispatchTone() {
  if (!throttled('dispatch', 1500)) return;
  const now = nowish();
  playRadioSquelch();
  scheduleTone(880, 0.12, 'square', now + 0.09, 0.04, 'dispatch');
  scheduleTone(1100, 0.18, 'square', now + 0.23, 0.04, 'dispatch');
}

export function playRadioBeep() {
  if (!throttled('radiobeep', 200)) return;
  const now = nowish();
  noiseBurst(0.02, 2400, 2, now, 0.015, 'ui');
  scheduleTone(1200, 0.06, 'sine', now, 0.02, 'ui', jitterPan());
  scheduleTone(1500, 0.08, 'sine', now + 0.08, 0.02, 'ui', jitterPan());
}

export function playStationBuilt() {
  if (!throttled('station', 800)) return;
  const now = nowish();
  noiseBurst(0.05, 800, 1.5, now, 0.03, 'dispatch');
  scheduleTone(440, 0.1, 'sine', now + 0.02, 0.035, 'dispatch');
  scheduleTone(550, 0.12, 'sine', now + 0.12, 0.035, 'dispatch');
  scheduleTone(660, 0.22, 'sine', now + 0.24, 0.035, 'dispatch');
}

/** Short two-tone roll-out blip (a unit leaving the station). */
export function playSirenBlip() {
  if (!throttled('sirenblip', 1200)) return;
  const now = nowish();
  scheduleTone(620, 0.14, 'sawtooth', now, 0.03, 'dispatch');
  scheduleTone(880, 0.2, 'sawtooth', now + 0.16, 0.03, 'dispatch');
}

/** Real siren wail — two rising/falling frequency sweeps (500↔800 Hz). */
export function playSiren() {
  if (!throttled('siren', 2500)) return;
  const now = nowish();
  // Air-movement noise bed behind the wail.
  noiseBurst(1.4, 700, 0.7, now, 0.012, 'dispatch');
  scheduleSweep(500, 800, 0.42, 'sawtooth', now, 0.035, 'dispatch');
  scheduleSweep(800, 500, 0.42, 'sawtooth', now + 0.44, 0.035, 'dispatch');
  scheduleSweep(500, 800, 0.42, 'sawtooth', now + 0.88, 0.035, 'dispatch');
}

/** Rapid alternating beeper — a pursuit has just started. */
export function playPursuitAlert() {
  if (!throttled('pursuit', 3000)) return;
  const now = nowish();
  noiseBurst(0.5, 1000, 1, now, 0.02, 'alert');
  for (let i = 0; i < 3; i++) {
    const t = now + i * 0.16;
    scheduleTone(600, 0.09, 'sawtooth', t, 0.035, 'alert');
    scheduleTone(900, 0.09, 'sawtooth', t + 0.08, 0.035, 'alert');
  }
}

// ── Alert family (500–1200 Hz, saw + shimmer) ──

export function playMissionAlert() {
  if (!throttled('mission', 800)) return;
  const now = nowish();
  noiseBurst(0.06, 1500, 1.5, now, 0.02, 'alert');
  scheduleTone(700, 0.15, 'sawtooth', now, 0.035, 'alert');
  scheduleTone(700, 0.15, 'sawtooth', now + 0.22, 0.035, 'alert');
  scheduleTone(900, 0.35, 'square', now + 0.44, 0.045, 'alert');
}

/** Shimmer: a quiet octave-up sine layered over the note for sparkle. */
function shimmer(freq: number, when: number, gain: number, category: SoundCategory = 'alert') {
  scheduleTone(freq * 2, 0.14, 'sine', when, gain, category);
}

export function playSuccess() {
  if (!throttled('success', 500)) return;
  const now = nowish();
  scheduleTone(523, 0.12, 'sine', now, 0.045, 'alert');
  scheduleTone(659, 0.12, 'sine', now + 0.12, 0.045, 'alert');
  scheduleTone(784, 0.3, 'sine', now + 0.24, 0.045, 'alert');
  shimmer(784, now + 0.24, 0.012);
  shimmer(1047, now + 0.26, 0.01);
}

export function playFailure() {
  if (!throttled('failure', 600)) return;
  const now = nowish();
  noiseBurst(0.08, 600, 1, now, 0.025, 'alert');
  scheduleTone(300, 0.25, 'sawtooth', now, 0.045, 'alert');
  scheduleTone(250, 0.35, 'sawtooth', now + 0.28, 0.045, 'alert');
}

/** Bright rising chime when a chain stage completes. */
export function playChainComplete() {
  if (!throttled('chain', 800)) return;
  const now = nowish();
  scheduleTone(659, 0.1, 'triangle', now, 0.045, 'alert');
  scheduleTone(784, 0.1, 'triangle', now + 0.1, 0.045, 'alert');
  scheduleTone(988, 0.22, 'triangle', now + 0.2, 0.05, 'alert');
  shimmer(988, now + 0.2, 0.012);
}

/** Quick ascending blips — credits earned. */
export function playCash() {
  if (!throttled('cash', 400)) return;
  const now = nowish();
  scheduleTone(1245, 0.07, 'sine', now, 0.035, 'alert', jitterPan());
  scheduleTone(1660, 0.1, 'sine', now + 0.08, 0.035, 'alert', jitterPan());
  shimmer(1660, now + 0.08, 0.01, 'alert');
}

/** Siren + alarm burst for disaster events. */
export function playDisasterAlert() {
  if (!throttled('disaster', 4000)) return;
  const now = nowish();
  noiseBurst(2.0, 500, 0.6, now, 0.02, 'alert');
  for (let i = 0; i < 4; i++) {
    const t = now + i * 0.22;
    scheduleTone(500, 0.18, 'sawtooth', t, 0.05, 'alert');
    scheduleTone(750, 0.18, 'sawtooth', t + 0.11, 0.05, 'alert');
  }
  scheduleTone(1200, 0.4, 'square', now + 0.88, 0.04, 'alert');
  scheduleTone(600, 0.5, 'sawtooth', now + 0.9, 0.03, 'alert');
}

/** Ascending arpeggio for level-ups. */
export function playLevelUp() {
  if (!throttled('levelup', 2000)) return;
  const now = nowish();
  scheduleTone(523, 0.12, 'triangle', now, 0.045, 'alert');
  scheduleTone(659, 0.12, 'triangle', now + 0.12, 0.045, 'alert');
  scheduleTone(784, 0.12, 'triangle', now + 0.24, 0.045, 'alert');
  scheduleTone(1047, 0.3, 'triangle', now + 0.36, 0.055, 'alert');
  shimmer(1047, now + 0.36, 0.015);
  shimmer(2093, now + 0.38, 0.008);
}

// ── Ambient ─────────────────────────────────
// The ambient bed (city hum + minor-third drone) was removed in the v0.23
// sound pass — non-alert cues are muted at the source. The exported hooks
// remain as no-ops so call sites (App.tsx lifecycle) stay unchanged.

export function startAmbient() {
  return;
}

export function stopAmbient() {
  return;
}
