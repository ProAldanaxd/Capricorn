const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('capri', {
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onAction: (cb) => ipcRenderer.on('action', (_e, a) => cb(a)),
  onFloor: (cb) => { ipcRenderer.on('floor', (_e, y) => cb(y)); ipcRenderer.send('get-floor'); },
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  showMenu: (s) => ipcRenderer.send('show-menu', s),
  sendState: (s) => ipcRenderer.send('state', s),
});
