import { getSession, getTrash } from '../../_lib/auth.js';
import { json, error } from '../../_lib/http.js';

// R2 keys derive from rel_path with an extension swap (schema.md → R2 Key Conventions).
function swapExt(relPath, ext) {
  return relPath.replace(/\.[^./]+$/, '') + ext;
}

function r2Keys(relPath, kind) {
  if (kind === 'video') {
    return [`video/${swapExt(relPath, '.mp4')}`, `poster/${swapExt(relPath, '.jpg')}`];
  }
  const jpg = swapExt(relPath, '.jpg');
  return [`thumb/${jpg}`, `web/${jpg}`, `orig/${jpg}`];
}

// Rulings on trash-review items:
//   delete → permanent: R2 derivatives, vote history, the media row
//   keep   → exempt from the 3-loss auto-flag (and clear any manual mark)
//   unmark → clear a manual mark only (stays eligible for auto-flag)
export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');
  if (!(await getTrash(request, env))) return error(403, 'trash auth required');

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'expected JSON body');
  }
  const id = Number(body?.mediaId);
  const action = body?.action;
  if (!Number.isInteger(id)) return error(400, 'mediaId must be a media id');
  if (!['delete', 'keep', 'unmark'].includes(action)) return error(400, 'action must be delete, keep or unmark');

  const media = await env.DB.prepare('SELECT rel_path, kind, folder_id FROM media WHERE id = ?').bind(id).first();
  if (!media) return error(404, 'unknown media id');

  if (action === 'keep') {
    await env.DB.prepare('UPDATE media SET kept_at = unixepoch(), marked_at = NULL WHERE id = ?').bind(id).run();
    return json({ ok: true, id, action });
  }
  if (action === 'unmark') {
    await env.DB.prepare('UPDATE media SET marked_at = NULL WHERE id = ?').bind(id).run();
    return json({ ok: true, id, action });
  }

  // delete — R2 first (idempotent, safe to retry if the D1 batch fails),
  // then the rows, then self-healing folder counts.
  await env.FAMILY_BUCKET.delete(r2Keys(media.rel_path, media.kind));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM votes WHERE winner_id = ? OR loser_id = ?').bind(id, id),
    env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id),
    env.DB.prepare(
      `UPDATE folders SET
         photo_count = (SELECT COUNT(*) FROM media WHERE folder_id = ? AND kind = 'photo'),
         video_count = (SELECT COUNT(*) FROM media WHERE folder_id = ? AND kind = 'video')
       WHERE id = ?`
    ).bind(media.folder_id, media.folder_id, media.folder_id),
  ]);

  return json({ ok: true, id, action });
}
