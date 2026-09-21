import { getSession, getTrash } from '../../_lib/auth.js';
import { json, error } from '../../_lib/http.js';

// Deletion-review queue: manually marked items plus everything with 3+ losses
// (unless a previous review said "keep"). 403 (not 401) when only the trash
// cookie is missing, so the frontend shows the trash gate instead of logout.
export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');
  if (!(await getTrash(request, env))) return error(403, 'trash auth required');

  const { results } = await env.DB.prepare(
    `SELECT m.id, m.rel_path, m.kind, m.rating, m.votes, m.wins, m.duration_s, m.taken_at,
            m.marked_at, f.name AS folder,
            CASE WHEN m.marked_at IS NOT NULL THEN 'marked' ELSE 'losses' END AS reason
     FROM media m JOIN folders f ON f.id = m.folder_id
     WHERE m.marked_at IS NOT NULL
        OR (m.kept_at IS NULL AND m.votes - m.wins >= 3)
     ORDER BY (m.marked_at IS NOT NULL) DESC, m.votes - m.wins DESC, m.id DESC
     LIMIT 500`
  ).all();

  return json({ items: results, count: results.length });
}
