import { getSession, secretsMatch, signTrash, trashSetCookie } from '../../_lib/auth.js';
import { json, error } from '../../_lib/http.js';

// Second gate for the trash-review view: requires a normal family session
// PLUS the separate TRASH_PASSWORD. Grants the short-lived famtrash cookie.
export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'expected JSON body');
  }
  if (!(await secretsMatch(env, body?.password ?? '', env.TRASH_PASSWORD))) {
    return error(403, 'wrong password');
  }

  const token = await signTrash(env);
  return json({ ok: true }, { headers: { 'Set-Cookie': trashSetCookie(token) } });
}
