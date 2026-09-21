import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  const url = new URL(request.url);
  const folder = url.searchParams.get('folder');
  if (!folder) return error(400, 'folder required');
  const kind = url.searchParams.get('kind');
  if (kind && !['photo', 'video'].includes(kind)) return error(400, 'kind must be photo or video');
  const cursor = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

  let sql = `SELECT m.id, m.rel_path, m.kind, m.rating, m.votes, m.wins, m.duration_s, m.taken_at
             FROM media m JOIN folders f ON f.id = m.folder_id
             WHERE f.name = ? AND m.id > ?`;
  const binds = [folder, cursor];
  if (kind) {
    sql += ' AND m.kind = ?';
    binds.push(kind);
  }
  sql += ' ORDER BY m.id LIMIT ?';
  binds.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const nextCursor = results.length === limit ? results[results.length - 1].id : null;
  return json({ items: results, nextCursor });
}
