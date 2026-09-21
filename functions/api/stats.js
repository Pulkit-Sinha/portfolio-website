import { getSession } from '../_lib/auth.js';
import { json, error } from '../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return error(401, 'unauthorized');

  const [voters, totals, votesTotal] = await Promise.all([
    env.DB.prepare(
      `SELECT v.id, v.name, COUNT(vo.id) AS votes_cast
       FROM voters v LEFT JOIN votes vo ON vo.voter_id = v.id
       GROUP BY v.id ORDER BY votes_cast DESC, v.id`
    ).all(),
    env.DB.prepare(`SELECT kind, COUNT(*) AS c, SUM(votes) AS votes FROM media GROUP BY kind`).all(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM votes').first(),
  ]);

  let myTop = [];
  if (Number.isInteger(session.voterId)) {
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.rel_path, m.kind, m.rating, m.votes, m.wins, m.duration_s, f.name AS folder,
              COUNT(*) AS picks
       FROM votes vo
       JOIN media m ON m.id = vo.winner_id
       JOIN folders f ON f.id = m.folder_id
       WHERE vo.voter_id = ?
       GROUP BY m.id ORDER BY picks DESC, MAX(vo.id) DESC LIMIT 12`
    )
      .bind(session.voterId)
      .all();
    myTop = results;
  }

  return json({
    voters: voters.results,
    totals: totals.results,
    totalVotes: votesTotal.c,
    myTop,
  });
}
