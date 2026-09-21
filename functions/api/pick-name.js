import { getSession, signSession, sessionSetCookie } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'expected JSON body');
  }
  const voterId = Number(body?.voterId);
  if (!Number.isInteger(voterId)) return error(400, 'voterId required');

  const voter = await env.DB.prepare('SELECT id, name FROM voters WHERE id = ?').bind(voterId).first();
  if (!voter) return error(404, 'unknown voter');

  const token = await signSession(env, { voterId: voter.id, name: voter.name });
  return json(
    { ok: true, voterId: voter.id, name: voter.name },
    { headers: { 'Set-Cookie': sessionSetCookie(token) } }
  );
}
