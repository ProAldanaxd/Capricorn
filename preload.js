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
  // pasarle texto a la app de Claude: target 'chat' | 'code'
  // images: data URLs de las imágenes pegadas en el cuadro (opcional)
  claudeSend: (target, text, images) => ipcRenderer.invoke('claude-send', target, text, images || []),
  claudeReset: (target) => ipcRenderer.invoke('claude-reset', target),
  // lo mismo con la app de Antigravity
  agSend: (text, images) => ipcRenderer.invoke('ag-send', text, images || []),
  // ¿hay una imagen recién copiada (Win+Shift+S)? -> milisegundos desde que se copió, o null
  recentImage: () => ipcRenderer.invoke('recent-image'),
  // avisos de Claude Code (permisos, preguntas, botones): ver hooks.js
  onPrompt: (cb) => ipcRenderer.on('prompt', (_e, p) => cb(p)),
  onPromptClose: (cb) => ipcRenderer.on('prompt-close', (_e, id) => cb(id)),
  promptAnswer: (id, value) => ipcRenderer.send('prompt-answer', id, value),
  // lo que están haciendo Claude Code / Antigravity (línea debajo de Capri)
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  onNotify:(cb) => ipcRenderer.on('notify', (_e, kind, data) => cb(kind, data)),
  // IA (Gemini): la clave y las llamadas viven en el proceso principal
  ai: {
    ask: (kind, text, ctx) => ipcRenderer.invoke('ai-ask', kind, text, ctx),
    status: () => ipcRenderer.invoke('ai-status'),
    setKey: (k) => ipcRenderer.invoke('ai-setkey', k),
    onState: (cb) => ipcRenderer.on('ai-state', (_e, s) => cb(s)),
    onExpress: (cb) => ipcRenderer.on('express', (_e, a) => cb(a)),
    unloadOllama: () => ipcRenderer.send('ollama-unload'),
  },
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  showMenu: (s, x, y) => ipcRenderer.send('show-menu', s, x, y),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, items, x, y) => cb(items, x, y)),
  menuClick: (id) => ipcRenderer.send('menu-click', id),
  menuOpen: (open) => ipcRenderer.send('menu-open', open),
  sendState: (s) => ipcRenderer.send('state', s),
});
