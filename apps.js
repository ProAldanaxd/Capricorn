// Detecta qué app/juego tienes en primer plano (todo local, nada sale de tu compu).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------- juegos instalados (Steam y Epic) ----------
function steamGames() {
  const roots = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  const libs = new Set();
  for (const r of roots) {
    const vdf = path.join(r, 'steamapps', 'libraryfolders.vdf');
    if (!fs.existsSync(vdf)) continue;
    libs.add(r);
    const txt = fs.readFileSync(vdf, 'utf8');
    for (const m of txt.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  }
  const games = [];
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        const name = (t.match(/"name"\s+"([^"]+)"/) || [])[1];
        const inst = (t.match(/"installdir"\s+"([^"]+)"/) || [])[1];
        if (!name || !inst || /Steamworks|Redistributable|Proton/i.test(name)) continue;
        const appid = f.match(/\d+/)[0];
        games.push({ name, dir: path.join(dir, 'common', inst).toLowerCase(), store: 'steam', launch: 'steam://rungameid/' + appid });
      } catch { /* manifiesto ilegible */ }
    }
  }
  return games;
}

function epicGames() {
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  const games = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.item')); } catch { return games; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j.DisplayName && j.InstallLocation) {
        games.push({ name: j.DisplayName, dir: j.InstallLocation.toLowerCase(), store: 'epic',
          launch: 'com.epicgames.launcher://apps/' + encodeURIComponent(j.AppName) + '?action=launch&silent=true' });
      }
    } catch { /* manifiesto ilegible */ }
  }
  return games;
}

let GAMES = [];
function loadGames() {
  const seen = new Set();
  GAMES = [...steamGames(), ...epicGames()].filter((g) => (seen.has(g.dir) ? false : seen.add(g.dir)));
  return GAMES;
}

// ---------- clasificación ----------
function classify(info, selfDir) {
  const p = (info.path || '').toLowerCase();
  const exe = path.basename(p);
  const title = info.title || '';
  if (!p) return { id: 'other' };
  if (selfDir && p.startsWith(selfDir.toLowerCase())) return { id: 'self' };
  for (const g of GAMES) if (p.startsWith(g.dir + path.sep) || p.startsWith(g.dir + '/')) return { id: 'game', game: g.name, store: g.store };
  if (exe === 'opera.exe') return { id: p.includes('opera gx') ? 'operagx' : 'browser' };
  if (['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe'].includes(exe)) return { id: 'browser' };
  if (exe === 'code.exe') return { id: 'vscode' };
  if (exe === 'antigravity.exe') return { id: 'antigravity' };
  if (exe === 'steam.exe' || exe === 'steamwebhelper.exe') return { id: 'steam' };
  if (exe === 'epicgameslauncher.exe') return { id: 'epic' };
  if (exe === 'discord.exe') return { id: 'discord' };
  if (exe === 'claude.exe') return { id: 'claude' };
  if (exe === 'olk.exe' || exe === 'outlook.exe') return { id: 'outlook' };
  if (exe === 'systemsettings.exe' || (exe === 'applicationframehost.exe' && /configuraci|settings/i.test(title))) return { id: 'settings' };
  if (exe === 'explorer.exe') {
    if (info.cls === 'CabinetWClass') return { id: 'explorer' };
    if (info.cls === 'Progman' || info.cls === 'WorkerW') return { id: 'desktop' };
    return { id: 'other' };
  }
  if (exe === 'taskmgr.exe') return { id: 'taskmgr' };
  return { id: 'other' };
}

// ---------- vigilante ----------
function startWatcher(selfDir, onApp) {
  loadGames();
  let child = null, buf = '', stopped = false, lastId = '';
  const run = () => {
    if (stopped) return;
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'watcher.ps1')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const lineTxt = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!lineTxt) continue;
        try {
          const c = classify(JSON.parse(lineTxt), selfDir);
          const key = c.id + '|' + (c.game || '');
          if (c.id !== 'self' && key !== lastId) { lastId = key; onApp(c); }
        } catch { /* línea incompleta */ }
      }
    });
    child.on('exit', () => { child = null; if (!stopped) setTimeout(run, 5000); }); // si se cae, reintenta
  };
  run();
  return { stop() { stopped = true; if (child) child.kill(); }, games: () => GAMES };
}

module.exports = { startWatcher, loadGames, classify, loadedGames: () => (GAMES.length ? GAMES : loadGames()) };
