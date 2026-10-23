// ============================================
// Dispatch HQ — Input Validation
// ============================================
// Lightweight, pure validators for public-facing auth input. These mirror the
// DB column caps (varchar(30) username, varchar(255) email) so an oversized
// value fails with a clean 400 instead of a Postgres "value too long" 500, and
// reject junk shapes early (spam registrations, accidental paste-bombs).

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const EMAIL_MAX = 255;
export const PASSWORD_MAX = 128;

// Roughly RFC-5322-lite: local@domain.tld with a sane character set. The goal
// is to reject obvious junk ("", "a", "not-an-email", "x@y", single-char TLDs)
// without being so strict it refuses valid modern addresses (+tags,
// subdomains, 2+ letter TLDs).
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/;

export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length === 0 || e.length > EMAIL_MAX) return false;
  return EMAIL_RE.test(e);
}

// Usernames: 3-30 chars, letters/digits/underscore/hyphen/space, must start
// with a letter or digit. Guests use "Guest_<hex>" which satisfies this too.
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,29}$/;

export function isValidUsername(username: unknown): username is string {
  if (typeof username !== 'string') return false;
  const u = username.trim();
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) return false;
  return USERNAME_RE.test(u);
}

export function isValidPassword(password: unknown): password is string {
  if (typeof password !== 'string') return false;
  // The auth route already requires >= 6 chars; here we also cap the length so
  // a multi-megabyte paste can't be scrypt-hashed (CPU blow-up) or rejected by
  // Postgres later.
  return password.length >= 6 && password.length <= PASSWORD_MAX;
}

/** Field-length guard for free-text fields that are stored in varchar columns. */
export function fieldTooLong(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max;
}
