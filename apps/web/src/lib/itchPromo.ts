// ============================================
// Dispatch HQ — itch.io promo copy (date-gated)
// ============================================
// The itch.io platform launch lands on a fixed date. Until then every promo
// surface (main-menu widget, pause menu, city-picker badge) says the game is
// coming; from the launch date on they flip to a buy CTA automatically —
// there is nothing to redeploy when the date passes.
//
// The date is LOCAL time on the player's machine (midnight Oct 27 their
// timezone), which is the right UX for a "coming today" banner.

/** The itch.io platform launch date — flip from "coming" to "buy" here. */
export const ITCH_LAUNCH_DATE = new Date('2026-10-27T00:00:00');

/** True once the itch.io launch date has passed (player-local time). */
export function itchLaunched(): boolean {
  return Date.now() >= ITCH_LAUNCH_DATE.getTime();
}

/**
 * The primary promo label, shared by the main menu, pause menu and city
 * picker so all three flip in sync:
 *   before launch → "Coming October 27 to all platforms"
 *   from launch   → "Buy Now"
 */
export function itchPromoLabel(): string {
  return itchLaunched() ? 'Buy Now' : 'Coming October 27 to all platforms';
}
