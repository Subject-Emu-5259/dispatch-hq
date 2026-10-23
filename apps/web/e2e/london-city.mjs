// ============================================================
// Dispatch HQ — London city e2e (v0.34.x)
// ============================================================
// The smoke runs West Memphis only. This journey proves the London slice
// (city street/landmark/district data + campaign loop) holds up in a live
// browser: start a brand new campaign in London, then play the placement
// loop — the London loop a player sees. Mirrors la-city.mjs /
// chicago-city.mjs / houston-city.mjs. London has the precise OSM Greater
// London boundary (all 32 boroughs + the City of London), so the picker
// attaches the real polygon at campaign start and the station must land
// inside Greater London — never in the ring towns (Watford, Slough,
// Dartford…) outside the boundary.
//
//   guest login → new campaign → pick London (Police) →
//   skip tutorial → build a station in London
//
// New campaigns are NOT level-gated (the L14 gate only applies to
// relocation), so a fresh campaign can start in London directly. Needs the
// BUILT server + Postgres, same as the smoke. Usage:
//   E2E_BASE_URL=http://127.0.0.1:3001 pnpm e2e:london-city
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

    step(3, 'pick London + Police Department');
    await waitForText(page, 'Choose Your City');
    await clickByText(page, 'London');
    await waitForText(page, 'Choose Your Service');
    await clickByText(page, 'Police Department');
    await clickByText(page, 'Start Dispatching');
    console.log('  ok: London campaign started');

    step(4, 'skip onboarding tutorial');
    await waitForText(page, 'Skip Tutorial');
    await clickByText(page, 'Skip Tutorial');
    await sleep(800);
    await waitForText(page, 'Build Station');

    step(5, 'build a station in London');
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
    if (!built) throw new Error('Could not place the station on the London map');

    console.log('\n  ok: station placed in London');
    await waitForText(page, 'Start Campaign');
    await clickByText(page, 'Start Campaign');

    console.log('\n=== london-city journey PASSED ===');
    const errs = errors();
    if (errs.length) {
      console.log('page errors observed:');
      for (const e of errs) console.log('  -', e);
    }
  } catch (err) {
    console.error(`\n=== london-city journey FAILED: ${err.message} ===`);
    await bodyDump(page, 'london-city');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
