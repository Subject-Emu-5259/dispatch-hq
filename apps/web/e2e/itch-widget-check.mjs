// ============================================================
// Dispatch HQ — itch.io widget render check (screenshots)
// ============================================================
// Verifies the "Play on itch.io" widget in the MAIN MENU renders
// correctly on desktop and phone viewports, and captures PNG
// screenshots of the widget region for the scan checklist.
//
//   * waits for the "Play on itch.io" section + the itch iframe
//   * asserts the iframe src is https://itch.io/embed/4854287
//   * captures full-page + widget-crop screenshots per viewport
//
// Usage:
//   E2E_BASE_URL=http://127.0.0.1:3001 node apps/web/e2e/itch-widget-check.mjs
//   SHOT_DIR=/tmp/itch-shots node apps/web/e2e/itch-widget-check.mjs
//
// Exit codes: 0 = all viewports verified, 1 = any check failed.
// ============================================================

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const SHOT_DIR = process.env.SHOT_DIR || join(process.cwd(), '.record-tmp', 'itch-widget');
const STEP_TIMEOUT = 30000;
const EMBED_ID = '4854287';
// The promo label is date-gated (apps/web/src/lib/itchPromo.ts):
//   before Oct 27 2026 → 'Coming October 27 to all platforms'
//   from Oct 27       → 'Buy Now'
// The section renders it UPPERCASE (uppercase tracking-widest).
const ITCH_LAUNCH_DATE = new Date('2026-10-27T00:00:00');
const PROMO_LABEL = Date.now() >= ITCH_LAUNCH_DATE.getTime() ? 'BUY NOW' : 'COMING OCTOBER 27 TO ALL PLATFORMS';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 375, height: 812 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/could not find|browser|chrome|executable/i.test(msg)) {
      console.log(`SKIP — headless Chromium not provisioned (${msg}). Run "npx puppeteer browsers install chrome".`);
      return;
    }
    throw err;
  }

  let failures = 0;
  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height });
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

      try {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 1. Click through the boot loading gate if present
        {
          const deadline = Date.now() + STEP_TIMEOUT;
          while (Date.now() < deadline) {
            const entered = await page.evaluate(() => {
              const t = document.body ? document.body.innerText || '' : '';
              if (t.includes('Play on itch.io')) return true; // already past the gate
              const btn = Array.from(document.querySelectorAll('button')).find(
                (b) => (b.textContent || '').includes('Enter Dispatch HQ') && !b.disabled
              );
              if (btn) { btn.click(); return true; }
              return false;
            });
            if (entered) break;
            await sleep(300);
          }
        }

        // 2. Guest login — the app gates the menu behind auth (Quick Play).
        {
          const deadline = Date.now() + STEP_TIMEOUT;
          while (Date.now() < deadline) {
            const authed = await page.evaluate(() => {
              const t = document.body ? document.body.innerText || '' : '';
              if (t.includes('Play on itch.io')) return true; // already on the menu
              const btn = Array.from(document.querySelectorAll('button')).find(
                (b) => (b.textContent || '').trim() === 'Quick Play' && !b.disabled
              );
              if (btn) { btn.click(); return true; }
              return false;
            });
            if (authed) break;
            await sleep(300);
          }
        }

        // 3. Main menu is up (guest auth resolves → menu with the itch widget).
        //    The section label is date-gated + rendered UPPERCASE, so compare
        //    against the expected promo label case-insensitively.
        const deadline = Date.now() + STEP_TIMEOUT;
        let menu = false;
        while (Date.now() < deadline) {
          const t = await page.evaluate(() => (document.body ? (document.body.innerText || '').toUpperCase() : ''));
          if (t.includes(PROMO_LABEL)) { menu = true; break; }
          await sleep(300);
        }
        if (!menu) throw new Error('main menu (with the itch section) did not render after guest login');

        // 4. Promo section visible (label + FREE note)
        const sec = await page.evaluate(() => {
          const t = (document.body ? document.body.innerText || '' : '').toUpperCase().replace(/\s+/g, ' ');
          return t.includes(PROMO_LABEL) && t.includes('WEB VERSION IS FREE');
        });
        if (!sec) throw new Error(`itch promo section (${PROMO_LABEL}) not found on the main menu`);
        console.log(`  ok: itch section present (${PROMO_LABEL})`);

        // 5. iframe present with the right embed src
        const iframe = await page.evaluate((id) => {
          const f = Array.from(document.querySelectorAll('iframe')).find(
            (x) => (x.src || '').includes(`itch.io/embed/${id}`)
          );
          if (!f) return null;
          const r = f.getBoundingClientRect();
          return { src: f.src, w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
        }, EMBED_ID);
        if (!iframe) throw new Error(`itch iframe (embed/${EMBED_ID}) not in the DOM`);
        if (!iframe.visible) throw new Error(`itch iframe has zero size — widget not rendering`);
        console.log(`  ok: iframe ${iframe.src} visible (${iframe.w}x${iframe.h})`);

        // 6. let the embed's own content load (it fetches from itch.io)
        await sleep(2500);

        // 7. screenshots
        const full = join(SHOT_DIR, `itch-${vp.name}-full.png`);
        await page.screenshot({ path: full });
        console.log(`  shot: ${full}`);

        const crop = join(SHOT_DIR, `itch-${vp.name}-widget.png`);
        // scroll the widget fully into view FIRST, then measure — the clip is
        // viewport-relative, so measuring before scrolling captures stale coords.
        await page.evaluate((id) => {
          const f = Array.from(document.querySelectorAll('iframe')).find(
            (x) => (x.src || '').includes(`itch.io/embed/${id}`)
          );
          if (f) f.scrollIntoView({ block: 'center' });
        }, EMBED_ID);
        await sleep(800);
        const rect = await page.evaluate((id) => {
          const f = Array.from(document.querySelectorAll('iframe')).find(
            (x) => (x.src || '').includes(`itch.io/embed/${id}`)
          );
          if (!f) return null;
          const r = f.getBoundingClientRect();
          // widen the crop: section label above + FREE note below.
          // Puppeteer's clip needs integer (double) values.
          return {
            x: Math.round(Math.max(0, r.left - 8)),
            y: Math.round(Math.max(0, r.top - 28)),
            width: Math.round(r.width + 16),
            height: Math.round(r.height + 60),
          };
        }, EMBED_ID);
        if (rect) {
          await page.screenshot({ path: crop, clip: rect });
          console.log(`  shot: ${crop} (crop ${rect.width}x${rect.height})`);
        }

        if (errors.length) {
          console.log(`  (warn: ${errors.length} page error(s))`);
          errors.slice(0, 4).forEach((e) => console.log(`    ${e}`));
        }
        console.log(`  ✓ ${vp.name} verified`);
      } catch (err) {
        failures++;
        console.error(`  ✗ ${vp.name} FAILED: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    console.error(`\nITCH_WIDGET_FAIL — ${failures} viewport(s) failed. Screenshots in ${SHOT_DIR}`);
    process.exit(1);
  }
  console.log(`\nITCH_WIDGET_OK — desktop + phone verified. Screenshots in ${SHOT_DIR}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
