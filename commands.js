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
  const reply = (text, hold = 3.2) => { say(text, hold); };

  // ---------------------------------------------------------------- cuadro de texto
  const box = document.getElementById('ask');
  const input = document.getElementById('ask-input');
  const boxTag = document.getElementById('ask-tag');
  const boxHint = document.getElementById('ask-hint');
  let open = false, boxMode = 'ask';

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
    boxTag.textContent = isKey ? 'API KEY DE GEMINI://' : 'PEDIRLE ALGO A CAPRI://';
    boxHint.textContent = isKey ? 'Pégala y Enter · se guarda cifrada · vacío = borrar · Esc cancela' : 'Enter para enviar · Esc para cerrar';
    input.type = isKey ? 'password' : 'text';
    open = true;
    box.classList.add('show');
    input.value = '';
    placeBox();
    api.focusInput(true);
    setTimeout(() => input.focus(), 60);
    if (INTERRUPTIBLE.has(pet.mode) || pet.mode === 'float') setMode('look', 999);
    nextDecision = T + 999;
    say(isKey ? 'Pásame la clave de Google AI Studio. No se la digo a nadie.' : R(P.ask), 2);
  }
  function hideBox() {
    if (!open) return;
    open = false;
    box.classList.remove('show');
    input.blur();
    api.focusInput(false);
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
    if (e.key === 'Enter') {
      const text = input.value.trim();
      const mode = boxMode;
      input.value = '';
      hideBox();
      if (mode === 'key') submitKey(text);
      else if (text) handle(text);
    }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (open && document.activeElement !== input) hideBox(); }, 150));
  api.onAction((a) => {
    if (a === 'ask') (open ? hideBox() : showBox('ask'));
    else if (a === 'apikey') showBox('key');
    else if (a === 'ai-on') say(aiInfo.hasKey ? 'IA activada. Mis engramas están en línea.' : 'IA activada, pero me falta la API key. Clic derecho → Poner API key…', 3.5);
    else if (a === 'ai-off') say('IA apagada. Vuelvo a mis frases de siempre.', 2.5);
    else if (a === 'ai-reset') say('Listo, olvidé esta conversación. Lo de mi memoria sigue ahí.', 3);
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
  let aiInfo = { enabled: false, hasKey: false, comentarios: true, gapSec: 150 };
  let aiDownUntil = 0; // sin internet / sin cuota: modo LOCAL un rato
  const aiReady = () => aiInfo.enabled && aiInfo.hasKey && T > aiDownUntil;
  const refreshBadge = () => setBubbleBadge(aiReady() ? 'SYNC' : 'LOCAL');
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
  function aiFailed(res) {
    console.warn('IA falló:', res.error, res.status || '', res.detail || '');
    if (res.error === 'network' || res.error === 'timeout') aiDownUntil = T + 120;
    else if (res.error === 'quota') { aiDownUntil = T + 300; }
    refreshBadge();
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
    const useAi = aiReady() && aiInfo.comentarios && !spontBusy && (force || T - lastSpontAi >= (aiInfo.gapSec || 150));
    if (!useAi) { if (fallback) say(fallback, hold); return !!fallback; }
    spontBusy = true; lastSpontAi = T;
    let done = false;
    const giveUp = setTimeout(() => { if (!done) { done = true; spontBusy = false; if (fallback) say(fallback, hold); } }, maxWait * 1000);
    api.ai.ask('event', desc, aiContext()).then((res) => {
      spontBusy = false;
      if (done) return;
      done = true; clearTimeout(giveUp);
      if (pet.mode === 'hidden') return;
      if (res.ok) say(res.text, hold + 0.8, { queue: true });
      else { aiFailed(res); if (fallback) say(fallback, hold); }
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

  // Todo pasa primero por la IA; si está apagada o falla, por las reglas de siempre.
  let aiErrorToldAt = -1e9;
  async function handle(raw) {
    lastInteract = Date.now();
    if (aiReady()) {
      think(true);
      if (INTERRUPTIBLE.has(pet.mode)) setMode('look', 30);
      const res = await api.ai.ask('chat', raw, aiContext());
      think(false);
      if (pet.mode === 'look') setMode('idle');
      if (res.ok) { say(res.text, 3.8); return; }
      aiFailed(res);
      // avisar del problema (sin repetirlo a cada rato) y seguir con las reglas
      if (T - aiErrorToldAt > 600) {
        aiErrorToldAt = T;
        const why = { quota: 'Se acabó mi cuota de IA por ahora', key: 'Mi API key no funciona (revísala en el menú)', network: 'No tengo internet',
          timeout: 'La IA tardó demasiado', nokey: 'Me falta la API key' }[res.error] || 'La IA falló';
        say(why + '. Uso mis reglas mientras.', 3);
        await new Promise((r) => setTimeout(r, 2600));
      }
    }
    return handleRules(raw);
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
    if (has(t, 'clima|temperatura|llueve|llover') || /que tiempo hace/.test(t)) { window.capriEnv && window.capriEnv.weatherReport(); return; }

    pet.glitch = 0.4;
    reply(R(P.unknown), 4);
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
      if (c.startsWith('__key:')) { await submitKey(c.slice(6)); setTimeout(() => console.log('SAID>', bub.text), 300); return; }
      if (c === '__long') { say('Esta es una respuesta larga de prueba para ver cómo se parte el globo. Tiene varias frases seguidas. Así puedes leer cada parte con calma. Y aquí termina la tercera parte del mensaje, choom.', 3); return; }
      await handle(c);
      setTimeout(() => console.log('SAID>', bub.text), 300);
    }, 3000 + i * 3500));
  }
})();
