// ============================================================
// Dispatch HQ — signup-gate end-to-end check
// ============================================================
// Verifies the founder-controlled new-signup gate against the BUILT server
// (serve-combined) via plain HTTP — no browser needed:
//
//   * default state is OPEN — register returns 201
//   * founder (admin) toggles the gate closed via /api/admin/signup-gate
//   * while CLOSED, register returns 403 with the pause message
//   * guest login still works while closed (existing players unaffected)
//   * founder reopens — register returns 201 again
//
// The admin routes are gated on the founder email (config.founderEmail,
// always in the admin allow-list), so the script registers a real founder
// account first and reuses its auth cookie for the toggle calls.
//
// Usage:
//   E2E_BASE_URL=http://127.0.0.1:3001 node apps/web/e2e/signup-gate.mjs
//   (or `pnpm e2e:signup-gate` from the repo root)
//
// Exit codes:
//   0  all assertions passed
//   1  any assertion failed (message + last response body printed)
// ============================================================

const BASE_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const FOUNDER_EMAIL = process.env.E2E_FOUNDER_EMAIL || 'deandrewh26@gmail.com';
const FOUNDER_PASS = process.env.E2E_FOUNDER_PASS || 'e2e-founder-pass-2026';
const UNIQUE = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// --- tiny cookie jar: the auth token is an HttpOnly SameSite cookie ---
let cookieHeader = '';

function captureCookies(res) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    if (pair && pair.trim()) cookieHeader = pair.trim();
  }
}

async function req(method, path, { body, cookie = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie && cookieHeader) headers.Cookie = cookieHeader;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  captureCookies(res);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  console.log(`=== signup-gate e2e — ${BASE_URL} ===\n`);

  // 1. default state is OPEN
  console.log('[1] default state is open');
  {
    const r = await req('POST', '/api/auth/register', {
      body: { username: `gate_user_${UNIQUE}`, email: `gate_${UNIQUE}@example.com`, password: 'pass-1234' },
    });
    check('register returns 201 while open', r.status === 201, `got ${r.status}`);
  }

  // 2. founder registers and gets admin access
  console.log('[2] founder admin access');
  let adminReady = false;
  {
    const r = await req('POST', '/api/auth/register', {
      body: { username: `founder_${UNIQUE}`, email: FOUNDER_EMAIL, password: FOUNDER_PASS },
    });
    if (r.status === 409) {
      // Founder already exists from a previous run — log in instead.
      const l = await req('POST', '/api/auth/login', {
        body: { email: FOUNDER_EMAIL, password: FOUNDER_PASS },
      });
      adminReady = l.status === 200;
    } else {
      adminReady = r.status === 201;
    }
    check('founder account ready (register 201 or login 200)', adminReady, `got ${r.status}`);
  }
  if (!adminReady) {
    console.error('\nSIGNUP_GATE_FAIL — no founder access; cannot toggle the gate.');
    process.exit(1);
  }

  // 3. read the gate (admin) — should be open
  console.log('[3] admin reads gate state');
  {
    const r = await req('GET', '/api/admin/signup-gate');
    check('gate reported open', r.status === 200 && r.data?.open === true, JSON.stringify(r.data));
  }

  // 4. close the gate (founder toggle)
  console.log('[4] founder closes the gate');
  {
    const r = await req('POST', '/api/admin/signup-gate', { body: { open: false } });
    check('toggle accepted', r.status === 200 && r.data?.open === false, JSON.stringify(r.data));
  }

  // 5. register rejected while closed
  console.log('[5] register blocked while closed');
  let closedMsg = '';
  {
    const r = await req('POST', '/api/auth/register', {
      body: { username: `blocked_${UNIQUE}`, email: `blocked_${UNIQUE}@example.com`, password: 'pass-1234' },
    });
    closedMsg = r.data?.error ?? '';
    check('register returns 403 while closed', r.status === 403, `got ${r.status}`);
    check('403 carries the pause message', /signups are temporarily paused/i.test(closedMsg), JSON.stringify(r.data));
  }

  // 6. guest play still works while closed
  console.log('[6] guest login unaffected while closed');
  {
    const r = await req('POST', '/api/auth/guest');
    check('guest login returns 201 while closed', r.status === 201, `got ${r.status}`);
  }

  // 7. reopen and register again
  console.log('[7] founder reopens; register works again');
  {
    const t = await req('POST', '/api/admin/signup-gate', { body: { open: true } });
    check('toggle accepted', t.status === 200 && t.data?.open === true, JSON.stringify(t.data));
    const r = await req('POST', '/api/auth/register', {
      body: { username: `reopen_${UNIQUE}`, email: `reopen_${UNIQUE}@example.com`, password: 'pass-1234' },
    });
    check('register returns 201 after reopen', r.status === 201, `got ${r.status}`);
  }

  console.log('');
  if (failures > 0) {
    console.error(`SIGNUP_GATE_FAIL — ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('SIGNUP_GATE_OK — open 201 / closed 403 / guest unaffected / reopen 201');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
