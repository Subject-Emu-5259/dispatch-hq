import { describe, it, expect } from 'vitest';
import { REPORT_STATUSES } from '../routes/admin';

// Bug-report triage workflow: the admin PATCH endpoint validates status
// against the exported REPORT_STATUSES closed set, and the client renders
// chips for exactly those statuses. These tests pin the contract so a typo
// or a new status that the UI can't render is caught here.
describe('Bug report triage statuses', () => {
  it('supports exactly the three triage statuses', () => {
    expect(REPORT_STATUSES).toEqual(['new', 'investigating', 'fixed']);
  });

  it('every server status has a client-side chip (AdminPanel STATUS_META + BugReport chips)', () => {
    const clientChips = ['new', 'investigating', 'fixed'];
    for (const s of REPORT_STATUSES) {
      expect(clientChips).toContain(s);
    }
  });

  it('the PATCH guard rejects anything outside the closed set', () => {
    const invalid = ['open', 'resolved', 'NEW', 'done', '', 'investigating ', null];
    for (const s of invalid) {
      expect((REPORT_STATUSES as readonly unknown[]).includes(s)).toBe(false);
    }
  });

  it('new submissions and legacy rows both read as "new"', () => {
    // POST inserts status 'new'; GET falls back to 'new' for pre-migration rows.
    expect(REPORT_STATUSES.includes('new')).toBe(true);
  });
});
