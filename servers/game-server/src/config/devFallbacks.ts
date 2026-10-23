// ============================================
// Dispatch HQ — Dev-only fallback credentials
// ============================================
// THE single source of truth for the dev fallback literals — the publicly-
// known dev credentials that must never be used in production. Everything
// that needs to recognize or reject them reads from here:
//   • config.ts re-exports them for the boot guards (JWT hard stop,
//     DATABASE_URL hard stop, REDIS_URL loud warning);
//   • drizzle.config.ts uses DEV_DATABASE_FALLBACK as the local-dev default;
//   • deploy.sh extracts them (line-anchored sed) to embed in the generated
//     instance pre-flight, which refuses a service env still holding them;
//   • scripts/db-hygiene.sh deliberately carries NO fallback — the pinned
//     DATABASE_URL is the only source of truth for ops tooling.
//
// Never put a copy of these literals anywhere else. The runtime source of
// truth is the PINNED service env (JWT_SECRET / DATABASE_URL / REDIS_URL);
// these strings exist solely so misconfiguration can be detected and refused
// loudly instead of silently booting against a dev store.
//
// Single-line declarations ONLY: deploy.sh extracts them with a line-anchored
// sed (`^export const NAME = '…';$`), so keeping each constant on exactly one
// line is part of the contract.

export const DEV_JWT_FALLBACK = 'dev-secret-change-in-production';
export const DEV_DATABASE_FALLBACK = 'postgresql://dispatch:dispatch_dev_2026@localhost:5432/dispatch_hq';
export const DEV_REDIS_FALLBACK = 'redis://localhost:6379';
