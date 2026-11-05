'use strict';
// =====================================================================
//  Menú del clic derecho con la estética de Capri (en vez del menú de Windows).
//  El proceso principal manda los elementos como datos; al hacer clic se
//  regresa el id y allá se ejecuta la acción.
// =====================================================================
(() => {
  const root = document.getElementById('capri-menu');
  let levels = []; // paneles abiertos: [panel raíz, submenú, sub-submenú...]
  window.capriMenuOpen = false;

  function close() {
    if (!window.capriMenuOpen) return;
    window.capriMenuOpen = false;
    root.innerHTML = '';
    levels = [];
    api.menuOpen(false);
  }

  // los submenús siguen la dirección del anterior (si uno se abrió a la izquierda, los demás también)
  function place(panel, x, y, parentRect, depth) {
    root.appendChild(panel);
    const w = panel.offsetWidth, h = panel.offsetHeight;
    let left = x, top = y;
    if (parentRect) {
      const goLeft = () => parentRect.left - w + 4;
      const goRight = () => parentRect.right - 4;
      let dir = levels.length > 1 ? levels[levels.length - 1].dataset.dir : 'right';
      if (dir === 'left') { left = goLeft(); if (left < 8) { left = goRight(); dir = 'right'; } }
      else { left = goRight(); if (left + w > innerWidth - 8) { left = goLeft(); dir = 'left'; } }
      panel.dataset.dir = dir;
      top = parentRect.top - 8;
    } else {
      if (left + w > innerWidth - 8) left = x - w;
      if (top + h > innerHeight - 8) top = y - h;
    }
    panel.style.left = Math.round(Math.max(8, left)) + 'px';
    panel.style.top = Math.round(Math.max(8, Math.min(top, innerHeight - h - 8))) + 'px';
  }

  function build(items, depth, x, y, parentRect) {
    // cerrar paneles más profundos
    while (levels.length > depth) levels.pop().remove();
    const panel = document.createElement('div');
    panel.className = 'cm-panel';
    panel.innerHTML = '<div class="cm-slab"></div>';
    const body = document.createElement('div');
    body.className = 'cm-body';
    if (depth === 0) body.innerHTML = '<div class="cm-tag">CAPRI://MENU</div>';
    panel.appendChild(body);
    for (const it of items) {
      if (it.type === 'separator') { body.insertAdjacentHTML('beforeend', '<div class="cm-sep"></div>'); continue; }
      const row = document.createElement('div');
      row.className = 'cm-item' + (it.enabled ? '' : ' disabled') + (it.submenu ? ' has-sub' : '');
      const mark = it.type === 'checkbox' ? (it.checked ? '✓' : '') : it.type === 'radio' ? (it.checked ? '●' : '○') : '';
      row.innerHTML = `<span class="cm-mark ${it.type}">${mark}</span><span class="cm-label"></span>` +
        (it.accelerator ? `<span class="cm-acc">${it.accelerator}</span>` : '') + (it.submenu ? '<span class="cm-arrow">›</span>' : '');
      row.querySelector('.cm-label').textContent = it.label;
      if (it.enabled) {
        row.addEventListener('mouseenter', () => {
          body.querySelectorAll('.cm-item.open').forEach((r) => r.classList.remove('open'));
          if (it.submenu) { row.classList.add('open'); build(it.submenu, depth + 1, 0, 0, row.getBoundingClientRect()); }
          else while (levels.length > depth + 1) levels.pop().remove();
        });
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if (it.submenu) return;
          close();
          api.menuClick(it.id);
        });
      }
      body.appendChild(row);
    }
    place(panel, x, y, parentRect, depth);
    if (!parentRect) panel.dataset.dir = 'right';
    levels.push(panel);
  }

  api.onMenu((items, x, y) => {
    close();
    window.capriMenuOpen = true;
    api.menuOpen(true);
    build(items, 0, x + 4, y + 4, null);
  });

  // clic fuera del menú o Esc: cerrar
  addEventListener('mousedown', (e) => { if (window.capriMenuOpen && !e.target.closest('.cm-panel')) { e.stopPropagation(); close(); } }, true);
  addEventListener('contextmenu', (e) => { if (window.capriMenuOpen && !e.target.closest('.cm-panel')) { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  addEventListener('blur', close);
})();
