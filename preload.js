const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('capri', {
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onAction: (cb) => ipcRenderer.on('action', (_e, a) => cb(a)),
  onFloor: (cb) => { ipcRenderer.on('floor', (_e, y) => cb(y)); ipcRenderer.send('get-floor'); },
  // entorno: config, app en primer plano, tiempo AFK y clima
  onEnv: (h) => {
    ipcRenderer.on('config', (_e, c) => h.config && h.config(c));
    ipcRenderer.on('app', (_e, a) => h.app && h.app(a));
    ipcRenderer.on('idle', (_e, s) => h.idle && h.idle(s));
    ipcRenderer.on('weather', (_e, w) => h.weather && h.weather(w));
    ipcRenderer.send('get-env');
  },
  // poderes: órdenes al proceso principal y avisos de vuelta
  cmd: (action, arg) => ipcRenderer.invoke('cmd', action, arg),
  focusInput: (on) => ipcRenderer.send('focus-input', on),
  onNotify: (cb) => ipcRenderer.on('notify', (_e, kind, data) => cb(kind, data)),
  // IA (Gemini): la clave y las llamadas viven en el proceso principal
  ai: {
    ask: (kind, text, ctx) => ipcRenderer.invoke('ai-ask', kind, text, ctx),
    status: () => ipcRenderer.invoke('ai-status'),
    setKey: (k) => ipcRenderer.invoke('ai-setkey', k),
    onState: (cb) => ipcRenderer.on('ai-state', (_e, s) => cb(s)),
    onExpress: (cb) => ipcRenderer.on('express', (_e, a) => cb(a)),
  },
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  showMenu: (s) => ipcRenderer.send('show-menu', s),
  sendState: (s) => ipcRenderer.send('state', s),
});
