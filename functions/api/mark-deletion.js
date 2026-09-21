import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

// Any family member can flag junk (misclicks, blurry shots, screenshots)
// via the dustbin. Marked items leave the matchup pool immediately; actual
// deletion needs the trash-review approval (functions/api/trash/action.js).
export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'expected JSON body');
  }
  const id = Number(body?.mediaId);
  if (!Number.isInteger(id)) return error(400, 'mediaId must be a media id');

  const res = await env.DB.prepare('UPDATE media SET marked_at = unixepoch() WHERE id = ? AND marked_at IS NULL')
    .bind(id)
    .run();
  if (res.meta.changes === 0) {
    const exists = await env.DB.prepare('SELECT 1 FROM media WHERE id = ?').bind(id).first();
    if (!exists) return error(404, 'unknown media id');
  }
  return json({ ok: true, id });
}
