const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const EXT = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.webm', '.mpg', '.mpeg']);
const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SKIP_DIRS = new Set(['node_modules', 'system volume information', '$recycle.bin', 'windows', 'program files', 'program files (x86)']);
const MAX_DEPTH = 3;
const MAX_FILES = 4000;
const MIN_SIZE = 5 * 1024 * 1024;

let mainWindow = null;

function storeFile() {
  return path.join(app.getPath('userData'), 'marquee-store.json');
}

function defaultStore() {
  return { version: 1, folders: null, favorites: [], collections: {}, progress: {}, watched: {} };
}

function loadStore() {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8');
    const data = JSON.parse(raw);
    return Object.assign(defaultStore(), data);
  } catch (e) {
    return defaultStore();
  }
}

function saveStore(data) {
  try {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('store write failed', e);
  }
}

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function detectLang(token) {
  const t = String(token).toLowerCase();
  if (/cz|cs|czech|dabing/i.test(t)) return 'CZ';
  if (/^sk$|slovak/i.test(t)) return 'SK';
  if (/en|eng|english/i.test(t)) return 'EN';
  if (/de|german/i.test(t)) return 'DE';
  if (/fr|french/i.test(t)) return 'FR';
  if (/es|spanish/i.test(t)) return 'ES';
  if (/ru|russian/i.test(t)) return 'RU';
  if (/pl|polish/i.test(t)) return 'PL';
  return null;
}

function parseMovie(filePath, folder) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).replace(/\.[^/.]+$/, '');
  const clean = base.replace(/\+/g, ' ').replace(/[_\u00A0]/g, ' ').replace(/\s+/g, ' ').trim();

  const yearMatch = clean.match(/(?:\(|\b)(19|20)\d{2}(?:\)|\b)/);
  const year = yearMatch ? parseInt(yearMatch[0].replace(/[()]/g, ''), 10) : null;

  const resMatch = clean.match(/\b(2160p|1080p|720p|480p|4k|uhd|blu[_-]?ray|web-?dl|web-?rip|hd-?rip|bdrip)\b/i);
  const res = resMatch ? resMatch[1].toUpperCase() : null;

  let title = clean;
  if (yearMatch) title = title.replace(yearMatch[0], ' ');
  title = title.replace(/\[[^\]]*\]/g, ' ');
  title = title.replace(/\((19|20)\d{2}\)/g, ' ');
  title = title.replace(/\b(2160p|1080p|720p|480p|4k|uhd|blu-?ray|web-?dl|web-?rip|hd-?rip|bdrip|hdtv|dvdrip|x264|x265|hevc|h\.?264|h\.?265|aac|ac3|dts|atmos|5\.1|7\.1|stereo|dolby|dabing|dubbed|duel|dual\s?audio|czech|subtitles?|subs?)\b/gi, ' ');
  title = title.replace(/(?:\(|\)|\[|\]|\{|\})/g, ' ');
  title = title.replace(/[^\p{L}\p{N}\s\-'’&]/gu, ' ');
  title = title.replace(/^[\s\-–—.]+|[\s\-–—.]+$/g, '');
  title = title.replace(/\s{2,}/g, ' ').trim();
  if (!title || title.length < 1) title = base.replace(/[_.]/g, ' ').trim();

  let lang = null;
  const langMatch = clean.match(/\b(cz|cs|czech|dabing|sk|slovak|en|eng|english|de|german|fr|french|es|spanish|ru|russian|pl|polish)\b/i);
  if (langMatch) lang = detectLang(langMatch[1]);
  if (!lang) {
    const bracket = clean.match(/\[([^\]]*)\]/g);
    if (bracket) {
      for (const b of bracket) {
        const inner = b.replace(/[\[\]]/g, ' ').replace(/[+_.]/g, ' ');
        const m = inner.match(/\b(cz|cs|czech|sk|slovak|en|eng|english|de|german|fr|french|es|spanish|ru|russian|pl|polish)\b/i);
        if (m) { lang = detectLang(m[1]); break; }
      }
    }
  }
  if (!lang) lang = 'EN';

  let art = null;
  try {
    const baseLower = base.toLowerCase();
    const files = fs.readdirSync(folder);
    for (const f of files) {
      const fext = path.extname(f).toLowerCase();
      if (IMG.has(fext)) {
        const fbase = path.basename(f, fext).toLowerCase().replace(/_|\+/g, ' ');
        if (fbase.indexOf(baseLower.slice(0, Math.min(baseLower.length, 12))) === 0) {
          art = path.join(folder, f);
          break;
        }
      }
    }
  } catch (e) { /* ignore */ }

  let sizeMB = 0;
  let added = 0;
  try {
    const st = fs.statSync(filePath);
    sizeMB = Math.round(st.size / (1024 * 1024));
    added = Math.round(st.mtimeMs);
  } catch (e) { /* ignore */ }

  return {
    id: hashString(filePath),
    title,
    year,
    res,
    lang,
    ext: ext.slice(1).toUpperCase(),
    sizeMB,
    file: path.basename(filePath),
    path: filePath,
    folder,
    art,
    added
  };
}

function scanFolder(folder, out, depth) {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    if (out.length >= MAX_FILES) return;
    if (ent.name.startsWith('.')) continue;
    if (ent.isSymbolicLink()) continue;
    const full = path.join(folder, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name.toLowerCase())) scanFolder(full, out, depth + 1);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (EXT.has(ext)) {
        try {
          const st = fs.statSync(full);
          if (st.size < MIN_SIZE) continue;
          out.push(parseMovie(full, folder));
        } catch (e) { /* ignore */ }
      }
    }
  }
}

function scanAll() {
  const store = loadStore();
  let folders = store.folders && store.folders.length ? store.folders : [];
  let replacedDefault = false;
  if (!folders.length) {
    const downloads = app.getPath('downloads');
    folders = [downloads];
    store.folders = folders;
    replacedDefault = true;
  }
  const movies = [];
  const seen = new Set();
  for (const folder of folders) {
    const tmp = [];
    scanFolder(folder, tmp, 0);
    for (const m of tmp) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        movies.push(m);
      }
    }
  }
  movies.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  if (replacedDefault) saveStore(store);
  return { movies, folders };
}

function addFolder(dir) {
  if (!dir) return false;
  const store = loadStore();
  const folders = store.folders && store.folders.length ? store.folders : [app.getPath('downloads')];
  const norm = path.resolve(dir);
  if (!folders.some((f) => path.resolve(f).toLowerCase() === norm.toLowerCase())) {
    folders.push(norm);
    store.folders = folders;
    saveStore(store);
    return true;
  }
  return false;
}

function findVlc() {
  const candidates = [
    process.env.VLC_PATH,
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'VideoLAN', 'VLC', 'vlc.exe')
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const spawnedVlcs = new Set();

function openInVlc(file, fullscreen) {
  const vlc = findVlc();
  if (!vlc) return { ok: false, error: 'VLC not found' };
  try {
    for (const child of spawnedVlcs) {
      try { child.kill(); } catch (e) { /* ignore */ }
    }
    spawnedVlcs.clear();
    const args = ['--no-one-instance', '--intf=qt', '--no-video-title-show'];
    if (fullscreen) args.push('--fullscreen');
    args.push(file);
    const child = spawn(vlc, args, { detached: true, stdio: 'ignore' });
    spawnedVlcs.add(child);
    child.on('exit', () => spawnedVlcs.delete(child));
    child.unref();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    }, 600);
    return { ok: true, vlc };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#07070b',
    title: 'Marquee',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b13', symbolColor: '#cfcfd6', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.MARQUEE_SMOKE === '1') {
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('SMOKE LOADED');
      setTimeout(async () => {
        const dom = await mainWindow.webContents.executeJavaScript(`({
          cards: document.querySelectorAll('.card').length,
          title: document.querySelector('#contentTitle') ? document.querySelector('#contentTitle').textContent : null,
          meta: document.querySelector('#scanMeta') ? document.querySelector('#scanMeta').textContent : null,
          renderErr: window.__renderErr || null
        })`).catch((e) => ({ execError: String(e) }));
        console.log('SMOKE DOM', JSON.stringify(dom));
        const menu = await mainWindow.webContents.executeJavaScript(`(async () => {
          const more = document.querySelector('.card .more-btn');
          if (!more) return { err: 'no more btn' };
          more.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 200));
          const mm = document.querySelector('#movieMenu');
          const ok = !mm.hidden && mm.querySelectorAll('.mm-item').length === 4;
          const moreOpen = more.classList.contains('open');
          mm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          const favItem = mm.querySelector('[data-action="fav"]');
          favItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
          const closed = mm.hidden && !more.classList.contains('open');
          return { ok, moreOpen, closed };
        })()`).catch((e) => ({ execError: String(e) }));
        console.log('SMOKE MENU', JSON.stringify(menu));
        const coll = await mainWindow.webContents.executeJavaScript(`(async () => {
          const more = document.querySelector('.card .more-btn');
          more.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 150));
          const add = document.querySelector('#movieMenu [data-action="coll"]');
          if (!add) return { err: 'no coll action' };
          add.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 150));
          const cmNew = document.querySelector('#collMenu .cm-new');
          if (!cmNew) return { err: 'no cm-new' };
          cmNew.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
          const input = document.querySelector('#modalInput');
          input.value = 'My Sci-Fi Night';
          document.querySelector('#modalOk').dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 200));
          const st = await window.mp.storeGet();
          const entry = st.collections['my-sci-fi-night'];
          const sidebar = Array.from(document.querySelectorAll('.col-name')).map((n) => n.textContent);
          const result = {
            shape: !!entry && Array.isArray(entry.movies) && entry.id === 'my-sci-fi-night',
            pretty: entry && entry.name,
            movieCount: entry && entry.movies.length,
            sidebar,
            headerTitle: document.getElementById('contentTitle').textContent
          };
          delete st.collections['my-sci-fi-night'];
          await window.mp.storeSet(st);
          return result;
        })()`).catch((e) => ({ execError: String(e) }));
        console.log('SMOKE COLL', JSON.stringify(coll));
        const view = await mainWindow.webContents.executeJavaScript(`(async () => {
          const snap = () => ({
            title: document.getElementById('contentTitle').textContent,
            sub: document.getElementById('contentSub').textContent,
            gridTitle: document.getElementById('gridTitle').textContent,
            toolsVisible: getComputedStyle(document.getElementById('collectionTools')).display !== 'none',
            activeNav: (() => { const a = document.querySelector('#sidebar .side-item.active'); return a ? a.getAttribute('data-nav') || a.textContent.trim() : null; })(),
            activeCol: (() => { const a = document.querySelector('.col-item.active'); return a ? a.querySelector('.col-name').textContent : null; })(),
            cardCount: document.querySelectorAll('#movieGrid .card').length
          });
          const out = [Object.assign({ step: 'home-start' }, snap())];
          const col = document.querySelector('.col-item');
          if (col) col.click();
          await new Promise((r) => setTimeout(r, 120));
          out.push(Object.assign({ step: 'in-collection' }, snap()));
          document.querySelector('#sidebar .side-item[data-nav="home"]').click();
          await new Promise((r) => setTimeout(r, 120));
          out.push(Object.assign({ step: 'home-again' }, snap()));
          out.push(Object.assign({ step: 'home-grid-check' }, (() => {
            const cards = Array.from(document.querySelectorAll('#movieGrid .card'));
            return { allCards: cards.length, gridTitle: document.getElementById('gridTitle').textContent };
          })()));
          return out;
        })()`).catch((e) => ({ execError: String(e) }));
        console.log('SMOKE VIEW', JSON.stringify(view));
        const toolsVisibleCheck = await mainWindow.webContents.executeJavaScript(`({
          homeToolDisplay: getComputedStyle(document.getElementById('collectionTools')).display
        })`).catch((e) => ({ execError: String(e) }));
        console.log('SMOKE TOOLS', JSON.stringify(toolsVisibleCheck));
        const cursorTest = await mainWindow.webContents.executeJavaScript(`(async () => {
          const card = document.querySelector('.card [data-play]');
          card.click();
          await new Promise((r) => setTimeout(r, 2000));
          const p = document.getElementById('player');
          await p.requestFullscreen().catch(() => {});
          await new Promise((r) => setTimeout(r, 400));
          p.classList.add('controls-hidden');
          await new Promise((r) => setTimeout(r, 100));
          const during = getComputedStyle(document.getElementById('video')).cursor;
          const playerCursor = getComputedStyle(p).cursor;
          p.classList.remove('controls-hidden');
          const shown = getComputedStyle(document.getElementById('video')).cursor;
          if (document.fullscreenElement) await document.exitFullscreen();
          return { during, playerCursor, shown };
        })()`).catch((e) => ({ execError: String(e) }));
        console.log('SMOKE CURSOR', JSON.stringify(cursorTest));
        const play = await mainWindow.webContents.executeJavaScript(`(async () => {
          const card = Array.from(document.querySelectorAll('.card')).find((c) =>
            Array.from(c.querySelectorAll('.badge')).some((b) => b.textContent.trim() === 'MKV'));
          if (!card) return { err: 'no mkv card' };
          card.querySelector('[data-play]').click();
          await new Promise((r) => setTimeout(r, 3000));
          const v = document.querySelector('#video');
          const before = Math.round(v.currentTime);
          const s = document.querySelector('#seek');
          s.value = 500;
          s.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 900));
          return {
            playerOpen: !document.getElementById('player').hidden,
            paused: v.paused,
            duration: Number.isFinite(v.duration) ? Math.round(v.duration) : null,
            readyState: v.readyState,
            error: v.error ? v.error.code : null,
            before,
            afterSeek: Math.round(v.currentTime)
          };
        })()`).catch((e) => ({ execError: String(e) }));
        console.log('SMOKE PLAY', JSON.stringify(play));
        app.exit(0);
      }, 4500);
    });
    mainWindow.webContents.on('render-process-gone', (e, details) => {
      console.log('SMOKE CRASH', details.reason);
      app.exit(1);
    });
    mainWindow.webContents.on('console-message', (e, level, message) => {
      console.log('RENDER:', message);
    });
  }
}

ipcMain.handle('movies:scan', () => scanAll());
ipcMain.handle('movies:addFolder', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const res = await dialog.showOpenDialog(win, {
    title: 'Add movies folder',
    properties: ['openDirectory']
  });
  if (res.canceled || !res.filePaths.length) return null;
  addFolder(res.filePaths[0]);
  return scanAll();
});
ipcMain.handle('movies:addFolderPath', (e, dir) => { addFolder(dir); return scanAll(); });
ipcMain.handle('movies:openVlc', (e, file, fullscreen) => openInVlc(file, !!fullscreen));
ipcMain.handle('shell:showInFolder', (e, p) => shell.showItemInFolder(p));
ipcMain.handle('store:get', () => loadStore());
ipcMain.handle('store:set', (e, data) => { saveStore(data); return true; });

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});