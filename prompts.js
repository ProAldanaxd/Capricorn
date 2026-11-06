'use strict';
// =====================================================================
//  Avisos de Claude Code con botones: permisos, preguntas y respuestas rápidas.
//  Llegan de hooks.js (proceso principal); lo que piques regresa a Claude Code.
//  Usa las funciones de renderer.js (say, pet, setMode, ...).
// =====================================================================
(() => {
  const panel = document.getElementById('capri-prompt');
  const elTag = panel.querySelector('.cp-tag');
  const elTitle = panel.querySelector('.cp-title');
  const elDetail = panel.querySelector('.cp-detail');
  const elOpts = panel.querySelector('.cp-opts');
  const elFoot = panel.querySelector('.cp-foot');
  const askBox = document.getElementById('ask');

  let queue = [];   // avisos esperando
  let cur = null;   // el que está a la vista: { p, step, answers, picked }

  const btn = (label, cls, onClick, desc) => {
    const b = document.createElement('div');
    b.className = 'cp-btn ' + (cls || '');
    const l = document.createElement('span'); l.className = 'cp-lbl'; l.textContent = label; b.appendChild(l);
    if (desc) { const d = document.createElement('span'); d.className = 'cp-desc'; d.textContent = desc; b.appendChild(d); }
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  };
  // de qué app viene: Claude Code (naranja) o Antigravity (azul)
  const APP = {
    claude: { tag: 'CLAUDE CODE', name: 'Claude', badge: 'CLAUDE' },
    ag: { tag: 'ANTIGRAVITY', name: 'Antigravity', badge: 'AG' },
  };
  const appOf = (p) => APP[p.app] || APP.claude;
  const tag = (p, kind) => appOf(p).tag + ' // ' + kind + (p.session ? '  ·  ' + p.session : '');

  function render() {
    const p = cur.p, A = appOf(p);
    panel.classList.toggle('ag', p.app === 'ag');
    elOpts.innerHTML = '';
    elDetail.textContent = ''; elDetail.style.display = 'none';
    const detail = (t) => { if (t) { elDetail.textContent = t; elDetail.style.display = ''; } };
    elOpts.classList.toggle('col', p.kind !== 'permission' && p.kind !== 'notice');
    if (p.kind === 'permission') {
      elTag.textContent = tag(p, 'PERMISO');
      elTitle.textContent = p.title;
      detail(p.detail);
      elOpts.append(
        btn('Permitir', 'ok', () => answer('allow')),
        btn('Negar', 'no', () => answer('deny')),
        btn('En ' + A.name, 'alt', () => answer('app')));
      elFoot.textContent = 'Solo esta vez · si no contestas, se queda en ' + A.name;
    } else if (p.kind === 'notice') {
      elTag.textContent = tag(p, 'PREGUNTA');
      elTitle.textContent = p.question || p.title;
      detail(p.detail);
      p.buttons.forEach((l, i) => elOpts.append(btn(l, i ? 'alt' : 'ok', () => answer(l))));
      elFoot.textContent = 'Esta se contesta en ' + A.name;
    } else if (p.kind === 'question') {
      const q = p.questions[cur.step];
      elTag.textContent = tag(p, 'PREGUNTA' + (p.questions.length > 1 ? ` ${cur.step + 1}/${p.questions.length}` : ''));
      elTitle.textContent = q.question;
      for (const o of q.options) {
        const on = cur.picked.includes(o.label);
        elOpts.append(btn((q.multiSelect ? (on ? '■ ' : '□ ') : '') + o.label, q.multiSelect && on ? 'sel' : '', () => pickOption(q, o.label), o.description));
      }
      const row = document.createElement('div'); row.className = 'cp-row';
      if (q.multiSelect) row.append(btn('Listo', 'ok', () => nextQuestion(q)));
      row.append(btn('En Claude', 'alt', () => answer('app')));
      elOpts.append(row);
      elFoot.textContent = 'Para escribir otra respuesta, contesta en Claude';
    } else {
      elTag.textContent = tag(p, 'TE PREGUNTA');
      elTitle.textContent = p.question;
      for (const l of p.buttons) elOpts.append(btn(l, 'ok', () => answer(l)));
      elOpts.append(btn('Cerrar', 'alt', () => answer('close')));
      elFoot.textContent = 'Le mando tu respuesta a esa sesión';
    }
    place();
  }

  function pickOption(q, label) {
    if (q.multiSelect) {
      cur.picked = cur.picked.includes(label) ? cur.picked.filter((x) => x !== label) : [...cur.picked, label];
      render();
      return;
    }
    cur.picked = [label];
    nextQuestion(q);
  }
  function nextQuestion(q) {
    if (!cur.picked.length) return;
    cur.answers[q.question] = cur.picked.join(', ');
    cur.step++; cur.picked = [];
    if (cur.step < cur.p.questions.length) render();
    else answer({ answers: cur.answers });
  }

  function answer(value) {
    if (!cur) return;
    const id = cur.p.id, A = appOf(cur.p), kind = cur.p.kind, o = { badge: A.badge, user: true };
    api.promptAnswer(id, value);
    if (value === 'allow') say('Va, le di permiso.', 2, o);
    else if (value === 'deny') say('Negado. ' + A.name + ' ya sabe que no.', 2, o);
    else if (value && value.answers) say('Listo, le pasé tu respuesta.', 2, o);
    else if (value === 'app') say('Ok, contéstale tú en ' + A.name + '.', 2, o);
    else if (kind === 'reply' && typeof value === 'string' && value !== 'close') say('Le mando: "' + value + '"', 2.5, o);
    close(id);
  }

  function show() {
    if (cur || !queue.length) return;
    cur = { p: queue.shift(), step: 0, answers: {}, picked: [] };
    if (pet.mode === 'hidden') { pet.x = clamp(pet.x, margin(), W - margin()); pet.y = floorY(); setMode('tpIn', 0.5); }
    if (pet.mode === 'sleep') wake();
    window.capriConvo.begin();
    place.last = null;
    panel.classList.add('show');
    render();
    const k = cur.p.kind, A = appOf(cur.p);
    say(k === 'permission' ? '¡Oye! ' + A.name + ' necesita tu permiso.' : k === 'reply' ? A.name + ' espera tu respuesta.' : A.name + ' te está preguntando algo.',
      3, { badge: A.badge, user: true });
  }
  function close(id) {
    if (cur && cur.p.id === id) {
      cur = null;
      panel.classList.remove('show');
      window.capriConvo.end();
      if (window.capriResyncIgnore) window.capriResyncIgnore();
      setTimeout(show, 250);
    } else queue = queue.filter((p) => p.id !== id);
  }

  // Arriba de Capri, dejando lugar para su globo (y arriba del cuadro de texto si está abierto).
  // No sigue al globo: si se moviera cuando el globo se va, el botón se escaparía del clic.
  const BUBBLE_ROOM = 125;
  function place() {
    if (!cur) return;
    const pw = panel.offsetWidth || 320, ph = panel.offsetHeight || 120, GAP = 14;
    const head = baseY() - curFrame.ay * S - 20;
    let top = head - BUBBLE_ROOM - ph - GAP, left = pet.x - pw / 2 + 60;
    if (askBox.classList.contains('show')) { const r = askBox.getBoundingClientRect(); top = Math.min(top, r.top - ph - GAP); }
    if (top < 8) top = clamp(head + 40, 8, H - ph - 8); // sin espacio arriba: abajo
    left = clamp(left, 8, W - pw - 8);
    // solo se mueve si Capri se movió de verdad (no por temblores de la animación)
    if (place.last && Math.abs(place.last.l - left) < 24 && Math.abs(place.last.t - top) < 24) return;
    place.last = { l: left, t: top };
    panel.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  setInterval(place, 100);

  // que la ventana atrape los clics sobre el panel
  const prevHit = window.uiHit;
  window.uiHit = (x, y) => {
    if (prevHit && prevHit(x, y)) return true;
    if (!cur) return false;
    const r = panel.getBoundingClientRect();
    return x >= r.left - 4 && x <= r.right + 10 && y >= r.top - 4 && y <= r.bottom + 10;
  };

  api.onPrompt((p) => {
    // botones de respuesta nuevos de la misma sesión reemplazan a los viejos
    if (p.kind === 'reply') {
      queue = queue.filter((q) => !(q.kind === 'reply' && q.session === p.session));
      if (cur && cur.p.kind === 'reply' && cur.p.session === p.session) { const old = cur.p.id; api.promptAnswer(old, 'close'); close(old); }
    }
    queue.push(p);
    show();
  });
  api.onPromptClose((id) => close(id));

  api.onAction((a) => {
    if (!a.startsWith('hook-reply:')) return;
    const r = a.slice(11);
    if (r === 'sent' || r === 'dry') return;
    if (r === 'nofocus') say('No pude pegarlo en Claude. Te lo dejé copiado.', 3.5, { badge: 'CLAUDE' });
    else if (r === 'nosession') say('No encontré esa sesión de Claude Code.', 3, { badge: 'CLAUDE' });
    else say('Algo falló al mandárselo a Claude.', 3, { badge: 'CLAUDE' });
  });

  // ------------------------------------------------------------ "qué está haciendo" (debajo de Capri)
  // Una línea por app: la última herramienta que usó. Se borra al terminar o tras 90 s sin noticias.
  const strip = document.getElementById('capri-status');
  const acts = new Map(); // 'src:key' -> { src, session, text, at }
  const SRC = { claude: 'CLAUDE', ag: 'AG', screen: 'VIENDO' };
  function renderStrip() {
    const now = Date.now();
    for (const [k, v] of acts) if (v.src !== 'screen' && now - v.at > 90000) acts.delete(k);
    // la más reciente de cada app
    const per = new Map();
    for (const v of acts.values()) if (!per.has(v.src) || per.get(v.src).at < v.at) per.set(v.src, v);
    strip.textContent = '';
    for (const v of [...per.values()].sort((a, b) => b.at - a.at)) {
      const line = document.createElement('div'); line.className = 'cs-line cs-' + v.src;
      const who = document.createElement('span'); who.className = 'cs-who'; who.textContent = SRC[v.src] || v.src;
      const what = document.createElement('span'); what.className = 'cs-what';
      what.textContent = v.src === 'screen' ? screenText(v) : (v.session ? v.session + ' › ' : '') + v.text;
      line.append(who, what); strip.appendChild(line);
    }
    strip.classList.toggle('show', per.size > 0);
  }
  function placeStrip() {
    if (!strip.classList.contains('show')) return;
    strip.style.visibility = pet.mode === 'hidden' ? 'hidden' : '';
    const w = strip.offsetWidth, h = strip.offsetHeight;
    const left = clamp(pet.x - w / 2, 8, W - w - 8), top = clamp(baseY() + 8, 8, H - h - 4);
    strip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  setInterval(placeStrip, 50);
  setInterval(renderStrip, 5000);

  // ------------------------------------------------------------ "Ver pantalla": REC y línea VIENDO
  const rec = document.getElementById('capri-rec');
  const recTxt = rec.querySelector('.txt');
  function screenText(v) {
    if (v.paused) return 'en pausa (estás jugando)';
    const name = (window.capriAppName && window.capriAppName({ id: v.app })) || 'tu pantalla';
    const s = v.at ? Math.max(0, Math.round((Date.now() - v.at) / 1000)) : 0;
    return name + ' · hace ' + s + ' s';
  }
  function placeRec() {
    if (!rec.classList.contains('show')) return;
    rec.style.visibility = pet.mode === 'hidden' ? 'hidden' : '';
    const hw = headWorld();
    const left = clamp(hw.x + EXT.side * S * 0.45, 8, W - rec.offsetWidth - 8), top = clamp(hw.y - 70 * S, 8, H - 30);
    rec.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  setInterval(placeRec, 50);
  setInterval(() => { if (acts.has('screen:1')) renderStrip(); }, 1000); // el "hace X s" corre
  api.onScreen((s) => {
    window.capriScreenOn = !!s.on && !s.paused;
    if (!s.on) { acts.delete('screen:1'); rec.classList.remove('show'); renderStrip(); return; }
    const prev = acts.get('screen:1') || {};
    acts.set('screen:1', { src: 'screen', at: s.at || prev.at || 0, app: s.app != null ? s.app : prev.app, paused: !!s.paused });
    rec.classList.add('show');
    rec.classList.toggle('paused', !!s.paused);
    recTxt.textContent = s.paused ? 'PAUSA' : 'REC';
    renderStrip(); placeRec(); placeStrip();
  });
  api.onScreenComment((t) => { if (pet.mode !== 'hidden') say(t, 4, { queue: true, badge: '● EN VIVO' }); });
  api.onStatus((s) => {
    const k = s.src + ':' + s.key;
    if (s.done) {
      acts.delete(k);
      if (s.notify && s.src === 'ag') {
        say(s.reason === 'error' ? 'Antigravity se detuvo por un error.' : s.reason === 'max_steps_exceeded' ? 'Antigravity se detuvo: llegó a su límite de pasos.' : 'Antigravity ya acabó.', 3, { badge: 'AG' });
      }
    } else acts.set(k, { src: s.src, session: s.session, text: s.text, at: Date.now() });
    renderStrip(); placeStrip();
  });

  // pruebas: ?cmdtest=__prompt:permission|question|reply|agperm|agq  y  __status
  window.capriTestPrompt = (kind) => {
    const id = 'test' + Date.now();
    const base = { id, session: 'Prueba', app: 'claude' };
    const p = kind === 'question'
      ? { ...base, kind, questions: [{ question: '¿Qué color?', header: 'Color', multiSelect: false, options: [{ label: 'Rosa', description: 'El de Capri' }, { label: 'Verde', description: '' }] },
        { question: '¿Qué extras?', header: 'Extras', multiSelect: true, options: [{ label: 'Brillo', description: '' }, { label: 'Sombra', description: '' }] }] }
      : kind === 'reply' ? { ...base, kind, question: '¿Le hago el aviso de permisos a Capri?', buttons: ['Sí, hazlo', 'Todavía no'] }
        : kind === 'agperm' ? { ...base, app: 'ag', kind: 'permission', title: 'Antigravity quiere correr un comando', detail: 'npm test' }
          : kind === 'agq' ? { ...base, app: 'ag', kind: 'notice', title: 'Antigravity te está preguntando', question: '¿Qué framework uso?', detail: '· React\n· Vue', buttons: ['Ir a Antigravity', 'Ok'] }
            : { ...base, kind: 'permission', title: 'Claude quiere usar Bash', detail: 'npm run build' };
    queue.push(p); show();
  };
  window.capriTestStatus = () => {
    acts.set('claude:t', { src: 'claude', session: 'Capri', text: 'editando main.js', at: Date.now() });
    acts.set('ag:t', { src: 'ag', session: 'Mi web', text: 'leyendo config.json', at: Date.now() - 1000 });
    renderStrip(); placeStrip();
  };
})();
