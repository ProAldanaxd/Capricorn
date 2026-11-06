'use strict';
// =====================================================================
//  Stream de la pantalla principal, compartido por "Grabar pantalla" y "Ver pantalla".
//  Es como compartir pantalla en una llamada: lo dibuja la tarjeta de video a 1-2 cuadros
//  por segundo, y de ahí se copian cuadros a un canvas cuando hacen falta. Así no se traba
//  la pantalla (antes cada foto era una captura completa nueva).
//  El permiso lo da el proceso principal (recorder.js) solo mientras graba o ve la pantalla.
// =====================================================================
(() => {
  let stream = null, video = null, opening = null;
  const owners = new Set(); // quién lo está usando: 'rec', 'view'

  async function open() {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 2, max: 5 } }, audio: false });
    const v = document.createElement('video');
    v.muted = true; v.srcObject = s;
    await v.play().catch(() => {});
    if (!v.videoWidth) await new Promise((r) => { v.onloadedmetadata = r; setTimeout(r, 2000); });
    s.getVideoTracks()[0].addEventListener('ended', () => { if (stream === s) { stream = null; video = null; } });
    stream = s; video = v;
    return v;
  }
  async function acquire(owner) {
    owners.add(owner);
    if (video) return true;
    try { if (!opening) opening = open().finally(() => { opening = null; }); await opening; return true; }
    catch (e) { owners.delete(owner); console.warn('stream de pantalla', e); return false; }
  }
  function release(owner) {
    owners.delete(owner);
    if (owners.size || !stream) return;
    stream.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
    stream = null; video = null;
  }
  // cuadro actual -> canvas (rect en px de la ventana, o null = toda la pantalla), máx. maxW de ancho
  function frame(rect, maxW, canvas = document.createElement('canvas')) {
    const v = video;
    if (!v || !v.videoWidth) return null;
    const k = v.videoWidth / innerWidth; // px del video por px de la ventana
    const r = rect ? { x: rect.x * k, y: rect.y * k, w: rect.width * k, h: rect.height * k } : { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight };
    const scale = Math.min(1, maxW / r.w);
    canvas.width = Math.max(2, Math.round(r.w * scale)); canvas.height = Math.max(2, Math.round(r.h * scale));
    canvas.getContext('2d').drawImage(v, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  // foto chiquita para comparar si la pantalla cambió
  const smallCv = document.createElement('canvas');
  smallCv.width = 48; smallCv.height = 27;
  function thumb(canvas) {
    const g = smallCv.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0, 48, 27);
    return g.getImageData(0, 0, 48, 27).data;
  }

  window.capriScreenCap = { acquire, release, frame, thumb, isOpen: () => !!video };

  // para "Ver pantalla": el proceso principal pide los cuadros con executeJavaScript
  // -> { b64: JPEG en base64, small: [48x27 RGBA] } o null
  const viewCv = document.createElement('canvas');
  window.capriScreenGrab = async (maxW = 1280) => {
    if (!video && !(await acquire('view'))) return null;
    owners.add('view');
    const c = frame(null, maxW, viewCv);
    if (!c) return null;
    return { b64: c.toDataURL('image/jpeg', 0.7).split(',')[1], small: Array.from(thumb(c)) };
  };
  window.capriScreenRelease = () => release('view');
})();
