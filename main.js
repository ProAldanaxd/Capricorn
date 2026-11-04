// Capri - mascota de escritorio (fan-made)
// Ventana transparente del tamaño del área de trabajo, siempre encima y que deja
// pasar los clics excepto cuando el cursor está sobre Capri.
const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let state = { following: false, sleeping: false, scale: 0.75 };

function send(action) {
  if (win && !win.isDestroyed()) win.webContents.send('action', action);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Capri', enabled: false },
    { type: 'separator' },
    { label: 'Hablar', click: () => send('talk') },
    { label: 'Bailar', click: () => send('dance') },
    { label: 'Mirar el cielo', click: () => send('sky') },
    { label: 'Teletransportarse', click: () => send('teleport') },
    { label: 'Seguir mi cursor', type: 'checkbox', checked: state.following, click: () => send('follow') },
    { label: state.sleeping ? 'Despertar' : 'Dormir', click: () => send(state.sleeping ? 'wake' : 'sleep') },
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
  win.loadFile('index.html', process.env.CAPRI_DEMO ? { query: { demo: process.env.CAPRI_DEMO } } : undefined);
  win.webContents.on('did-finish-load', sendFloor);
  ipcMain.on('get-floor', sendFloor);

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
  createWindow();
  tray = new Tray(trayIcon());
  tray.setToolTip('Capri');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => send('talk'));
});

app.on('window-all-closed', () => app.quit());

