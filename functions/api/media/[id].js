import { getSession } from '../../_lib/auth.js';
import { json, error } from '../../_lib/http.js';

// R2 keys derive from rel_path with an extension swap (schema.md → R2 Key Conventions).
function swapExt(relPath, ext) {
  return relPath.replace(/\.[^./]+$/, '') + ext;
}

const SIZES = {
  photo: { thumb: '.jpg', web: '.jpg', orig: '.jpg' },
  video: { poster: '.jpg', thumb: '.jpg', video: '.mp4' }, // thumb aliases poster
};

export async function onRequestGet({ request, env, params }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error(400, 'bad id');
  const url = new URL(request.url);
  const size = url.searchParams.get('size') || 'thumb';
  const download = url.searchParams.get('download') === '1';

  // ?meta=1 returns the item's metadata as JSON — used by #m={id} deep links,
  // which arrive with nothing but an id.
  if (url.searchParams.get('meta') === '1') {
    const row = await env.DB.prepare(
      `SELECT m.id, m.rel_path, m.kind, m.rating, m.votes, m.wins, m.duration_s, m.taken_at, f.name AS folder
       FROM media m JOIN folders f ON f.id = m.folder_id WHERE m.id = ?`
    )
      .bind(id)
      .first();
    if (!row) return error(404, 'not found');
    return json(row);
  }

  const media = await env.DB.prepare('SELECT rel_path, kind FROM media WHERE id = ?').bind(id).first();
  if (!media) return error(404, 'not found');

  const sizes = SIZES[media.kind];
  if (!sizes || !(size in sizes)) return error(400, `size must be one of: ${Object.keys(sizes || {}).join(', ')}`);

  const prefix = media.kind === 'video' && size === 'thumb' ? 'poster' : size;
  const key = `${prefix}/${swapExt(media.rel_path, sizes[size])}`;

  const rangeRequested = request.headers.has('Range');
  const object = await env.FAMILY_BUCKET.get(key, rangeRequested ? { range: request.headers } : undefined);
  if (!object) return error(404, 'object missing');

  const headers = new Headers();
  headers.set('Content-Type', sizes[size] === '.mp4' ? 'video/mp4' : 'image/jpeg');
  // Bytes for a given id+size never change. `private` keeps shared caches out
  // of authed media; the browser caches per-device so repeat views are free.
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', object.httpEtag);

  if (download) {
    const filename = swapExt(media.rel_path.split('/').pop(), sizes[size]);
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    headers.set(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
  }

  let status = 200;
  if (rangeRequested && object.range) {
    status = 206;
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
  } else {
    headers.set('Content-Length', String(object.size));
  }

  return new Response(object.body, { status, headers });
}
