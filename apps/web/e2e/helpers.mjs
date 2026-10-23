// ============================================================
// Dispatch HQ — shared e2e helpers (v0.33.0)
// ============================================================
// The wait/click/map/mission-card matchers shared by smoke.mjs,
// fire-service.mjs and la-city.mjs. Extracted verbatim from smoke.mjs so all
// three journeys behave identically (substring/RegExp matching inside the
// page, deepest-shortest-text clicking, retry loops, body-dump on failure).
// ============================================================

export const STEP_TIMEOUT = parseInt(process.env.E2E_STEP_TIMEOUT || '45000', 10);
export const VIEWPORT = { width: 1440, height: 900 };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A matcher is a plain string (substring match) or a RegExp. Matching happens
// inside the browser via page.evaluate, so RegExps are serialized to
// "/source/flags" strings and recompiled in the page.
function matcherSrc(matcher) {
  if (matcher instanceof RegExp) return `/${matcher.source}/${matcher.flags}`;
  return String(matcher);
}

/** Wait until `matcher` appears in the visible body text. */
export async function waitForText(page, matcher, timeout = STEP_TIMEOUT) {
  const src = matcherSrc(matcher);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((m) => {
      const body = document.body ? document.body.innerText || '' : '';
      const t = body.replace(/\s+/g, ' ').trim();
      let ok = false;
      if (m.startsWith('/')) {
        const mm = m.match(/^\/(.*)\/([a-z]*)$/);
        if (mm) { try { ok = new RegExp(mm[1], mm[2]).test(t); } catch { ok = false; } }
      } else {
        ok = t === m || t.includes(m);
      }
      return ok;
    }, src);
    if (found) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for text: ${src}`);
}

/** Click the deepest (shortest-text) enabled element matching `matcher`. */
export async function clickByText(page, matcher, { timeout = STEP_TIMEOUT, tag = '' } = {}) {
  const src = matcherSrc(matcher);
  const selector = tag || 'button, a, label, [role="button"], div, span';
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const done = await page.evaluate(({ m, selector }) => {
      let best = null;
      for (const el of document.querySelectorAll(selector)) {
        if (el.disabled) continue;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        let ok = false;
        if (m.startsWith('/')) {
          const mm = m.match(/^\/(.*)\/([a-z]*)$/);
          if (mm) { try { ok = new RegExp(mm[1], mm[2]).test(text); } catch { ok = false; } }
        } else {
          ok = text === m || text.includes(m);
        }
        if (ok && (!best || text.length < best.text.length)) best = { el, text };
      }
      if (!best) return false;
      best.el.click();
      return true;
    }, { m: src, selector });
    if (done) return;
    await sleep(300);
  }
  throw new Error(`Timed out clicking text: ${src}`);
}

export async function waitForSelector(page, sel, timeout = STEP_TIMEOUT) {
  try {
    await page.waitForSelector(sel, { timeout });
  } catch {
    throw new Error(`Timed out waiting for selector: ${sel}`);
  }
}

/** Click the map (for station placement) — right of the sidebar, below the
 *  location banner, inside the maplibregl canvas. */
export async function clickMap(page) {
  await waitForSelector(page, '.maplibregl-canvas', 20000);
  const rect = await page.evaluate(() => {
    const c = document.querySelector('.maplibregl-canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (!rect || rect.w < 10 || rect.h < 10) throw new Error('Map canvas has no size');
  await page.mouse.click(rect.x + rect.w * 0.62, rect.y + rect.h * 0.55);
}

/** Click the first mission card (a div with a "Needs" label, an "Lv." chip,
 *  and an h3). `skip` cards before it so the caller can move to the next. */
export async function clickFirstMissionCard(page, skip = 0) {
  return page.evaluate((skip) => {
    const cards = Array.from(document.querySelectorAll('div')).filter((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ');
      return t.includes('Needs') && t.includes('Lv.') && !!el.querySelector('h3');
    });
    if (cards.length <= skip) return false;
    const h3 = cards[skip].querySelector('h3');
    if (!h3) return false;
    h3.click();
    return true;
  }, skip);
}

/** Click the first enabled checkbox in the expanded mission card. */
export async function clickFirstCheckbox(page, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const clicked = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('input[type="checkbox"]')).find((b) => !b.disabled);
      if (!box) return false;
      box.click();
      return true;
    });
    if (clicked) return true;
    await sleep(300);
  }
  return false;
}

/**
 * Open the Unified Dispatch Center. Prefers the exact-text right-rail
 * "Dispatch HQ" toggle, falls back to the TopBar "CAD System" icon button
 * (both map to `toggleDispatchCenter`). Idempotent when already open.
 */
export async function openDispatchCenter(page) {
  const deadline = Date.now() + STEP_TIMEOUT;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const t = (document.body ? document.body.innerText || '' : '').replace(/\s+/g, ' ').trim();
      if (t.includes('Dispatch HQ Console')) return 'open';
      for (const el of document.querySelectorAll('button')) {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt === 'Dispatch HQ') { el.click(); return 'clicked'; }
      }
      const cad = document.querySelector('[aria-label="CAD System"]');
      if (cad) { cad.click(); return 'clicked'; }
      return 'none';
    });
    if (state === 'open') return;
    if (state === 'clicked') {
      try { await waitForText(page, 'Dispatch HQ Console', 5000); return; } catch { /* retry */ }
    }
    await sleep(300);
  }
  throw new Error('Could not open the dispatch center');
}

/** Close the Unified Dispatch Center via its close button. */
export async function closeDispatchCenter(page) {
  await page.evaluate(() => {
    const b = document.querySelector('[aria-label="Close Dispatch Center"]');
    if (b) b.click();
  });
  await sleep(400); // let the overlay finish closing
}

export async function bodyDump(page) {
  try {
    return await page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\n{2,}/g, '\n').slice(0, 3000));
  } catch {
    return '(no body)';
  }
}

/** Launch headless Chromium; SKIP (exit 0) when the browser binary is absent. */
export async function launchBrowser() {
  let browser;
  try {
    browser = await (await import('puppeteer')).launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: VIEWPORT,
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/could not find|browser|chrome|executable/i.test(msg)) {
      console.log(`SMOKE_SKIP — headless Chromium not provisioned (${msg}). Run "npx puppeteer browsers install chrome" or let CI provide it.`);
      return null;
    }
    throw err;
  }
  return browser;
}

/** Attach console/pageerror listeners and return the collected errors. */
export function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  return errors;
}

/**
 * Wait for the app to auto-resume into the game screen after a reload: the
 * sidebar "Build Station" + map canvas must appear, never the menu or auth.
 */
export async function waitForResume(page, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let resumed = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const t = (document.body ? document.body.innerText || '' : '').replace(/\s+/g, ' ');
      if (t.includes('Build Station')) return 'playing';
      if (t.includes('New Campaign') || t.includes('Quick Play')) return 'menu';
      return 'loading';
    });
    if (state === 'playing') { resumed = true; break; }
    if (state === 'menu') break;
    await sleep(300);
  }
  if (!resumed) throw new Error('After reload the app did not auto-resume into the game screen');
  await waitForSelector(page, '.maplibregl-canvas', 30000);
}

/**
 * Ram the game speed up (v0.33.0): write the server-persisted settings row so
 * the next settings hydration (reload) picks up gameSpeed 20 — mission work,
 * unit travel, and the game clock run 20× faster while patrol shifts stay
 * real-time. Requires an authenticated session (guest cookie) — same-origin.
 */
export async function setFastGameSpeed(page) {
  const ok = await page.evaluate(async () => {
    const res = await fetch('/player/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { gameSpeed: 20 } }),
    });
    return res.ok;
  });
  if (!ok) throw new Error('Could not persist fast game speed (settings POST failed)');
}
