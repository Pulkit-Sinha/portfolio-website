// Worker entry — routes /api/* to the /family gallery handlers (unchanged,
// Pages-Functions-style modules in functions/), everything else to static assets.
// Deployed via `npx wrangler deploy`; config in wrangler.toml.

import * as login from './functions/api/login.js';
import * as session from './functions/api/session.js';
import * as voters from './functions/api/voters.js';
import * as pickName from './functions/api/pick-name.js';
import * as matchup from './functions/api/matchup.js';
import * as vote from './functions/api/vote.js';
import * as undoVote from './functions/api/undo-vote.js';
import * as leaderboard from './functions/api/leaderboard.js';
import * as folders from './functions/api/folders.js';
import * as browse from './functions/api/browse.js';
import * as stats from './functions/api/stats.js';
import * as media from './functions/api/media/[id].js';
import * as register from './functions/api/admin/register.js';
import * as markDeletion from './functions/api/mark-deletion.js';
import * as trashLogin from './functions/api/trash/login.js';
import * as trashList from './functions/api/trash/list.js';
import * as trashAction from './functions/api/trash/action.js';

// [method, pattern, handler, capture-group param names]
const ROUTES = [
  ['POST', /^\/api\/login$/, login.onRequestPost],
  ['GET', /^\/api\/session$/, session.onRequestGet],
  ['GET', /^\/api\/voters$/, voters.onRequestGet],
  ['POST', /^\/api\/pick-name$/, pickName.onRequestPost],
  ['GET', /^\/api\/matchup$/, matchup.onRequestGet],
  ['POST', /^\/api\/vote$/, vote.onRequestPost],
  ['POST', /^\/api\/undo-vote$/, undoVote.onRequestPost],
  ['GET', /^\/api\/leaderboard$/, leaderboard.onRequestGet],
  ['GET', /^\/api\/folders$/, folders.onRequestGet],
  ['GET', /^\/api\/browse$/, browse.onRequestGet],
  ['GET', /^\/api\/stats$/, stats.onRequestGet],
  ['GET', /^\/api\/media\/(\d+)$/, media.onRequestGet, ['id']],
  ['POST', /^\/api\/admin\/register$/, register.onRequestPost],
  ['POST', /^\/api\/mark-deletion$/, markDeletion.onRequestPost],
  ['POST', /^\/api\/trash\/login$/, trashLogin.onRequestPost],
  ['GET', /^\/api\/trash\/list$/, trashList.onRequestGet],
  ['POST', /^\/api\/trash\/action$/, trashAction.onRequestPost],
];

// Apple universal links for LockdIn (invite join links). Inlined rather than a static asset so
// the Content-Type is guaranteed application/json with no redirect — extensionless dot-directory
// assets have undefined MIME/upload behavior in Workers assets. Keep byte-identical to
// website/apple-app-site-association.json in the LockdIn repo.
const AASA = JSON.stringify({
  applinks: {
    details: [{
      appIDs: ['92Z7W9B3UG.com.sherkit.LockdIn'],
      components: [{ '/': '/lockdin/join/*', comment: 'Invite links open LockdIn and prefill the invite code' }],
    }],
  },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // AASA: served at the well-known path (Apple's primary) and the legacy root path.
    if (url.pathname === '/.well-known/apple-app-site-association' ||
        url.pathname === '/apple-app-site-association') {
      return new Response(AASA, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // /lockdin/join/<CODE> → the static landing page with the code injected server-side.
    // Only [A-Za-z0-9]{4,16} is ever substituted (no HTML injection via the path); anything
    // else renders the page's no-code state.
    if (url.pathname.startsWith('/lockdin/join')) {
      const m = url.pathname.match(/^\/lockdin\/join\/([A-Za-z0-9]{4,16})\/?$/);
      const code = m ? m[1].toUpperCase() : '';
      const res = await env.ASSETS.fetch(new URL('/lockdin/join/index.html', url));
      const html = (await res.text()).replaceAll('{{CODE}}', code);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    if (url.pathname.startsWith('/api/')) {
      for (const [method, pattern, handler, paramNames = []] of ROUTES) {
        if (request.method !== method) continue;
        const match = url.pathname.match(pattern);
        if (!match) continue;
        const params = {};
        paramNames.forEach((name, i) => (params[name] = match[i + 1]));
        return handler({ request, env, params, ctx });
      }
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
