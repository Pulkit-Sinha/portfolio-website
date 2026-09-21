import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

const VALID_KINDS = ['photo', 'video'];

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  const url = new URL(request.url);
  const requested = (url.searchParams.get('kinds') || 'photo,video')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => VALID_KINDS.includes(k));
  if (requested.length === 0) return error(400, 'kinds must include photo and/or video');

  // Weight the kind choice by corpus size so videos (~2.5k) don't appear
  // as often as photos (~44k) when both are enabled.
  const placeholders = requested.map(() => '?').join(',');
  const { results: counts } = await env.DB.prepare(
    `SELECT kind, COUNT(*) AS c FROM media WHERE kind IN (${placeholders}) AND marked_at IS NULL GROUP BY kind`
  )
    .bind(...requested)
    .all();

  // A matchup needs two items of one kind.
  const eligible = counts.filter((r) => r.c >= 2);
  if (eligible.length === 0) return error(409, 'not enough media for a matchup');

  const total = eligible.reduce((s, r) => s + r.c, 0);
  let pick = Math.random() * total;
  let kind = eligible[eligible.length - 1].kind;
  for (const row of eligible) {
    pick -= row.c;
    if (pick <= 0) {
      kind = row.kind;
      break;
    }
  }

  const { results: pair } = await env.DB.prepare(
    `SELECT m.id, m.rel_path, m.kind, m.duration_s, m.taken_at, m.rating, m.votes, m.wins, f.name AS folder
     FROM media m JOIN folders f ON f.id = m.folder_id
     WHERE m.kind = ? AND m.marked_at IS NULL ORDER BY RANDOM() LIMIT 2`
  )
    .bind(kind)
    .all();

  return json({ a: pair[0], b: pair[1] });
}
