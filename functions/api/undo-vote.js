import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

const K = 24;

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');
  if (!Number.isInteger(session.voterId)) return error(403, 'pick a name first');

  const vote = await env.DB.prepare('SELECT * FROM votes WHERE voter_id = ? ORDER BY id DESC LIMIT 1')
    .bind(session.voterId)
    .first();
  if (!vote) return error(404, 'no vote to undo');

  // Inverse delta, recomputed from the stored before-ratings: cancels exactly
  // this vote's contribution without clobbering votes cast since (see schema.md §2).
  const expectedWin =
    1 / (1 + Math.pow(10, (vote.loser_rating_before - vote.winner_rating_before) / 400));
  const delta = K * (1 - expectedWin);

  await env.DB.batch([
    env.DB.prepare('UPDATE media SET rating = rating - ?, votes = votes - 1, wins = wins - 1 WHERE id = ?').bind(
      delta,
      vote.winner_id
    ),
    env.DB.prepare('UPDATE media SET rating = rating + ?, votes = votes - 1 WHERE id = ?').bind(
      delta,
      vote.loser_id
    ),
    env.DB.prepare('DELETE FROM votes WHERE id = ?').bind(vote.id),
  ]);

  return json({ ok: true, restored: { winnerId: vote.winner_id, loserId: vote.loser_id } });
}
