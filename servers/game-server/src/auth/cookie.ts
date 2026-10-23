// ============================================
// Dispatch HQ — Cookie Auth Helpers
// ============================================
// Auth tokens live in HttpOnly cookies so the client never has to
// store a JWT in localStorage. These helpers centralise cookie options.

import type { Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

const COOKIE_NAME = 'token';

function isSecureRequest(c: Context): boolean {
  // Trust the upstream proxy's X-Forwarded-Proto header on the Zo Computer
  // public edge; fall back to true so production cookies are secure.
  const forwarded = c.req.header('x-forwarded-proto');
  if (forwarded) return forwarded === 'https';
  return c.req.url.startsWith('https://');
}

export function setAuthCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Strict',
    path: '/',
    // 30 days: guests' saves/settings are keyed to this identity, so a short
    // cookie was silently "losing" progress between visits.
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearAuthCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export function getAuthCookie(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME);
}
