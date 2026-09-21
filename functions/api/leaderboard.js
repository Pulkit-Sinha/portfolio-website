import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') || 'photo';
  if (!['photo', 'video'].includes(kind)) return error(400, 'kind must be photo or video');
  const folder = url.searchParams.get('folder');
  const minVotes = Math.max(1, Number(url.searchParams.get('min_votes')) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 60));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  // Raw Elo order — no shrinkage, no confidence weighting (schema.md §6).
  let sql = `SELECT m.id, m.rel_path, m.kind, m.rating, m.votes, m.wins, m.duration_s, m.taken_at, f.name AS folder
             FROM media m JOIN folders f ON f.id = m.folder_id
             WHERE m.kind = ? AND m.votes >= ?`;
  const binds = [kind, minVotes];
  if (folder) {
    sql += ' AND f.name = ?';
    binds.push(folder);
  }
  sql += ' ORDER BY m.rating DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ items: results, limit, offset });
}
