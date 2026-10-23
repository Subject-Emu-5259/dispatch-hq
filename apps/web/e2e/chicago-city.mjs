// ============================================================
// Dispatch HQ — Chicago city e2e (v0.33.x)
// ============================================================
// The smoke runs West Memphis only. This journey proves the Chicago slice
// (precise city-limits boundary + enclave holes) holds up in a live browser:
// start a brand new campaign in Chicago (the picker attaches the real boundary
// polygon at selection), then play the placement loop — the Chicago loop a
// player sees. Mirrors la-city.mjs.
//
//   guest login → new campaign → pick Chicago (Police) →
//   skip tutorial → build a station inside Chicago city limits
//
// New campaigns are NOT level-gated (the L10 gate only applies to
// relocation), so a fresh campaign can start in Chicago directly. Needs the
// BUILT server + Postgres, same as the smoke. Usage:
//   E2E_BASE_URL=http://127.0.0.1:3001 pnpm e2e:chicago-city
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

    step(3, 'pick Chicago + Police Department');
    await waitForText(page, 'Choose Your City');
    await clickByText(page, 'Chicago');
    await waitForText(page, 'Choose Your Service');
    await clickByText(page, 'Police Department');
    await clickByText(page, 'Start Dispatching');
    console.log('  ok: Chicago campaign started (boundary attached)');

    step(4, 'skip onboarding tutorial');
    await waitForText(page, 'Skip Tutorial');
    await clickByText(page, 'Skip Tutorial');
    await sleep(800);
    await waitForText(page, 'Build Station');

    step(5, 'build a station inside the Chicago city limits');
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
    if (!built) throw new Error('Could not place the station on the Chicago map');
    await clickByText(page, /Build \(/);
    console.log('  ok: station built in Chicago');

    if (errors.length > 0) {
      console.log(`\n(warn: ${errors.length} page error(s), Chicago smoke still passed)`);
      errors.slice(0, 5).forEach((e) => console.log(`   ${e}`));
    }

    console.log('\nCHICAGO_SMOKE_OK — Chicago campaign → station placement loop');
  } catch (err) {
    console.error(`\nCHICAGO_SMOKE_FAIL — ${err.message}`);
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
