// ============================================
// Dispatch HQ — Player Save Slots Routes
// ============================================

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { playerSaves } from '../db/schema';
import { rateLimit } from '../lib/rateLimit';
import type { AuthVars } from '../auth/middleware';

export function sanitizeSlot(slot: unknown): string {
  // Clients always send string slots, but a malformed payload (numeric slot,
  // etc.) must never crash the handler — the v0.17.6 error log caught
  // `TypeError: slot.trim is not a function` 400ing save requests.
  return String(slot ?? '').trim().toLowerCase().slice(0, 50);
}

/**
 * Lightweight summary of a save payload for menu cards (Load Game screen).
 * Read directly off the jsonb blob so the main menu never needs N+1 fetches;
 * values are guarded so malformed/legacy payloads degrade to defaults instead
 * of crashing the list.
 */
export interface SavePreview {
  level: number;
  credits: number;
  xp: number;
  city: string | null;
  service: string | null;
  missionsCompleted: number;
  gameMinutes: number;
  // Onboarding tour position: 0..N-1 = mid-tour (the main-menu Continue card
  // shows "Step X of N" from this), -1 = done/skipped. Legacy saves without
  // the field degrade to -1 (done), matching the client restore guard.
  onboardingStep: number;
}

export function deriveSavePreview(data: unknown): SavePreview {
  const d = (data ?? {}) as Record<string, unknown>;
  const player = (d.player ?? {}) as Record<string, unknown>;
  const career = (d.career ?? {}) as Record<string, unknown>;
  const city = d.selectedCity as Record<string, unknown> | undefined;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    level: num(player.level, 1),
    credits: num(player.credits, 0),
    xp: num(player.xp, 0),
    city: typeof city?.name === 'string' && city.name ? city.name : null,
    service: typeof d.selectedService === 'string' ? d.selectedService : null,
    missionsCompleted: num(career.missionsCompleted, 0),
    gameMinutes: num(d.gameMinutes, 0),
    onboardingStep: num(d.onboardingStep, -1),
  };
}

const saves = new Hono<{ Variables: AuthVars }>();

saves.get('/', async (c) => {
  const playerId = c.get('playerId');
  const rows = await db
    .select({ slotName: playerSaves.slotName, label: playerSaves.label, updatedAt: playerSaves.updatedAt, createdAt: playerSaves.createdAt, data: playerSaves.data })
    .from(playerSaves)
    .where(eq(playerSaves.playerId, playerId))
    .orderBy(playerSaves.updatedAt);

  return c.json({
    saves: rows.map((r) => ({
      slot: r.slotName,
      label: r.label || r.slotName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      preview: deriveSavePreview(r.data),
    })),
  });
});

// Autosave is the highest-frequency authenticated write: a buggy client or a
// scripted token can hammer the jsonb upsert. Throttle per-player (not per-IP,
// since many players share a NAT) so a misbehaving account 429s without
// affecting its neighbors. 30 writes/min is far above any real autosave cadence.
saves.post('/', rateLimit({ windowMs: 60_000, max: 30, keyFn: (c) => `player:${c.get('playerId')}` }), async (c) => {
  const playerId = c.get('playerId');
  let body: { slot?: string; label?: string; data?: Record<string, unknown> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const slot = sanitizeSlot(body.slot || '');
  if (!slot) {
    return c.json({ error: 'Missing slot name' }, 400);
  }
  if (!body.data || typeof body.data !== 'object') {
    return c.json({ error: 'Missing save data object' }, 400);
  }
  const now = new Date();
  await db.insert(playerSaves)
    .values({
      playerId,
      slotName: slot,
      label: body.label ? body.label.slice(0, 100) : slot,
      data: body.data,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [playerSaves.playerId, playerSaves.slotName],
      set: {
        label: body.label ? body.label.slice(0, 100) : slot,
        data: body.data,
        updatedAt: now,
      },
    });

  return c.json({ success: true, slot, updatedAt: now.toISOString() });
});

saves.get('/:slot', async (c) => {
  const playerId = c.get('playerId');
  const slot = sanitizeSlot(c.req.param('slot'));
  const rows = await db
    .select({ data: playerSaves.data, updatedAt: playerSaves.updatedAt })
    .from(playerSaves)
    .where(and(eq(playerSaves.playerId, playerId), eq(playerSaves.slotName, slot)))
    .limit(1);
  if (rows.length === 0) {
    return c.json({ error: 'Save not found' }, 404);
  }
  return c.json({ slot, data: rows[0].data, updatedAt: rows[0].updatedAt });
});

saves.delete('/:slot', async (c) => {
  const playerId = c.get('playerId');
  const slot = sanitizeSlot(c.req.param('slot'));
  await db.delete(playerSaves).where(and(eq(playerSaves.playerId, playerId), eq(playerSaves.slotName, slot)));
  return c.json({ success: true });
});

export { saves as saveRoutes };
