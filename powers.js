// =====================================================================
//  Poderes de Capri (proceso principal).
//   - Avisos: CPU/RAM, disco, descargas terminadas, USB.
//   - Acciones: abrir apps/juegos, música/volumen, buscar archivos, capturas,
//     ordenar Descargas (con confirmación y deshacer).
//   - Acciones BLOQUEADAS (config.desbloquearAccionesPeligrosas = false por defecto):
//     mandar archivos a la papelera, modo oscuro/claro y brillo, instalar programas.
//     Aun desbloqueadas, cada una pide confirmación en una ventana de Windows.
// =====================================================================
const { shell, dialog, desktopCapturer, screen, app } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const HOME = os.homedir();
const DOWNLOADS = path.join(HOME, 'Downloads');
const PICTURES = app.getPath('pictures');
const SEARCH_ROOTS = [...new Set([app.getPath('desktop'), app.getPath('documents'), DOWNLOADS, PICTURES,
  app.getPath('videos'), app.getPath('music'), process.env.OneDrive].filter(Boolean))];
const TEMP_DL = /\.(crdownload|part|partial|tmp|opdownload|download)$/i;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------- confirmación
async function confirm(title, message, detail, okLabel) {
  const r = await dialog.showMessageBox({
    type: 'question', title: 'Capri · ' + title, message, detail,
    buttons: [okLabel, 'Cancelar'], defaultId: 1, cancelId: 1, noLink: true,
  });
  return r.response === 0;
}

// ---------------------------------------------------------------- apps y juegos
const START_MENU = [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
  path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs')];
let shortcuts = null;
async function listShortcuts() {
  if (shortcuts) return shortcuts;
  shortcuts = [];
  const walk = async (dir, depth) => {
    let ents = [];
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 4) await walk(p, depth + 1);
      else if (/\.(lnk|url)$/i.test(e.name) && !/uninstall|desinstal/i.test(e.name)) shortcuts.push({ name: e.name.replace(/\.(lnk|url)$/i, ''), path: p });
    }
  };
  for (const d of START_MENU) await walk(d, 0);
  return shortcuts;
}

// Alias directos para tus apps más usadas
const ALIASES = [
  { keys: ['steam'], open: 'steam://open/main', label: 'Steam' },
  { keys: ['configuracion', 'ajustes', 'settings'], open: 'ms-settings:', label: 'Configuración' },
  { keys: ['explorador', 'archivos', 'explorer', 'mis archivos'], exe: 'explorer.exe', label: 'el Explorador' },
  { keys: ['descargas'], folder: DOWNLOADS, label: 'Descargas' },
  { keys: ['documentos'], folder: app.getPath('documents'), label: 'Documentos' },
  { keys: ['escritorio'], folder: app.getPath('desktop'), label: 'el Escritorio' },
  { keys: ['imagenes', 'fotos'], folder: PICTURES, label: 'Imágenes' },
  { keys: ['calculadora'], exe: 'calc.exe', label: 'la Calculadora' },
  { keys: ['bloc de notas', 'notepad', 'notas'], exe: 'notepad.exe', label: 'el Bloc de notas' },
  { keys: ['administrador de tareas', 'task manager'], exe: 'taskmgr.exe', label: 'el Administrador de tareas' },
  { keys: ['opera', 'opera gx', 'navegador'], lnk: 'opera gx', label: 'Opera GX' },
  { keys: ['vscode', 'vs code', 'visual studio code', 'code'], lnk: 'visual studio code', label: 'VS Code' },
  { keys: ['epic', 'epic games'], lnk: 'epic games launcher', label: 'Epic Games' },
  { keys: ['outlook', 'correo'], open: 'ms-outlook:', lnk: 'outlook', label: 'Outlook' },
];

async function openThing(query, games) {
  // si sobran palabras ("abre discord rapido"), prueba quitando palabras del final
  const words = norm(query).split(' ').filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    const r = await openExact(words.slice(0, n).join(' '), games);
    if (r.ok || r.reason !== 'notfound') return r;
  }
  return { ok: false, reason: 'notfound' };
}

async function openExact(q, games) {
  if (!q) return { ok: false, reason: 'empty' };
  // 1) juegos instalados
  const g = games.find((x) => norm(x.name) === q) || games.find((x) => norm(x.name).includes(q) || q.includes(norm(x.name)));
  if (g && g.launch) { await shell.openExternal(g.launch); return { ok: true, label: g.name, game: true }; }
  // 2) alias
  const a = ALIASES.find((x) => x.keys.some((k) => q === k || q.startsWith(k + ' ') || (k.length > 4 && q.includes(k))));
  if (a) {
    if (a.lnk) {
      const s = (await listShortcuts()).find((x) => norm(x.name).includes(a.lnk));
      if (s) { await shell.openPath(s.path); return { ok: true, label: a.label }; }
    }
    if (a.open) { await shell.openExternal(a.open); return { ok: true, label: a.label }; }
    if (a.folder) { await shell.openPath(a.folder); return { ok: true, label: a.label }; }
    if (a.exe) { spawn(a.exe, [], { detached: true, stdio: 'ignore' }).unref(); return { ok: true, label: a.label }; }
  }
  // 3) cualquier acceso directo del menú Inicio
  const list = await listShortcuts();
  const scored = list.map((s) => {
    const n = norm(s.name);
    const score = n === q ? 100 : n.startsWith(q) ? 80 : n.includes(q) ? 60 : q.split(' ').every((w) => n.includes(w)) ? 40 : 0;
    return { s, score: score - n.length * 0.1 };
  }).filter((x) => x.score > 0).sort((a1, b1) => b1.score - a1.score);
  if (scored.length) { await shell.openPath(scored[0].s.path); return { ok: true, label: scored[0].s.name }; }
  return { ok: false, reason: 'notfound' };
}

// ---------------------------------------------------------------- música y volumen (teclas multimedia)
const VK = { playpause: 0xB3, next: 0xB0, prev: 0xB1, volup: 0xAF, voldown: 0xAE, mute: 0xAD };
function mediaKey(key, times = 1) {
  const vk = VK[key];
  if (!vk) return { ok: false };
  const n = Math.max(1, Math.min(25, times | 0));
  const ps = `Add-Type -Name K -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, System.UIntPtr e);';` +
    `for($i=0;$i -lt ${n};$i++){ [W.K]::keybd_event(${vk},0,0,[UIntPtr]::Zero); [W.K]::keybd_event(${vk},0,2,[UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
  return { ok: true };
}

// ---------------------------------------------------------------- buscar archivos
async function findFiles(query, { limit = 8, timeMs = 4000 } = {}) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const found = [];
  const deadline = Date.now() + timeMs;
  const SKIP = /^(node_modules|\.git|appdata|\$recycle\.bin|windows|program files.*)$/i;
  const queue = SEARCH_ROOTS.map((d) => [d, 0]);
  let seen = 0;
  while (queue.length && Date.now() < deadline && found.length < 200 && seen < 60000) {
    const [dir, depth] = queue.shift();
    let ents = [];
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      seen++;
      if (e.name.startsWith('.') || SKIP.test(e.name)) continue;
      const p = path.join(dir, e.name);
      const n = norm(e.name);
      if (words.every((w) => n.includes(w))) found.push({ path: p, name: e.name, dir: e.isDirectory(), score: (n.startsWith(q) ? 3 : 0) + (n === q ? 5 : 0) - depth * 0.2 });
      if (e.isDirectory() && depth < 6) queue.push([p, depth + 1]);
    }
  }
  const uniq = [...new Map(found.map((f) => [f.path.toLowerCase(), f])).values()];
  return uniq.sort((a1, b1) => b1.score - a1.score).slice(0, limit);
}

// ---------------------------------------------------------------- captura de pantalla
async function screenshot(win) {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  if (win) win.setOpacity(0); // que Capri no salga en la foto
  await new Promise((r) => setTimeout(r, 180));
  let img;
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    img = (sources.find((s) => String(s.display_id) === String(d.id)) || sources[0]).thumbnail;
  } finally { if (win) win.setOpacity(1); }
  const dir = path.join(PICTURES, 'Capri');
  await fsp.mkdir(dir, { recursive: true });
  const d0 = new Date(), z = (n) => String(n).padStart(2, '0');
  const stamp = `${d0.getFullYear()}-${z(d0.getMonth() + 1)}-${z(d0.getDate())}_${z(d0.getHours())}-${z(d0.getMinutes())}-${z(d0.getSeconds())}`;
  const file = path.join(dir, 'Captura_' + stamp + '.png');
  await fsp.writeFile(file, img.toPNG());
  return { ok: true, file, folder: dir };
}

// ---------------------------------------------------------------- ordenar Descargas
const CATS = [
  ['Imágenes', /\.(png|jpe?g|gif|webp|bmp|svg|heic|ico|tiff?)$/i],
  ['Videos', /\.(mp4|mkv|mov|avi|webm|wmv|flv)$/i],
  ['Música', /\.(mp3|wav|flac|ogg|m4a|aac|wma)$/i],
  ['Documentos', /\.(pdf|docx?|xlsx?|pptx?|txt|rtf|odt|ods|odp|csv|md|epub)$/i],
  ['Comprimidos', /\.(zip|rar|7z|tar|gz|bz2|xz|iso)$/i],
  ['Instaladores', /\.(exe|msi|msix|appx|bat)$/i],
  ['Código', /\.(js|ts|py|java|c|cpp|cs|html|css|json|ipynb|sql|sh|ps1|xml|ya?ml)$/i],
];
const UNDO_FILE = () => path.join(app.getPath('userData'), 'ordenar-descargas-deshacer.json');

async function uniqueTarget(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; i < 1000; i++) { const c = path.join(dir, `${name} (${i})${ext}`); if (!fs.existsSync(c)) return c; }
  return null;
}

async function organizeDownloads() {
  let ents = [];
  try { ents = await fsp.readdir(DOWNLOADS, { withFileTypes: true }); } catch { return { ok: false, reason: 'nodir' }; }
  const now = Date.now();
  const plan = [];
  for (const e of ents) {
    if (!e.isFile() || /^desktop\.ini$/i.test(e.name) || TEMP_DL.test(e.name)) continue;
    const p = path.join(DOWNLOADS, e.name);
    let st; try { st = await fsp.stat(p); } catch { continue; }
    if (now - st.mtimeMs < 2 * 60 * 1000) continue; // puede seguir descargándose
    const cat = (CATS.find(([, re]) => re.test(e.name)) || ['Otros'])[0];
    plan.push({ from: p, cat });
  }
  if (!plan.length) return { ok: true, moved: 0, empty: true };
  const counts = {};
  for (const m of plan) counts[m.cat] = (counts[m.cat] || 0) + 1;
  const summary = Object.entries(counts).map(([k, v]) => `  • ${v} → ${k}`).join('\n');
  const yes = await confirm('Ordenar Descargas', `¿Ordeno ${plan.length} archivo(s) de tu carpeta Descargas?`,
    `Se moverán a subcarpetas dentro de Descargas:\n${summary}\n\nNo se borra nada y puedes deshacerlo pidiéndome "deshaz el orden".`, 'Ordenar');
  if (!yes) return { ok: false, cancelled: true };
  const done = [];
  for (const m of plan) {
    const dir = path.join(DOWNLOADS, m.cat);
    await fsp.mkdir(dir, { recursive: true });
    const to = await uniqueTarget(path.join(dir, path.basename(m.from)));
    if (!to) continue;
    try { await fsp.rename(m.from, to); done.push({ from: m.from, to }); } catch { /* en uso: se salta */ }
  }
  await fsp.writeFile(UNDO_FILE(), JSON.stringify({ at: Date.now(), moves: done }, null, 2));
  return { ok: true, moved: done.length, counts };
}

async function undoOrganize() {
  let data;
  try { data = JSON.parse(await fsp.readFile(UNDO_FILE(), 'utf8')); } catch { return { ok: false, reason: 'nothing' }; }
  if (!data.moves || !data.moves.length) return { ok: false, reason: 'nothing' };
  const yes = await confirm('Deshacer orden', `¿Regreso ${data.moves.length} archivo(s) a donde estaban en Descargas?`, '', 'Deshacer');
  if (!yes) return { ok: false, cancelled: true };
  let n = 0;
  for (const m of data.moves) {
    if (!fs.existsSync(m.to)) continue;
    const back = await uniqueTarget(m.from);
    try { await fsp.rename(m.to, back); n++; } catch { /* en uso */ }
  }
  // borrar subcarpetas que quedaron vacías (solo si están vacías)
  for (const [cat] of [...CATS, ['Otros']]) {
    const d = path.join(DOWNLOADS, cat);
    try { if (!(await fsp.readdir(d)).length) await fsp.rmdir(d); } catch { /* no existe */ }
  }
  await fsp.unlink(UNDO_FILE()).catch(() => {});
  return { ok: true, moved: n };
}

// ---------------------------------------------------------------- acciones BLOQUEADAS
function locked(config) { return !config.desbloquearAccionesPeligrosas; }

async function trashFile(query) {
  const hits = (await findFiles(query, { limit: 5 })).filter((h) => !h.dir);
  if (!hits.length) return { ok: false, reason: 'notfound' };
  const f = hits[0];
  const others = hits.slice(1).map((h) => '  • ' + h.path).join('\n');
  const yes = await confirm('Mandar a la papelera', `¿Mando este archivo a la Papelera de reciclaje?`,
    `${f.path}\n\nNo se borra para siempre: lo puedes recuperar desde la Papelera.` + (others ? `\n\nOtros parecidos (no se tocan):\n${others}` : ''), 'Mandar a la papelera');
  if (!yes) return { ok: false, cancelled: true };
  await shell.trashItem(f.path);
  return { ok: true, name: f.name };
}

function regSetTheme(light) {
  const v = light ? '1' : '0';
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
  return Promise.all(['AppsUseLightTheme', 'SystemUsesLightTheme'].map((name) => new Promise((res) =>
    execFile('reg.exe', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', v, '/f'], { windowsHide: true }, (err) => res(!err)))));
}

async function changeSetting(kind, value) {
  if (kind === 'dark' || kind === 'light') {
    const yes = await confirm('Cambiar tema', `¿Cambio Windows a modo ${kind === 'dark' ? 'oscuro' : 'claro'}?`,
      'Se cambia el tema de las apps y del sistema. Lo puedes regresar cuando quieras.', 'Cambiar');
    if (!yes) return { ok: false, cancelled: true };
    const r = await regSetTheme(kind === 'light');
    return { ok: r.every(Boolean) };
  }
  if (kind === 'brightness') {
    const v = Math.max(5, Math.min(100, Math.round(value)));
    const yes = await confirm('Cambiar brillo', `¿Pongo el brillo de la pantalla en ${v}%?`, '', 'Cambiar');
    if (!yes) return { ok: false, cancelled: true };
    const ok = await new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=1;Brightness=${v}}) | Out-Null`],
    { windowsHide: true }, (err) => res(!err)));
    return { ok, value: v };
  }
  return { ok: false, reason: 'unknown' };
}

async function installProgram(name) {
  const clean = String(name || '').replace(/[^\p{L}\p{N} .+_-]/gu, '').trim().slice(0, 60);
  if (!clean) return { ok: false, reason: 'empty' };
  const yes = await confirm('Instalar programa', `¿Abro una terminal para instalar «${clean}» con winget?`,
    'En la terminal verás exactamente qué paquete se va a instalar, y winget te pedirá aceptar sus términos. Puedes cerrarla para cancelar.', 'Abrir instalador');
  if (!yes) return { ok: false, cancelled: true };
  // terminal visible (consola propia) para que veas todo lo que hace winget
  spawn('cmd.exe', ['/k', 'winget', 'install', '--interactive', clean], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true, name: clean };
}

// ---------------------------------------------------------------- avisos (monitores)
function startMonitors(config, notify) {
  // CPU y RAM
  let prev = os.cpus().map((c) => c.times);
  const cpuHist = [];
  let cpuWarnAt = 0, ramWarnAt = 0;
  setInterval(() => {
    const now = os.cpus().map((c) => c.times);
    let idle = 0, total = 0;
    now.forEach((t, i) => {
      const p = prev[i] || t;
      const d = (k) => t[k] - p[k];
      const tot = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
      idle += d('idle'); total += tot;
    });
    prev = now;
    const cpu = total ? 100 * (1 - idle / total) : 0;
    cpuHist.push(cpu); if (cpuHist.length > 12) cpuHist.shift();
    const avg = cpuHist.reduce((a1, b1) => a1 + b1, 0) / cpuHist.length;
    const ram = 100 * (1 - os.freemem() / os.totalmem());
    module.exports.lastPerf = { cpu: Math.round(avg), ram: Math.round(ram) };
    if (cpuHist.length >= 12 && avg > 90 && Date.now() - cpuWarnAt > 20 * 60e3) { cpuWarnAt = Date.now(); notify('cpu', { pct: Math.round(avg) }); }
    if (ram > 92 && Date.now() - ramWarnAt > 20 * 60e3) { ramWarnAt = Date.now(); notify('ram', { pct: Math.round(ram) }); }
  }, 5000);

  // Disco C:
  let diskWarnAt = 0;
  const checkDisk = async () => {
    const d = await diskInfo();
    if (d && (d.pctFree < 10 || d.freeGB < 15) && Date.now() - diskWarnAt > 6 * 3600e3) { diskWarnAt = Date.now(); notify('disk', d); }
  };
  setTimeout(checkDisk, 60e3); setInterval(checkDisk, 30 * 60e3);

  // Descargas terminadas
  const pending = new Map();
  try {
    fs.watch(DOWNLOADS, (ev, file) => {
      if (!file || TEMP_DL.test(file) || /^desktop\.ini$/i.test(file) || pending.has(file)) return;
      const p = path.join(DOWNLOADS, file);
      let last = -1, stable = 0, tries = 0;
      const t = setInterval(async () => {
        tries++;
        let st; try { st = await fsp.stat(p); } catch { st = null; }
        if (!st || !st.isFile()) { if (tries > 3) { clearInterval(t); pending.delete(file); } return; }
        if (st.size === last && st.size > 0) stable++; else stable = 0;
        last = st.size;
        if (stable >= 2) {
          clearInterval(t);
          if (Date.now() - st.birthtimeMs < 10 * 60e3) notify('download', { name: file, mb: +(st.size / 1048576).toFixed(1) });
          setTimeout(() => pending.delete(file), 30e3);
        }
        if (tries > 400) { clearInterval(t); pending.delete(file); }
      }, 1500);
      pending.set(file, t);
    });
  } catch { /* sin carpeta Descargas */ }

  // USB / unidades nuevas
  const letters = () => 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => { try { return fs.existsSync(l + ':\\'); } catch { return false; } });
  let known = new Set(letters());
  setInterval(() => {
    const cur = new Set(letters());
    for (const l of cur) if (!known.has(l)) notify('usb', { letter: l });
    for (const l of known) if (!cur.has(l)) notify('usbOut', { letter: l });
    known = cur;
  }, 4000);
}

async function diskInfo() {
  try {
    const s = await fsp.statfs('C:\\');
    const free = s.bavail * s.bsize, total = s.blocks * s.bsize;
    return { freeGB: Math.round(free / 1073741824), totalGB: Math.round(total / 1073741824), pctFree: Math.round((100 * free) / total) };
  } catch { return null; }
}

// ---------------------------------------------------------------- despachador
async function run(action, arg, ctx) {
  const { config, win, games } = ctx;
  try {
    switch (action) {
      case 'open': return await openThing(arg, games());
      case 'media': return mediaKey(arg.key, arg.times);
      case 'find': {
        const hits = await findFiles(arg);
        if (hits.length) shell.showItemInFolder(hits[0].path);
        return { ok: hits.length > 0, hits: hits.map((h) => ({ name: h.name, path: h.path, dir: h.dir })) };
      }
      case 'screenshot': return await screenshot(win);
      case 'openShots': await shell.openPath(path.join(PICTURES, 'Capri')); return { ok: true };
      case 'disk': return { ok: true, ...(await diskInfo()) };
      case 'perf': return { ok: true, ...(module.exports.lastPerf || { cpu: 0, ram: Math.round(100 * (1 - os.freemem() / os.totalmem())) }) };
      case 'organize': return await organizeDownloads();
      case 'undoOrganize': return await undoOrganize();
      case 'trash': return locked(config) ? { ok: false, locked: true } : await trashFile(arg);
      case 'setting': return locked(config) ? { ok: false, locked: true } : await changeSetting(arg.kind, arg.value);
      case 'install': return locked(config) ? { ok: false, locked: true } : await installProgram(arg);
      default: return { ok: false, reason: 'unknown' };
    }
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e && e.message || e) };
  }
}

module.exports = { run, startMonitors, findFiles, lastPerf: null };
