# v0.40.0–v0.43.0 — Co-op dispatch goes live, every city gets its own radio voice

**Post this on the itch.io dashboard:** agreatgame.itch.io → **Edit game** → **Devlogs** → **Create new post** (paste the markdown below; the dashboard editor renders itch markdown).

---

The big one: co-op dispatch is fully operational, and every city now speaks its own language.

**Co-op dispatch — you're not alone anymore.** Alliance members share a mission board. When someone clears a shared mission, you see "Alliance Clear — cleared by Player A" with a green badge. Auto-Respond Alliance Calls lets your units jump on incoming alliance calls automatically. Shared mission markers pulse purple on the map so you can spot them at a glance. Level gating keeps things fair — you need alliance level 2+ to view the shared board, 3+ to dispatch, 4+ for cross-service access.

**City-flavored radio — London sounds like London, Paris sounds like Paris.** Every international city now has a unique dispatch voice:

- **London** — "Acknowledged" instead of "10-4", "Make Pumps 4" fire codes, "Category 1" EMS, "Control" as dispatcher
- **Paris** — "Reçu"/"Affirmatif", "FEU" fire codes, "P1 URGENT" EMS, "Central" dispatcher
- **Tokyo** — "Shōchi" acknowledgments, "Kaji" fire codes, "Kyūkyū" EMS, "Hōsō" dispatcher
- **Berlin** — "Verstanden"/"Okay", "BRAND" fire codes, "NOTFALL" EMS, "Leitstelle" dispatcher

The accent system is extensible — adding a new city is a single entry in the config.

**Economy rebalance.** Coin packs got better value (Vault Pack now 3,500 coins, Bank Pack 10,000). The coin→credits rate tightened from 5,000 to 3,500 per 100 coins so credits feel more earned. New promo code WELCOME-50 gives 50 free coins on first redemption. Commander members now get auto-respond to alliance calls by default.

**Bundle optimization.** The radio dialogue engine (50KB) and patrol engine (10KB) are now lazy-loaded — they only fetch when you actually use them, not at page load. The main bundle shrank from 786KB to 761KB.

As always: desktop builds on this page load the live game, so they pull today's content.
