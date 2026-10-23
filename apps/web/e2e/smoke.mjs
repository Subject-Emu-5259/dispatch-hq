// ============================================================
// Dispatch HQ — end-to-end smoke (v0.24.0 Slice 4, expanded v0.32.0/v0.33.0)
// ============================================================
// Drives the BUILT server (serve-combined) with headless Chromium and plays
// the core loop end-to-end:
//
//   guest login → new campaign → build station → buy patrol car →
//   START PATROL → save → reload → resume (patrol persisted) →
//   dispatch the patrolling unit → en_route → complete the call (v0.33.0)
//
// v0.32.0 expanded the original guest→dispatch→save→resume smoke to also cover
// patrol start, a save round-trip that VERIFIES the persisted state, and
// pulling a patrolling unit off its beat. v0.33.0 pushes the run past en_route:
// it rams the game speed to 20×, saves + reloads mid-mission, and waits for the
// actual completion toast (+credits/+XP) — closing the audit's last
// integration-only flow. It is intentionally NOT part of `pnpm test` — it
// needs a booted server + Postgres — so it runs via the explicit `pnpm
// e2e:smoke` script (and the `e2e` CI job).
//
// Usage:
//   E2E_BASE_URL=http://127.0.0.1:3001 pnpm e2e:smoke
//
// Exit codes:
//   0  healthy (or SKIPPED when the headless browser binary isn't provisioned)
//   1  a step failed (message + page-text dump are printed)
// ============================================================

import {
  VIEWPORT, sleep,
  waitForText, clickByText, clickMap,
  clickFirstMissionCard, clickFirstCheckbox,
  openDispatchCenter, closeDispatchCenter, bodyDump,
  launchBrowser, collectPageErrors, waitForResume, setFastGameSpeed,
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
    step(1, `load ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForText(page, 'Command the chaos');
    await clickByText(page, 'Quick Play');
    console.log('  ok: guest login issued');

    step(2, 'start a new campaign');
    await waitForText(page, 'New Campaign');
    await clickByText(page, 'New Campaign');
    await waitForText(page, 'Start Here');
    await clickByText(page, 'Start Here');

    step(3, 'pick West Memphis + Police Department');
    await waitForText(page, 'Choose Your City');
    await clickByText(page, 'West Memphis, AR');
    await waitForText(page, 'Choose Your Service');
    await clickByText(page, 'Police Department');
    await clickByText(page, 'Start Dispatching');
    console.log('  ok: campaign started');

    step(4, 'skip onboarding tutorial');
    await waitForText(page, 'Skip Tutorial');
    await clickByText(page, 'Skip Tutorial');
    await sleep(800); // let the dismissal animation finish
    await waitForText(page, 'Build Station');

    step(5, 'build the first station');
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
    if (!built) throw new Error('Could not place the station on the map');
    await clickByText(page, /Build \(/);
    console.log('  ok: station built');

    step(6, 'buy the first patrol car');
    await clickByText(page, 'Stations', { tag: 'button' });
    await waitForText(page, 'Stations Command');
    await clickByText(page, /0\/\d+ units/); // expand the station card
    await waitForText(page, 'Acquire Unit');
    await clickByText(page, 'Patrol Car', { tag: 'button' });
    console.log('  ok: patrol car purchased');
    await page.mouse.click(VIEWPORT.width - 40, Math.floor(VIEWPORT.height / 2)); // backdrop closes the overlay
    await sleep(500);

    step(7, 'start a patrol from the dispatch center');
    await openDispatchCenter(page);
    await clickByText(page, 'Roster', { tag: 'button' });
    await waitForText(page, 'Patrol Car'); // the unit is listed in the roster
    await clickByText(page, 'PATROL', { tag: 'button' });
    await waitForText(page, 'END PATROL'); // the button flips once the unit is patrolling
    console.log('  ok: unit patrolling');

    step(8, 'save while patrolling');
    await closeDispatchCenter(page);
    await page.keyboard.press('Escape');
    await waitForText(page, 'PAUSED');
    await clickByText(page, 'Save Now');
    await waitForText(page, 'Saved to');
    console.log('  ok: saved');

    step(9, 'reload and verify the patrol survived');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForResume(page);
    // The save round-trip must restore the patrol, not just the screen: the
    // same unit must still be patrolling after resume.
    await openDispatchCenter(page);
    await clickByText(page, 'Roster', { tag: 'button' });
    await waitForText(page, 'Patrol Car');
    await waitForText(page, 'END PATROL');
    console.log('  ok: resumed, patrol persisted through save/reload');
    await closeDispatchCenter(page);

    step(10, 'dispatch the patrolling unit to a call');
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
    if (!dispatched) throw new Error('Could not dispatch the patrolling unit to a mission');
    await waitForText(page, 'En Route');
    console.log('  ok: patrolling unit pulled off its beat, now en_route');

    step(11, 'complete the dispatched mission (fast speed, save, resume)');
    // Ram the game speed to 20× (server-persisted settings row), save +
    // reload so the speed hydrates, then wait for the completion toast. At 20×
    // the drive + on-scene work finish in seconds; patrol shifts stay
    // real-time so nothing else races.
    await setFastGameSpeed(page);
    await page.keyboard.press('Escape');
    await waitForText(page, 'PAUSED');
    await clickByText(page, 'Save Now');
    await waitForText(page, 'Saved to');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForResume(page);
    await waitForText(page, /Complete!/, 240000); // "<mission> Complete!" toast
    await waitForText(page, /\+\d[\d,]* credits/, 15000); // "+N credits, +N XP" on the same toast
    console.log('  ok: mission completed end-to-end (reward toast)');

    if (errors.length > 0) {
      console.log(`\n(warn: ${errors.length} page error(s), smoke still passed)`);
      errors.slice(0, 5).forEach((e) => console.log(`   ${e}`));
    }

    console.log('\nSMOKE_OK — guest → build → patrol → save → reload → resume(patrol) → dispatch → complete');
  } catch (err) {
    console.error(`\nSMOKE_FAIL — ${err.message}`);
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
