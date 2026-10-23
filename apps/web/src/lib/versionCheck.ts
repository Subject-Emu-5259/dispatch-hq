// ============================================
// Dispatch HQ — Version comparison helpers
// ============================================
// Pure numeric version comparison for the update nudge: "0.22.0" > "0.21.9".
// Release versions are clean x.y.z strings; tolerate a leading "v" and any
// segment count so a malformed server reply can never crash the check.

export function parseVersion(v: string): number[] {
  const cleaned = String(v).trim().replace(/^v/i, '');
  if (!cleaned) return [];
  return cleaned.split('.').map((s) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** True when `a` is strictly newer than `b` (numeric, segment-by-segment). */
export function isNewerVersion(a: string, b: string): boolean {
  const A = parseVersion(a);
  const B = parseVersion(b);
  // An empty version is not comparable — never treat it as newer (or older).
  if (A.length === 0 || B.length === 0) return false;
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
