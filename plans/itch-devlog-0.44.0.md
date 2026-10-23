# v0.44.0–v0.47.0 — Daily coins, two more radio accents, and the help docs catch up

**Post this on the itch.io dashboard:** agreatgame.itch.io → **Edit game** → **Devlogs** → **Create new post** (paste the markdown below; the dashboard editor renders itch markdown).

---

A quality-of-life sprint: free coins every day, two new city voices, and the help docs finally reflect what the game actually does.

**Daily login bonus — free coins just for opening the game.** Every player gets coins daily: Commander members receive 5, free players receive 2. A banner appears on the main menu when the bonus is available — tap to claim. Server-authoritative with idempotent claiming, so double-tapping is safe and your balance stays correct across devices.

**Sydney and Toronto join the radio.** Two more cities get the full accent treatment:

- **Sydney** 🇦🇺 — "Copy"/"Roger" acknowledgments, "ALPHA" fire codes, "PARAMEDIC URGENT" EMS, "Fire & Rescue NSW" style
- **Toronto** 🇨🇦 — "Copy that"/"Roger" acknowledgments, "ALPHA" fire codes, "PARAMEDIC URGENT" EMS, "Toronto Fire Services" style

All six international cities now have distinct radio accents: London, Paris, Tokyo, Berlin, Sydney, and Toronto — each with unique call signs, dispatch codes, and locale-specific phrasing.

**Help & FAQ refreshed.** The help panel now covers co-op dispatch (shared mission board, clearance badges, level gating), city traits (how each city plays differently), city-flavored radio, daily login bonus, and the shop/membership system. Loading screen dispatch tips updated — 12 new tips covering city traits, daily bonus, alliance co-op, weather, patrol, hospital/helipad, and shift reports.

**Bundle optimization continues.** Patrol engine lazy-loaded (saves 3KB from main bundle). The main bundle is now 783KB — still over target, but the heavy lifting (radio dialogue, patrol engine) is out of the critical path.

As always: desktop builds on this page load the live game, so they pull today's content.
