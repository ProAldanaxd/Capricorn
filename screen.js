'use strict';
// =====================================================================
//  "Ver pantalla": Capri toma fotos de tu pantalla mientras está encendido.
//
//  - Apagado por defecto y no se recuerda: cada vez que abres Capri empieza apagado.
//  - Cada ~15 s toma una foto (en memoria, 1280 px) y la compara con la anterior para
//    saber si cambió algo. NO se guarda ningún archivo.
//  - Las fotos salen del stream de la pantalla que abre la ventana (screencap.js), como
//    compartir pantalla en una llamada: no traban la pantalla.
//  - Cuando le preguntas algo, se toma una foto nueva y va con tu pregunta a la IA que ve.
//  - De vez en cuando (si la pantalla cambió) le pide a la IA un comentario corto.
//  - Se pausa sola en juegos (y cierra el stream mientras juegas).
// =====================================================================
const TICK_MS = 15000;
const WIDTH = 1280;

let on = false, timer = null, busy = false, streamOpen = false;
let lastSmall = null;      // foto chiquita para comparar
let lastAt = 0;            // última foto tomada
let changedSince = false;  // ¿cambió desde el último comentario?
let commentAt = 0;
let hooks = null; // { grab(w) -> {b64, small}|null, release(), isPaused, appName, canComment, onComment, onStatus, gapSec, log }

// diferencia promedio entre dos fotos chiquitas (0 = iguales)
function diff(a, b) {
  if (!a || !b || a.length !== b.length) return 255;
  let s = 0;
  for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return s / (a.length / 4) / 3;
}
async function grab() {
  const r = await hooks.grab(WIDTH);
  if (r) streamOpen = true;
  return r;
}
function closeStream() { if (streamOpen) { streamOpen = false; hooks.release(); } }

async function tick() {
  if (!on || busy) return;
  if (hooks.isPaused()) { closeStream(); hooks.onStatus({ on, paused: true }); return; }
  busy = true;
  try {
    const shot = await grab();
    if (!shot || !on) return;
    const changed = diff(shot.small, lastSmall) > 3;
    lastSmall = shot.small; lastAt = Date.now();
    if (changed) changedSince = true;
    if (process.env.CAPRI_DEBUG) console.log('[pantalla] cambió=' + changed, Math.round(shot.b64.length * 0.75 / 1024) + ' KB');
    hooks.onStatus({ on, at: lastAt, app: hooks.appName() });
    // comentario espontáneo: solo si cambió algo y ya pasó un rato
    if (changedSince && Date.now() - commentAt > hooks.gapSec() * 1000 && hooks.canComment()) {
      commentAt = Date.now(); changedSince = false;
      hooks.onComment(shot.b64);
    }
  } catch (e) { hooks.log('pantalla: ' + String(e && e.message || e)); }
  finally { busy = false; }
}

function setup(h) { hooks = h; }
function start() {
  if (on) return;
  on = true; lastSmall = null; changedSince = false;
  commentAt = Date.now(); // el primer comentario espera un rato
  hooks.log('pantalla: encendida');
  timer = setInterval(tick, TICK_MS);
  tick();
}
function stop() {
  if (!on) return;
  on = false; clearInterval(timer); timer = null; lastSmall = null;
  closeStream();
  hooks.log('pantalla: apagada');
  hooks.onStatus({ on: false });
}
// foto nueva para mandar con tu pregunta (base64 JPEG) o null si está apagado/pausado
async function snapshot() {
  if (!on || hooks.isPaused()) return null;
  try {
    const shot = await grab();
    if (!shot) return null;
    lastAt = Date.now(); hooks.onStatus({ on, at: lastAt, app: hooks.appName() });
    return shot.b64;
  } catch (e) { hooks.log('pantalla: ' + String(e && e.message || e)); return null; }
}

module.exports = { setup, start, stop, snapshot, isOn: () => on };
