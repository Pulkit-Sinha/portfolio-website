// /family — SPA-lite. Views: login → name picker → tabs (versus/ranks/archive/stats) + lightbox.
// All data comes from the cookie-gated /api/* Functions; any 401 drops back to the login view.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  session: null,
  pair: null,
  prevPair: null,
  voteCount: 0,
  busy: false,
  ranks: { kind: 'photo', folder: '', offset: 0, limit: 60 },
  archive: { folder: null, cursor: 0 },
  foldersLoaded: false,
  lightbox: null,
};

/* ── API ─────────────────────────────────────────────────────────────── */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    showGate('login');
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

const mediaUrl = (id, size) => `/api/media/${id}?size=${size}`;

/* ── View switching ──────────────────────────────────────────────────── */

function showGate(which) {
  $('#app').hidden = true;
  $('#view-login').hidden = which !== 'login';
  $('#view-name').hidden = which !== 'name';
  $('#hud-user').hidden = true;
  $('#hud-switch').hidden = true;
  if (which === 'login') $('#login-password').focus();
}

function showApp() {
  $('#view-login').hidden = true;
  $('#view-name').hidden = true;
  $('#app').hidden = false;
  const user = $('#hud-user');
  user.textContent = state.session.name || '';
  user.hidden = !state.session.name;
  $('#hud-switch').hidden = false;
  loadPair();
  syncVoteCount();
  openDeepLink();
}

function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  $$('.tab-view').forEach((v) => (v.hidden = v.id !== `view-${name}`));
  if (name === 'ranks') loadRanks(true);
  if (name === 'archive') loadFolders();
  if (name === 'stats') loadStats();
  if (name === 'trash') loadTrash();
}

/* ── Boot / auth flow ────────────────────────────────────────────────── */

async function boot() {
  const session = await api('/api/session');
  if (!session.authenticated) return showGate('login');
  state.session = session;
  if (!Number.isInteger(session.voterId)) return showNamePicker();
  showApp();
}

async function showNamePicker() {
  showGate('name');
  const { voters } = await api('/api/voters');
  const list = $('#name-list');
  list.innerHTML = '';
  for (const v of voters) {
    const btn = document.createElement('button');
    btn.textContent = v.name;
    btn.addEventListener('click', async () => {
      const res = await api('/api/pick-name', { method: 'POST', body: { voterId: v.id } });
      state.session = { authenticated: true, voterId: res.voterId, name: res.name };
      showApp();
    });
    list.appendChild(btn);
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  try {
    await api('/api/login', { method: 'POST', body: { password: $('#login-password').value } });
    state.session = { authenticated: true, voterId: null, name: null };
    $('#login-password').value = '';
    showNamePicker();
  } catch {
    $('#login-error').hidden = false;
  }
});

$('#hud-switch').addEventListener('click', showNamePicker);

/* ── Versus ──────────────────────────────────────────────────────────── */

const KINDS_KEY = 'fam.kinds';

function selectedKinds() {
  const kinds = [];
  if ($('#kind-photo').checked) kinds.push('photo');
  if ($('#kind-video').checked) kinds.push('video');
  return kinds;
}

function restoreKinds() {
  try {
    const saved = JSON.parse(localStorage.getItem(KINDS_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) {
      $('#kind-photo').checked = saved.includes('photo');
      $('#kind-video').checked = saved.includes('video');
    }
  } catch {}
}

for (const id of ['#kind-photo', '#kind-video']) {
  $(id).addEventListener('change', (e) => {
    if (selectedKinds().length === 0) {
      e.target.checked = true; // at least one format stays in play
      return;
    }
    localStorage.setItem(KINDS_KEY, JSON.stringify(selectedKinds()));
    loadPair();
  });
}

function renderContender(slot, item) {
  const el = $(`.contender[data-slot="${slot}"]`);
  const media = el.querySelector('.media');
  media.innerHTML = '';
  el.dataset.id = item.id;
  if (item.kind === 'video') {
    const video = document.createElement('video');
    video.src = mediaUrl(item.id, 'video');
    video.poster = mediaUrl(item.id, 'poster');
    video.controls = true;
    video.preload = 'none';
    video.playsInline = true;
    media.appendChild(video);
    const pick = document.createElement('button');
    pick.className = 'pill pick';
    pick.textContent = 'Pick this one';
    pick.style.cssText = 'position:absolute;bottom:3.4rem;left:50%;transform:translateX(-50%);z-index:2;background:rgba(5,5,8,.85)'; // clears the native video controls
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      vote(slot);
    });
    el.appendChild(pick);
  } else {
    const img = document.createElement('img');
    img.src = mediaUrl(item.id, 'web');
    img.alt = '';
    img.draggable = false;
    media.appendChild(img);
  }
}

async function loadPair() {
  if (state.busy) return;
  state.busy = true;
  $('#arena-msg').hidden = true;
  $$('.contender .pick').forEach((b) => b.remove());
  $$('.contender .media').forEach((m) => (m.innerHTML = ''));
  $$('.contender').forEach((c) => c.classList.remove('is-winner'));
  try {
    const pair = await api(`/api/matchup?kinds=${selectedKinds().join(',')}`);
    state.pair = pair;
    renderContender('a', pair.a);
    renderContender('b', pair.b);
  } catch (err) {
    if (err.status === 409) {
      const msg = $('#arena-msg');
      msg.textContent = 'Not enough media in the pool yet — the archive is still being uploaded.';
      msg.hidden = false;
    }
  } finally {
    state.busy = false;
  }
}

async function vote(winnerSlot) {
  if (!state.pair || state.busy) return;
  const winner = winnerSlot === 'a' ? state.pair.a : state.pair.b;
  const loser = winnerSlot === 'a' ? state.pair.b : state.pair.a;
  $(`.contender[data-slot="${winnerSlot}"]`).classList.add('is-winner');
  try {
    await api('/api/vote', { method: 'POST', body: { winnerId: winner.id, loserId: loser.id } });
  } catch (err) {
    if (err.status === 403) showNamePicker();
    return;
  }
  state.prevPair = state.pair;
  state.voteCount += 1;
  updateVoteCount();
  $('#btn-undo').hidden = false;
  loadPair();
}

async function undoVote() {
  try {
    await api('/api/undo-vote', { method: 'POST' });
  } catch {
    return;
  }
  state.voteCount = Math.max(0, state.voteCount - 1);
  updateVoteCount();
  $('#btn-undo').hidden = true; // single-step
  if (state.prevPair) {
    state.pair = state.prevPair;
    state.prevPair = null;
    $$('.contender .pick').forEach((b) => b.remove());
    $$('.contender').forEach((c) => c.classList.remove('is-winner'));
    renderContender('a', state.pair.a);
    renderContender('b', state.pair.b);
  } else {
    loadPair();
  }
}

function updateVoteCount() {
  $('#vote-count').textContent = state.voteCount ? `${state.voteCount} VOTES CAST` : '';
}

async function syncVoteCount() {
  try {
    const stats = await api('/api/stats');
    const me = stats.voters.find((v) => v.id === state.session.voterId);
    if (me) {
      state.voteCount = me.votes_cast;
      updateVoteCount();
    }
  } catch {}
}

// Two-tap confirm for destructive buttons: first tap arms it, second executes.
function armedClick(btn, armedText, fn) {
  const restText = btn.textContent;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.dataset.armed) {
      delete btn.dataset.armed;
      btn.classList.remove('is-armed');
      btn.textContent = restText;
      fn();
    } else {
      btn.dataset.armed = '1';
      btn.classList.add('is-armed');
      btn.textContent = armedText;
      setTimeout(() => {
        delete btn.dataset.armed;
        btn.classList.remove('is-armed');
        btn.textContent = restText;
      }, 2500);
    }
  });
}

async function markForDeletion(slot) {
  const item = slot === 'a' ? state.pair?.a : state.pair?.b;
  if (!item || state.busy) return;
  try {
    await api('/api/mark-deletion', { method: 'POST', body: { mediaId: item.id } });
  } catch {
    return;
  }
  state.prevPair = null; // the old pair contains a dead item — no undo target
  $('#btn-undo').hidden = true;
  loadPair();
}

$$('.contender').forEach((el) => {
  el.addEventListener('click', (e) => {
    if (e.target.closest('.expand') || e.target.closest('.bin') || e.target.closest('video') || e.target.closest('.pick'))
      return;
    vote(el.dataset.slot);
  });
  el.querySelector('.expand').addEventListener('click', (e) => {
    e.stopPropagation();
    const item = el.dataset.slot === 'a' ? state.pair?.a : state.pair?.b;
    if (item) openLightbox(item);
  });
  armedClick(el.querySelector('.bin'), 'SURE?', () => markForDeletion(el.dataset.slot));
});

$('#btn-skip').addEventListener('click', loadPair);
$('#btn-undo').addEventListener('click', undoVote);

document.addEventListener('keydown', (e) => {
  if (!$('#lightbox').hidden || $('#app').hidden || $('#view-versus').hidden) return;
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'ArrowLeft') vote('a');
  if (e.key === 'ArrowRight') vote('b');
});

/* ── Ranks ───────────────────────────────────────────────────────────── */

function makeTile(item, { tag, small } = {}) {
  const tile = document.createElement('button');
  tile.className = 'tile';
  const img = document.createElement('img');
  img.src = mediaUrl(item.id, 'thumb');
  img.alt = '';
  img.loading = 'lazy';
  tile.appendChild(img);
  if (item.kind === 'video') {
    const play = document.createElement('span');
    play.className = 'tile-play';
    play.textContent = '▶';
    tile.appendChild(play);
  }
  if (tag) {
    const t = document.createElement('span');
    t.className = 'tile-tag';
    t.textContent = tag;
    tile.appendChild(t);
  }
  return tile;
}

async function loadRanks(reset) {
  if (reset) {
    state.ranks.offset = 0;
    $('#ranks-grid').innerHTML = '';
  }
  const { kind, folder, offset, limit } = state.ranks;
  const params = new URLSearchParams({ kind, limit, offset });
  if (folder) params.set('folder', folder);
  const { items } = await api(`/api/leaderboard?${params}`);
  const grid = $('#ranks-grid');
  items.forEach((item, i) => {
    const rank = offset + i + 1;
    const tile = makeTile(item, { tag: `#${String(rank).padStart(3, '0')} · ${Math.round(item.rating)}` });
    tile.addEventListener('click', () => openLightbox(item, { rank }));
    grid.appendChild(tile);
  });
  state.ranks.offset += items.length;
  $('#ranks-empty').hidden = grid.children.length > 0;
  $('#ranks-more').hidden = items.length < limit;
  populateFolderSelect();
}

$$('.seg-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('.seg-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    state.ranks.kind = btn.dataset.kind;
    loadRanks(true);
  })
);
$('#ranks-folder').addEventListener('change', (e) => {
  state.ranks.folder = e.target.value;
  loadRanks(true);
});
$('#ranks-more').addEventListener('click', () => loadRanks(false));

let folderCache = null;
async function getFolders() {
  if (!folderCache) folderCache = (await api('/api/folders')).folders;
  return folderCache;
}

async function populateFolderSelect() {
  const select = $('#ranks-folder');
  if (select.options.length > 1) return;
  for (const f of await getFolders()) {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name.toUpperCase();
    select.appendChild(opt);
  }
}

/* ── Archive ─────────────────────────────────────────────────────────── */

async function loadFolders() {
  $('#archive-browser').hidden = true;
  const list = $('#folder-list');
  list.hidden = false;
  if (list.children.length) return;
  for (const f of await getFolders()) {
    const row = document.createElement('button');
    row.className = 'folder-row';
    const counts = [
      f.photo_count ? `${f.photo_count} PHOTOS` : null,
      f.video_count ? `${f.video_count} VIDEOS` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    row.innerHTML = `<span class="folder-name"></span><span class="folder-counts">${counts || 'EMPTY'}</span>`;
    row.querySelector('.folder-name').textContent = f.name;
    row.addEventListener('click', () => openBrowser(f.name));
    list.appendChild(row);
  }
}

function openBrowser(folder) {
  state.archive = { folder, cursor: 0 };
  $('#folder-list').hidden = true;
  $('#archive-browser').hidden = false;
  $('#archive-title').textContent = folder;
  $('#archive-grid').innerHTML = '';
  loadBrowse();
}

async function loadBrowse() {
  const { folder, cursor } = state.archive;
  const params = new URLSearchParams({ folder, cursor, limit: 100 });
  const { items, nextCursor } = await api(`/api/browse?${params}`);
  const grid = $('#archive-grid');
  for (const item of items) {
    const tile = makeTile(item);
    tile.addEventListener('click', () => openLightbox(item));
    grid.appendChild(tile);
  }
  state.archive.cursor = nextCursor;
  $('#archive-more').hidden = !nextCursor;
}

$('#archive-back').addEventListener('click', loadFolders);
$('#archive-more').addEventListener('click', loadBrowse);

/* ── Stats ───────────────────────────────────────────────────────────── */

async function loadStats() {
  const stats = await api('/api/stats');

  const votersEl = $('#stats-voters');
  votersEl.innerHTML = '';
  const max = Math.max(1, ...stats.voters.map((v) => v.votes_cast));
  for (const v of stats.voters) {
    const row = document.createElement('div');
    row.className = 'voter-row';
    row.innerHTML = `<span class="voter-name"></span><span class="voter-bar"></span><span class="voter-n"></span>`;
    row.querySelector('.voter-name').textContent = v.name;
    row.querySelector('.voter-bar').style.width = `${(v.votes_cast / max) * 40}%`;
    row.querySelector('.voter-n').textContent = v.votes_cast;
    votersEl.appendChild(row);
  }

  const myTop = $('#stats-mytop');
  myTop.innerHTML = '';
  for (const item of stats.myTop) {
    const tile = makeTile(item, { tag: `${item.picks}×`, small: true });
    tile.addEventListener('click', () => openLightbox(item));
    myTop.appendChild(tile);
  }
  $('#stats-mytop-empty').hidden = stats.myTop.length > 0;

  const photo = stats.totals.find((t) => t.kind === 'photo');
  const video = stats.totals.find((t) => t.kind === 'video');
  $('#stats-totals').innerHTML =
    `<span><strong>${photo?.c ?? 0}</strong> photos</span>` +
    `<span><strong>${video?.c ?? 0}</strong> videos</span>` +
    `<span><strong>${stats.totalVotes}</strong> total votes</span>`;
}

/* ── Trash (deletion review — extra password gate) ───────────────────── */

async function loadTrash() {
  try {
    const { items } = await api('/api/trash/list');
    renderTrash(items);
  } catch (err) {
    if (err.status === 403) {
      $('#trash-panel').hidden = true;
      $('#trash-gate').hidden = false;
      $('#trash-password').focus();
    }
  }
}

$('#trash-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#trash-error').hidden = true;
  try {
    await api('/api/trash/login', { method: 'POST', body: { password: $('#trash-password').value } });
    $('#trash-password').value = '';
    $('#trash-gate').hidden = true;
    loadTrash();
  } catch {
    $('#trash-error').hidden = false;
  }
});

function renderTrash(items) {
  $('#trash-gate').hidden = true;
  $('#trash-panel').hidden = false;
  const grid = $('#trash-grid');
  grid.innerHTML = '';
  const marked = items.filter((i) => i.reason === 'marked').length;
  $('#trash-count').textContent = items.length
    ? `${items.length} awaiting review — ${marked} marked, ${items.length - marked} with 3+ losses`
    : '';
  $('#trash-empty').hidden = items.length > 0;

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'trash-card';
    const losses = item.votes - item.wins;
    card.innerHTML = `
      <button class="trash-thumb"><img loading="lazy" alt="" /></button>
      <div class="trash-meta">
        <span class="trash-reason ${item.reason === 'marked' ? 'is-marked' : ''}"></span>
        <span class="trash-file"></span>
        <span class="trash-record"></span>
      </div>
      <div class="trash-actions">
        <button class="pill t-keep">Keep</button>
        <button class="pill t-del">Delete</button>
      </div>`;
    card.querySelector('img').src = mediaUrl(item.id, 'thumb');
    card.querySelector('.trash-reason').textContent = item.reason === 'marked' ? 'MARKED' : `${losses} LOSSES`;
    card.querySelector('.trash-file').textContent = item.rel_path.split('/').pop();
    card.querySelector('.trash-record').textContent = item.votes ? `${item.wins}W – ${losses}L` : 'never voted';
    card.querySelector('.trash-thumb').addEventListener('click', () => openLightbox(item));
    card.querySelector('.t-keep').addEventListener('click', async () => {
      await trashAction(item.id, item.reason === 'marked' ? 'unmark' : 'keep');
      card.remove();
      refreshTrashCount();
    });
    armedClick(card.querySelector('.t-del'), 'SURE?', async () => {
      await trashAction(item.id, 'delete');
      card.remove();
      refreshTrashCount();
    });
    grid.appendChild(card);
  }
}

async function trashAction(mediaId, action) {
  try {
    await api('/api/trash/action', { method: 'POST', body: { mediaId, action } });
  } catch (err) {
    if (err.status === 403) loadTrash(); // cookie expired mid-session — re-gate
    throw err;
  }
}

function refreshTrashCount() {
  const left = $('#trash-grid').children.length;
  $('#trash-count').textContent = left ? `${left} awaiting review` : '';
  $('#trash-empty').hidden = left > 0;
}

/* ── Lightbox ────────────────────────────────────────────────────────── */

function fmtDate(epoch) {
  if (!epoch) return 'date unknown';
  return new Date(epoch * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(s) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

function openLightbox(item, ctx = {}) {
  state.lightbox = item;
  const lb = $('#lightbox');
  const mediaEl = $('#lightbox-media');
  mediaEl.innerHTML = '';
  if (item.kind === 'video') {
    const video = document.createElement('video');
    video.src = mediaUrl(item.id, 'video');
    video.poster = mediaUrl(item.id, 'poster');
    video.controls = true;
    video.playsInline = true;
    mediaEl.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = mediaUrl(item.id, 'web');
    img.alt = '';
    mediaEl.appendChild(img);
  }

  const rankEl = $('#lightbox-rank');
  rankEl.hidden = !ctx.rank;
  if (ctx.rank) rankEl.innerHTML = `<span class="accent">#${ctx.rank}</span> RATED ${Math.round(item.rating)}`;

  const dl = $('#lb-download');
  dl.href = mediaUrl(item.id, item.kind === 'video' ? 'video' : 'orig') + '&download=1';

  const info = $('#lightbox-info');
  info.hidden = true;
  const relPath = item.rel_path || '';
  const rows = [
    ['File', relPath.split('/').pop() || `#${item.id}`],
    ['Taken', fmtDate(item.taken_at)],
    ['Folder', relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : item.folder || '—'],
  ];
  const dur = fmtDuration(item.duration_s);
  if (dur) rows.push(['Duration', dur]);
  if (typeof item.rating === 'number' && item.votes > 0) {
    rows.push(['Rating', String(Math.round(item.rating))]);
    rows.push(['Record', `${item.wins}W – ${item.votes - item.wins}L (${item.votes} votes)`]);
  }
  info.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd></dd>`).join('');
  [...info.querySelectorAll('dd')].forEach((dd, i) => (dd.textContent = rows[i][1]));

  lb.hidden = false;
  history.replaceState(null, '', `#m=${item.id}`);
}

function closeLightbox() {
  const lb = $('#lightbox');
  lb.querySelector('video')?.pause();
  lb.hidden = true;
  state.lightbox = null;
  history.replaceState(null, '', location.pathname);
}

$('#lb-close').addEventListener('click', closeLightbox);
$('.lightbox-backdrop').addEventListener('click', closeLightbox);
$('#lb-info').addEventListener('click', () => {
  const info = $('#lightbox-info');
  info.hidden = !info.hidden;
});
$('#lb-share').addEventListener('click', async () => {
  if (!state.lightbox) return;
  const url = `${location.origin}/family/#m=${state.lightbox.id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Family gallery', url });
      return;
    } catch {}
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank', 'noopener');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#lightbox').hidden) closeLightbox();
});

async function openDeepLink() {
  const m = location.hash.match(/^#m=(\d+)$/);
  if (!m) return;
  try {
    const item = await api(`/api/media/${m[1]}?meta=1`);
    openLightbox(item);
  } catch {}
}

window.addEventListener('hashchange', () => {
  if ($('#app').hidden) return;
  if (location.hash.startsWith('#m=')) openDeepLink();
});

/* ── Tabs + boot ─────────────────────────────────────────────────────── */

$$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

restoreKinds();
boot();
