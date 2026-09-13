const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  movies: [],
  folders: [],
  store: { folders: [], favorites: [], collections: {}, progress: {}, watched: {} },
  view: 'home',
  current: null,
  detailMovie: null,
  player: {
    open: false,
    speed: 1,
    hideTimer: null,
    saveTimer: null,
    lastSave: 0,
    resumePending: null
  }
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtSize(mb) {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
  return mb + ' MB';
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
}

function hueOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function posterStyle(title, id) {
  const hue = hueOf(id || title);
  const sec = (hue + 45) % 360;
  return {
    hue,
    background: `radial-gradient(130% 95% at 28% 12%, hsla(${hue}, 70%, 55%, 0.95), hsla(${hue}, 68%, 34%, 0.92) 34%, hsla(${sec}, 52%, 12%, 1) 74%, #0a0a10 100%)`
  };
}

function glyphOf(title) {
  return (title.trim().charAt(0) || '?').toUpperCase();
}

function isFav(id) { return state.store.favorites.includes(id); }
function inColl(collId, id) {
  const c = state.store.collections[collId];
  return !!(c && c.movies && c.movies.includes(id));
}

function collList() {
  return Object.entries(state.store.collections).map(([id, c]) => ({
    id,
    name: (c && c.name) || id,
    movies: (c && c.movies) || []
  }));
}

function normalizeCollections(collections) {
  const out = {};
  for (const [key, val] of Object.entries(collections || {})) {
    if (val && Array.isArray(val.movies)) {
      out[key] = { id: key, name: val.name || key, movies: val.movies };
    } else if (val && Array.isArray(val)) {
      out[key] = { id: key, name: key, movies: val };
    }
  }
  return out;
}

function saveStore() {
  window.mp.storeSet(state.store);
}

function saveStoreSoon(ms) {
  clearTimeout(state.player.saveTimer);
  state.player.saveTimer = setTimeout(saveStore, ms || 700);
}

function toast(msg, icon) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${icon || ''}${esc(msg)}`;
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, 2400);
}

function openModal(title, placeholder, onOk, initial) {
  const mod = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalInput').placeholder = placeholder;
  $('#modalInput').value = initial || '';
  mod.hidden = false;
  const input = $('#modalInput');
  setTimeout(() => input.focus(), 30);
  const commit = () => {
    const v = input.value.trim();
    if (!v) return;
    mod.hidden = true;
    onOk(v);
  };
  $('#modalOk').onclick = commit;
  $('#modalCancel').onclick = () => { mod.hidden = true; };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') mod.hidden = true;
  };
}

/* ---------------- collection menu ---------------- */

let collMenuFor = null;
let movieMenuFor = null;

function createCollection(prettyName, firstMovieId) {
  const name = String(prettyName || '').trim();
  if (!name) return null;
  const id = slug(name);
  if (state.store.collections[id]) {
    toast('That collection already exists');
    return null;
  }
  state.store.collections[id] = { id, name, movies: firstMovieId ? [firstMovieId] : [] };
  saveStore();
  renderSidebar();
  renderGrid();
  renderDetailChips();
  return id;
}

function showCollMenu(btn, movieId) {
  const menu = $('#collMenu');
  collMenuFor = movieId;
  const entries = collList();
  let html = '<h4>ADD TO COLLECTION</h4>';
  if (!entries.length) html += '<div class="cm-item" style="cursor:default;color:var(--text-faint)">No collections yet</div>';
  for (const c of entries) {
    const on = inColl(c.id, movieId) ? 'on' : '';
    html += `<button class="cm-item ${on}" data-coll="${esc(c.id)}"><span class="cm-check">${on ? '✓' : ''}</span><span class="cm-name">${esc(c.name)}</span></button>`;
  }
  html += '<button class="cm-new">＋ New collection…</button>';
  menu.innerHTML = html;
  menu.hidden = false;

  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 200)) + 'px';
  menu.style.top = r.bottom + 6 + 'px';

  $$('.cm-item', menu).forEach((it) => {
    it.onclick = () => {
      const cid = it.dataset.coll;
      const coll = state.store.collections[cid];
      if (!coll) return;
      const items = coll.movies;
      if (items.includes(movieId)) {
        coll.movies = items.filter((x) => x !== movieId);
        toast(`Removed from “${coll.name}”`);
      } else {
        items.push(movieId);
        toast(`Added to “${coll.name}”`);
      }
      saveStore();
      renderSidebar();
      renderGrid();
      const dm = state.detailMovie;
      if (dm && dm.id === movieId) renderDetailChips();
      showCollMenu(btn, movieId);
    };
  });
  $('.cm-new', menu).onclick = () => {
    menu.hidden = true;
    openModal('New collection', 'Collection name', (name) => {
      createCollection(name, movieId);
    });
  };
}

function hideCollMenu() {
  $('#collMenu').hidden = true;
  collMenuFor = null;
}

/* ---------------- movie ⋮ menu ---------------- */

function openMovieMenu(btn, m) {
  hideCollMenu();
  if (movieMenuFor && movieMenuFor.btn && movieMenuFor.btn !== btn) movieMenuFor.btn.classList.remove('open');
  const menu = $('#movieMenu');
  const fav = isFav(m.id);
  const watched = !!state.store.watched[m.id];
  menu.innerHTML = `
    <button class="mm-item ${fav ? 'on' : ''}" data-action="fav">
      <span class="mm-ico">${fav ? '♥' : '♡'}</span><span>${fav ? 'Remove from favorites' : 'Add to favorites'}</span>
    </button>
    <button class="mm-item" data-action="coll">
      <span class="mm-ico">☰</span><span>Add to collection</span>
    </button>
    <button class="mm-item" data-action="watched">
      <span class="mm-ico">${watched ? '✓' : '○'}</span><span>${watched ? 'Mark unplayed' : 'Mark as watched'}</span>
    </button>
    <div class="mm-sep"></div>
    <button class="mm-item" data-action="vlc">
      <span class="mm-ico">▶</span><span>Open with VLC</span>
    </button>`;
  menu.hidden = false;

  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 12)) + 'px';
  menu.style.top = Math.max(8, r.bottom + 6) + 'px';

  btn.classList.add('open');
  movieMenuFor = { btn, m };

  $$('.mm-item', menu).forEach((it) => {
    it.onclick = (e) => {
      e.stopPropagation();
      const action = it.dataset.action;
      const anchor = movieMenuFor.btn;
      hideMovieMenu();
      if (action === 'fav') {
        toggleFav(m.id);
        toast(isFav(m.id) ? 'Added to favorites' : 'Removed from favorites', isFav(m.id) ? '♥' : '');
        renderSidebar();
        renderGrid();
        renderContinue();
      } else if (action === 'coll') {
        showCollMenu(anchor, m.id);
      } else if (action === 'watched') {
        if (state.store.watched[m.id]) {
          delete state.store.watched[m.id];
          toast('Marked as unplayed');
        } else {
          state.store.watched[m.id] = true;
          delete state.store.progress[m.id];
          toast('Marked as watched', '✓');
        }
        saveStore();
        renderGrid();
        renderContinue();
      } else if (action === 'vlc') {
        launchVlc(m, true);
      }
    };
  });
}

function hideMovieMenu() {
  const menu = $('#movieMenu');
  menu.hidden = true;
  menu.innerHTML = '';
  if (movieMenuFor && movieMenuFor.btn) movieMenuFor.btn.classList.remove('open');
  movieMenuFor = null;
}

window.addEventListener('pointermove', (e) => {
  if (movieMenuFor) {
    const r = movieMenuFor.btn.getBoundingClientRect();
    if (e.clientY < r.top - 4) hideMovieMenu();
  }
});

/* ---------------- rendering ---------------- */

function cardHTML(m, opts = {}) {
  const st = posterStyle(m.title, m.id);
  const prog = state.store.progress[m.id];
  const watched = state.store.watched[m.id];
  const pct = prog && prog.d ? Math.min(100, (prog.t / prog.d) * 100) : 0;
  const showProg = prog && !watched && pct > 2 && pct < 99;

  const badges = [];
  if (m.res) badges.push(`<span class="badge">${esc(m.res)}</span>`);
  if (m.lang && m.lang !== 'EN') badges.push(`<span class="badge lang">${esc(m.lang)}</span>`);
  if (m.ext) badges.push(`<span class="badge">${esc(m.ext)}</span>`);

  let art = '';
  if (m.art) art = `<img class="card-art" src="file:///${encodeURI(m.art.replace(/\\/g, '/'))}" alt="">`;

  const subParts = [];
  if (m.year) subParts.push(esc(m.year));
  subParts.push(`${fmtSize(m.sizeMB)}`);
  const watchDot = watched ? '<span class="watch-dot" title="Watched"></span>' : '';

  return `
<article class="card" data-id="${esc(m.id)}" style="--i:${opts.i || 0}">
  <div class="card-poster" style="background:${st.background};box-shadow:0 14px 34px -14px rgba(0,0,0,0.8);--glow:0 0 0 1px hsla(${st.hue},70%,60%,0.35),0 26px 50px -18px hsla(${st.hue},60%,40%,0.55)">
    ${art}
    <span class="card-glyph">${esc(glyphOf(m.title))}</span>
    <div class="card-top">
      ${badges.join('')}
      <button class="more-btn" data-more="${esc(m.id)}" title="More options">⋮</button>
    </div>
    <div class="card-hover">
      <button class="btn small primary" data-play="${esc(m.id)}">▶ &nbsp;Play</button>
      <button class="btn small" data-coll-btn="${esc(m.id)}">☰ &nbsp;Collection</button>
    </div>
    ${showProg ? `<div class="progress-track"><div class="fill" style="width:${pct}%"></div></div>` : ''}
  </div>
  <div class="card-meta">
    <div class="card-title" data-open="${esc(m.id)}">${esc(m.title)}</div>
    <div class="card-sub"><span class="lboard">${subParts.join(' · ')}</span>${watchDot}</div>
  </div>
</article>`;
}

function renderGrid() {
  const grid = $('#movieGrid');
  const empty = $('#emptyState');
  let movies = visibleMovies();

  const q = $('#searchInput').value.trim().toLowerCase();
  if (q) {
    movies = movies.filter((m) =>
      m.title.toLowerCase().includes(q) ||
      (m.year && String(m.year).includes(q)) ||
      m.lang.toLowerCase().includes(q)
    );
  }

  if (!movies.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = movies.map((m, i) => cardHTML(m, { i })).join('');
}

function visibleMovies() {
  if (state.view === 'favorites') return state.movies.filter((m) => isFav(m.id));
  if (state.view.startsWith('collection:')) {
    const cid = state.view.slice(11);
    const c = state.store.collections[cid];
    const items = (c && c.movies) || [];
    return state.movies.filter((m) => items.includes(m.id));
  }
  return state.movies;
}

function renderContinue() {
  const row = $('#continueRow');
  const grid = $('#continueGrid');
  const items = Object.entries(state.store.progress)
    .filter(([id, p]) => p && p.d && p.t > 8 && p.t < p.d - 35 && !state.store.watched[id])
    .map(([id, p]) => ({ id, p }))
    .sort((a, b) => (b.p.at || 0) - (a.p.at || 0))
    .slice(0, 8);
  const movies = items
    .map(({ id, p }) => ({ m: state.movies.find((x) => x.id === id), p }))
    .filter((x) => x.m);
  if (!movies.length) { row.hidden = true; return; }
  row.hidden = false;
  grid.innerHTML = movies.map(({ m, p }, i) => cardHTML(m, { i })).join('');
}

function renderSidebar() {
  $('#favCount').textContent = state.store.favorites.length || '';
  const list = $('#collectionList');
  list.innerHTML = '';
  for (const c of collList()) {
    const hue = hueOf(c.id);
    const el = document.createElement('button');
    el.className = 'col-item' + (state.view === 'collection:' + c.id ? ' active' : '');
    el.innerHTML = `<span class="col-dot" style="background:hsla(${hue},70%,60%,1);box-shadow:0 0 8px hsla(${hue},70%,60%,0.55)"></span><span class="col-name" title="${esc(c.name)}">${esc(c.name)}</span><span class="side-count">${c.movies.length}</span>`;
    el.onclick = () => setView('collection:' + c.id);
    list.appendChild(el);
  }
}

function renderHead() {
  const tools = $('#collectionTools');
  const titleMap = {
    home: ['Cinema', `${state.movies.length} film${state.movies.length === 1 ? '' : 's'} in your library`],
    favorites: ['Favorites', `${state.store.favorites.length} saved film${state.store.favorites.length === 1 ? '' : 's'}`]
  };
  let t, s;
  if (titleMap[state.view]) { [t, s] = titleMap[state.view]; }
  else if (state.view.startsWith('collection:')) {
    const id = state.view.slice(11);
    const c = state.store.collections[id];
    t = c ? c.name : id;
    const n = (c && c.movies) || [];
    s = `${n.length} film${n.length === 1 ? '' : 's'} · collection`;
  }
  $('#contentTitle').textContent = t;
  $('#contentSub').textContent = s;
  $('#gridTitle').textContent = state.view.startsWith('collection:') ? 'Films in this collection' : (state.view === 'favorites' ? 'Your picks' : 'All films');
  if (tools) tools.hidden = !state.view.startsWith('collection:');
}

function renderAll() {
  renderSidebar();
  renderHead();
  renderGrid();
  renderContinue();
  updateScanMeta();
}

function setView(v) {
  state.view = v;
  renderAll();
  $$('#sidebar .side-item').forEach((it) => it.classList.toggle('active', it.dataset.nav === v));
  $('#content').scrollTop = 0;
}

function updateScanMeta() {
  const folders = state.folders.length;
  $('#scanMeta').textContent = `${state.movies.length} film${state.movies.length === 1 ? '' : 's'} • ${folders} folder${folders === 1 ? '' : 's'}`;
  $('#searchInput').value = '';
}

/* ---------------- detail ---------------- */

function openDetail(m) {
  state.detailMovie = m;
  const st = posterStyle(m.title, m.id);
  const art = m.art ? `<img src="file:///${encodeURI(m.art.replace(/\\/g, '/'))}" alt="">` : '';

  $('#dBackdrop').style.background = st.background;
  $('#dPoster').style.background = st.background;
  $('#dPoster').innerHTML = art + `<span class="card-glyph">${esc(glyphOf(m.title))}</span>`;
  $('#dTitle').textContent = m.title;

  const tags = [];
  if (m.year) tags.push(`<span class="badge">${esc(m.year)}</span>`);
  if (m.res) tags.push(`<span class="badge">${esc(m.res)}</span>`);
  if (m.lang) tags.push(`<span class="badge lang">${esc(m.lang)}</span>`);
  if (m.ext) tags.push(`<span class="badge">${esc(m.ext)}</span>`);
  $('#dTags').innerHTML = tags.join('');

  $('#dMeta').innerHTML = [
    m.year ? `Year ${m.year}` : null,
    `${fmtSize(m.sizeMB)}`,
    `${m.ext} file`,
    `<button class="btn ghost" style="padding:2px 8px;font-size:11px" id="dShowInFolder" title="Show in folder">📂</button>`
  ].filter(Boolean).join(' <span style="opacity:.3">·</span> ');

  const prog = state.store.progress[m.id];
  const resumeBtn = $('#dResume');
  if (prog && prog.d && prog.t > 10 && prog.t < prog.d - 30) {
    resumeBtn.textContent = `▶ Resume ${fmtTime(prog.t)}`;
    resumeBtn.hidden = false;
    resumeBtn.onclick = () => { closeDetail(); openPlayer(m, prog.t); };
  } else {
    resumeBtn.hidden = true;
  }

  $('#dPlay').onclick = () => { closeDetail(); openPlayer(m, 0); };
  $('#dVlc').onclick = () => launchVlc(m, true);
  const favBtn = $('#dFav');
  const refreshFav = () => {
    const f = isFav(m.id);
    favBtn.innerHTML = `${f ? '♥' : '♡'} ${f ? 'Favorited' : 'Favorite'}`;
    favBtn.classList.toggle('primary', f);
    favBtn.style.color = f ? '' : '';
  };
  refreshFav();
  favBtn.onclick = () => {
    toggleFav(m.id);
    refreshFav();
    renderGrid();
    renderSidebar();
  };

  const $fold = $('#dShowInFolder');
  if ($fold) $fold.onclick = () => window.mp.showInFolder(m.path);

  renderDetailChips();
  $('#detail').hidden = false;
  document.body.classList.add('modal-open');
}

function renderDetailChips() {
  const m = state.detailMovie;
  if (!m) return;
  const wrap = $('#dChips');
  let html = '';
  for (const c of collList()) {
    const on = inColl(c.id, m.id) ? 'on' : '';
    html += `<button class="chip ${on}" data-cid="${esc(c.id)}"><span class="chip-dot" style="width:7px;height:7px;border-radius:2px;background:hsla(${hueOf(c.id)},70%,60%,1);display:inline-block"></span>${esc(c.name)}${on ? ' ✕' : ''}</button>`;
  }
  html += '<button class="chip add" id="chipAdd">＋ Add</button>';
  wrap.innerHTML = html;
  $$('.chip[data-cid]', wrap).forEach((c) => {
    c.onclick = () => {
      const cid = c.dataset.cid;
      const coll = state.store.collections[cid];
      if (!coll) return;
      if (coll.movies.includes(m.id)) {
        coll.movies = coll.movies.filter((x) => x !== m.id);
        toast(`Removed from “${coll.name}”`);
      } else {
        coll.movies.push(m.id);
        toast(`Added to “${coll.name}”`);
      }
      saveStore();
      renderDetailChips();
      renderSidebar();
      renderGrid();
    };
  });
  $('#chipAdd', wrap).onclick = () => {
    openModal('New collection', 'Collection name', (name) => {
      const cid = createCollection(name, m.id);
      if (cid && state.detailMovie) {
        renderSidebar();
        renderGrid();
        toast(`Created “${name}”`, '✓');
      }
    });
  };
}

function closeDetail() {
  $('#detail').hidden = true;
  document.body.classList.remove('modal-open');
  state.detailMovie = null;
}

function toggleFav(id) {
  const arr = state.store.favorites;
  if (arr.includes(id)) state.store.favorites = arr.filter((x) => x !== id);
  else state.store.favorites.push(id);
  saveStore();
}

/* ---------------- player ---------------- */

const video = $('#video');
const seekEl = $('#seek');
const volEl = $('#vol');
const btnPlay = $('#btnPlay');

function openPlayer(m, startAt) {
  state.player.open = true;
  state.current = m;
  $('#player').hidden = false;
  $('#pTitle').textContent = m.title;
  $('#pSub').textContent = [m.year, m.ext, m.res, m.lang].filter(Boolean).join(' · ');

  const prog = state.store.progress[m.id];
  const isWatched = state.store.watched[m.id];
  const resumeCard = $('#resumeCard');
  let resumeAt = startAt != null ? startAt : (prog && prog.t ? prog.t : 0);

  video.src = 'file:///' + encodeURI(m.path.replace(/\\/g, '/'));
  video.volume = volEl.value / 100;

  if (startAt == null && !isWatched && prog && prog.t > 10 && prog.t < prog.d - 35) {
    state.player.resumePending = prog.t;
    $('#resumeTitle').textContent = m.title;
    $('#resumeText').textContent = `Continue from ${fmtTime(prog.t)}?`;
    resumeCard.hidden = false;
    $('#resumeBtn').onclick = () => { resumeCard.hidden = true; playFrom(prog.t); };
    $('#restartBtn').onclick = () => { resumeCard.hidden = true; playFrom(0); };
  } else {
    playFrom(resumeAt);
  }

  resetHideTimer();
}

function playFrom(t) {
  $('#resumeCard').hidden = true;
  $('#unsupportedCard').hidden = true;
  video.currentTime = t;
  video.play().catch(() => {});
  updatePlayIcon();
}

function updatePlayIcon() { btnPlay.textContent = video.paused ? '▶' : '⏸'; }
function updateSeek() {
  const d = video.duration || 0;
  const t = video.currentTime || 0;
  const pct = d ? (t / d) * 1000 : 0;
  seekEl.value = Math.min(1000, pct);
  seekEl.style.setProperty('--fill', pct / 10 + '%');
  $('#timeLabel').textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
}

function resetHideTimer() {
  clearTimeout(state.player.hideTimer);
  $('#player').classList.remove('controls-hidden');
  if (!video.paused) {
    state.player.hideTimer = setTimeout(() => $('#player').classList.add('controls-hidden'), 2600);
  }
}

video.addEventListener('loadedmetadata', () => {
  updateSeek();
  video.volume = volEl.value / 100;
});
video.addEventListener('timeupdate', () => {
  if (!state.current) return;
  updateSeek();
  const now = Date.now();
  if (now - state.player.lastSave > 3500) {
    state.player.lastSave = now;
    state.store.progress[state.current.id] = { t: video.currentTime, d: video.duration, at: now };
    saveStoreSoon(1200);
  }
});
video.addEventListener('play', () => { updatePlayIcon(); resetHideTimer(); $('#buffering').hidden = true; });
video.addEventListener('pause', () => {
  updatePlayIcon();
  $('#player').classList.remove('controls-hidden');
  clearTimeout(state.player.hideTimer);
});
video.addEventListener('playing', () => $('#buffering').hidden = true);
video.addEventListener('waiting', () => { $('#buffering').hidden = false; });
video.addEventListener('ended', () => {
  updatePlayIcon();
  state.store.watched[state.current.id] = true;
  delete state.store.progress[state.current.id];
  saveStore();
  $('#centerHint').textContent = '✓';
  setTimeout(() => { $('#centerHint').innerHTML = ''; }, 700);
  toast('Finished — marked as watched', '✓');
  renderContinue();
  renderGrid();
});
video.addEventListener('error', () => {
  if (!state.player.open) return;
  $('#player').classList.remove('controls-hidden');
  $('#unsupportedText').textContent = `“${state.current.title}” could not be decoded by the built-in engine (${state.current.ext}). VLC plays almost everything.`;
  $('#unsupportedCard').hidden = false;
});

video.addEventListener('click', () => {
  if (video.paused) video.play(); else video.pause();
  flashHint(video.paused ? '⏸' : '▶');
});
video.addEventListener('dblclick', toggleFullscreen);

function flashHint(txt) {
  const h = $('#centerHint');
  h.textContent = txt;
  h.style.animation = 'none';
  void h.offsetWidth;
  h.style.animation = '';
  setTimeout(() => { h.textContent = ''; }, 700);
}

function toggleFullscreen() {
  const pl = $('#player');
  if (!document.fullscreenElement) pl.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}

document.addEventListener('fullscreenchange', () => {
  $('#btnFull').textContent = document.fullscreenElement ? '⊡' : '⛶';
});

function seekTo(el) {
  if (!isFinite(video.duration) || video.duration <= 0) return;
  const ratio = (el.valueAsNumber - Number(el.min)) / (Number(el.max) - Number(el.min));
  const t = ratio * video.duration;
  if (isFinite(t) && t >= 0) video.currentTime = t;
  updateSeek();
}

seekEl.addEventListener('input', () => seekTo(seekEl));
seekEl.addEventListener('change', () => seekTo(seekEl));
seekEl.addEventListener('pointermove', (e) => {
  const r = seekEl.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const h = $('#seekHover');
  h.textContent = fmtTime(ratio * video.duration);
  h.style.opacity = '1';
  h.style.left = ratio * 100 + '%';
});
seekEl.addEventListener('pointerleave', () => { $('#seekHover').style.opacity = '0'; });

volEl.addEventListener('input', () => {
  video.volume = volEl.value / 100;
  video.muted = volEl.value == 0;
  $('#btnMute').textContent = volEl.value == 0 ? '✕' : '♫';
  volEl.style.setProperty('--fill', volEl.value + '%');
});
volEl.style.setProperty('--fill', '80%');

function setSpeed() {
  const speeds = [1, 1.25, 1.5, 1.75, 2, 0.75, 0.5];
  const i = speeds.indexOf(state.player.speed);
  state.player.speed = speeds[(i + 1) % speeds.length];
  video.playbackRate = state.player.speed;
  $('#btnSpeed').textContent = state.player.speed + '×';
  toast(`Speed ${state.player.speed}×`);
}
$('#btnSpeed').onclick = setSpeed;

function launchVlc(movie, fullscreen) {
  return window.mp.openInVlc(movie.path, fullscreen).then((r) => {
    if (r.ok) {
      closePlayer();
      toast('Playing in VLC', '▶');
    } else {
      toast('VLC: ' + r.error, '⚠');
    }
    return r;
  });
}

$('#btnPlay').onclick = () => {
  if (video.paused) video.play(); else video.pause();
};
$('#btnBack10').onclick = () => { video.currentTime = Math.max(0, video.currentTime - 10); updateSeek(); };
$('#btnFwd10').onclick = () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); updateSeek(); };
$('#btnMute').onclick = () => {
  video.muted = !video.muted;
  volEl.value = video.muted ? 0 : video.volume * 100;
  $('#btnMute').textContent = video.muted ? '✕' : '♫';
};
$('#btnFull').onclick = toggleFullscreen;
$('#pExit').onclick = closePlayer;
$('#unsupportedVlcBtn').onclick = () => launchVlc(state.current, true);
$('#unsupportedCloseBtn').onclick = closePlayer;
$('#btnVlc').onclick = () => launchVlc(state.current, false);

function closePlayer() {
  if (!state.player.open) return;
  if (document.fullscreenElement) document.exitFullscreen();
  video.pause();
  video.removeAttribute('src');
  video.load();
  state.player.open = false;
  const p = state.store.progress[state.current.id] || {};
  if (p && p.d) {
    if (p.t > 10) state.store.progress[state.current.id] = p;
    saveStore();
  }
  $('#player').hidden = true;
  $('#unsupportedCard').hidden = true;
  $('#resumeCard').hidden = true;
  state.current = null;
  renderContinue();
}

$('#player').addEventListener('pointermove', () => resetHideTimer());

/* ---------------- keyboard ---------------- */

document.addEventListener('keydown', (e) => {
  if ($('#modal').hidden === false) return;
  if (e.key === 'Escape') {
    if (movieMenuFor) { hideMovieMenu(); return; }
    if (!$('#collMenu').hidden) { hideCollMenu(); return; }
  }
  const meta = e.ctrlKey || e.metaKey || e.altKey;
  if (state.player.open) {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (video.paused) video.play(); else video.pause();
        break;
      case 'ArrowLeft':
        video.currentTime = Math.max(0, video.currentTime - 10); updateSeek(); break;
      case 'ArrowRight':
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); updateSeek(); break;
      case 'ArrowUp':
        e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); volEl.value = video.volume * 100; break;
      case 'ArrowDown':
        e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); volEl.value = video.volume * 100; break;
      case 'm': case 'M': $('#btnMute').click(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 's': case 'S': setSpeed(); break;
      case 'Escape':
        if (document.fullscreenElement) document.exitFullscreen();
        else closePlayer();
        break;
    }
    return;
  }
  if (!$('#detail').hidden) {
    if (e.key === 'Escape') closeDetail();
    return;
  }
  if (e.key === 'Escape' && state.view !== 'home') setView('home');
  if (e.key === '/' && !meta) { e.preventDefault(); $('#searchInput').focus(); }
});

/* ---------------- wire-up ---------------- */

document.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) {
    e.stopPropagation();
    const m = state.movies.find((x) => x.id === more.dataset.more);
    if (m && !$('#movieMenu').hidden && movieMenuFor && movieMenuFor.m && movieMenuFor.m.id === m.id) {
      hideMovieMenu();
    } else if (m) {
      openMovieMenu(more, m);
    }
    return;
  }
  const play = e.target.closest('[data-play]');
  if (play) {
    e.stopPropagation();
    const m = state.movies.find((x) => x.id === play.dataset.play);
    if (m) openPlayer(m, null);
    return;
  }
  const collBtn = e.target.closest('[data-coll-btn]');
  if (collBtn) {
    e.stopPropagation();
    showCollMenu(collBtn, collBtn.dataset.collBtn);
    return;
  }
  const open = e.target.closest('[data-open], .card-poster');
  if (open) {
    const card = e.target.closest('.card');
    if (card) {
      const m = state.movies.find((x) => x.id === card.dataset.id);
      if (m) openDetail(m);
    }
    return;
  }
  const closeEl = e.target.closest('[data-close]');
  if (closeEl) { closeDetail(); return; }
  if (!$('#collMenu').hidden && !e.target.closest('#collMenu')) hideCollMenu();
  if (movieMenuFor && !e.target.closest('#movieMenu')) hideMovieMenu();
});

$('#newCollectionBtn').onclick = () => {
  openModal('Name your collection', 'e.g. Sci-Fi Night', (name) => {
    if (createCollection(name)) toast(`Created “${name.trim()}”`, '✓');
  });
};

$('#renameCollBtn').onclick = () => {
  if (!state.view.startsWith('collection:')) return;
  const id = state.view.slice(11);
  const c = state.store.collections[id];
  if (!c) return;
  openModal('Rename collection', c.name, (name) => {
    c.name = name.trim();
    saveStore();
    renderAll();
    toast('Collection renamed', '✓');
  }, c.name);
};

$('#deleteCollBtn').onclick = () => {
  if (!state.view.startsWith('collection:')) return;
  const btn = $('#deleteCollBtn');
  if (!btn.classList.contains('arm')) {
    btn.classList.add('arm');
    btn.textContent = 'Sure?';
    clearTimeout(btn._armTimer);
    btn._armTimer = setTimeout(() => {
      btn.classList.remove('arm');
      btn.textContent = '✕';
    }, 2500);
    return;
  }
  const id = state.view.slice(11);
  const c = state.store.collections[id];
  delete state.store.collections[id];
  saveStore();
  toast(`Deleted “${c ? c.name : id}”`);
  setView('home');
};

$$('#sidebar .side-item[data-nav]').forEach((it) => {
  it.onclick = () => setView(it.dataset.nav);
});

$('#rescanBtn').onclick = async () => {
  toast('Scanning…', '⟳');
  const res = await window.mp.scanMovies();
  state.movies = res.movies;
  state.folders = res.folders;
  renderAll();
  toast('Library scanned');
};

$('#addFolderBtn').onclick = async () => {
  const res = await window.mp.addFolder();
  if (!res) return;
  state.movies = res.movies;
  state.folders = res.folders;
  renderAll();
  toast('Folder added', '✓');
};
$('#emptyAddBtn').onclick = () => $('#addFolderBtn').click();

$('#searchInput').addEventListener('input', renderGrid);

/* ---------------- init ---------------- */

(async function init() {
  try {
    const [store, scan] = await Promise.all([window.mp.storeGet(), window.mp.scanMovies()]);
    state.store = Object.assign({ folders: [], favorites: [], collections: {}, progress: {}, watched: {} }, store);
    state.store.collections = normalizeCollections(state.store.collections);
    state.movies = scan.movies;
    state.folders = scan.folders;
    renderAll();
  } catch (err) {
    window.__renderErr = String(err && err.stack ? err.stack : err);
    console.error(window.__renderErr);
  }
})();