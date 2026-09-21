// Session auth for /family — HMAC-signed cookie, Web Crypto only (no libraries).
// Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, SESSION_SECRET))
// Payload: { v: 1, voterId: int|null, name: string|null, iat, exp }

const COOKIE_NAME = 'fam';
const SESSION_TTL = 180 * 24 * 60 * 60; // ~180 days, in seconds

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

export async function signSession(env, { voterId = null, name = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, voterId, name, iat: now, exp: now + SESSION_TTL };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(env.SESSION_SECRET, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

// Returns the payload for a valid, unexpired session cookie; null otherwise.
export async function getSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const token = m[1];
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  let ok = false;
  try {
    const key = await hmacKey(env.SESSION_SECRET, ['verify']);
    ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(token.slice(dot + 1)), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function sessionSetCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;
}

// ── Trash-review admin cookie ────────────────────────────────────────────
// Separate, shorter-lived cookie granted by the TRASH_PASSWORD gate. Signed
// with the same SESSION_SECRET but a distinct name+shape, so a family session
// can never pass for trash-admin and vice versa.

const TRASH_COOKIE = 'famtrash';
const TRASH_TTL = 7 * 24 * 60 * 60; // 7 days

export async function signTrash(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, trash: true, iat: now, exp: now + TRASH_TTL };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(env.SESSION_SECRET, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

// True iff the request carries a valid, unexpired trash-admin cookie.
export async function getTrash(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${TRASH_COOKIE}=([^;]+)`));
  if (!m) return false;
  const token = m[1];
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const body = token.slice(0, dot);
  let ok = false;
  try {
    const key = await hmacKey(env.SESSION_SECRET, ['verify']);
    ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(token.slice(dot + 1)), enc.encode(body));
  } catch {
    return false;
  }
  if (!ok) return false;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
  } catch {
    return false;
  }
  return payload.trash === true && payload.exp > Math.floor(Date.now() / 1000);
}

export function trashSetCookie(token) {
  return `${TRASH_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TRASH_TTL}`;
}

// Constant-time string comparison: HMAC both sides with the session secret so
// lengths and content never influence timing observably.
export async function secretsMatch(env, submitted, expected) {
  if (typeof submitted !== 'string' || typeof expected !== 'string') return false;
  const key = await hmacKey(env.SESSION_SECRET, ['sign']);
  const a = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(submitted)));
  const b = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(expected)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
