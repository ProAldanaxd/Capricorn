// Capri - mascota de escritorio (fan-made)
// Ventana transparente del tamaño del área de trabajo, siempre encima y que deja
// pasar los clics excepto cuando el cursor está sobre Capri.
const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage, powerMonitor, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const apps = require('./apps');
const powers = require('./powers');
const ai = require('./ai');
const claude = require('./claude');
const antigravity = require('./antigravity');
const gemini = require('./gemini');
const hooks = require('./hooks');
const images = require('./images');
const screenWatch = require('./screen');
const recorder = require('./recorder');
// portapapeles: cuándo se copió la última imagen (para ofrecer adjuntar la captura recién tomada)
const clip = { imageAt: 0, ownUntil: 0 };

// ---------- configuración (config.json, editable a mano) ----------
const DEFAULT_CONFIG = {
  ciudad: 'Guadalajara', latitud: 20.6597, longitud: -103.3496, zonaHoraria: 'America/Mexico_City',
  clima: true, reaccionarAApps: true, esconderseEnJuegos: true, minutosParaRecordarDescanso: 120, minutosAFKParaDormir: 5,
  avisos: true, atajoPedirleAlgo: 'Ctrl+Alt+C', atajoGrabar: 'Ctrl+Alt+R', atajoCaptura: 'Ctrl+Alt+S', desbloquearAccionesPeligrosas: false,
  ia: true, modeloIA: 'gemini-3.6-flash', comentariosIA: true, segundosEntreComentariosIA: 150, desbloquearComandos: false,
  ollama: true, modeloOllama: 'llama3.2:3b', segundosEntreComentariosOllama: 60,
  claudeDarEnter: true, carpetaClaudeCode: '',
};
let config = DEFAULT_CONFIG;
try { config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')) }; } catch { /* usa valores por defecto */ }
let aiState = null; // { ollama, modeloOllama, routes } — se carga cuando la app está lista (necesita userData)
let ollamaOnline = false;
let ollamaModelList = [];
let ollamaVisionList = []; // los modelos instalados que entienden imágenes (para Ver pantalla)
async function refreshOllamaModels() { ollamaModelList = await ai.ollamaModels(); ollamaVisionList = await ai.ollamaVisionModels(ollamaModelList); }
// el modelo de visión que se usa: el elegido si está instalado; si no, el primero que haya
const visionModel = () => (ollamaVisionList.includes(aiState.modeloVision) ? aiState.modeloVision : ollamaVisionList[0] || null);
// ¿quien "ve" está listo? (Gemini con su clave, u Ollama encendido con un modelo de visión)
const visionReady = () => (aiState.routes.vision === 'ollama' ? !!(aiState.ollama && ollamaOnline && visionModel()) : ai.hasKey());
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
  if (on) { ollamaOnline = await ai.startOllama(); if (ollamaOnline) await refreshOllamaModels(); }
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
// Mientras graba o ve tu pantalla, la ventana de Capri no sale en las capturas
// (Windows la excluye; tú la sigues viendo normal).
function updateCaptureHiding() {
  if (!win || win.isDestroyed()) return;
  try { win.setContentProtection(recorder.isOn() || screenWatch.isOn()); } catch { /* no soportado */ }
}
// Grabar pantalla: si está grabando, detiene; si no, la ventana te deja elegir la sección
function toggleRecording() {
  send(recorder.isOn() ? 'rec-stop' : 'rec-select'); // la que graba es la ventana (recording.js)
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
          {
            label: 'Modelo para ver pantalla', enabled: !!aiState.ollama,
            submenu: ollamaVisionList.length ? ollamaVisionList.map((m) => ({ label: m, type: 'radio', checked: m === visionModel(),
              click: () => { aiState.modeloVision = m; ai.saveState(aiState); send('vision-model:' + m); } }))
              : [{ label: 'Ninguno instalado (ollama pull ' + aiState.modeloVision + ')', enabled: false }],
          },
        ],
      },
      { type: 'separator' },
      { label: 'Qué hace cada IA', enabled: false },
      job('comentarios', 'Comentarios espontáneos', {}, 'Ninguna'),
      job('platica', 'Plática', {}),
      job('herramientas', 'Herramientas', {}, 'Ninguna'),
      // quién "ve" en Ver pantalla (sin "Ninguna": para ver hace falta alguien)
      {
        label: 'Ver pantalla',
        submenu: [
          { label: 'Gemini' + note('gemini'), type: 'radio', checked: aiState.routes.vision !== 'ollama', click: () => setRoute('vision', 'gemini') },
          { label: 'Ollama (local' + (visionModel() ? ': ' + visionModel() : ', sin modelo de visión') + ')' + note('ollama'), type: 'radio',
            checked: aiState.routes.vision === 'ollama', click: () => setRoute('vision', 'ollama') },
        ],
      },
    ],
  };
}

function buildMenu() { return Menu.buildFromTemplate(menuTemplate()); } // menú nativo (ícono junto al reloj)

// Menú con estilo de Capri: se manda como datos a la ventana y los clics regresan por id.
let menuHandlers = new Map();
function serializeMenu(items) {
  menuHandlers = new Map();
  let n = 0;
  const walk = (list) => list.map((it) => {
    if (it.type === 'separator') return { type: 'separator' };
    const id = 'm' + n++;
    if (it.click) menuHandlers.set(id, it.click);
    return { id, label: it.label, type: it.type || 'normal', checked: !!it.checked, enabled: it.enabled !== false,
      accelerator: it.accelerator || '', submenu: it.submenu ? walk(it.submenu) : null };
  });
  // el título "Capri" ya lo pone el menú con estilo (CAPRI://MENU)
  while (items.length && (items[0].type === 'separator' || (items[0].label === 'Capri' && items[0].enabled === false))) items = items.slice(1);
  return walk(items);
}

// Claude: empezar conversación nueva y elegir sesión de Claude Code
function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return 'hace ' + m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return 'hace ' + Math.round(h / 24) + ' d';
}
function claudeMenu() {
  const cur = claude.current();
  const sessions = claude.listCodeSessions(10);
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  return {
    label: 'Claude',
    submenu: [
      { label: 'Chat nuevo con Claude', click: () => { claude.reset('chat'); send('claude-reset:chat'); } },
      { label: 'Sesión nueva de Claude Code', click: () => { claude.reset('code'); send('claude-reset:code'); } },
      { type: 'separator' },
      {
        label: 'Sesiones de Claude Code',
        submenu: sessions.length ? sessions.map((s) => ({
          label: short(s.title, 34) + '  ·  ' + (/scratch-workspaces/i.test(s.cwd) ? 'temporal' : short(path.basename(s.cwd) || '?', 18)) + '  ·  ' + ago(s.last),
          type: 'radio', checked: cur.code === s.id,
          click: () => { claude.pickCodeSession(s.id, s.title); send('claude-pick:' + s.title); },
        })) : [{ label: 'No encontré sesiones', enabled: false }],
      },
    ],
  };
}

// Gemini en el navegador: chat nuevo (los chats viven en tu cuenta de Google, no se pueden listar)
function geminiMenu() {
  const cur = gemini.current();
  return {
    label: 'Gemini (navegador)',
    submenu: [
      { label: 'Chat nuevo', click: () => { gemini.reset(); send('gem-reset'); } },
      { label: cur.url ? 'Chat actual: ' + cur.url.replace(/^https?:\/\//, '').slice(0, 40) : 'Sin chat todavía', enabled: false },
    ],
  };
}

// Antigravity: conversación nueva y elegir una de las guardadas
function antigravityMenu() {
  const cur = antigravity.current();
  const convs = antigravity.listConversations(10);
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  return {
    label: 'Antigravity',
    submenu: [
      { label: 'Conversación nueva', click: () => { antigravity.reset(); send('ag-reset'); } },
      { type: 'separator' },
      {
        label: 'Conversaciones',
        submenu: convs.length ? convs.map((c) => ({
          label: short(c.title, 40) + (c.last ? '  ·  ' + ago(c.last) : ''),
          type: 'radio', checked: cur.id === c.id,
          click: () => { antigravity.pick(c.id, c.title); send('ag-pick:' + c.title); },
        })) : [{ label: 'Todavía no hay conversaciones', enabled: false }],
      },
    ],
  };
}

function menuTemplate() {
  return ([
    { label: 'Capri', enabled: false },
    { type: 'separator' },
    { label: 'Pedirle algo…', accelerator: config.atajoPedirleAlgo, click: () => send('ask') },
    // después de enviarle algo a Claude, minimizar su ventana (apagado por defecto)
    { label: 'Ventanas', type: 'checkbox', checked: !!aiState.ventanas,
      click: () => { aiState.ventanas = !aiState.ventanas; ai.saveState(aiState); send('ventanas:' + (aiState.ventanas ? 'on' : 'off')); } },
    {
      label: 'Pantalla',
      submenu: [
        // captura de una sección (o toda la pantalla), directo a su cuadro de texto
        { label: 'Tomar captura…', accelerator: config.atajoCaptura || 'Ctrl+Alt+S', click: () => send('shot-select') },
        // grabar una sección (o toda la pantalla) y mandársela a Claude / Antigravity como hoja de cuadros
        { label: recorder.isOn() ? 'Detener grabación' : 'Grabar pantalla…', accelerator: config.atajoGrabar || 'Ctrl+Alt+R', click: toggleRecording },
        // Capri ve tu pantalla mientras está encendido; siempre arranca apagado
        { label: 'Ver pantalla', type: 'checkbox', checked: screenWatch.isOn(),
          click: () => {
            if (screenWatch.isOn()) { screenWatch.stop(); send('screen:off'); return; }
            if (!visionReady()) { send(aiState.routes.vision === 'ollama' ? (aiState.ollama && ollamaOnline ? 'screen:nomodel:' + aiState.modeloVision : 'screen:noollama') : 'screen:nokey'); return; }
            screenWatch.start(); send('screen:on:' + (aiState.routes.vision === 'ollama' ? 'ollama' : 'gemini'));
          } },
      ],
    },
    claudeMenu(),
    geminiMenu(),
    antigravityMenu(),
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
    // cierra y vuelve a abrir Capri (sirve para cargar cambios del código o de config.json)
    { label: 'Reiniciar', click: () => { app.relaunch(); app.quit(); } },
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
  // pasarle el texto a la app de Claude (chat o Claude Code) y darle Enter
  ipcMain.handle('claude-reset', (_e, target) => {
    if (target === 'ag') antigravity.reset(); else if (target === 'gemini') gemini.reset(); else claude.reset(target === 'code' ? 'code' : 'chat');
    return true;
  });
  // con imágenes: se guardan un momento en la carpeta temporal y se pegan antes del texto.
  // Mientras Capri usa el portapapeles, lo que copie ella no cuenta como "captura nueva".
  const withImages = async (imgs, fn) => {
    const files = images.saveTemp(imgs);
    if (files.length) clip.ownUntil = Date.now() + 120000;
    try { return await fn(files); }
    finally { if (files.length) { clip.ownUntil = Date.now() + 3000; images.cleanup(files); } }
  };
  ipcMain.handle('ag-send', (_e, text, imgs) => withImages(imgs, (files) =>
    antigravity.safeSend(text, config, { minimize: !!aiState.ventanas, images: files })));
  ipcMain.handle('gem-send', (_e, text, imgs) => withImages(imgs, (files) =>
    gemini.safeSend(text, config, { minimize: !!aiState.ventanas, images: files })));
  ipcMain.handle('claude-send', (_e, target, text, imgs) => withImages(imgs, (files) =>
    claude.safeSend(target === 'code' ? 'code' : 'chat', text, config, { minimize: !!aiState.ventanas, images: files })));
  // ¿se copió una imagen hace menos de un minuto? (la avisa watcher.ps1)
  ipcMain.handle('recent-image', () => {
    const age = Date.now() - clip.imageAt;
    return clip.imageAt && age < 60000 ? age : null;
  });

  // ---------- IA: proveedores y trabajos ----------
  ipcMain.handle('ai-status', () => aiInfo());
  ipcMain.handle('ai-setkey', async (_e, key) => { const r = await ai.setKey(key); pushAiState(); return r; });
  ipcMain.handle('ai-ask', async (_e, kind, text, ctx) => {
    const aenv = {
      config, state: aiState, available, powersCtx,
      express: (a) => { if (win && !win.isDestroyed()) win.webContents.send('express', a); },
    };
    // viendo la pantalla: tu pregunta va con una foto nueva
    if (kind === 'chat' && screenWatch.isOn()) { aenv.screen = await screenWatch.snapshot(); aenv.visionModel = visionModel(); }
    const r = kind === 'event' ? await ai.event(text, ctx, aenv) : await ai.chat(text, ctx, aenv);
    if (!r.ok && r.provider === 'ollama' && (r.error === 'network' || r.error === 'timeout')) ollamaOnline = await ai.ollamaUp(); // ¿se cayó?
    pushAiState();
    return r;
  });
  ipcMain.on('ollama-unload', () => { if (aiState.ollama && ollamaOnline) { ai.unloadOllama(aiState.modeloOllama); const v = visionModel(); if (v) ai.unloadOllama(v); } });

  // Ollama: encenderlo si está activado, y revisar cada minuto si sigue vivo
  if (aiState.ollama) ai.startOllama().then(async (up) => { ollamaOnline = up; if (up) await refreshOllamaModels(); pushAiState(); });
  win.webContents.on('did-finish-load', () => setTimeout(pushAiState, 500)); // la ventana tarda en cargar
  setInterval(async () => {
    pushAiState(); // refresca si un proveedor salió de su pausa por cuota
    if (!aiState.ollama) return;
    const up = await ai.ollamaUp();
    if (up !== ollamaOnline) { ollamaOnline = up; if (up) await refreshOllamaModels(); pushAiState(); } else if (up) await refreshOllamaModels(); // por si descargaste un modelo
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
    }, (kind) => { if (kind === 'image' && Date.now() > clip.ownUntil) clip.imageAt = Date.now(); });
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

ipcMain.on('show-menu', (_e, s, x, y) => {
  state = { ...state, ...s };
  if (win && !win.isDestroyed()) win.webContents.send('menu', serializeMenu(menuTemplate()), x, y);
});
ipcMain.on('menu-click', (_e, id) => {
  const h = menuHandlers.get(id);
  if (process.env.CAPRI_DEBUG) console.log('[menú] clic', id, h ? 'ok' : 'sin handler');
  if (h) Promise.resolve().then(() => h()).catch((e) => claude.log('menú: error ' + String(e && e.stack || e).slice(0, 300)));
});
// mientras el menú está abierto, la ventana atrapa todos los clics (para cerrarlo al hacer clic afuera)
ipcMain.on('menu-open', (_e, open) => {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!open, { forward: true });
  win.setFocusable(!!open);
  if (open) { win.focus(); win.webContents.focus(); } else win.blur();
});

ipcMain.on('state', (_e, s) => {
  state = { ...state, ...s };
  if (tray) tray.setContextMenu(buildMenu());
});

app.whenReady().then(() => {
  aiState = ai.loadState(config);
  createWindow();
  // permisos, preguntas y botones de Claude Code -> Capri (ver hooks.js)
  // nombres de sesiones/conversaciones, guardados un rato (los hooks llegan en cada herramienta)
  const titles = new Map(); // 'src:id' -> { t, at }
  const sessionTitle = (src, id) => {
    if (!id) return '';
    const k = src + ':' + id, c = titles.get(k);
    if (c && Date.now() - c.at < (c.t ? 10 * 60000 : 30000)) return c.t;
    let t = '';
    try {
      if (src === 'ag') { const x = antigravity.listConversations(200).find((r) => r.id === id); t = x ? x.title : ''; }
      else { const s = claude.sessionByCli(id); t = s ? s.title : ''; }
    } catch { /* sin acceso */ }
    titles.set(k, { t, at: Date.now() });
    return t;
  };
  hooks.start({
    userData: app.getPath('userData'),
    getWin: () => win,
    isFront: (id) => !!(env.app && env.app.id === id),
    sessionTitle,
    onAgFocus: () => antigravity.bringToFront(),
    onReply: async (cli, label) => {
      const s = claude.sessionByCli(cli);
      if (!s) { send('hook-reply:nosession'); return; }
      const r = await claude.sendToSession(s.id, label, config, { minimize: !!aiState.ventanas });
      send('hook-reply:' + (r.ok ? r.result : 'error'));
    },
    log: (m) => claude.log('[hooks] ' + m),
  });
  ipcMain.on('prompt-answer', (_e, id, value) => hooks.answer(id, value));
  // "Ver pantalla" (ver screen.js)
  const toWin = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
  const inWin = (js) => (win && !win.isDestroyed() ? win.webContents.executeJavaScript(js, true) : Promise.resolve(null));
  screenWatch.setup({
    grab: (w) => inWin('window.capriScreenGrab(' + Number(w) + ')').catch(() => null),
    release: () => { inWin('window.capriScreenRelease()').catch(() => {}); },
    isPaused: () => !!(env.app && env.app.id === 'game'),
    appName: () => (env.app ? env.app.id : ''),
    canComment: () => config.comentariosIA !== false && aiState.routes.comentarios !== 'none' && visionReady(),
    gapSec: () => Number(config.segundosEntreComentariosPantalla) || 180,
    onStatus: (s) => { updateCaptureHiding(); toWin('screen', s); },
    onComment: async (img) => {
      const r = await ai.screenComment(img, {}, { config, state: aiState, available, visionModel: visionModel(), powersCtx: () => ({ config, win }), express: () => {} });
      if (r.ok) toWin('screen-comment', r.text);
      else if (r.error !== 'nada') claude.log('pantalla: comentario falló (' + r.error + ')');
    },
    log: (m) => claude.log(m),
  });
  app.on('before-quit', () => screenWatch.stop());
  // "Grabar pantalla" (ver recorder.js). Mientras graba, la ventana de Capri no sale en las fotos.
  // el permiso del stream de pantalla solo se da mientras graba o ve la pantalla
  recorder.setup({ onChange: () => updateCaptureHiding(), allow: () => recorder.isOn() || screenWatch.isOn(), log: (m) => claude.log(m) });
  // la ventana avisa cuándo empieza (para darle permiso del stream) y cuándo termina
  ipcMain.handle('rec-start', (_e, kind) => recorder.start(kind));
  ipcMain.on('rec-stop', (_e, info) => recorder.stop(info));
  app.on('before-quit', () => hooks.stop());
  tray = new Tray(trayIcon());
  tray.setToolTip('Capri');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => send('talk'));
  // Atajo global para pedirle algo desde cualquier app
  try { globalShortcut.register(config.atajoPedirleAlgo, () => send('ask')); } catch { /* atajo inválido u ocupado */ }
  // grabar pantalla: el mismo atajo empieza (eliges la sección) y detiene
  try { globalShortcut.register(config.atajoGrabar || 'Ctrl+Alt+R', toggleRecording); } catch { /* atajo inválido u ocupado */ }
  // captura: eliges la sección y queda adjunta en su cuadro
  try { globalShortcut.register(config.atajoCaptura || 'Ctrl+Alt+S', () => send('shot-select')); } catch { /* atajo inválido u ocupado */ }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());

