'use strict';
// =====================================================================
//  "Grabar pantalla" (proceso principal): solo lleva el estado y le da permiso a la
//  ventana de abrir un stream de la pantalla principal (como compartir pantalla en una
//  llamada, a 1-2 cuadros por segundo). Las fotos, el recorte y la hoja de cuadros los
//  hace recording.js en la ventana, con la tarjeta de video: así no se traba la pantalla.
//  Todo vive en memoria: no se guarda ningún archivo.
// =====================================================================
const { desktopCapturer, screen: displays, session } = require('electron');

let on = false;
let hooks = null; // { onChange(on), allow() -> ¿se puede abrir el stream?, log }

function setup(h) {
  hooks = h;
  // la ventana pide la pantalla con getDisplayMedia: solo se concede mientras se graba
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    if (!(hooks.allow ? hooks.allow() : on)) { cb({}); return; }
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      const d = displays.getPrimaryDisplay();
      const src = sources.find((x) => String(x.display_id) === String(d.id)) || sources[0];
      cb(src ? { video: src } : {});
    }).catch(() => cb({}));
  });
}
function start(kind) {
  if (on) return false;
  on = true; hooks.onChange(true); hooks.log((kind === 'captura' ? 'captura' : 'grabar') + ': empezó');
  return true;
}
function stop(info) {
  if (!on) return false;
  on = false; hooks.onChange(false);
  hooks.log(info === 'captura' ? 'captura: lista' : 'grabar: terminó' + (info ? ' (' + info + ')' : ''));
  return true;
}

module.exports = { setup, start, stop, isOn: () => on };
