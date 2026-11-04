// ============================================
// Dispatch HQ — Expanded-mode hook (STAGED batch)
// ============================================
// Main edition: there is no compact/inline view (full browser game), so
// expanded is always true. The Reddit edition implements the same hook with
// getWebViewMode() === 'expanded' — the game tree only ships in expanded.html,
// so it is true by construction there too, with the runtime check as
// belt-and-braces. Profile (and future) expanded-only layouts gate on this.
export function useExpandedMode(): boolean {
  return true;
}
