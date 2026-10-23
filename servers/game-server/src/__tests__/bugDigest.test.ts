import { describe, it, expect } from 'vitest';
import { parseDigestQuery, REPORT_STATUSES } from '../routes/admin';

// Weekly triage digest: the /admin/bug-reports endpoint derives its sort/filter
// from query params. These tests pin the parsing contract (defaults, invalid
// values, limits) and the status set the digest counts are grouped by.
describe('Bug report digest query parsing', () => {
  it('defaults to newest-first, all reports, limit 30', () => {
    expect(parseDigestQuery(null, null, null)).toEqual({
      order: 'newest',
      filter: 'all',
      limit: 30,
    });
  });

  it('accepts oldest order and unassigned filter', () => {
    expect(parseDigestQuery('oldest', 'unassigned', '50')).toEqual({
      order: 'oldest',
      filter: 'unassigned',
      limit: 50,
    });
  });

  it('rejects unknown order/filter values by falling back to safe defaults', () => {
    expect(parseDigestQuery('bogus', 'everything', '10')).toEqual({
      order: 'newest',
      filter: 'all',
      limit: 10,
    });
  });

  it('clamps the limit to the 1..200 range', () => {
    expect(parseDigestQuery('oldest', 'all', '-5')).toMatchObject({ limit: 1 });
    expect(parseDigestQuery('oldest', 'all', '9999')).toMatchObject({ limit: 200 });
    // '0' and non-numeric strings fall back to the 30 default (0 is falsy).
    expect(parseDigestQuery('oldest', 'all', '0')).toMatchObject({ limit: 30 });
    expect(parseDigestQuery('oldest', 'all', 'abc')).toMatchObject({ limit: 30 });
  });

  it('the digest counts are grouped over exactly the three triage statuses', () => {
    expect(REPORT_STATUSES).toEqual(['new', 'investigating', 'fixed']);
  });
});
