// ============================================
// Dispatch HQ — Bug Report Routes
// ============================================

import { Hono } from 'hono';
import { desc, eq, or } from 'drizzle-orm';
import { db } from '../db';
import { bugReports } from '../db/schema';
import type { AuthVars } from '../auth/middleware';

const bugReportsApp = new Hono<{ Variables: AuthVars }>();

bugReportsApp.post('/', async (c) => {
  const playerId = c.get('playerId');
  let body: { category?: string; description?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const category = (body.category || 'general').slice(0, 50);
  const description = (body.description || '').trim();
  if (!description) return c.json({ error: 'Missing description' }, 400);
  if (description.length > 5000) return c.json({ error: 'Description too long' }, 400);

  await db.insert(bugReports).values({
    playerId,
    category,
    description,
    status: 'new',
  });
  return c.json({ success: true });
});

// My reports: everything the authenticated player has filed, newest first,
// with live triage status + any notes the team left (shown in the bug
// reporter's "My Reports" tab).
bugReportsApp.get('/mine', async (c) => {
  const playerId = c.get('playerId');
  const rows = await db
    .select({
      id: bugReports.id,
      category: bugReports.category,
      description: bugReports.description,
      status: bugReports.status,
      assignee: bugReports.assignee,
      notes: bugReports.notes,
      createdAt: bugReports.createdAt,
      updatedAt: bugReports.updatedAt,
    })
    .from(bugReports)
    .where(eq(bugReports.playerId, playerId))
    .orderBy(desc(bugReports.createdAt))
    .limit(50);
  return c.json({
    reports: rows.map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      status: r.status ?? 'new',
      assignee: r.assignee ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
});

// Known issues: reports the team is investigating or has fixed. Players see
// this list in-game so they know a bug they hit is already on our radar.
bugReportsApp.get('/known', async (c) => {
  const rows = await db
    .select({
      id: bugReports.id,
      category: bugReports.category,
      description: bugReports.description,
      status: bugReports.status,
      assignee: bugReports.assignee,
      createdAt: bugReports.createdAt,
    })
    .from(bugReports)
    .where(or(eq(bugReports.status, 'fixed'), eq(bugReports.status, 'investigating')))
    .orderBy(desc(bugReports.createdAt))
    .limit(30);
  // Team notes are intentionally NOT included: the known-issues list is public
  // (any player can read it), while notes are for the reporting player only.
  return c.json({
    issues: rows.map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      status: r.status,
      assignee: r.assignee ?? null,
      createdAt: r.createdAt,
    })),
  });
});

export { bugReportsApp as bugReportRoutes };
