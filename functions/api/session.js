import { getSession } from '../_lib/auth.js';
import { json } from '../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return json({ authenticated: false });
  return json({ authenticated: true, voterId: session.voterId, name: session.name });
}
