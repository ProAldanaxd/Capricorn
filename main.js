// Capri - mascota de escritorio (fan-made)
// Ventana transparente del tamaño del área de trabajo, siempre encima y que deja
// pasar los clics excepto cuando el cursor está sobre Capri.
const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage, powerMonitor, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const apps = require('./apps');
const powers = require('./powers');
const ai = require('./ai');

// ---------- configuración (config.json, editable a mano) ----------
const DEFAULT_CONFIG = {
  ciudad: 'Guadalajara', latitud: 20.6597, longitud: -103.3496, zonaHoraria: 'America/Mexico_City',
  clima: true, reaccionarAApps: true, esconderseEnJuegos: true, minutosParaRecordarDescanso: 120, minutosAFKParaDormir: 5,
  avisos: true, atajoPedirleAlgo: 'Ctrl+Alt+C', desbloquearAccionesPeligrosas: false,
  ia: true, modeloIA: 'gemini-3.6-flash', comentariosIA: true, segundosEntreComentariosIA: 150, desbloquearComandos: false,
  ollama: true, modeloOllama: 'llama3.2:3b', segundosEntreComentariosOllama: 60,
};
let config = DEFAULT_CONFIG;
try { config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')) }; } catch { /* usa valores por defecto */ }
let aiState = null; // { ollama, modeloOllama, routes } — se carga cuando la app está lista (necesita userData)
let ollamaOnline = false;
let ollamaModelList = [];
// ¿el proveedor está configurado y conectado? (la cuota la revisa ai.js)
const available = (p) => (p === 'gemini' ? ai.hasKey() : p === 'ollama' ? !!(aiState && aiState.ollama && ollamaOnline) : false);
const aiInfo = () => {
  const st = ai.status();
  return {
    routes: aiState ? aiState.routes : { comentarios: 'none', platica: 'none', herramientas: 'none' },
    avail: { gemini: available('gemini') && !st.down.gemini, ollama: available('ollama') && !st.down.ollama },
    hasKey: ai.hasKey(), comentarios: config.comentariosIA !== false,
    gapSec: config.segundosEntreComentariosIA, gapOllama: config.segundosEntreComentariosOllama,
  };
};
async function setOllama(on) {
  aiState.ollama = on; ai.saveState(aiState);
  if (on) { ollamaOnline = await ai.startOllama(); if (ollamaOnline) ollamaModelList = await ai.ollamaModels(); }
  else { ai.stopOllama(); ollamaOnline = false; }
  pushAiState();
  return ollamaOnline;
}
function setRoute(job, p) {
  aiState.routes[job] = p; ai.saveState(aiState); pushAiState();
  send('route:' + job + ':' + p);
}
function pushAiState() {
  if (win && !win.isDestroyed()) win.webContents.send('ai-state', aiInfo());
  if (tray) tray.setContextMenu(buildMenu());
}

// Último estado conocido de cada fuente, para mandarlo cuando la ventana termina de cargar.
const env = { app: null, weather: null };

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let state = { following: false, sleeping: false, scale: 0.75, moving: true };

function send(action) {
  if (win && !win.isDestroyed()) win.webContents.send('action', action);
}

// ---------- menú "API Keys": arriba las conexiones, abajo qué IA hace cada trabajo ----------
// Para un proveedor nuevo: su "Configurar …" arriba y una entrada en PROVIDER_LABELS.
const PROVIDER_LABELS = { gemini: 'Gemini', ollama: 'Ollama' };
function apiKeysMenu() {
  if (!aiState) return { label: 'API Keys', enabled: false };
  const note = (p) => (p === 'gemini' && !ai.hasKey() ? ' (sin API key)' : p === 'ollama' && !aiState.ollama ? ' (apagado)'
    : p === 'ollama' && !ollamaOnline ? ' (sin conexión)' : '');
  const job = (key, label, extra = {}, noneLabel = 'Ninguna') => ({
    label,
    submenu: [
      ...Object.keys(PROVIDER_LABELS).map((p) => ({
        label: PROVIDER_LABELS[p] + (extra[p] || '') + note(p), type: 'radio', checked: aiState.routes[key] === p, click: () => setRoute(key, p),
      })),
      { label: noneLabel, type: 'radio', checked: aiState.routes[key] === 'none', click: () => setRoute(key, 'none') },
    ],
  });
  const models = ollamaModelList.length ? ollamaModelList : [aiState.modeloOllama];
  return {
    label: 'API Keys',
    submenu: [
      { label: (ai.hasKey() ? 'Cambiar' : 'Configurar') + ' API key de Gemini…', click: () => send('apikey') },
      {
        label: 'Configurar Ollama',
        submenu: [
          {
            label: 'Encendido' + (aiState.ollama && !ollamaOnline ? ' (sin conexión)' : ''), type: 'checkbox', checked: !!aiState.ollama,
            click: async () => { const on = !aiState.ollama; const up = await setOllama(on); send(on ? (up ? 'ollama-on' : 'ollama-fail') : 'ollama-off'); },
          },
          {
            label: 'Modelo', enabled: !!aiState.ollama,
            submenu: models.map((m) => ({ label: m, type: 'radio', checked: m === aiState.modeloOllama,
              click: () => { aiState.modeloOllama = m; ai.saveState(aiState); pushAiState(); send('ollama-model:' + m); } })),
          },
        ],
      },
      { type: 'separator' },
      { label: 'Qué hace cada IA', enabled: false },
      job('comentarios', 'Comentarios espontáneos', {}, 'Ninguna (frases fijas)'),
      job('platica', 'Plática', { gemini: ' (con búsqueda en internet)' }),
      job('herramientas', 'Herramientas', { ollama: ' (experimental)' }, 'Ninguna (solo reglas)'),
    ],
  };
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Capri', enabled: false },
    { type: 'separator' },
    { label: 'Pedirle algo…', accelerator: config.atajoPedirleAlgo, click: () => send('ask') },
    { type: 'separator' },
    apiKeysMenu(),
    {
      label: 'Memoria',
      submenu: [
        { label: 'Ver lo que recuerda', click: () => shell.openPath(ai.ensureMemoryFile()) },
        { label: 'Olvidar esta conversación', click: () => { ai.resetChat(); send('ai-reset'); } },
      ],
    },
    { type: 'separator' },
    { label: 'Moverse por la pantalla', type: 'checkbox', checked: state.moving !== false, click: () => send('move-toggle') },
    { label: 'Seguir mi cursor', type: 'checkbox', checked: state.following, click: () => send('follow') },
    {
      label: 'Acciones',
      submenu: [
        { label: 'Hablar', click: () => send('talk') },
        { label: 'Bailar', click: () => send('dance') },
        { label: 'Mirar el cielo', click: () => send('sky') },
        { label: 'Teletransportarse', click: () => send('teleport') },
        { label: '¿Qué clima hace?', enabled: config.clima, click: () => send('weather') },
        { label: state.sleeping ? 'Despertar' : 'Dormir', click: () => send(state.sleeping ? 'wake' : 'sleep') },
      ],
    },
    {
      label: 'Tamaño',
      submenu: [['Pequeña', 0.55], ['Normal', 0.75], ['Grande', 1.0]].map(([label, v]) => ({
        label,
        type: 'radio',
        checked: Math.abs(state.scale - v) < 0.01,
        click: () => send('scale:' + v),
      })),
    },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]);
}

function trayIcon() {
  // Rombo magenta con "ojos" verdes, generado en memoria (BGRA).
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d <= 7.5) {
        const eye = y === 7 && (x === 5 || x === 10);
        buf[i] = eye ? 0x9b : 0x6d;     // B
        buf[i + 1] = eye ? 0xf5 : 0x2a; // G
        buf[i + 2] = eye ? 0x27 : 0xff; // R
        buf[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// La ventana cubre toda la pantalla (incluida la barra de tareas) para que Capri
// pueda sentarse en el borde de la barra con las piernas colgando.
function sendFloor() {
  if (!win || win.isDestroyed()) return;
  const d = screen.getPrimaryDisplay();
  win.webContents.send('floor', d.workArea.y + d.workArea.height - d.bounds.y);
}
function fitToWorkArea() {
  if (!win) return;
  win.setBounds(screen.getPrimaryDisplay().bounds);
  sendFloor();
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  const query = {};
  if (process.env.CAPRI_DEMO) query.demo = process.env.CAPRI_DEMO;
  if (process.env.CAPRI_ENVTEST) query.envtest = '1';
  if (process.env.CAPRI_CMDTEST) query.cmdtest = process.env.CAPRI_CMDTEST;
  win.loadFile('index.html', Object.keys(query).length ? { query } : undefined);
  win.webContents.on('did-finish-load', sendFloor);
  if (process.env.CAPRI_DEBUG) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
  }
  ipcMain.on('get-floor', sendFloor);
  ipcMain.on('get-env', () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('config', config);
    win.webContents.send('ai-state', aiInfo());
    if (env.app) win.webContents.send('app', env.app);
    if (env.weather) win.webContents.send('weather', env.weather);
  });

  // ---------- poderes: el cuadro de órdenes y los avisos ----------
  const powersCtx = () => ({ config, win, games: () => apps.loadedGames() });
  ipcMain.handle('cmd', (_e, action, arg) => powers.run(action, arg, powersCtx()));

  // ---------- IA: proveedores y trabajos ----------
  ipcMain.handle('ai-status', () => aiInfo());
  ipcMain.handle('ai-setkey', async (_e, key) => { const r = await ai.setKey(key); pushAiState(); return r; });
  ipcMain.handle('ai-ask', async (_e, kind, text, ctx) => {
    const aenv = {
      config, state: aiState, available, powersCtx,
      express: (a) => { if (win && !win.isDestroyed()) win.webContents.send('express', a); },
    };
    const r = kind === 'event' ? await ai.event(text, ctx, aenv) : await ai.chat(text, ctx, aenv);
    if (!r.ok && r.provider === 'ollama' && (r.error === 'network' || r.error === 'timeout')) ollamaOnline = await ai.ollamaUp(); // ¿se cayó?
    pushAiState();
    return r;
  });
  ipcMain.on('ollama-unload', () => { if (aiState.ollama && ollamaOnline) ai.unloadOllama(aiState.modeloOllama); });

  // Ollama: encenderlo si está activado, y revisar cada minuto si sigue vivo
  if (aiState.ollama) ai.startOllama().then(async (up) => { ollamaOnline = up; if (up) ollamaModelList = await ai.ollamaModels(); pushAiState(); });
  win.webContents.on('did-finish-load', () => setTimeout(pushAiState, 500)); // la ventana tarda en cargar
  setInterval(async () => {
    pushAiState(); // refresca si un proveedor salió de su pausa por cuota
    if (!aiState.ollama) return;
    const up = await ai.ollamaUp();
    if (up !== ollamaOnline) { ollamaOnline = up; if (up) ollamaModelList = await ai.ollamaModels(); pushAiState(); }
  }, 60000);
  app.on('before-quit', () => ai.stopOllama());
  ipcMain.on('focus-input', (_e, on) => {
    if (!win || win.isDestroyed()) return;
    win.setFocusable(!!on);
    if (on) { win.focus(); win.webContents.focus(); }
    else { win.blur(); }
  });
  if (config.avisos) powers.startMonitors(config, (kind, data) => {
    if (win && !win.isDestroyed()) win.webContents.send('notify', kind, data);
  });

  // App en primer plano (incluye juegos de Steam/Epic)
  if (!config.reaccionarAApps) apps.loadGames();
  if (config.reaccionarAApps) {
    const watcher = apps.startWatcher(__dirname, (info) => {
      env.app = info;
      if (win && !win.isDestroyed()) win.webContents.send('app', info);
    });
    app.on('before-quit', () => watcher.stop());
  }

  // Tiempo sin tocar mouse/teclado (para AFK y recordatorios de descanso)
  setInterval(() => {
    if (win && !win.isDestroyed()) win.webContents.send('idle', powerMonitor.getSystemIdleTime());
  }, 5000);

  // Clima (Open-Meteo: gratis, sin clave; solo se manda la latitud/longitud de config.json)
  if (config.clima) {
    const fetchWeather = async () => {
      try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + config.latitud + '&longitude=' + config.longitud +
          '&current=temperature_2m,apparent_temperature,weather_code,is_day,precipitation,wind_speed_10m' +
          '&timezone=' + encodeURIComponent(config.zonaHoraria);
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const c = (await r.json()).current;
        env.weather = { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, isDay: !!c.is_day,
          precip: c.precipitation, wind: c.wind_speed_10m, city: config.ciudad, at: Date.now() };
        if (process.env.CAPRI_DEBUG) console.log('[clima]', JSON.stringify(env.weather));
        if (win && !win.isDestroyed()) win.webContents.send('weather', env.weather);
        setTimeout(fetchWeather, 30 * 60 * 1000);
      } catch {
        setTimeout(fetchWeather, 10 * 60 * 1000); // sin internet: reintenta en 10 min
      }
    };
    setTimeout(fetchWeather, 4000);
  }

  // Posición global del cursor (funciona aunque el mouse esté sobre otras apps).
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 30);

  // Al arrancar con Windows el escritorio todavía no está listo: reajustar a la pantalla y
  // volver al frente unos segundos después, por si la ventana quedó mal ubicada o detrás.
  const reassert = () => {
    if (!win || win.isDestroyed()) return;
    fitToWorkArea();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
  };
  for (const ms of [3000, 10000, 30000, 60000]) setTimeout(reassert, ms);

  screen.on('display-metrics-changed', fitToWorkArea);
  screen.on('display-added', fitToWorkArea);
  screen.on('display-removed', fitToWorkArea);
}

ipcMain.on('set-ignore', (_e, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on('show-menu', (_e, s) => {
  state = { ...state, ...s };
  buildMenu().popup({ window: win });
});

ipcMain.on('state', (_e, s) => {
  state = { ...state, ...s };
  if (tray) tray.setContextMenu(buildMenu());
});

app.whenReady().then(() => {
  aiState = ai.loadState(config);
  createWindow();
  tray = new Tray(trayIcon());
  tray.setToolTip('Capri');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => send('talk'));
  // Atajo global para pedirle algo desde cualquier app
  try { globalShortcut.register(config.atajoPedirleAlgo, () => send('ask')); } catch { /* atajo inválido u ocupado */ }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());

