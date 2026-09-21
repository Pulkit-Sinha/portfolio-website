import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  const { results } = await env.DB.prepare('SELECT id, name FROM voters ORDER BY id').all();
  return json({ voters: results });
}
