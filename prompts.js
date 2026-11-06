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
  const tag = (kind, session) => 'CLAUDE CODE // ' + kind + (session ? '  ·  ' + session : '');

  function render() {
    const p = cur.p;
    elOpts.innerHTML = '';
    elDetail.textContent = ''; elDetail.style.display = 'none';
    elOpts.classList.toggle('col', p.kind !== 'permission');
    if (p.kind === 'permission') {
      elTag.textContent = tag('PERMISO', p.session);
      elTitle.textContent = 'Claude quiere usar ' + p.tool;
      if (p.detail) { elDetail.textContent = p.detail; elDetail.style.display = ''; }
      elOpts.append(
        btn('Permitir', 'ok', () => answer('allow')),
        btn('Negar', 'no', () => answer('deny')),
        btn('En Claude', 'alt', () => answer('claude')));
      elFoot.textContent = 'Solo esta vez · si no contestas, se queda en Claude';
    } else if (p.kind === 'question') {
      const q = p.questions[cur.step];
      elTag.textContent = tag('PREGUNTA' + (p.questions.length > 1 ? ` ${cur.step + 1}/${p.questions.length}` : ''), p.session);
      elTitle.textContent = q.question;
      for (const o of q.options) {
        const on = cur.picked.includes(o.label);
        elOpts.append(btn((q.multiSelect ? (on ? '■ ' : '□ ') : '') + o.label, q.multiSelect && on ? 'sel' : '', () => pickOption(q, o.label), o.description));
      }
      const row = document.createElement('div'); row.className = 'cp-row';
      if (q.multiSelect) row.append(btn('Listo', 'ok', () => nextQuestion(q)));
      row.append(btn('En Claude', 'alt', () => answer('claude')));
      elOpts.append(row);
      elFoot.textContent = 'Para escribir otra respuesta, contesta en Claude';
    } else {
      elTag.textContent = tag('TE PREGUNTA', p.session);
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
    const id = cur.p.id;
    api.promptAnswer(id, value);
    if (value === 'allow') say('Va, le di permiso.', 2, { badge: 'CLAUDE', user: true });
    else if (value === 'deny') say('Negado. Claude ya sabe que no.', 2, { badge: 'CLAUDE', user: true });
    else if (value && value.answers) say('Listo, le pasé tu respuesta.', 2, { badge: 'CLAUDE', user: true });
    else if (value === 'claude') say('Ok, contéstale tú en Claude.', 2, { badge: 'CLAUDE', user: true });
    else if (typeof value === 'string' && value !== 'close') say('Le mando: "' + value + '"', 2.5, { badge: 'CLAUDE', user: true });
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
    const k = cur.p.kind;
    say(k === 'permission' ? '¡Oye! Claude necesita tu permiso.' : k === 'question' ? 'Claude te está preguntando algo.' : 'Claude espera tu respuesta.',
      3, { badge: 'CLAUDE', user: true });
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

  // pruebas: ?cmdtest=__prompt:permission|question|reply
  window.capriTestPrompt = (kind) => {
    const id = 'test' + Date.now();
    const base = { id, session: 'Prueba' };
    const p = kind === 'question'
      ? { ...base, kind, questions: [{ question: '¿Qué color?', header: 'Color', multiSelect: false, options: [{ label: 'Rosa', description: 'El de Capri' }, { label: 'Verde', description: '' }] },
        { question: '¿Qué extras?', header: 'Extras', multiSelect: true, options: [{ label: 'Brillo', description: '' }, { label: 'Sombra', description: '' }] }] }
      : kind === 'reply' ? { ...base, kind, question: '¿Le hago el aviso de permisos a Capri?', buttons: ['Sí, hazlo', 'Todavía no'] }
        : { ...base, kind: 'permission', tool: 'Bash', detail: 'npm run build' };
    queue.push(p); show();
  };
})();
