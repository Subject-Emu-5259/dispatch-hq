// ============================================
// Dispatch HQ — Auth Middleware (Hono)
// ============================================

import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyToken } from './jwt';

export interface AuthVars {
  playerId: string;
}

export async function resolveBearerOrCookie(c: any): Promise<string | null> {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return getCookie(c, 'token') ?? null;
}

export const authMiddleware: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const token = await resolveBearerOrCookie(c);
  if (!token) {
    return c.json({ error: 'Missing or malformed authentication' }, 401);
  }
  const verified = await verifyToken(token);
  if (!verified) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  c.set('playerId', verified.playerId);
  await next();
};
