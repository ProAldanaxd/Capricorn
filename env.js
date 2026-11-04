'use strict';
// =====================================================================
//  Capri y su entorno: qué app usas, si estás AFK, cuánto tiempo llevas,
//  la hora del día y el clima. Usa las funciones de renderer.js
//  (say, setMode, pet, emit, ...), que comparten el ámbito global.
// =====================================================================
(() => {
  let CFG = {
    ciudad: 'Guadalajara', esconderseEnJuegos: true, minutosParaRecordarDescanso: 120, minutosAFKParaDormir: 5,
  };

  // ---------- utilidades ----------
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? v[k] : ''));
  const lastPick = new Map();
  function pickFrom(key, arr, vars = {}) {
    if (!arr || !arr.length) return '';
    let s, n = 0;
    do { s = pick(arr); } while (s === lastPick.get(key) && arr.length > 1 && n++ < 6);
    lastPick.set(key, s);
    return fill(s, vars);
  }
  const busy = () => T < talkUntil + 1.5 || ['drag', 'fling', 'spin', 'tpOut', 'tpIn', 'hidden'].includes(pet.mode);
  let lastEnvTalk = -999;
  // Habla si no está ocupada y no habló del entorno hace poco (minGap en segundos)
  // Si viene `desc` (qué pasó, para la IA), el comentario lo genera Gemini y `text` queda de respaldo.
  function envSay(text, { minGap = 45, hold = 3.2, force = false, desc = null, maxWait } = {}) {
    if (!text) return false;
    if (!force && (busy() || T - lastEnvTalk < minGap)) return false;
    if (pet.mode === 'sleep' && !force) return false;
    lastEnvTalk = T;
    if (desc && window.capriSpeak) return window.capriSpeak(desc, text, { hold, force, maxWait });
    say(text, hold);
    return true;
  }
  const hhmm = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  // "Una vez por día" que sobrevive a reinicios
  const todayKey = () => new Date().toDateString();
  function onceToday(key) {
    const k = 'capri.once.' + key;
    if (localStorage.getItem(k) === todayKey()) return false;
    localStorage.setItem(k, todayKey());
    return true;
  }

  // =================================================================
  //  1) App en primer plano
  // =================================================================
  let curApp = { id: 'other' }, appSince = 0, reacted = false, inGame = null;
  const appCooldown = new Map(); // id -> T de la última reacción
  const APP_COOLDOWN = 12 * 60;    // no repetir la misma app antes de 12 min
  const DWELL = 4;                 // segundos que debe quedarse la app antes de reaccionar

  let outOfGameSince = null;
  function onApp(a) {
    curApp = a; appSince = T; reacted = false;
    if (a.id === 'game') {
      outOfGameSince = null;
      if (inGame !== a.game) enterGame(a.game);
    } else if (inGame) {
      outOfGameSince = T; // se confirma en appTick si sigues fuera 5 s
    }
  }

  let gameStartT = 0;
  function enterGame(name) {
    inGame = name; gameStartT = T;
    const special = LINES.games && LINES.games[name];
    const text = special && chance(0.7) ? pickFrom('g:' + name, special) : pickFrom('gameStart', LINES.gameStart, { juego: name });
    if (pet.mode === 'sleep') wake();
    envSay(text, { force: true, hold: 2.6, maxWait: 2.6,
      desc: `El usuario acaba de abrir el juego "${name}". Despídete en una frase corta: te vas a esconder para no estorbarle mientras juega.` });
    if (CFG.esconderseEnJuegos) {
      // se despide y desaparece en glitch para no estorbar el juego
      setTimeout(() => {
        if (inGame !== name || pet.mode === 'drag') return;
        setMode('tpOut', 0.4);
        setTimeout(() => { if (inGame === name) { setMode('hidden'); pet.alpha = 0; } }, 450);
      }, 3200);
    }
  }

  function leaveGame(name) {
    inGame = null;
    if (pet.mode === 'hidden' || pet.mode === 'tpOut') {
      pet.x = clamp(pet.x, margin(), W - margin()); pet.y = floorY();
      setMode('tpIn', 0.6); burst(20);
    }
    const min = Math.max(1, Math.round((T - gameStartT) / 60));
    setTimeout(() => envSay(pickFrom('gameEnd', LINES.gameEnd, { juego: name }), { force: true,
      desc: `El usuario acaba de salir del juego "${name}" después de unos ${min} minutos. Recíbelo de vuelta.` }), 900);
  }

  // Reacción a la app cuando ya llevas unos segundos en ella
  function appTick() {
    if (inGame && outOfGameSince !== null && T - outOfGameSince >= 5) { const g = inGame; outOfGameSince = null; leaveGame(g); return; }
    if (reacted || T - appSince < DWELL) return;
    reacted = true;
    const id = curApp.id;
    const lines = LINES.apps && LINES.apps[id];
    if (!lines || inGame) return;
    if (T - (appCooldown.get(id) ?? -1e9) < APP_COOLDOWN) return;
    if (!chance(0.75)) return;
    const appName = (window.capriAppName && window.capriAppName(curApp)) || id;
    if (!envSay(pickFrom('a:' + id, lines), { desc: `El usuario acaba de cambiar a ${appName}.` })) { reacted = false; appSince = T; return; } // ocupada: reintenta luego
    appCooldown.set(id, T);
    // pequeñas reacciones físicas
    if (!INTERRUPTIBLE.has(pet.mode)) return;
    if (id === 'steam' || id === 'epic') doJump();
    else if (id === 'discord') setMode('wave', 1.6);
    else if (id === 'settings' || id === 'taskmgr') { pet.glitch = 1; burst(12); }
    else if (id === 'vscode' || id === 'antigravity' || id === 'explorer') setMode('look', 2.5);
    else if (id === 'claude') setMode('talk', 3);
  }

  // =================================================================
  //  2) AFK y tiempo frente a la pantalla
  // =================================================================
  let afk = false, afkSince = 0, activeSec = 0, nextBreak = null;
  function onIdle(sec) {
    const afkLimit = CFG.minutosAFKParaDormir * 60;
    if (!afk && sec >= afkLimit && pet.mode !== 'hidden') {
      afk = true;
      afkSince = T;
      if (pet.mode !== 'sleep') {
        startSleep();
        setTimeout(() => envSay(pickFrom('afkSleep', LINES.afkSleep), { force: true, hold: 2.5,
          desc: `El usuario lleva ${CFG.minutosAFKParaDormir} minutos sin tocar la compu. Te vas a dormir; dilo en una frase.` }), 50);
      }
    } else if (afk && sec < 3) {
      afk = false;
      const away = Math.max(1, Math.round((T - afkSince) / 60) + CFG.minutosAFKParaDormir);
      if (pet.mode === 'sleep') {
        wake();
        setTimeout(() => envSay(pickFrom('back', LINES.back), { force: true, hold: 3,
          desc: `El usuario regresó a la compu después de unos ${away} minutos ausente. Te acabas de despertar.` }), 50);
      }
      lastEnvTalk = T;
    }
    // tiempo activo (cuenta mientras usas la compu; un descanso de 10 min lo reinicia)
    if (nextBreak === null) nextBreak = CFG.minutosParaRecordarDescanso * 60;
    if (sec < 120) activeSec += 5;
    if (sec > 600) { activeSec = 0; nextBreak = CFG.minutosParaRecordarDescanso * 60; }
    if (activeSec >= nextBreak && !inGame) {
      const h = Math.floor(activeSec / 3600), m = Math.round((activeSec % 3600) / 60);
      const horas = h ? (h + (h === 1 ? ' hora' : ' horas') + (m >= 10 ? ' y ' + m + ' min' : '')) : m + ' minutos';
      if (envSay(pickFrom('break', LINES.break, { horas }), { minGap: 20, hold: 4, force: true,
        desc: `El usuario lleva ${horas} seguidas frente a la pantalla. Recomiéndale con cariño un descanso (estirarse, agua, mirar lejos).` })) nextBreak += 60 * 60;
    }
  }

  // =================================================================
  //  3) Hora del día
  // =================================================================
  let lateWarnAt = -1e9;
  function clockTick() {
    const d = new Date(), h = d.getHours(), mm = d.getMinutes(), t = h + mm / 60;
    if (inGame || pet.mode === 'sleep') return;
    const MEAL = { breakfast: 'desayunar', lunch: 'comer', dinner: 'cenar' };
    const slot = (key, from, to) => t >= from && t < to && chance(0.06) && localStorage.getItem('capri.once.' + key) !== todayKey()
      && envSay(pickFrom(key, LINES[key]), { desc: `Son las ${hhmm()}: es hora de ${MEAL[key]}. Pregúntale o recuérdaselo.` }) && onceToday(key);
    slot('breakfast', 8, 9.75) || slot('lunch', 14, 15.75) || slot('dinner', 20, 21.75);
    if (h >= 0 && h < 5 && T - lateWarnAt > 45 * 60 && chance(0.1)) {
      if (envSay(pickFrom('lateNight', LINES.lateNight), { desc: `Son las ${hhmm()} de la madrugada y el usuario sigue despierto en la compu.` })) lateWarnAt = T;
    }
    const day = d.getDay();
    if ((day === 0 || day === 6) && h >= 9 && localStorage.getItem('capri.once.weekend') !== todayKey() && chance(0.1)) {
      if (envSay(pickFrom('weekend', LINES.weekend), { desc: `Hoy es ${day === 6 ? 'sábado' : 'domingo'}, fin de semana.` })) onceToday('weekend');
    }
  }

  // =================================================================
  //  4) Clima
  // =================================================================
  let weather = null, wcat = null, lastTempTalk = -1e9, thunderAt = 0, firstWeather = true;
  const SKY = { clear: 'despejado', cloudy: 'nublado', fog: 'con neblina', rain: 'lloviendo', storm: 'con tormenta', snow: 'nevando' };
  function category(code) {
    if (code <= 1) return 'clear';
    if (code <= 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code >= 95) return 'storm';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    return 'cloudy';
  }
  const wvars = () => ({ temp: Math.round(weather.temp), ciudad: weather.city || CFG.ciudad, cielo: SKY[wcat] || 'raro' });

  function onWeather(w) {
    weather = w;
    const cat = category(w.code);
    const changed = cat !== wcat;
    wcat = cat;
    if (firstWeather) {
      firstWeather = false;
      const v = wvars();
      setTimeout(() => envSay(pickFrom('weatherReport', LINES.weatherReport, v), { minGap: 5,
        desc: `Comenta el clima de hoy: en ${v.ciudad} hay ${v.temp}°C y está ${v.cielo}.` }), 7000);
      return;
    }
    if (changed) {
      const key = cat === 'clear' && !w.isDay ? 'clearNight' : cat === 'snow' ? 'cold' : cat;
      const v = wvars();
      pendingWeather = { text: pickFrom(key, LINES[key], v), until: T + 10 * 60, // se dice en cuanto pueda
        desc: `El clima en ${v.ciudad} acaba de cambiar: ahora está ${v.cielo} y hace ${v.temp}°C${w.isDay ? '' : ' (es de noche)'}.` };
    } else if (T - lastTempTalk > 3 * 3600) {
      const v = wvars();
      if (w.temp >= 31 && envSay(pickFrom('hot', LINES.hot, v), { desc: `Hace calor: ${v.temp}°C en ${v.ciudad}.` })) lastTempTalk = T;
      else if (w.temp <= 12 && envSay(pickFrom('cold', LINES.cold, v), { desc: `Hace frío: ${v.temp}°C en ${v.ciudad}.` })) lastTempTalk = T;
    }
  }

  let pendingWeather = null;
  setInterval(() => {
    if (!pendingWeather) return;
    if (T > pendingWeather.until) { pendingWeather = null; return; }
    if (envSay(pendingWeather.text, { minGap: 12, desc: pendingWeather.desc })) pendingWeather = null;
  }, 1000);

  // Gotitas digitales y truenos
  function weatherFx() {
    if (!weather || pet.mode === 'hidden' || pet.alpha < 0.5) return;
    if (wcat === 'rain' || wcat === 'storm') {
      const top = baseY() - curFrame.ay * S - 60 * S;
      const n = wcat === 'storm' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        emit(pet.x + rand(-170, 170) * S, top - rand(0, 120) * S, {
          vx: -30, vy: rand(380, 520), life: rand(0.45, 0.8), size: rand(1.5, 3) * S * 1.4,
          col: pick(['#7fe8ff', '#7fe8ff', C.green, C.white]),
        });
      }
    }
    if (wcat === 'storm' && T > thunderAt) {
      const first = thunderAt === 0;
      thunderAt = T + rand(18, 55);
      if (!first) {
        pet.glitch = 1; burst(18);
        if (INTERRUPTIBLE.has(pet.mode) || pet.mode === 'idle') doJump(0.8);
        if (chance(0.5)) envSay(pickFrom('thunder', LINES.thunder), { minGap: 25, hold: 1.6 });
      }
    }
  }

  // =================================================================
  //  conexión
  // =================================================================
  api.onEnv({
    config: (c) => { CFG = { ...CFG, ...c }; },
    app: onApp,
    idle: onIdle,
    weather: onWeather,
  });
  function weatherReport() {
    if (!weather) { say('Todavía no sé el clima. ¿Hay internet?', 2.5); return; }
    say(pickFrom('weatherReport', LINES.weatherReport, wvars()) + (Math.abs(weather.feels - weather.temp) >= 3 ? ' Se siente como ' + Math.round(weather.feels) + '°.' : ''), 3.5);
    lastEnvTalk = T;
  }
  api.onAction((a) => { if (a === 'weather') weatherReport(); });
  setInterval(appTick, 1000);
  setInterval(clockTick, 30 * 1000);
  setInterval(weatherFx, 60);

  // Para probar desde la consola: capriEnv.app({id:'vscode'}), capriEnv.weather({...})
  window.capriEnv = { app: onApp, idle: onIdle, weather: onWeather, weatherReport, inGame: () => inGame,
    state: () => ({ curApp, inGame, afk, activeSec, weather, wcat }) };
  window.addEventListener('error', (e) => console.error('ERROR', e.message, e.filename + ':' + e.lineno));

  // Prueba guiada (?envtest=1): simula apps, juego, AFK y lluvia para revisarlo en pantalla
  if (new URLSearchParams(location.search).get('envtest') === '1') {
    const steps = [
      [2, () => { console.log('STATE', JSON.stringify(window.capriEnv.state())); }],
      [3, () => onApp({ id: 'vscode' })],
      [9, () => { lastEnvTalk = -999; onWeather({ ...(weather || { temp: 24, feels: 24, isDay: true, precip: 1, wind: 5, city: CFG.ciudad }), code: 63 }); }],
      [15, () => onApp({ id: 'game', game: 'Cyberpunk 2077', store: 'steam' })],
      [22, () => console.log('HIDDEN?', pet.mode, pet.alpha)],
      [23, () => onApp({ id: 'discord' })],
      [32, () => { console.log('BACK?', pet.mode); onIdle(CFG.minutosAFKParaDormir * 60 + 1); }],
      [36, () => { console.log('AFK?', pet.mode); onIdle(0); }],
      [40, () => console.log('WOKE?', pet.mode, JSON.stringify(window.capriEnv.state())) ],
    ];
    for (const [s, f] of steps) setTimeout(() => { try { f(); } catch (err) { console.error('TEST', err.message); } }, s * 1000);
  }
})();
