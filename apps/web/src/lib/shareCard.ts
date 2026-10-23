// ============================================
// Dispatch HQ — Shift Report Share Card (v0.22.0 Task 3)
// ============================================
// Canvas-generated PNG debrief for Discord/social: draws the shift summary
// (rank, stats tiles, zone heat bars, crew line, seasonal contest line) on a
// 1080×1350 (4:5 social crop) canvas in the game's dark palette + logo.
//
// Two layers:
//   1. buildShareCardData — pure layout-data builder (unit-tested) that turns
//      the shift summary + display context into everything the canvas needs.
//   2. renderShareCard — DOM canvas painting from that data (not unit-tested;
//      the layout math lives in the builder so the tests cover it).
//
// Pure client-side — no server work.

import type { ShiftSummary } from './shiftSummary';
import { formatTimer } from '@/utils/timeFormat';

/** Palette constants mirrored from tailwind.config.js + index.css. */
export const CARD_PALETTE = {
  bgTop: '#0B1220',
  bgBottom: '#030712',
  panel: '#111827',
  panelBorder: '#1F2937',
  text: '#F9FAFB',
  textMuted: '#9CA3AF',
  textFaint: '#6B7280',
  red: '#DC2626',
  green: '#059669',
  cyan: '#0891B2',
  amber: '#D97706',
  orange: '#F59E0B',
  purple: '#7C3AED',
} as const;

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface ShareStatTile {
  label: string;
  value: string;
  accent: string; // hex color for the value + tick
}

export interface ShareZoneRow {
  name: string;
  calls: number;
  patrolKm: number;
  pct: number; // 0–100 share of this shift's calls
}

export interface ShareCrewLine {
  hoursLabel: string;
  avgFatigue: number | null;
  peakFatigue: number;
  overworkEvents: number;
  moraleBoosts: number;
  restEvents: number;
}

export interface ShareContestLine {
  icon: string;
  name: string;
  clears: number;
  totalCalls: number | null;
  rank: number | null;
  timeLeft: string | null;
}

export interface ShareRecoveryLine {
  transported: number;
  treated: number;
  recovered: number;
  released: number;
  diverted: number;
  /** Helipad flights this shift (v0.22.14). */
  airlifted: number;
  /** Ambulance runs this shift (v0.22.14). */
  roadTransported: number;
  recoveryRate: number | null;
}

export interface ShareCardData {
  username: string | null;
  rankIcon: string;
  rankTitle: string;
  level: number;
  serviceLabel: string;
  stats: ShareStatTile[];
  clearancePct: number;
  zoneRows: ShareZoneRow[];
  totalZoneCalls: number;
  crew: ShareCrewLine | null;
  recovery: ShareRecoveryLine | null;
  contest: ShareContestLine | null;
  footerLine: string;
}

export interface BuildShareCardInput {
  username: string | null;
  rankIcon: string;
  rankTitle: string;
  level: number;
  serviceLabel: string;
  /** Shift elapsed time label, e.g. "1h 12m". */
  shiftDurationLabel: string;
  summary: ShiftSummary;
  creditsEarned: number;
  xpEarned: number;
  /** Zone rows with display names resolved (id → name already applied). */
  zoneRows: Array<{ id: string; name: string; calls: number; patrolKm: number }>;
  /** Optional seasonal contest progress (null when no event ran this shift). */
  contest: Omit<ShareContestLine, 'clears'> & { clears: number } | null;
}

/**
 * Pure layout-data builder: everything the canvas painter needs, computed
 * here so the layout rules (tile selection, top-5 zones, percentages) are
 * unit-testable without a DOM.
 */
export function buildShareCardData(input: BuildShareCardInput): ShareCardData {
  const { summary, zoneRows, contest } = input;

  const total = summary.clearanceRate;
  const bestSec = summary.bestResponseSec != null && Number.isFinite(summary.bestResponseSec)
    ? formatTimer(summary.bestResponseSec)
    : '--:--';

  const stats: ShareStatTile[] = [
    { label: 'Missions Cleared', value: String(summary.tierMix.routine + summary.tierMix.moderate + summary.tierMix.serious + summary.tierMix.critical), accent: CARD_PALETTE.green },
    { label: 'Clearance Rate', value: `${Math.round(total * 100)}%`, accent: CARD_PALETTE.cyan },
    { label: 'Best Response', value: bestSec, accent: CARD_PALETTE.cyan },
    { label: 'Shift Duration', value: input.shiftDurationLabel, accent: CARD_PALETTE.cyan },
    { label: 'Credits Earned', value: `$${input.creditsEarned.toLocaleString()}`, accent: CARD_PALETTE.amber },
    { label: 'XP Earned', value: input.xpEarned.toLocaleString(), accent: CARD_PALETTE.purple },
  ];

  const totalZoneCalls = zoneRows.reduce((sum, r) => sum + r.calls, 0);
  const topZones = [...zoneRows]
    .sort((a, b) => b.calls - a.calls || b.patrolKm - a.patrolKm)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      calls: r.calls,
      patrolKm: r.patrolKm,
      pct: totalZoneCalls > 0 ? Math.round((r.calls / totalZoneCalls) * 100) : 0,
    }));

  const crewHours = summary.crewHoursRidden;
  const crew: ShareCrewLine | null = {
    hoursLabel: `${Math.floor(crewHours)}h ${Math.round((crewHours % 1) * 60)}m`,
    avgFatigue: summary.avgFatigue,
    peakFatigue: summary.peakFatigue,
    overworkEvents: summary.overworkEvents,
    moraleBoosts: summary.moraleBoosts,
    restEvents: summary.restEvents,
  };

  // Patient recovery — mirrors the text debrief's recovery line (v0.22.12):
  // only shown when patients were actually transported this shift, carrying
  // the same transported / treated / recovered / diverted counts so the PNG
  // tells the same recovery story as the copy-to-clipboard summary.
  const po = summary.patientOutcomes;
  const recovery: ShareRecoveryLine | null = po && po.transported > 0
    ? {
        transported: po.transported,
        treated: po.treated,
        recovered: po.recovered,
        released: po.released,
        diverted: po.diverted,
        airlifted: po.airlifted,
        roadTransported: po.roadTransported,
        recoveryRate: po.recoveryRate ?? null,
      }
    : null;

  return {
    username: input.username,
    rankIcon: input.rankIcon,
    rankTitle: input.rankTitle,
    level: input.level,
    serviceLabel: input.serviceLabel,
    stats,
    clearancePct: Math.round(total * 100),
    zoneRows: topZones,
    totalZoneCalls,
    crew,
    recovery,
    contest: contest && contest.clears > 0 ? { ...contest } : null,
    footerLine: 'Command the chaos.',
  };
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------

/** Rounded-rect path (compatible across browsers without ctx.roundRect). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

/**
 * Paint the share card onto `canvas` (should be CARD_WIDTH × CARD_HEIGHT).
 * `logo` is optional — when absent (or not loaded) a stylized DHQ monogram
 * square is drawn instead so the card never has a blank header.
 */
export function renderShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  logo?: HTMLImageElement | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const p = CARD_PALETTE;

  // Background gradient.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.bgTop);
  bg.addColorStop(1, p.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle red glow behind the header.
  const glow = ctx.createRadialGradient(120, 120, 20, 120, 120, 520);
  glow.addColorStop(0, 'rgba(220, 38, 38, 0.22)');
  glow.addColorStop(1, 'rgba(220, 38, 38, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 420);

  // Top hairline in brand red.
  ctx.fillStyle = p.red;
  ctx.fillRect(0, 0, W, 6);

  // ---- Header ----
  const logoSize = 128;
  const logoX = 76;
  const logoY = 76;
  if (logo && logo.complete && logo.naturalWidth > 0) {
    ctx.save();
    roundRectPath(ctx, logoX, logoY, logoSize, logoSize, 24);
    ctx.clip();
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } else {
    // DHQ monogram fallback.
    roundRectPath(ctx, logoX, logoY, logoSize, logoSize, 24);
    ctx.fillStyle = p.red;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 52px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DHQ', logoX + logoSize / 2, logoY + logoSize / 2 + 4);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = p.text;
  ctx.font = '900 56px system-ui, -apple-system, sans-serif';
  ctx.fillText('SHIFT REPORT', logoX + logoSize + 36, 118);

  ctx.font = '600 30px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = p.textMuted;
  const subtitle = `${data.rankIcon} ${data.rankTitle} · Lv ${data.level} · ${data.serviceLabel}`;
  ctx.fillText(truncate(ctx, subtitle, W - (logoX + logoSize + 36) - 60), logoX + logoSize + 36, 164);

  if (data.username) {
    ctx.font = '500 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = p.textFaint;
    ctx.fillText(`@${data.username}`, logoX + logoSize + 36, 202);
  }

  // Divider.
  ctx.fillStyle = p.panelBorder;
  ctx.fillRect(76, 236, W - 152, 2);

  // ---- Stats grid (3 × 2) ----
  const tileW = 292;
  const tileH = 132;
  const gap = 20;
  const gridX = 76;
  const gridY = 272;
  data.stats.forEach((tile, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = gridX + col * (tileW + gap);
    const y = gridY + row * (tileH + gap);
    roundRectPath(ctx, x, y, tileW, tileH, 18);
    ctx.fillStyle = p.panel;
    ctx.fill();
    ctx.strokeStyle = p.panelBorder;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Accent tick.
    ctx.fillStyle = tile.accent;
    ctx.fillRect(x + 18, y + 20, 6, 24);
    ctx.fillStyle = p.textMuted;
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(truncate(ctx, tile.label.toUpperCase(), tileW - 44), x + 36, y + 40);
    ctx.fillStyle = p.text;
    ctx.font = '800 40px system-ui, -apple-system, sans-serif';
    ctx.fillText(truncate(ctx, tile.value, tileW - 44), x + 36, y + 98);
  });

  // ---- Zone heat bars ----
  let yCursor = gridY + 2 * (tileH + gap) + 30;
  ctx.fillStyle = p.text;
  ctx.font = '800 30px system-ui, -apple-system, sans-serif';
  ctx.fillText('NEIGHBORHOOD HEAT', 76, yCursor);
  ctx.fillStyle = p.textFaint;
  ctx.font = '500 24px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${data.totalZoneCalls} calls this shift`, W - 76 - 280, yCursor);
  yCursor += 40;

  if (data.zoneRows.length === 0) {
    ctx.fillStyle = p.textFaint;
    ctx.font = '500 26px system-ui, -apple-system, sans-serif';
    ctx.fillText('No neighborhood call data this shift.', 76, yCursor + 26);
  } else {
    data.zoneRows.forEach((row) => {
      const barY = yCursor;
      const barH = 26;
      const labelW = 260;
      const valueW = 60;
      const patrolW = 120;
      const barX = 76 + labelW + 24;
      const barMaxW = W - 152 - labelW - valueW - patrolW - 48;

      ctx.fillStyle = p.text;
      ctx.font = '600 26px system-ui, -apple-system, sans-serif';
      ctx.fillText(truncate(ctx, row.name, labelW), 76, barY + barH - 6);

      // Track.
      roundRectPath(ctx, barX, barY, barMaxW, barH, 13);
      ctx.fillStyle = '#1F2937';
      ctx.fill();
      // Fill.
      const fillW = Math.max(6, Math.round((row.pct / 100) * barMaxW));
      const fillGrad = ctx.createLinearGradient(barX, 0, barX + barMaxW, 0);
      fillGrad.addColorStop(0, p.orange);
      fillGrad.addColorStop(1, p.red);
      roundRectPath(ctx, barX, barY, fillW, barH, 13);
      ctx.fillStyle = fillGrad;
      ctx.fill();

      ctx.fillStyle = p.orange;
      ctx.font = '800 26px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(row.calls), barX + barMaxW + 20 + valueW - 40, barY + barH - 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = p.textFaint;
      ctx.font = '500 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${row.patrolKm.toFixed(1)} km`, barX + barMaxW + valueW + 48, barY + barH - 6);

      yCursor += barH + 18;
    });
  }

  // ---- Patient recovery strip ----
  // Compact line between the zone bars and the crew panel (v0.22.12): the
  // card's vertical budget is tight once zones + crew + contest all render,
  // so this is a slim panel with the same transported/treated/recovered/
  // diverted counts as the text debrief's recovery line.
  if (data.recovery) {
    yCursor += 18;
    const recPanelY = yCursor;
    const recPanelH = 64;
    roundRectPath(ctx, 76, recPanelY, W - 152, recPanelH, 16);
    ctx.fillStyle = 'rgba(5, 150, 105, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(5, 150, 105, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = p.textMuted;
    ctx.font = '700 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('PATIENT RECOVERY', 100, recPanelY + 28);
    ctx.fillStyle = p.text;
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    const recBits = [
      `${data.recovery.transported} transported`,
      `${data.recovery.treated} treated`,
      `${data.recovery.recovered} recovered / ${data.recovery.recovered + data.recovery.released} discharged`,
      ...(data.recovery.diverted > 0 ? [`${data.recovery.diverted} diverted`] : []),
      // Airlift split (v0.22.14): how patients arrived — ✈️ air / 🚑 road.
      ...(data.recovery.airlifted + data.recovery.roadTransported > 0
        ? [`✈️ ${data.recovery.airlifted} airlifted / ${data.recovery.roadTransported} road`]
        : []),
    ].join(' · ');
    ctx.fillText(truncate(ctx, recBits, W - 260), 100, recPanelY + 52);
    if (data.recovery.recoveryRate != null) {
      ctx.fillStyle = p.textFaint;
      ctx.font = '500 20px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(data.recovery.recoveryRate * 100)}% recovery`, W - 100, recPanelY + 28);
      ctx.textAlign = 'left';
    }
    yCursor = recPanelY + recPanelH;
  }

  // ---- Crew line ----
  if (data.crew) {
    yCursor += 26;
    const crewPanelY = yCursor;
    const crewPanelH = 168;
    roundRectPath(ctx, 76, crewPanelY, W - 152, crewPanelH, 18);
    ctx.fillStyle = p.panel;
    ctx.fill();
    ctx.strokeStyle = p.panelBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = p.textMuted;
    ctx.font = '700 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('CREW CONDITION', 100, crewPanelY + 40);
    ctx.fillStyle = p.textFaint;
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${data.crew.hoursLabel} ridden`, W - 100, crewPanelY + 40);
    ctx.textAlign = 'left';

    const fatigue = data.crew.avgFatigue != null ? data.crew.avgFatigue : 0;
    const fatigueColor = fatigue >= 70 ? p.red : fatigue >= 40 ? p.amber : p.green;
    ctx.fillStyle = p.text;
    ctx.font = '600 26px system-ui, -apple-system, sans-serif';
    ctx.fillText('Avg fatigue', 100, crewPanelY + 86);
    // Track + fill.
    const fBarX = 320;
    const fBarW = W - 152 - 320 - 200;
    roundRectPath(ctx, fBarX, crewPanelY + 68, fBarW, 18, 9);
    ctx.fillStyle = '#1F2937';
    ctx.fill();
    roundRectPath(ctx, fBarX, crewPanelY + 68, Math.max(6, Math.round((fatigue / 100) * fBarW)), 18, 9);
    ctx.fillStyle = fatigueColor;
    ctx.fill();
    ctx.fillStyle = p.text;
    ctx.font = '800 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(fatigue)}%`, W - 100, crewPanelY + 86);
    ctx.textAlign = 'left';

    ctx.fillStyle = p.textFaint;
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `Peak ${data.crew.peakFatigue}% · ${data.crew.overworkEvents} overwork · ${data.crew.moraleBoosts} boosts · ${data.crew.restEvents} rests`,
      100, crewPanelY + 128,
    );
    yCursor = crewPanelY + crewPanelH;
  }

  // ---- Seasonal contest line ----
  if (data.contest) {
    yCursor += 24;
    const cPanelY = yCursor;
    const cPanelH = 130;
    roundRectPath(ctx, 76, cPanelY, W - 152, cPanelH, 18);
    ctx.fillStyle = 'rgba(220, 38, 38, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '700 26px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${data.contest.icon} SEASONAL CONTEST — ${data.contest.name.toUpperCase()}`, 100, cPanelY + 44);
    ctx.fillStyle = p.text;
    ctx.font = '800 30px system-ui, -apple-system, sans-serif';
    const contestLeft = `${data.contest.clears} call${data.contest.clears === 1 ? '' : 's'} cleared this shift`;
    ctx.fillText(contestLeft, 100, cPanelY + 92);
    ctx.textAlign = 'right';
    ctx.fillStyle = p.textFaint;
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    const standingBits = [
      data.contest.rank != null ? `#${data.contest.rank}` : null,
      data.contest.totalCalls != null ? `${data.contest.totalCalls} total` : null,
      data.contest.timeLeft,
    ].filter(Boolean).join(' · ');
    ctx.fillText(standingBits || 'In progress', W - 100, cPanelY + 92);
    ctx.textAlign = 'left';
    yCursor = cPanelY + cPanelH;
  }

  // ---- Footer ----
  const footerY = H - 96;
  ctx.fillStyle = p.red;
  ctx.fillRect(76, footerY - 46, 56, 4);
  ctx.fillStyle = p.text;
  ctx.font = '800 34px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.footerLine, 76, footerY);
  ctx.fillStyle = p.textFaint;
  ctx.font = '500 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('DISPATCH HQ', W - 76, footerY);
  ctx.textAlign = 'left';
}

/** Load the header logo (used for /logo.png in the card header). */
export function loadCardLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Export the card: render to a PNG data URL, try copying the image to the
 * clipboard (navigator.clipboard.write with a ClipboardItem), and fall back
 * to a direct download when the clipboard API or permission is unavailable.
 * Resolves 'clipboard' | 'download' so callers can toast the outcome.
 */
export async function shareCardPng(canvas: HTMLCanvasElement, filename: string): Promise<'clipboard' | 'download'> {
  const png = canvas.toDataURL('image/png');

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) {
    try {
      // TS lib may lack ClipboardItem in older targets — feature-check at runtime.
      const anyNav = navigator as Navigator & { clipboard?: { write?: (items: unknown[]) => Promise<void> } };
      const ClipboardItemCtor = (globalThis as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => unknown }).ClipboardItem;
      if (anyNav.clipboard?.write && ClipboardItemCtor) {
        await anyNav.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
        return 'clipboard';
      }
    } catch {
      // Clipboard write rejected (permission, focus, etc.) — fall through.
    }
  }

  const a = document.createElement('a');
  a.href = png;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'download';
}
