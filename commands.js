'use strict';
// =====================================================================
//  Pedirle cosas a Capri: cuadro de texto (Ctrl+Alt+C o menú "Pedirle algo…"),
//  intérprete de órdenes en español y avisos de la compu (batería, CPU, etc.).
//  Usa las funciones de renderer.js (say, setMode, pet, ...).
// =====================================================================
(() => {
  const P = LINES.poderes || {};
  const AV = LINES.avisos || {};
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? v[k] : ''));
  const R = (arr, v = {}) => fill(pick(arr && arr.length ? arr : ['...']), v);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:"']+/g, ' ').replace(/\s+/g, ' ').trim();
  // respuestas a lo que escribiste: tienen prioridad sobre comentarios y avisos
  const reply = (text, hold = 3.2) => { say(text, hold, { user: true }); };

  // ---------------------------------------------------------------- cuadro de texto
  const box = document.getElementById('ask');
  const input = document.getElementById('ask-input');
  const boxTag = document.getElementById('ask-tag');
  const boxHint = document.getElementById('ask-hint');
  let open = false, boxMode = 'ask';
  // a quién va lo que escribes: Capri, el chat de Claude, Claude Code, Gemini (navegador) o Antigravity (Tab cambia)
  const DESTS = ['capri', 'chat', 'code', 'gemini', 'ag'];
  // chat y code van a la app de Claude (naranja); gemini y ag en azul; todos se muestran como Capri
  const DEST_TAG = { capri: 'CAPRI://', chat: 'CAPRI://', code: 'CAPRI CODE://', gemini: 'CAPRI://', ag: 'CAPRI AG://' };
  let dest = 'capri';

  // ---- imágenes pegadas (Ctrl+V) para mandárselas a Claude / Antigravity junto con el texto
  const thumbs = document.getElementById('ask-thumbs');
  const offer = document.getElementById('ask-offer');
  const MAX_IMGS = 4, MAX_IMG_BYTES = 12 * 1024 * 1024;
  let images = []; // data URLs
  function renderThumbs() {
    thumbs.textContent = '';
    images.forEach((src, i) => {
      const d = document.createElement('div'); d.className = 'ask-thumb';
      const im = document.createElement('img'); im.src = src;
      const x = document.createElement('div'); x.className = 'x'; x.textContent = '✕'; x.title = 'Quitar';
      x.addEventListener('mousedown', (e) => { e.preventDefault(); images.splice(i, 1); renderThumbs(); });
      d.append(im, x); thumbs.appendChild(d);
    });
    thumbs.classList.toggle('has', images.length > 0);
    if (images.length) offer.classList.remove('show');
    placeBox();
  }
  function addImageBlob(blob) {
    if (!blob || !/^image\//.test(blob.type)) return;
    if (images.length >= MAX_IMGS) { say('Máximo ' + MAX_IMGS + ' imágenes por mensaje.', 2.5, { user: true }); return; }
    if (blob.size > MAX_IMG_BYTES) { say('Esa imagen está muy pesada para pasarla.', 2.5, { user: true }); return; }
    const r = new FileReader();
    r.onload = () => { images.push(String(r.result)); renderThumbs(); };
    r.readAsDataURL(blob);
  }
  function clearImages() { images = []; offer.classList.remove('show'); renderThumbs(); }
  // abrir el cuadro con imágenes ya adjuntas (la grabación de pantalla). En modo Capri rosa
  // las imágenes no se mandan, así que cambia a Claude.
  // opts.append: si el cuadro ya está abierto, se suma a lo que ya tenías adjunto (capturas)
  window.capriAttachImages = (list, note, opts = {}) => {
    const keep = opts.append && open && boxMode === 'ask' ? images.slice() : [];
    if (!open || boxMode !== 'ask') showBox('ask');
    if (dest === 'capri') setDest('chat');
    images = [...keep, ...list].slice(-MAX_IMGS);
    renderThumbs();
    if (note) say(note, 4, { user: true });
    setTimeout(() => input.focus(), 80);
  };
  // la captura recién copiada (Win+Shift+S): Capri ofrece adjuntarla sin Ctrl+V
  async function offerRecent() {
    offer.classList.remove('show');
    if (boxMode !== 'ask' || images.length || !api.recentImage) return;
    const age = await api.recentImage();
    if (age == null || !open || images.length) return;
    offer.textContent = '📎 Tienes una captura de hace ' + Math.max(1, Math.round(age / 1000)) + ' s · clic para adjuntarla';
    offer.classList.add('show');
    placeBox();
  }
  offer.addEventListener('mousedown', async (e) => {
    e.preventDefault();
    offer.classList.remove('show');
    try {
      for (const item of await navigator.clipboard.read()) {
        const t = item.types.find((x) => x.startsWith('image/'));
        if (t) { addImageBlob(await item.getType(t)); return; }
      }
      say('Ya no la encuentro en el portapapeles. Pégala con Ctrl+V.', 3, { user: true });
    } catch { say('No pude leer la captura. Pégala con Ctrl+V.', 3, { user: true }); }
  });
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.items : [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!files.length) return; // texto normal: que se pegue como siempre
    e.preventDefault();
    for (const f of files) addImageBlob(f.getAsFile());
  });

  function setDest(d) {
    dest = d;
    if (boxMode !== 'ask') return;
    boxTag.textContent = DEST_TAG[d];
    boxHint.textContent = 'Enter para enviar · Tab cambia modo · Esc para cerrar';
    box.classList.toggle('to-claude', d === 'chat' || d === 'code');
    box.classList.toggle('to-ag', d === 'ag' || d === 'gemini'); // Gemini (navegador) y Antigravity en azul
  }

  // El cuadro va ARRIBA del globo (sin encimarse). Si arriba no cabe, va debajo del globo.
  function placeBox() {
    const bw = box.offsetWidth || 300, bh = box.offsetHeight || 70;
    const GAP = 14;
    let r;
    if (bubbleEl.classList.contains('show')) r = bubbleEl.getBoundingClientRect();
    else {
      // dónde quedaría el globo (misma cuenta que updateBubble)
      const gbw = bubbleEl.offsetWidth || 330, gbh = Math.max(bubbleEl.offsetHeight, 100);
      const gl = clamp(pet.x - gbw / 2 + 60, 8, W - gbw - 8), gt = baseY() - curFrame.ay * S - gbh - 20;
      r = { left: gl, top: gt, right: gl + gbw, bottom: gt + gbh };
    }
    let left = clamp(r.left, 8, W - bw - 8);
    let top = r.top - bh - GAP;
    if (top < 8) top = clamp(r.bottom + GAP + 8, 8, H - bh - 8); // sin espacio arriba: debajo del globo
    box.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  function showBox(mode = 'ask') {
    if (pet.mode === 'hidden') { pet.x = clamp(pet.x, margin(), W - margin()); pet.y = floorY(); setMode('tpIn', 0.5); }
    if (pet.mode === 'sleep') wake();
    boxMode = mode;
    const isKey = mode === 'key';
    boxTag.textContent = isKey ? 'API KEY DE GEMINI://' : 'CAPRI://';
    boxHint.textContent = isKey ? 'Pégala y Enter · se guarda cifrada · vacío = borrar · Esc cancela' : 'Enter para enviar · Esc para cerrar';
    input.type = isKey ? 'password' : 'text';
    box.classList.remove('to-claude', 'to-ag');
    if (!isKey) setDest(dest); // el modo se queda hasta que lo cambies con Tab o cierres a Capri
    open = true;
    box.classList.add('show');
    input.value = '';
    placeBox();
    api.focusInput(true);
    setTimeout(() => input.focus(), 60);
    if (INTERRUPTIBLE.has(pet.mode) || pet.mode === 'float') setMode('look', 999);
    nextDecision = T + 999;
    say(isKey ? 'Pásame la clave de Google AI Studio. No se la digo a nadie.' : R(P.ask), 2, { user: true });
    window.capriConvo.begin(); // mientras escribes, nadie interrumpe
    clearImages();
    if (!isKey) offerRecent();
  }
  function hideBox() {
    if (!open) return;
    open = false;
    window.capriConvo.end();
    box.classList.remove('show');
    input.blur();
    clearImages();
    api.focusInput(false);
    if (window.capriResyncIgnore) window.capriResyncIgnore(); // que la ventana vuelva a atrapar clics sobre Capri
    if (pet.mode === 'look') setMode('idle');
    nextDecision = T + rand(4, 8);
  }
  window.uiHit = (x, y) => {
    if (!open) return false;
    const r = box.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  setInterval(() => { if (open) placeBox(); }, 100);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideBox(); return; }
    if (e.key === 'Tab' && boxMode === 'ask') {
      e.preventDefault();
      setDest(DESTS[(DESTS.indexOf(dest) + (e.shiftKey ? DESTS.length - 1 : 1)) % DESTS.length]);
      return;
    }
    if (e.key === 'Enter') {
      const text = input.value.trim();
      const mode = boxMode, to = dest, imgs = images.slice();
      // las imágenes son para Claude / Antigravity: en modo Capri no se cierra el cuadro
      if (mode === 'ask' && imgs.length && to === 'capri') {
        say('Las imágenes se las paso a Claude o a Antigravity. Cambia de modo con Tab.', 3.5, { user: true });
        return;
      }
      input.value = '';
      hideBox();
      if (mode === 'key') submitKey(text);
      else if ((text || imgs.length) && to !== 'capri') toClaude(to, text, imgs);
      else if (text) handle(text);
    }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (open && document.activeElement !== input) hideBox(); }, 150));
  api.onAction((a) => {
    if (a === 'ask') (open ? hideBox() : showBox('ask'));
    else if (a === 'apikey') showBox('key');
    else if (a === 'gem-reset') say('Va. Lo siguiente que le pases a Gemini abre un chat nuevo.', 3, { badge: 'GEMINI' });
    else if (a === 'ag-reset') say('Va. Lo siguiente en CAPRI AG abre una conversación nueva.', 3, { badge: 'AG' });
    else if (a.startsWith('ag-pick:')) say('Conectada a "' + a.slice(8) + '" en Antigravity. Lo que me pases en CAPRI AG va para allá.', 3.5, { badge: 'AG' });
    else if (a === 'claude-reset:chat') say('Va. Lo siguiente que me pases abre un chat nuevo con Claude.', 3, { badge: 'CLAUDE' });
    else if (a === 'claude-reset:code') say('Va. Lo siguiente en CAPRI CODE abre una sesión nueva.', 3, { badge: 'CLAUDE' });
    else if (a.startsWith('claude-pick:')) say('Conectada a "' + a.slice(12) + '". Lo que me pases en CAPRI CODE va para allá.', 3.5, { badge: 'CLAUDE' });
    else if (a === 'ventanas:on') say('Va: cuando le mande algo a una AI, minimizo su ventana.', 3, { badge: 'CLAUDE' });
    else if (a === 'ventanas:off') say('Ok, dejo a la AI al frente después de enviarle algo.', 3, { badge: 'CLAUDE' });
    else if (a.startsWith('screen:on')) say(a.endsWith(':ollama') ? 'Va, ya veo tu pantalla, con mi IA local: nada sale de tu compu. Pregúntame lo que quieras.'
      : 'Va, ya veo tu pantalla. Pregúntame lo que quieras.', 3.5, { badge: '● EN VIVO', user: true });
    else if (a.startsWith('screen:nomodel:')) say('Para ver con Ollama me falta un modelo con visión. Descárgalo con: ollama pull ' + a.slice(15), 5, { user: true });
    else if (a === 'screen:noollama') say('Para ver con Ollama necesito que esté encendido (API Keys → Configurar Ollama).', 4, { user: true });
    else if (a.startsWith('vision-model:')) say('Ahora veo tu pantalla con ' + a.slice(13) + '.', 2.5, { badge: 'OLLAMA' });
    else if (a === 'screen:off') say('Listo, dejé de ver tu pantalla.', 2.5, { user: true });
    else if (a === 'screen:nokey') say('Para ver tu pantalla necesito Gemini. Ponle su API key en el menú.', 3.5, { user: true });
    else if (a === 'ai-reset') say('Listo, olvidé esta conversación. Lo de mi memoria sigue ahí.', 3);
    else if (a === 'ollama-on') say('Ollama en línea. Mi cerebro local está despierto.', 3, { badge: 'OLLAMA' });
    else if (a === 'ollama-off') say('Apagué Ollama. Lo que le tocaba lo hace la otra IA o mis frases.', 3.5);
    else if (a === 'ollama-fail') say('No pude encender Ollama. ¿Está instalado? Sigo sin él.', 3.5);
    else if (a.startsWith('ollama-model:')) say('Ahora pienso con ' + a.slice(13) + '.', 2.5, { badge: 'OLLAMA' });
    else if (a.startsWith('route:')) {
      const [, job, p] = a.split(':');
      if (job === 'vision') {
        say(p === 'ollama' ? 'En "Ver pantalla" ahora veo con Ollama: tus capturas no salen de tu compu.' : 'En "Ver pantalla" ahora veo con Gemini.', 3.5, { badge: BADGE[p] });
        return;
      }
      const JOB = { comentarios: 'Mis comentarios', platica: 'La plática', herramientas: 'Las herramientas' };
      const WHO = { gemini: 'van con Gemini', ollama: 'van con Ollama', none: job === 'herramientas' ? 'van con mis reglas' : 'van con mis frases fijas' };
      let extra = '';
      if (p === 'gemini' && !aiInfo.hasKey) extra = ' Ojo: me falta la API key de Gemini.';
      if (p === 'ollama' && !aiInfo.avail.ollama) extra = ' Ojo: Ollama está apagado o sin conexión.';
      if (job === 'herramientas' && p === 'ollama') extra += ' Con Ollama puedo equivocarme de herramienta.';
      say(JOB[job] + ' ' + WHO[p] + '.' + extra, 4, { badge: BADGE[p] });
    }
  });

  async function submitKey(k) {
    think(true);
    const r = await api.ai.setKey(k);
    think(false);
    if (r.ok && r.removed) say('Borré la clave. Ahora soy solo yo, sin nube.', 3);
    else if (r.ok) { doJump(); say('¡Conectada! Ahora sí puedo pensar de verdad.', 3); }
    else if (r.reason === 'invalid') { pet.glitch = 1; say('Esa clave no funcionó. Revísala en Google AI Studio.', 3.5); }
    else if (r.reason === 'network') say('No pude probarla. ¿Hay internet?', 3);
    else if (r.reason === 'noencrypt') say('Windows no me deja cifrar la clave aquí, así que no la guardé.', 3.5);
    else say('Algo falló guardando la clave (' + (r.status || r.reason) + ').', 3);
    refreshAi();
  }

  // ---------------------------------------------------------------- estado de la IA
  // routes: qué IA hace cada trabajo ('gemini' | 'ollama' | 'none'); avail: qué IA está lista ahora
  let aiInfo = { routes: { comentarios: 'none', platica: 'none', herramientas: 'none' }, avail: { gemini: false, ollama: false },
    hasKey: false, comentarios: true, gapSec: 150, gapOllama: 60 };
  const BADGE = { gemini: 'SYNC', ollama: 'OLLAMA', none: 'LOCAL' };
  const ready = (p) => p !== 'none' && !!aiInfo.avail[p];
  const anyReady = () => ready('gemini') || ready('ollama');
  // ¿la IA puede atender un mensaje? (la elegida o la otra como respaldo)
  const chatPossible = () => {
    const { platica, herramientas } = aiInfo.routes;
    return platica !== 'none' ? anyReady() : ready(herramientas);
  };
  const aiReady = chatPossible;
  // con "Ver pantalla" encendido, las preguntas van a quien ve aunque la plática esté en "Ninguna"
  const canAsk = () => chatPossible() || !!window.capriScreenOn;
  // etiqueta del globo: SYNC = Gemini, OLLAMA = IA local, LOCAL = reglas y frases fijas
  window.capriDefaultBadge = () => {
    const p = aiInfo.routes.platica;
    if (ready(p)) return BADGE[p];
    if (p !== 'none' && anyReady()) return ready('gemini') ? 'SYNC' : 'OLLAMA';
    return 'LOCAL';
  };
  const refreshBadge = () => { if (!bub.active || bub.thinking) setBubbleBadge(window.capriDefaultBadge()); };
  async function refreshAi() { try { aiInfo = { ...aiInfo, ...(await api.ai.status()) }; } catch { /* sin main */ } refreshBadge(); }
  api.ai.onState((s) => { aiInfo = { ...aiInfo, ...s }; refreshBadge(); });
  setInterval(refreshBadge, 5000);
  refreshAi();

  const APP_NAMES = { operagx: 'Opera GX', browser: 'un navegador', vscode: 'VS Code', antigravity: 'Antigravity', claude: 'la app de Claude',
    steam: 'Steam', epic: 'Epic Games', discord: 'Discord', explorer: 'el Explorador de archivos', outlook: 'Outlook',
    settings: 'Configuración de Windows', taskmgr: 'el Administrador de tareas', desktop: 'el escritorio' };
  window.capriAppName = (a) => (a ? (a.id === 'game' ? a.game : APP_NAMES[a.id] || null) : null);
  // contexto que se le pasa a la IA en cada mensaje
  function aiContext() {
    const st = (window.capriEnv && window.capriEnv.state()) || {};
    const SKY = { clear: 'despejado', cloudy: 'nublado', fog: 'con neblina', rain: 'lloviendo', storm: 'con tormenta', snow: 'nevando' };
    return {
      weather: st.weather ? { city: st.weather.city, temp: st.weather.temp, sky: SKY[st.wcat] || '' } : null,
      app: window.capriAppName(st.curApp), game: st.inGame || null,
      battery: batt ? { pct: Math.round(batt.level * 100), charging: batt.charging } : null,
      activeMin: st.activeSec ? Math.round(st.activeSec / 60) : 0,
    };
  }
  // las pausas por cuota/red las lleva el proceso principal; aquí solo se actualiza el estado
  function aiFailed(res) {
    console.warn('IA falló:', res.provider || '', res.error, res.status || '', res.detail || '');
    refreshAi();
  }

  // gestos que pide la IA
  api.ai.onExpress((a) => {
    if (pet.mode === 'hidden' || pet.mode === 'drag') return;
    if (a === 'dance') setMode('dance', 4.5);
    else if (a === 'jump') doJump();
    else if (a === 'wave') setMode('wave', 1.8);
    else if (a === 'sky') setMode('sky', 3.5);
    else if (a === 'teleport') startTeleport();
    else if (a === 'spin') { setMode('spin', 0.9); burst(15); }
    else if (a === 'glitch') { pet.glitch = 1; burst(20); }
    else if (a === 'sleep') startSleep();
    else if (a === 'sit') { if (onFloor()) startSit(); else goTo({ x: pet.x, y: floorY() }, startSit); }
  });

  // ---------------------------------------------------------------- comentarios espontáneos con IA
  // speak(descripción del evento para la IA, frase fija de respaldo, opciones) -> true si va a hablar
  let lastSpontAi = -1e9, spontBusy = false;
  window.capriSpeak = function (desc, fallback, { hold = 3.2, maxWait = 8, force = false } = {}) {
    // con Ollama los comentarios son gratis: se permiten más seguido
    const c = aiInfo.routes.comentarios;
    const who = ready(c) ? c : ready('ollama') ? 'ollama' : 'gemini';
    const gap = who === 'ollama' ? (aiInfo.gapOllama || 60) : (aiInfo.gapSec || 150);
    const useAi = c !== 'none' && anyReady() && aiInfo.comentarios && !spontBusy && (force || T - lastSpontAi >= gap);
    if (!useAi) { if (fallback) say(fallback, hold, { badge: 'LOCAL' }); return !!fallback; }
    spontBusy = true; lastSpontAi = T;
    let done = false;
    const giveUp = setTimeout(() => { if (!done) { done = true; spontBusy = false; if (fallback) say(fallback, hold); } }, maxWait * 1000);
    api.ai.ask('event', desc, aiContext()).then((res) => {
      spontBusy = false;
      if (done) return;
      done = true; clearTimeout(giveUp);
      if (pet.mode === 'hidden') return;
      if (res.ok) say(res.text, hold + 0.8, { queue: true, badge: BADGE[res.provider] || 'SYNC' });
      else { if (res.error !== 'off') aiFailed(res); if (fallback) say(fallback, hold, { badge: 'LOCAL' }); }
    }).catch(() => { spontBusy = false; if (!done) { done = true; clearTimeout(giveUp); if (fallback) say(fallback, hold); } });
    return true;
  };

  // ---------------------------------------------------------------- intérprete
  // Verbo al inicio de la frase -> lo que sigue es el "objeto" (ej. "abre el cyberpunk" -> "cyberpunk")
  function verb(t, words) {
    const m = t.match(new RegExp('^(?:capri\\s+)?(?:(?:me |puedes |podrias |porfa |por favor )\\s*)*(' + words + ')\\b\\s*(.*)$'));
    return m ? m[2].replace(/^(el|la|los|las|un|una|mi|mis|el archivo|la carpeta|el programa|el juego|a|al)\s+/, '').trim() : null;
  }
  const has = (t, re) => new RegExp('\\b(' + re + ')\\b').test(t);

  async function cmd(action, arg) {
    try { return await api.cmd(action, arg); } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
  }
  function common(res, okText) {
    if (res.locked) { pet.glitch = 0.8; reply(R(P.locked), 5); return true; }
    if (res.cancelled) { reply(R(P.cancelled)); return true; }
    if (!res.ok && res.reason === 'error') { pet.glitch = 1; reply(R(P.error)); return true; }
    if (okText && res.ok) { reply(okText); return true; }
    return false;
  }
  const media = (key, times = 1) => { cmd('media', { key, times }); reply(R(P.media[key]), 1.8); };

  // Lo que le escribes:
  //  - Herramientas = Ninguna -> primero las reglas (abrir, música...); si no es orden, plática con IA.
  //  - Si no -> la IA (con herramientas propias o delegadas); si falla, reglas.
  let aiErrorToldAt = -1e9;
  async function askAi(raw) {
    think(true);
    if (INTERRUPTIBLE.has(pet.mode)) setMode('look', 30);
    const res = await api.ai.ask('chat', raw, aiContext());
    think(false);
    if (pet.mode === 'look') setMode('idle');
    if (res.ok) { say(res.text, 3.8, { badge: res.screen ? '● EN VIVO' : BADGE[res.provider] || 'SYNC', user: true }); return true; }
    aiFailed(res);
    if (T - aiErrorToldAt > 600 && res.error !== 'off') { // avisar del problema, sin repetirlo a cada rato
      aiErrorToldAt = T;
      const why = { quota: 'Se acabó mi cuota de IA por ahora', key: 'Mi API key no funciona (revísala en el menú)', network: 'No tengo internet',
        timeout: 'La IA tardó demasiado', nokey: 'Me falta la API key', nomodel: 'No encontré el modelo de IA', unavailable: 'Mi IA no está disponible' }[res.error] || 'La IA falló';
      say(why + '. Uso mis reglas mientras.', 3, { badge: 'LOCAL', user: true });
      await new Promise((r) => setTimeout(r, 2600));
    }
    return false;
  }
  // ---------------------------------------------------------------- pasarle cosas a Claude
  // "@claude ...", "@code ...", "dile a Claude (Code) que ...", "pregúntale a Claude ..."
  function claudeTarget(raw) {
    const s = String(raw).trim();
    let m = s.match(/^@(?:claude[\s-]*code|code|cc)\b[\s:,]*([\s\S]+)$/i);
    if (m) return ['code', m[1]];
    m = s.match(/^@claude\b[\s:,]*([\s\S]+)$/i);
    if (m) return ['chat', m[1]];
    m = s.match(/^@(?:gemini|gem)\b[\s:,]*([\s\S]+)$/i);
    if (m) return ['gemini', m[1]];
    m = s.match(/^(?:dile|preg[uú]ntale|p[aá]sale|m[aá]ndale|p[ií]dele|escr[ií]bele)\s+a\s+gemini\b[\s:,]*(?:que\s+)?([\s\S]+)$/i);
    if (m) return ['gemini', m[1]];
    m = s.match(/^@(?:ag|antigravity|agy)\b[\s:,]*([\s\S]+)$/i);
    if (m) return ['ag', m[1]];
    m = s.match(/^(?:dile|preg[uú]ntale|p[aá]sale|m[aá]ndale|p[ií]dele|escr[ií]bele)\s+a\s+antigravity\b[\s:,]*(?:que\s+)?([\s\S]+)$/i);
    if (m) return ['ag', m[1]];
    m = s.match(/^(?:dile|preg[uú]ntale|p[aá]sale|m[aá]ndale|p[ií]dele|escr[ií]bele)\s+a\s+claude(\s+code)?\b[\s:,]*(?:que\s+)?([\s\S]+)$/i);
    if (m) return [m[1] ? 'code' : 'chat', m[2]];
    return null;
  }
  let claudeBusy = false;
  // target: 'chat' | 'code' (app de Claude) | 'ag' (Antigravity)
  async function toClaude(target, text, imgs = []) {
    lastInteract = Date.now();
    const isAg = target === 'ag', isGem = target === 'gemini';
    const name = isAg ? 'Antigravity' : isGem ? 'Gemini' : target === 'code' ? 'Claude Code' : 'Claude';
    const BG = isAg ? 'AG' : isGem ? 'GEMINI' : 'CLAUDE';
    if (claudeBusy) { reply('Espérame, todavía le estoy pasando lo anterior a ' + name + '.', 3); return; }
    // "nuevo", "nuevo chat", "nueva sesión"... -> empezar otra conversación (con o sin texto)
    // ("nuevo" solo, o "nuevo chat: ...", "otra sesión ..."; "otra pregunta" NO cuenta)
    const fresh = String(text).match(/^(?:(?:nuev[oa]|otr[oa])\s+(?:chat|sesi[oó]n|conversaci[oó]n|pl[aá]tica)\b[\s:,.]*([\s\S]*)|nuev[oa][\s.!]*)$/i);
    if (fresh) {
      await api.claudeReset(target);
      text = (fresh[1] || '').trim();
      if (!text && !imgs.length) {
        const msg = isAg ? 'Va. Lo siguiente en CAPRI AG abre una conversación nueva.' : isGem ? 'Va. Lo siguiente que le pases a Gemini abre un chat nuevo.' : target === 'code' ? 'Va. Lo siguiente en CAPRI CODE abre una sesión nueva.' : 'Va. Lo siguiente que me pases abre un chat nuevo con Claude.';
        say(msg, 3, { badge: BG, user: true }); return;
      }
    }
    claudeBusy = true;
    window.capriConvo.begin();
    try {
      pet.glitch = 0.35;
      const what = imgs.length ? (text ? 'tu mensaje con ' : '') + (imgs.length > 1 ? imgs.length + ' imágenes' : 'la imagen') : '';
      say(imgs.length ? 'Va, le paso ' + what + ' a ' + name + '.'
        : pick(['Va, se lo paso a ' + name + '.', 'Abriendo canal con ' + name + '…', 'Dame un segundo, lo mando a ' + name + '.']), 2.4, { badge: BG, user: true });
      const r = isAg ? await api.agSend(text, imgs) : isGem ? await api.gemSend(text, imgs) : await api.claudeSend(target, text, imgs);
      if (!r || !r.ok) {
        const why = r && r.error === 'empty' ? 'No escribiste nada, choom.'
          : r && r.error === 'notinstalled' ? (isGem ? 'No encontré Opera GX en tu compu (lo uso para abrir Gemini).' : 'No encontré Antigravity instalado en tu compu.')
          : 'No pude abrir la app de ' + name + '. ¿Está instalada?';
        reply(why, 3.5);
        return;
      }
      // Antigravity siempre pega (igual que Claude al seguir en el mismo chat)
      const pasted = isAg || isGem || r.mode === 'continue';
      const where = r.pickFailed ? ' No encontré la conversación de antes; lo puse en la que estaba abierta.' : r.reopened ? ' Su ventana ya no estaba, así que abrí el chat otra vez.' : '';
      if (pasted && r.result === 'nofocus') {
        say(name + ' no se dejó traer al frente. Te dejé el texto copiado: pégalo tú con Ctrl+V.', 4, { badge: BG, user: true });
        return;
      }
      if (r.mode === 'continue' && r.result === 'sent' && !r.minimized) {
        say(pick(['Listo, seguí en la misma conversación.', 'Enviado, en el mismo hilo de antes.']) + (r.title ? ' (' + r.title + ')' : '') + where, 3, { badge: BG, user: true });
        return;
      }
      if (r.result === 'sent' && r.minimized) say(pick(['Enviado. Te quité a ' + name + ' de encima; sigue trabajando abajo.', 'Listo, se lo mandé y minimicé su ventana.']) + (r.truncated ? ' Era muy largo y lo recorté.' : '') + where, 3, { badge: BG, user: true });
      else if (r.result === 'sent') say(pick(['Listo, ya se lo mandé a ' + name + '.', 'Enviado. ' + name + ' ya está en eso.', 'Hecho, le di Enter por ti.']) + (r.truncated ? ' Era muy largo y lo recorté.' : '') + where, 3, { badge: BG, user: true });
      else if (r.result === 'focused') say('Te lo dejé escrito en ' + name + '. Tú le das Enter.', 3, { badge: BG, user: true });
      else if (r.result === 'nofocus') say(name + ' no se dejó traer al frente. Tu texto quedó escrito ahí; dale Enter tú.', 4, { badge: BG, user: true });
      else if (r.result === 'noapp') say(name + ' no terminó de abrir. Intenta otra vez en un ratito.', 3.5, { badge: BG, user: true });
      else if (r.result === 'dry') say('(prueba ' + (r.mode === 'continue' ? 'mismo chat' : 'nuevo') + ') ' + name + ' ← ' + text.slice(0, 60) + (imgs.length ? ' + ' + imgs.length + ' img' : ''), 3, { badge: BG, user: true });
      else say('Algo raro pasó con ' + name + '. Revisa si tu texto quedó ahí.', 3.5, { badge: BG, user: true });
    } finally {
      claudeBusy = false;
      window.capriConvo.end();
    }
  }
  window.capriToClaude = toClaude;

  async function handle(raw) {
    const ct = claudeTarget(raw);
    if (ct) return toClaude(ct[0], ct[1].trim());
    lastInteract = Date.now();
    window.capriConvo.begin(); // hasta que te responda, ningún otro mensaje la interrumpe
    try {
      const rulesFirst = aiInfo.routes.herramientas === 'none';
      if (!rulesFirst && canAsk() && await askAi(raw)) return;
      const r = await handleRules(raw);
      if (r !== 'unknown') return;
      if (rulesFirst && canAsk() && await askAi(raw)) return;
      pet.glitch = 0.4;
      reply(R(P.unknown), 4);
    } finally {
      window.capriConvo.end();
    }
  }

  async function handleRules(raw) {
    const t = norm(raw);
    lastInteract = Date.now();
    const num = (t.match(/\d+/) || [])[0];
    let q;

    // --- ayuda
    if (/^(ayuda|help|que puedes hacer|comandos|que sabes hacer)\b/.test(t)) { reply(R(P.help), 7); return; }

    // --- ordenar / deshacer Descargas
    if ((q = verb(t, 'deshaz|deshacer|revierte')) !== null) {
      const r = await cmd('undoOrganize');
      if (common(r)) return;
      reply(r.ok ? R(P.undone, { n: r.moved }) : R(P.undoNothing)); return;
    }
    if ((q = verb(t, 'ordena|ordename|organiza|organizame|acomoda|acomodame|limpia')) !== null) {
      if (!/descargas|downloads/.test(q)) { reply('Por ahora solo sé ordenar tu carpeta Descargas. Dime "ordena descargas".', 4); return; }
      reply('Revisando tu carpeta Descargas...', 2);
      const r = await cmd('organize');
      if (common(r)) return;
      if (r.empty) { reply(R(P.organizeEmpty)); return; }
      if (r.ok) { doJump(); reply(R(P.organized, { n: r.moved })); } else reply(R(P.error));
      return;
    }

    // --- BLOQUEADAS con verbo: papelera e instalar
    if ((q = verb(t, 'borra|borrame|elimina|eliminame|manda a la papelera|tira')) !== null) {
      if (!q) { reply('¿Qué archivo? Dime su nombre.'); return; }
      const r = await cmd('trash', q);
      if (common(r)) return;
      reply(r.ok ? R(P.trashed, { cosa: r.name }) : R(P.foundNone, { cosa: q })); return;
    }
    if ((q = verb(t, 'instala|instalame|descarga e instala')) !== null) {
      if (!q) { reply('¿Qué programa instalo?'); return; }
      const r = await cmd('install', q);
      if (common(r)) return;
      reply(r.ok ? R(P.installing, { cosa: r.name }) : R(P.error)); return;
    }

    // --- buscar archivos
    if ((q = verb(t, 'busca|buscame|encuentra|encuentrame|donde esta|donde quedo|donde guarde')) !== null) {
      if (!q) { reply('¿Qué busco?'); return; }
      reply(R(P.searching, { cosa: q }), 4);
      setMode('look', 4);
      const r = await cmd('find', q);
      if (common(r)) return;
      reply(r.ok ? R(P.found, { n: r.hits.length, cosa: r.hits[0].name }) : R(P.foundNone, { cosa: q }), 4); return;
    }

    // --- abrir apps, juegos y carpetas
    if ((q = verb(t, 'abre|abreme|abrir|inicia|ejecuta|lanza|corre|juega|jugar|vamos a jugar|pon|ponme|entra a|quiero jugar')) !== null) {
      if (!q) { reply('¿Qué abro?'); return; }
      if (/^(pausa|play|la musica|musica)$/.test(q)) return media('playpause');
      if (/^(capturas|mis capturas|screenshots)$/.test(q)) { await cmd('openShots'); reply(R(P.open, { cosa: 'tus capturas' })); return; }
      const r = await cmd('open', q);
      if (common(r)) return;
      if (r.ok) { if (r.game) doJump(); reply(R(r.game ? P.openGame : P.open, { cosa: r.label })); }
      else reply(R(P.openFail, { cosa: q }));
      return;
    }

    // --- capturas
    if (has(t, 'captura|screenshot|pantallazo') || /foto (de )?(la )?pantalla/.test(t)) {
      const r = await cmd('screenshot');
      if (common(r)) return;
      pet.glitch = 0.6; burst(15); reply(R(P.shot)); return;
    }

    // --- música y volumen
    if (/^(pausa|pausala|play|reproduce|continua|resume|dale play|para la musica|deten la musica)\b/.test(t)) return media('playpause');
    if (has(t, 'siguiente|next|skip|otra cancion') || /^salta/.test(t)) return media('next');
    if (has(t, 'anterior|previous|cancion de antes')) return media('prev');
    if (/\b(sube|subele|mas)\b.*\b(volumen|fuerte)\b|^sube$|volumen arriba/.test(t)) return media('volup', num ? Math.round(num / 2) : 5);
    if (/\b(baja|bajale|menos)\b.*\b(volumen|fuerte)\b|^baja$|volumen abajo|mas (bajito|quedito)/.test(t)) return media('voldown', num ? Math.round(num / 2) : 5);
    if (has(t, 'silencio|mute|silencia|sin sonido') || /quita el sonido/.test(t)) return media('mute');

    // --- tema y brillo (BLOQUEADAS)
    if (/modo oscuro|tema oscuro|dark mode/.test(t)) { const r = await cmd('setting', { kind: 'dark' }); if (!common(r, R(P.settingDone))) reply(R(P.error)); return; }
    if (/modo claro|tema claro|light mode/.test(t)) { const r = await cmd('setting', { kind: 'light' }); if (!common(r, R(P.settingDone))) reply(R(P.error)); return; }
    if (has(t, 'brillo')) {
      if (!num) { reply('¿A cuánto? Por ejemplo: "brillo 60".'); return; }
      const r = await cmd('setting', { kind: 'brightness', value: +num });
      if (!common(r, R(P.settingDone))) reply('No pude cambiar el brillo. Puede que tu pantalla no lo permita.'); return;
    }

    // --- estado de la compu
    if (has(t, 'bateria|pila') || /\bcarga\b/.test(t) && !/descarga/.test(t)) {
      const b = await battery();
      reply(b ? R(P.battery, { pct: b.pct, carga: b.charging ? ' y cargando' : '' }) : 'Esta compu no me deja ver la batería.'); return;
    }
    if (has(t, 'espacio|disco|almacenamiento')) {
      const r = await cmd('disk');
      reply(r.ok && r.freeGB !== undefined ? R(P.disk, { libre: r.freeGB, total: r.totalGB }) : R(P.error)); return;
    }
    if (has(t, 'cpu|ram|memoria|rendimiento|procesador') || /como (esta|va) (la )?compu/.test(t)) {
      const r = await cmd('perf');
      const extra = r.cpu > 80 || r.ram > 85 ? ' Está sudando un poco.' : ' Todo tranquilo.';
      reply(R(P.perf, { cpu: r.cpu, ram: r.ram, extra })); return;
    }
    if (has(t, 'clima|temperatura|llueve|llover') || /que tiempo hace/.test(t)) { window.capriEnv && window.capriEnv.weatherReport({ user: true }); return; }

    return 'unknown'; // no es una orden conocida: quien llamó decide (Ollama o "no entendí")
  }

  // ---------------------------------------------------------------- avisos
  const inGame = () => window.capriEnv && window.capriEnv.inGame && window.capriEnv.inGame();
  const lastNotice = new Map();
  function notice(kind, vars = {}, { cooldown = 60, hold = 3.5 } = {}) {
    if (pet.mode === 'hidden' || inGame()) return;
    const k = kind + (vars.letter || '');
    if (T - (lastNotice.get(k) ?? -1e9) < cooldown) return;
    lastNotice.set(k, T);
    if (pet.mode === 'sleep' && kind !== 'batteryCritical') return;
    const DESC = {
      cpu: `El CPU de la compu lleva un rato al ${vars.pct}%.`, ram: `La RAM está al ${vars.pct}%.`,
      disk: `Solo quedan ${vars.freeGB} GB libres en el disco C:.`, download: `Acaba de terminar una descarga: "${vars.name}" (${vars.mb} MB).`,
      usb: `El usuario conectó una unidad USB (${vars.letter}:).`, usbOut: `El usuario desconectó la unidad ${vars.letter}:.`,
      batteryLow: `La batería bajó al ${vars.pct}% y no está cargando.`, batteryCritical: `¡La batería está en ${vars.pct}%! Urge conectar el cargador.`,
      plugged: 'El usuario conectó el cargador.', unplugged: 'El usuario desconectó el cargador.',
    };
    const urgent = kind === 'batteryCritical' || kind === 'download';
    window.capriSpeak(DESC[kind] || kind, R(AV[kind], vars), { hold, force: urgent, maxWait: urgent ? 5 : 8 });
    if (kind === 'cpu' || kind === 'ram' || kind === 'batteryCritical') pet.glitch = 1;
    if ((kind === 'usb' || kind === 'download') && INTERRUPTIBLE.has(pet.mode)) doJump();
  }
  api.onNotify((kind, data) => notice(kind, data || {}, { cooldown: kind === 'download' ? 8 : 60 }));

  // batería (API del navegador)
  let batt = null;
  async function battery() {
    try { batt = batt || (await navigator.getBattery()); } catch { return null; }
    return batt ? { pct: Math.round(batt.level * 100), charging: batt.charging } : null;
  }
  (async () => {
    if (!(await battery())) return;
    let warned20 = false, warned10 = false, lastPlug = -1e9;
    const check = () => {
      const pct = Math.round(batt.level * 100);
      if (batt.charging || pct > 25) { warned20 = false; warned10 = false; return; }
      if (pct <= 10 && !warned10) { warned10 = true; notice('batteryCritical', { pct }, { cooldown: 0, hold: 4 }); }
      else if (pct <= 20 && !warned20) { warned20 = true; notice('batteryLow', { pct }, { cooldown: 0 }); }
    };
    batt.addEventListener('levelchange', check);
    batt.addEventListener('chargingchange', () => {
      if (T - lastPlug < 120) return;
      lastPlug = T;
      notice(batt.charging ? 'plugged' : 'unplugged', {}, { cooldown: 0, hold: 2.5 });
      check();
    });
    check();
  })();

  // ---------------------------------------------------------------- pruebas
  window.capriCmd = { handle, handleRules, showBox, hideBox, aiReady: () => aiReady() };
  const test = new URLSearchParams(location.search).get('cmdtest');
  if (test) {
    test.split('|').forEach((c, i) => setTimeout(async () => {
      console.log('CMD>', c);
      if (c === '__box') { showBox(); input.value = 'abre cyberpunk'; return; }
      if (c.startsWith('__tab:')) { // abre la barra, cambia de destino n veces y deja texto
        showBox(); for (let k = 0; k < +c.slice(6); k++) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
        input.value = 'explícame qué hace main.js'; console.log('DEST>', dest, boxTag.textContent); return;
      }
      if (c === '__enter') { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); setTimeout(() => console.log('SAID>', bubbleBadge.textContent, bub.text), 900); return; }
      if (c === '__still' || c === '__move') { setMovement(c === '__move'); console.log('MODE>', pet.mode, 'moving', movementOn); return; }
      if (c.startsWith('__spont:')) {
        const d = c.slice(8);
        setTimeout(() => { window.capriSpeak(d, 'RESPALDO FIJO', { force: true, maxWait: 30 }); setTimeout(() => console.log('SAID>', bubbleBadge.textContent, bub.text), 25000); }, 4000);
        return;
      }
      if (c.startsWith('__chat:')) { await handle(c.slice(7)); setTimeout(() => console.log('SAID>', bubbleBadge.textContent, bub.text), 300); return; }
      if (c === '__ai') { console.log('AI>', JSON.stringify(aiInfo), 'badge', window.capriDefaultBadge()); return; }
      if (c.startsWith('__race:')) {
        // simula que llega un comentario mientras Capri responde
        const q = c.slice(7);
        setTimeout(() => say('COMENTARIO QUE INTERRUMPE', 3), 400);
        setTimeout(() => window.capriSpeak('El usuario abrió Discord.', 'RESPALDO QUE INTERRUMPE', { force: true }), 900);
        const log = setInterval(() => console.log('BUB>', bub.thinking ? '(pensando)' : bub.text), 1500);
        await handle(q);
        setTimeout(() => clearInterval(log), 30000);
        return;
      }
      if (c.startsWith('__menuclick:')) { // clic en un renglón del menú abierto
        const it = [...document.querySelectorAll('.cm-item')].find((e) => e.textContent.includes(c.slice(12)));
        if (it) it.click(); setTimeout(() => console.log('SAID>', bubbleBadge.textContent, bub.text), 600); return;
      }
      if (c.startsWith('__hover:')) { // pasar el mouse por un renglón (abre su submenú)
        const it = [...document.querySelectorAll('.cm-item')].reverse().find((e) => e.textContent.includes(c.slice(8)));
        if (it) it.dispatchEvent(new MouseEvent('mouseenter')); return;
      }
      if (c.startsWith('__prompt:')) { window.capriTestPrompt(c.slice(9)); return; } // panel de avisos de Claude
      if (c === '__status') { window.capriTestStatus(); return; } // línea de "qué está haciendo"
      if (c.startsWith('__recsel:')) { const [a, b, x, y] = c.slice(9).split(',').map(Number); window.capriRecTest.select(a, b, x, y); return; }
      if (c.startsWith('__shotsel:')) { const [a, b, x, y] = c.slice(10).split(',').map(Number); window.capriRecTest.select(a, b, x, y, 'shot'); setTimeout(() => console.log('IMGS>', images.length, images.map((s) => Math.round(s.length * 0.75 / 1024) + 'KB').join(',')), 2500); return; }
      if (c === '__recstop') { window.capriRecTest.stop(); return; }
      if (c === '__img') { // una imagen de prueba en el cuadro (como si la pegaras)
        const cv = document.createElement('canvas'); cv.width = 120; cv.height = 80;
        const g = cv.getContext('2d'); g.fillStyle = '#ff2368'; g.fillRect(0, 0, 120, 80); g.fillStyle = '#27f59b'; g.fillRect(20, 20, 40, 40);
        cv.toBlob((b) => addImageBlob(b), 'image/png'); return;
      }
      if (c === '__offer') { offer.dispatchEvent(new MouseEvent('mousedown', { cancelable: true })); setTimeout(() => console.log('IMGS>', images.length), 800); return; }
      if (c.startsWith('__pclick:')) { // clic en un botón del panel de avisos
        const it = [...document.querySelectorAll('.cp-btn')].find((e) => e.textContent.includes(c.slice(9)));
        if (it) it.click(); return;
      }
      if (c === '__menu0') { api.showMenu({ following, sleeping: pet.mode === 'sleep', scale: S, moving: movementOn }, Math.round(pet.x - 120), Math.round(baseY() - 420)); return; }
      if (c === '__menu') {
        api.showMenu({ following, sleeping: pet.mode === 'sleep', scale: S, moving: movementOn }, Math.round(pet.x - 120), Math.round(baseY() - 420));
        setTimeout(() => {
          const r = [...document.querySelectorAll('.cm-item')].find((e) => e.textContent.includes('API Keys'));
          if (r) r.dispatchEvent(new MouseEvent('mouseenter'));
          setTimeout(() => {
            const j = [...document.querySelectorAll('.cm-item')].find((e) => e.textContent.includes('Plática'));
            if (j) j.dispatchEvent(new MouseEvent('mouseenter'));
          }, 300);
        }, 600);
        return;
      }
      if (c === '__afk') { window.__fakeIdle = true; window.capriEnv.idle(9999); return; }
      if (c === '__back') { window.capriEnv.idle(0); window.__fakeIdle = false; return; }
      if (c === '__state') { console.log('MODE>', pet.mode, 'moving', movementOn, 'onFloor', onFloor()); return; }
      if (c.startsWith('__key:')) { await submitKey(c.slice(6)); setTimeout(() => console.log('SAID>', bub.text), 300); return; }
      if (c === '__long') { say('Esta es una respuesta larga de prueba para ver cómo se parte el globo. Tiene varias frases seguidas. Así puedes leer cada parte con calma. Y aquí termina la tercera parte del mensaje, choom.', 3); return; }
      await handle(c);
      setTimeout(() => console.log('SAID>', bub.text), 300);
    }, 3000 + i * 3500));
  }
})();

