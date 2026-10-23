// ============================================================
// Dispatch HQ — Paris city e2e (v0.34.x)
// ============================================================
// The smoke runs West Memphis only. This journey proves the Paris slice
// (city street/landmark/district data + campaign loop) holds up in a live
// browser: start a brand new campaign in Paris, then play the placement
// loop — the Paris loop a player sees. Mirrors la-city.mjs /
// chicago-city.mjs / houston-city.mjs / london-city.mjs. Paris has the
// precise OSM City of Paris boundary (all 20 arrondissements inside the
// périphérique, the two bois included), so the picker attaches the real
// polygon at campaign start and the station must land inside Paris proper —
// never in the banlieue (Boulogne, Neuilly, Saint-Denis, Montreuil…)
// outside the boundary.
//
//   guest login → new campaign → pick Paris (Police) →
//   skip tutorial → build a station in Paris
//
// New campaigns are NOT level-gated (the L16 gate only applies to
// relocation), so a fresh campaign can start in Paris directly. Needs the
// BUILT server + Postgres, same as the smoke. Usage:
//   E2E_BASE_URL=http://127.0.0.1:3001 pnpm e2e:paris-city
//
// Exit codes: 0 healthy (or SKIPPED when headless Chromium is absent), 1 failed.
// ============================================================

import {
  sleep,
  waitForText, clickByText, clickMap,
  bodyDump,
  launchBrowser, collectPageErrors,
} from './helpers.mjs';

const BASE_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

let page;
async function main() {
  const browser = await launchBrowser();
  if (!browser) return;

  page = await browser.newPage();
  const errors = collectPageErrors(page);

  const step = (n, label) => console.log(`\n[${n}] ${label}`);

  try {
    step(1, `load ${BASE_URL} + guest login`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForText(page, 'Command the chaos');
    await clickByText(page, 'Quick Play');

    step(2, 'start a new campaign');
    await waitForText(page, 'New Campaign');
    await clickByText(page, 'New Campaign');
    await waitForText(page, 'Start Here');
    await clickByText(page, 'Start Here');

    step(3, 'pick Paris + Police Department');
    await waitForText(page, 'Choose Your City');
    await clickByText(page, 'Paris');
    await waitForText(page, 'Choose Your Service');
    await clickByText(page, 'Police Department');
    await clickByText(page, 'Start Dispatching');
    console.log('  ok: Paris campaign started');

    step(4, 'skip onboarding tutorial');
    await waitForText(page, 'Skip Tutorial');
    await clickByText(page, 'Skip Tutorial');
    await sleep(800);
    await waitForText(page, 'Build Station');

    step(5, 'build a station in Paris');
    await clickByText(page, /^Build Station$/);
    await waitForText(page, 'Choose Location');
    await clickByText(page, 'Choose Location');
    await waitForText(page, 'Click anywhere on the map below');
    let built = false;
    for (let attempt = 0; attempt < 3 && !built; attempt++) {
      await clickMap(page);
      try {
        await waitForText(page, 'Build (', 8000);
        built = true;
      } catch {
        console.log(`    (retry map click ${attempt + 1})`);
      }
    }
    if (!built) throw new Error('Could not place the station on the Paris map');

    console.log('\n  ok: station placed in Paris');
    await waitForText(page, 'Start Campaign');
    await clickByText(page, 'Start Campaign');

    console.log('\n=== paris-city journey PASSED ===');
    const errs = errors();
    if (errs.length) {
      console.log('page errors observed:');
      for (const e of errs) console.log('  -', e);
    }
  } catch (err) {
    console.error(`\n=== paris-city journey FAILED: ${err.message} ===`);
    await bodyDump(page, 'paris-city');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
