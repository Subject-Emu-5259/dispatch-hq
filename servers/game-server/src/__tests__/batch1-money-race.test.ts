// ============================================
// Dispatch HQ — Batch 1 money-race harness (P1-M2)
// ============================================
// Why SQLite here: the VM has no Postgres, and the race lives in the SQL
// pattern, not the driver — a single guarded UPDATE (`... WHERE balance >=
// cost`, affected-row count as the verdict) is atomic in ANY engine that
// serializes writers, Postgres included. So this harness runs the EXACT
// guarded statements the routes issue (same shape, same guard, same
// row-count verdict) with 20 genuinely concurrent writers, and runs the OLD
// check-then-act shape as a control to prove the harness can catch the bug.
// The route-side half — that the handlers issue exactly these statements —
// is covered by tsc + the code, and by the live DHQ-LAUNCH race after deploy.
//
// Each writer gets its OWN connection (shared cache off, WAL on) with a busy
// timeout, so writers truly contend like 20 HTTP requests hitting Postgres.

import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Run fn on its own connection, staggered so all writers overlap. */
async function race(dbFile: () => DatabaseSync, n: number, fn: (db: DatabaseSync, i: number) => number | Promise<number>): Promise<number[]> {
  const dbs = Array.from({ length: n }, () => dbFile());
  try {
    return await Promise.all(dbs.map(async (db, i) => {
      await new Promise((r) => setTimeout(r, (i % 5) * 2));
      try {
        return await fn(db, i);
      } finally {
        db.close();
      }
    }));
  } finally {
    for (const db of dbs) { try { db.close(); } catch { /* already closed */ } }
  }
}

function setupFileDb(): { file: string; setup: DatabaseSync } {
  const dir = mkdtempSync(join(tmpdir(), 'dhq-batch1-race-'));
  tmpDirs.push(dir);
  const file = join(dir, 'race.db');
  const setup = new DatabaseSync(file);
  setup.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;');
  return { file, setup } as { file: string; setup: DatabaseSync };
}

function writerFor(file: string): () => DatabaseSync {
  return () => {
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;');
    return db;
  };
}

describe('P1-M2 money races — guarded SQL pattern', () => {
  it('20 concurrent spends of 50 against a 50-coin balance: exactly ONE succeeds, balance never negative', async () => {
    const { file, setup } = setupFileDb();
    setup.exec('CREATE TABLE players (id TEXT PRIMARY KEY, coins INTEGER NOT NULL, credits INTEGER NOT NULL)');
    setup.exec("INSERT INTO players VALUES ('p1', 50, 0)");
    setup.close();

    const results = await race(
      writerFor(file),
      20,
      (db) => {
        // EXACT guarded shape from routes/shop.ts /spend:
        // UPDATE players SET coins = coins - ? WHERE id = ? AND coins >= ?
        const res = db.prepare('UPDATE players SET coins = coins - ? WHERE id = ? AND coins >= ?').run(50, 'p1', 50);
        if (res.changes === 1) {
          db.prepare('UPDATE players SET credits = credits + 100 WHERE id = ?').run('p1');
          return 1;
        }
        return 0;
      },
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    const check = new DatabaseSync(file);
    const row = check.prepare('SELECT coins, credits FROM players WHERE id = ?').get('p1') as { coins: number; credits: number };
    expect(row.coins).toBe(0);
    expect(row.credits).toBe(100);
    check.close();
  });

  it('CONTROL — old check-then-act shape fails the same race (proves the harness catches it)', async () => {
    const { file, setup } = setupFileDb();
    setup.exec('CREATE TABLE players (id TEXT PRIMARY KEY, coins INTEGER NOT NULL, credits INTEGER NOT NULL)');
    setup.exec("INSERT INTO players VALUES ('p1', 50, 0)");
    setup.close();

    const results = await race(
      writerFor(file),
      20,
      async (db) => {
        // OLD shape: read in JS, check in JS, write an absolute value — with
        // a real await between read and write so all 20 interleave the way
        // 20 concurrent HTTP requests interleave around an awaited query.
        const row = db.prepare('SELECT coins FROM players WHERE id = ?').get('p1') as { coins: number };
        if (row.coins < 50) return 0;
        await new Promise((r) => setTimeout(r, 10));
        db.prepare('UPDATE players SET coins = ?, credits = credits + 100 WHERE id = ?').run(row.coins - 50, 'p1');
        return 1;
      },
    );
    // More than one "success" for a single affordable spend = the bug.
    expect(results.reduce((a, b) => a + b, 0)).toBeGreaterThan(1);
  });

  it('20 concurrent redeems against maxUses=1: usedCount never exceeds 1', async () => {
    const { file, setup } = setupFileDb();
    setup.exec('CREATE TABLE promo_codes (id TEXT PRIMARY KEY, used_count INTEGER NOT NULL, max_uses INTEGER NOT NULL)');
    setup.exec("INSERT INTO promo_codes VALUES ('code1', 0, 1)");
    setup.exec('CREATE TABLE promo_redemptions (promo_id TEXT NOT NULL, player_id TEXT NOT NULL, UNIQUE(promo_id, player_id))');
    setup.close();

    const results = await race(
      writerFor(file),
      20,
      (db, i) => {
        // EXACT guarded shape from routes/promos.ts: bump only while under cap.
        const bumped = db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ? AND used_count < ?').run('code1', 1);
        if (bumped.changes === 0) return 0;
        try {
          db.prepare('INSERT INTO promo_redemptions VALUES (?, ?)').run('code1', `player-${i}`);
        } catch {
          return 0;
        }
        return 1;
      },
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    const check = new DatabaseSync(file);
    const row = check.prepare('SELECT used_count FROM promo_codes WHERE id = ?').get('code1') as { used_count: number };
    expect(row.used_count).toBe(1);
    check.close();
  });

  it('20 concurrent shared-station claims: exactly one transfer wins', async () => {
    const { file, setup } = setupFileDb();
    setup.exec('CREATE TABLE stations (id TEXT PRIMARY KEY, alliance_id TEXT, owner_id TEXT)');
    setup.exec("INSERT INTO stations VALUES ('s1', 'a1', NULL)");
    setup.exec('CREATE TABLE players (id TEXT PRIMARY KEY, credits INTEGER NOT NULL)');
    for (let i = 0; i < 20; i++) setup.exec(`INSERT INTO players VALUES ('player-${i}', 9000)`);
    setup.close();

    const results = await race(
      writerFor(file),
      20,
      (db, i) => {
        // EXACT shape from routes/sharedStations.ts: transfer only while
        // still alliance-owned, debit only while funded — one transaction.
        db.exec('BEGIN IMMEDIATE');
        try {
          const moved = db.prepare('UPDATE stations SET alliance_id = NULL, owner_id = ? WHERE id = ? AND alliance_id = ?').run(`player-${i}`, 's1', 'a1');
          if (moved.changes === 0) { db.exec('ROLLBACK'); return 0; }
          const paid = db.prepare('UPDATE players SET credits = credits - ? WHERE id = ? AND credits >= ?').run(5000, `player-${i}`, 5000);
          if (paid.changes === 0) { db.exec('ROLLBACK'); return 0; }
          db.exec('COMMIT');
          return 1;
        } catch {
          try { db.exec('ROLLBACK'); } catch { /* ignore */ }
          return 0;
        }
      },
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    const check = new DatabaseSync(file);
    const station = check.prepare('SELECT alliance_id, owner_id FROM stations WHERE id = ?').get('s1') as { alliance_id: string | null; owner_id: string };
    expect(station.alliance_id).toBeNull();
    expect(station.owner_id).toMatch(/^player-/);
    const debited = check.prepare('SELECT COUNT(*) AS n FROM players WHERE credits = 4000').get() as { n: number };
    expect(debited.n).toBe(1);
    check.close();
  });
});
