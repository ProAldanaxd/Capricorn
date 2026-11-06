'use strict';
// =====================================================================
//  "Grabar pantalla" (lado de la ventana):
//   1) eliges la sección arrastrando (o Enter = toda la pantalla, Esc = cancelar)
//   2) mientras graba, junto a Capri sale "■ 0:12": clic (o Ctrl+Alt+R) para detener
//   3) al terminar arma la hoja de cuadros y la adjunta al cuadro de "Pedirle algo"
//  Graba aquí mismo con un stream de la pantalla (getDisplayMedia); recorder.js solo da
//  el permiso y lleva el estado. Usa funciones de renderer.js.
// =====================================================================
(() => {
  // ---------------------------------------------------------------- elegir sección
  const sel = document.getElementById('rec-select');
  const selBox = sel.querySelector('.box');
  let selecting = false, start = null, selMode = 'rec'; // 'rec' = grabar · 'shot' = captura
  const selHint = sel.querySelector('.hint');

  function openSelect(mode = 'rec') {
    if (selecting) return;
    selecting = true; start = null; selMode = mode;
    selBox.style.display = 'none';
    const what = mode === 'shot' ? 'capturo' : 'grabo';
    selHint.textContent = `Arrastra para elegir qué ${what} · Enter = toda la pantalla · Esc = cancelar`;
    sel.classList.add('show');
    window.capriSelecting = true; // la ventana atrapa todos los clics y teclas (como con el menú)
    api.menuOpen(true);
    say(`Arrastra para elegir qué ${what}. Enter = toda la pantalla, Esc = cancelar.`, 4, { badge: 'LOCAL', user: true });
  }
  function closeSelect() {
    selecting = false; start = null;
    sel.classList.remove('show');
    window.capriSelecting = false;
    api.menuOpen(false);
    if (window.capriResyncIgnore) window.capriResyncIgnore();
  }
  function begin(rect) {
    closeSelect();
    // un respiro para que el velo desaparezca antes de la primera foto
    const mode = selMode;
    setTimeout(() => (mode === 'shot' ? takeShot(rect) : startCapture(rect)), 150);
  }
  const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
  sel.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); if (e.button !== 0) return; start = { x: e.clientX, y: e.clientY }; });
  sel.addEventListener('mousemove', (e) => {
    e.stopPropagation();
    if (!start) return;
    const r = rectOf(start, { x: e.clientX, y: e.clientY });
    Object.assign(selBox.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' });
  });
  sel.addEventListener('mouseup', (e) => {
    e.stopPropagation();
    if (!start) return;
    const r = rectOf(start, { x: e.clientX, y: e.clientY });
    begin(r.width > 12 && r.height > 12 ? r : null); // clic sin arrastrar = toda la pantalla
  });
  addEventListener('keydown', (e) => {
    if (!selecting) return;
    // que la tecla no le llegue al cuadro de texto (si estaba abierto)
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'Escape') { closeSelect(); say(selMode === 'shot' ? 'Ok, sin captura.' : 'Ok, no grabo nada.', 2, { user: true }); }
    else if (e.key === 'Enter') begin(null);
  }, true);

  // ---------------------------------------------------------------- grabar (stream de la pantalla)
  // Como compartir pantalla en una llamada: un stream a 1-2 cuadros por segundo que dibuja
  // la tarjeta de video. Cada segundo se copia un cuadro (recortado a tu sección) y solo
  // se guarda si algo cambió.
  const EVERY_MS = 1000, MAX_SECS = 120, MAX_KEEP = 80, CELL_W = 960;
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  let cap = null; // { rect, started, frames:[{dataUrl,t}], lastSmall, last, timer, big }
  const SC = window.capriScreenCap; // el stream compartido (screencap.js)

  function diff(a, b) {
    if (!a || !b || a.length !== b.length) return 255;
    let s = 0;
    for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return s / (a.length / 4) / 3;
  }
  async function startCapture(rect) {
    if (cap) return;
    if (!(await api.recStart())) return;
    if (!(await SC.acquire('rec'))) { api.recStop('sin permiso'); say('No pude abrir la pantalla para grabar.', 3, { user: true }); return; }
    cap = { rect, started: performance.now(), frames: [], lastSmall: null, last: null, big: document.createElement('canvas'), timer: null };
    cap.timer = setInterval(grabFrame, EVERY_MS);
    setRecording(true, 0);
    setTimeout(grabFrame, 300);
  }
  function grabFrame() {
    if (!cap) return;
    if (!SC.isOpen()) { stopCapture(); return; } // Windows cortó el stream
    const secs = (performance.now() - cap.started) / 1000;
    if (secs >= MAX_SECS) { stopCapture(); return; }
    if (!SC.frame(cap.rect, CELL_W, cap.big)) return;
    const px = SC.thumb(cap.big);
    cap.last = { t: secs };
    if (!cap.frames.length || diff(px, cap.lastSmall) > 2.5) {
      cap.frames.push({ t: secs, dataUrl: cap.big.toDataURL('image/jpeg', 0.85) });
      cap.lastSmall = px;
      if (cap.frames.length > MAX_KEEP) cap.frames = cap.frames.filter((_, i) => i % 2 === 0 || i === cap.frames.length - 1);
      cap.last.saved = true;
    }
    setRecording(true, secs);
  }
  // ---------------------------------------------------------------- captura (una sola foto)
  // A resolución completa y en PNG (el texto se lee nítido), directo al cuadro de "Pedirle algo".
  async function takeShot(rect) {
    if (cap) { say('Estoy grabando; detén la grabación primero.', 3, { user: true }); return; }
    if (!(await api.recStart('captura'))) return;
    let url = null;
    try {
      const had = SC.isOpen();
      if (await SC.acquire('shot')) {
        // un cuadro fresco (sin el velo de selección)
        await new Promise((r) => setTimeout(r, had ? 600 : 400));
        const c = SC.frame(rect, 4096);
        if (c) url = c.toDataURL('image/png');
      }
    } finally { SC.release('shot'); api.recStop('captura'); }
    if (!url) { say('No pude tomar la captura.', 3, { user: true }); return; }
    window.capriAttachImages([url], 'Captura lista. Escribe tu pregunta y elige a quién se la paso (Tab).', { append: true });
  }

  // hasta 9 momentos repartidos (siempre el primero y el último)
  function pickFrames(frames, n = 9) {
    if (frames.length <= n) return frames;
    const out = [];
    for (let i = 0; i < n; i++) out.push(frames[Math.round(i * (frames.length - 1) / (n - 1))]);
    return out;
  }
  async function stopCapture() {
    if (!cap) return;
    const c = cap; cap = null;
    clearInterval(c.timer);
    // el último cuadro tal como quedó la pantalla al detener
    const secs = (performance.now() - c.started) / 1000;
    if (SC.isOpen() && c.last && !c.last.saved) {
      cap = c; grabFrame(); cap = null; // si algo cambió en el último segundo, se agrega
    }
    SC.release('rec');
    setRecording(false);
    const chosen = pickFrames(c.frames);
    api.recStop(Math.round(secs) + ' s, ' + c.frames.length + ' momentos, ' + chosen.length + ' en la hoja');
    onDone({ secs: Math.round(secs), frames: chosen });
  }

  // ---------------------------------------------------------------- grabando: botón para detener
  const btn = document.getElementById('rec-stop');
  const btnTxt = btn.querySelector('.txt');
  let recording = false;
  btn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); stopCapture(); });
  function placeBtn() {
    if (!recording) return;
    btn.style.visibility = pet.mode === 'hidden' ? 'hidden' : '';
    const hw = headWorld();
    const left = clamp(hw.x - EXT.side * S * 0.45 - btn.offsetWidth, 8, W - btn.offsetWidth - 8), top = clamp(hw.y - 70 * S, 8, H - 30);
    btn.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  setInterval(placeBtn, 50);
  const prevHit = window.uiHit;
  window.uiHit = (x, y) => {
    if (prevHit && prevHit(x, y)) return true;
    if (!recording) return false;
    const r = btn.getBoundingClientRect();
    return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
  };
  function setRecording(on, secs = 0) {
    recording = on;
    btn.classList.toggle('show', on);
    if (on) { btnTxt.textContent = mmss(secs) + ' · clic para detener'; placeBtn(); }
    else if (window.capriResyncIgnore) window.capriResyncIgnore();
  }

  // ---------------------------------------------------------------- hoja de cuadros
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  async function buildSheet(d) {
    const imgs = await Promise.all(d.frames.map((f) => loadImg(f.dataUrl)));
    if (imgs.length === 1) return d.frames[0].dataUrl; // pantalla quieta: un solo cuadro, sin cuadrícula
    const n = imgs.length, cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const cw = Math.min(640, imgs[0].naturalWidth), ch = Math.round(cw * imgs[0].naturalHeight / imgs[0].naturalWidth);
    const PAD = 8, HEAD = 46;
    const cv = document.createElement('canvas');
    cv.width = cols * cw + (cols + 1) * PAD; cv.height = HEAD + rows * ch + (rows + 1) * PAD;
    const g = cv.getContext('2d');
    g.fillStyle = '#111014'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#ffffff'; g.font = '600 20px Segoe UI, sans-serif'; g.textBaseline = 'middle';
    g.fillText(`Grabación de pantalla · ${mmss(d.secs)} · ${n} momentos en orden (izquierda a derecha, arriba a abajo)`, PAD + 4, HEAD / 2 + 2);
    imgs.forEach((im, i) => {
      const x = PAD + (i % cols) * (cw + PAD), y = HEAD + PAD + Math.floor(i / cols) * (ch + PAD);
      g.drawImage(im, x, y, cw, ch);
      const label = (i + 1) + ' · ' + mmss(d.frames[i].t);
      g.font = '600 16px Segoe UI, sans-serif';
      const tw = g.measureText(label).width + 14;
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x, y, tw, 26);
      g.fillStyle = '#ff2a6d'; g.fillRect(x, y, 3, 26);
      g.fillStyle = '#ffffff'; g.fillText(label, x + 8, y + 13);
    });
    return cv.toDataURL('image/jpeg', 0.85);
  }
  async function onDone(d) {
    if (!d.frames || !d.frames.length) { say('No alcancé a grabar nada.', 2.5, { user: true }); return; }
    try {
      const sheet = await buildSheet(d);
      if (/cmdtest/.test(location.search)) console.log('SHEET>' + sheet); // pruebas
      window.capriAttachImages([sheet], `Listo: ${mmss(d.secs)} grabados, ${d.frames.length === 1 ? 'la pantalla no cambió' : d.frames.length + ' momentos en una imagen'}. Escribe tu pregunta y elige a quién (Tab).`);
    } catch (e) { say('No pude armar la grabación.', 3, { user: true }); console.warn('hoja de cuadros', e); }
  }

  api.onAction((a) => {
    if (a === 'rec-select') openSelect('rec');
    else if (a === 'shot-select') openSelect('shot');
    else if (a === 'rec-stop') stopCapture();
  });

  // pruebas (?cmdtest=__recsel:x1,y1,x2,y2|__recstop): arrastrar una sección y detener
  window.capriRecTest = {
    select(x1, y1, x2, y2, mode = 'rec') {
      openSelect(mode);
      setTimeout(() => {
        const ev = (type, x, y) => sel.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
        ev('mousedown', x1, y1); ev('mousemove', (x1 + x2) / 2, (y1 + y2) / 2); ev('mousemove', x2, y2); ev('mouseup', x2, y2);
      }, 800);
    },
    stop: () => stopCapture(),
  };
})();
