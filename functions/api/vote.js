import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

const K = 24;

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');
  // voterId comes from the signed cookie ONLY — never from the request body.
  if (!Number.isInteger(session.voterId)) return error(403, 'pick a name before voting');

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'expected JSON body');
  }
  const winnerId = Number(body?.winnerId);
  const loserId = Number(body?.loserId);
  if (!Number.isInteger(winnerId) || !Number.isInteger(loserId) || winnerId === loserId) {
    return error(400, 'winnerId and loserId must be distinct media ids');
  }

  const { results } = await env.DB.prepare('SELECT id, kind, rating FROM media WHERE id IN (?, ?)')
    .bind(winnerId, loserId)
    .all();
  if (results.length !== 2) return error(404, 'unknown media id');
  const winner = results.find((r) => r.id === winnerId);
  const loser = results.find((r) => r.id === loserId);
  if (winner.kind !== loser.kind) return error(400, 'matchups never mix kinds');

  const expectedWin = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
  const delta = K * (1 - expectedWin);

  await env.DB.batch([
    env.DB.prepare('UPDATE media SET rating = rating + ?, votes = votes + 1, wins = wins + 1 WHERE id = ?').bind(
      delta,
      winnerId
    ),
    env.DB.prepare('UPDATE media SET rating = rating - ?, votes = votes + 1 WHERE id = ?').bind(delta, loserId),
    env.DB.prepare(
      `INSERT INTO votes (voter_id, winner_id, loser_id, winner_rating_before, loser_rating_before)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(session.voterId, winnerId, loserId, winner.rating, loser.rating),
  ]);

  return json({
    ok: true,
    delta,
    winner: { id: winnerId, rating: winner.rating + delta },
    loser: { id: loserId, rating: loser.rating - delta },
  });
}
