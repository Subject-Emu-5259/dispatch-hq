// ============================================
// Dispatch HQ — JWT Auth (jose)
// ============================================

import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config';

const secret = new TextEncoder().encode(config.jwt.secret);
const ISSUER = 'dispatch-hq';
const AUDIENCE = 'dispatch-hq-client';

export async function signToken(playerId: string): Promise<string> {
  return new SignJWT({ playerId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(playerId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(config.jwt.expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<{ playerId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string') {
      return null;
    }
    return { playerId: payload.sub };
  } catch {
    return null;
  }
}

// 30 days — must stay >= the cookie lifetime so an auth cookie is never
// presented with an already-expired token (which 401'd every save/settings
// call and made progress appear to "vanish" between visits).
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function cookieOptions(c: { req: { header: (name: string) => string | undefined; url: string } }) {
  const proto = c.req.header('x-forwarded-proto');
  const isSecure = proto === 'https' || c.req.url.startsWith('https:');
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Strict' as const,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
  };
}
