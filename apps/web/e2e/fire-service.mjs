// ============================================================
// Dispatch HQ — fire-service e2e (v0.33.0)
// ============================================================
// The smoke covers police only. This journey proves the FIRE service works
// end-to-end in a live browser: build a fire station, acquire two engines,
// and dispatch them to a fire call → en route.
//
//   guest login → new campaign (Fire Department) → build station →
//   buy 2 fire engines → roster shows them → dispatch to a fire call → en_route
//
// Needs the BUILT server + Postgres, same as the smoke (runs in CI, not
// `pnpm test`). Usage:  E2E_BASE_URL=http://127.0.0.1:3001 pnpm e2e:fire
//
// Exit codes: 0 healthy (or SKIPPED when headless Chromium is absent), 1 failed.
// ============================================================

import {
  sleep,
  waitForText, clickByText, clickMap,
  clickFirstMissionCard, clickFirstCheckbox,
  openDispatchCenter, bodyDump,
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

    step(3, 'pick West Memphis + Fire Department');
    await waitForText(page, 'Choose Your City');
    await clickByText(page, 'West Memphis, AR');
    await waitForText(page, 'Choose Your Service');
    await clickByText(page, 'Fire Department');
    await clickByText(page, 'Start Dispatching');
    console.log('  ok: fire campaign started');

    step(4, 'skip onboarding tutorial');
    await waitForText(page, 'Skip Tutorial');
    await clickByText(page, 'Skip Tutorial');
    await sleep(800);
    await waitForText(page, 'Build Station');

    step(5, 'build the first fire station');
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
    if (!built) throw new Error('Could not place the fire station on the map');
    await clickByText(page, /Build \(/);
    console.log('  ok: fire station built');

    step(6, 'buy two fire engines');
    await clickByText(page, 'Stations', { tag: 'button' });
    await waitForText(page, 'Stations Command');
    await clickByText(page, /0\/\d+ units/); // expand the station card
    await waitForText(page, 'Acquire Unit');
    await clickByText(page, 'Fire Engine', { tag: 'button' });
    await clickByText(page, 'Fire Engine', { tag: 'button' }); // second engine
    console.log('  ok: 2 fire engines acquired');
    await page.mouse.click(VIEWPORT.width - 40, Math.floor(VIEWPORT.height / 2)); // backdrop closes the overlay
    await sleep(500);

    step(7, 'verify the engines in the dispatch roster');
    await openDispatchCenter(page);
    await clickByText(page, 'Roster', { tag: 'button' });
    await waitForText(page, 'Fire Engine');
    console.log('  ok: fire engines listed in the roster');
    await page.evaluate(() => {
      const b = document.querySelector('[aria-label="Close Dispatch Center"]');
      if (b) b.click();
    });
    await sleep(500);

    step(8, 'dispatch the engines to a fire call');
    let dispatched = false;
    for (let attempt = 0; attempt < 5 && !dispatched; attempt++) {
      if (!(await clickFirstMissionCard(page, attempt))) { await sleep(1000); continue; }
      if (!(await clickFirstCheckbox(page, 6000))) { await sleep(500); continue; }
      try {
        await clickByText(page, /^Dispatch \d/, { timeout: 8000 });
        dispatched = true;
      } catch {
        await sleep(500);
      }
    }
    if (!dispatched) throw new Error('Could not dispatch fire engines to a call');
    await waitForText(page, 'En Route');
    console.log('  ok: fire engines dispatched, en_route');

    if (errors.length > 0) {
      console.log(`\n(warn: ${errors.length} page error(s), fire smoke still passed)`);
      errors.slice(0, 5).forEach((e) => console.log(`   ${e}`));
    }

    console.log('\nFIRE_SMOKE_OK — fire campaign → station → engines → dispatch → en_route');
  } catch (err) {
    console.error(`\nFIRE_SMOKE_FAIL — ${err.message}`);
    console.error('\n--- page text dump ---\n');
    console.error(await bodyDump(page));
    if (errors.length) {
      console.error('\n--- page errors ---\n');
      errors.slice(0, 10).forEach((e) => console.error(`  ${e}`));
    }
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
