import { signSession, sessionSetCookie, secretsMatch } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.FAMILY_PASSWORD || !env.SESSION_SECRET) return error(500, 'server not configured');

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'expected JSON body');
  }

  if (!(await secretsMatch(env, body?.password ?? '', env.FAMILY_PASSWORD))) {
    return error(401, 'wrong password');
  }

  const token = await signSession(env, { voterId: null, name: null });
  return json({ ok: true, voterId: null }, { headers: { 'Set-Cookie': sessionSetCookie(token) } });
}
