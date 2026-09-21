import { secretsMatch } from '../../_lib/auth.js';
import { json, error } from '../../_lib/http.js';

const MAX_ITEMS = 500;

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_TOKEN || !env.SESSION_SECRET) return error(500, 'server not configured');
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await secretsMatch(env, token, env.ADMIN_TOKEN))) return error(401, 'unauthorized');

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'expected JSON body');
  }
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) return error(400, 'items[] required');
  if (items.length > MAX_ITEMS) return error(400, `max ${MAX_ITEMS} items per batch`);

  const folders = new Set();
  for (const it of items) {
    if (typeof it?.rel_path !== 'string' || !it.rel_path || it.rel_path.includes('..')) {
      return error(400, 'each item needs a safe rel_path');
    }
    if (!['photo', 'video'].includes(it?.kind)) return error(400, 'each item needs kind photo|video');
    if (typeof it?.content_hash !== 'string' || it.content_hash.length < 32) {
      return error(400, 'each item needs a content_hash');
    }
    folders.add(it.rel_path.includes('/') ? it.rel_path.split('/')[0] : '(root)');
  }

  const statements = [];
  for (const name of folders) {
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO folders (name) VALUES (?)').bind(name));
  }
  for (const it of items) {
    const folder = it.rel_path.includes('/') ? it.rel_path.split('/')[0] : '(root)';
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO media (folder_id, rel_path, kind, content_hash, duration_s, taken_at)
         VALUES ((SELECT id FROM folders WHERE name = ?), ?, ?, ?, ?, ?)`
      ).bind(folder, it.rel_path, it.kind, it.content_hash, it.duration_s ?? null, it.taken_at ?? null)
    );
  }
  // Recompute counts rather than increment, so they self-heal (schema.md §5).
  const folderList = [...folders];
  const placeholders = folderList.map(() => '?').join(',');
  statements.push(
    env.DB.prepare(
      `UPDATE folders SET
         photo_count = (SELECT COUNT(*) FROM media WHERE folder_id = folders.id AND kind = 'photo'),
         video_count = (SELECT COUNT(*) FROM media WHERE folder_id = folders.id AND kind = 'video')
       WHERE name IN (${placeholders})`
    ).bind(...folderList)
  );

  const results = await env.DB.batch(statements);
  const inserted = results
    .slice(folders.size, folders.size + items.length)
    .reduce((s, r) => s + (r.meta?.changes || 0), 0);

  return json({ ok: true, received: items.length, inserted, skipped: items.length - inserted });
}
