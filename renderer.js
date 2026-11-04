'use strict';
// =====================================================================
//  Capri - mascota de escritorio. Animación por cuadros desde el
//  spritesheet (assets/atlas.png + atlas.js), con el pelo meciéndose
//  encima, glitches, partículas y su "cerebro" de comportamientos.
// =====================================================================
const api = window.capri;
const LINES = window.LINES;
const ATLAS = window.ATLAS;
// Atlas en alta resolución: las coordenadas x/y son píxeles reales del PNG, pero el resto
// (tamaño y ancla) se pasa a unidades "lógicas" del spritesheet original para que todo lo
// demás (escala, físicas, hitbox) siga igual.
const AS = window.ATLAS_SCALE || 1;
for (const k in ATLAS) for (const f of ATLAS[k]) { f.w /= AS; f.h /= AS; f.ax /= AS; f.ay /= AS; }
const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');
const bubbleEl = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');

// ---------- utilidades ----------
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
const C = { pink: '#ff2368', green: '#27f59b', white: '#fff4f8', purple: '#6a2bff', cyan: '#22e0ff' };

// ---------- atlas ----------
const atlasImg = new Image();
let atlasReady = false;
atlasImg.onload = () => { atlasReady = true; };
atlasImg.src = AS > 1 ? 'assets/atlas_hd.png' : 'assets/atlas.png';

// Lienzo del personaje con espacio para el cuadro más grande alrededor del ancla
const PAD = 40;
const EXT = { up: 0, down: 0, side: 0 };
for (const k in ATLAS) for (const f of ATLAS[k]) {
  EXT.up = Math.max(EXT.up, f.ay); EXT.down = Math.max(EXT.down, f.h - f.ay);
  EXT.side = Math.max(EXT.side, f.ax, f.w - f.ax);
}
const CW = Math.ceil(EXT.side * 2 + PAD * 2), CH = Math.ceil(EXT.up + EXT.down + PAD * 2);
const AX = CW / 2, AY = EXT.up + PAD;
const TILE = 16;
// Al sentarse, sube lo justo para que las piernas toquen la barra de tareas
// (Windows siempre dibuja la barra encima de todo) y se sienta en un borde holográfico.
const SIT_LIFT = Math.max(...ATLAS.sit.map((f) => f.h - f.ay)) - 6;

// ---------- lienzos ----------
let W = innerWidth, H = innerHeight, DPR = window.devicePixelRatio || 1;
let S = parseFloat(localStorage.getItem('capri.scale3') || '0.75');
let floorPx = H - 48;
let charCv, charCtx, tintA, tintCtxA, tintC, tintCtxC;

function makeBuf() {
  const c = document.createElement('canvas');
  c.width = Math.ceil(CW * S * DPR);
  c.height = Math.ceil(CH * S * DPR);
  return c;
}
function buildBuffers() {
  charCv = makeBuf(); charCtx = charCv.getContext('2d');
  tintA = makeBuf(); tintCtxA = tintA.getContext('2d');
  tintC = makeBuf(); tintCtxC = tintC.getContext('2d');
}
function resize() {
  W = innerWidth; H = innerHeight; DPR = window.devicePixelRatio || 1;
  stage.width = Math.round(W * DPR); stage.height = Math.round(H * DPR);
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  buildBuffers();
}
resize();
addEventListener('resize', () => { resize(); keepInside(); });
api.onFloor((y) => {
  const wasOnFloor = typeof pet !== 'undefined' && onFloor();
  floorPx = y;
  if (typeof pet !== 'undefined') { if (wasOnFloor) pet.y = floorY(); keepInside(); }
});

// ---------- diálogos ----------
const lastLine = {};
function line(cat) {
  const arr = LINES[cat];
  if (!arr || !arr.length) return '';
  let s, tries = 0;
  do { s = pick(arr); } while (s === lastLine[cat] && arr.length > 1 && tries++ < 6);
  lastLine[cat] = s;
  return s;
}
const isNight = () => { const h = new Date().getHours(); return h >= 23 || h < 5; };

// ---------- estado ----------
const margin = () => 150 * S;
const floorY = () => floorPx - 1;
const minY = () => 330 * S + 10;
const onFloor = () => pet.y >= floorY() - 0.5;
function keepInside() { pet.x = clamp(pet.x, margin(), W - margin()); pet.y = clamp(pet.y, minY(), floorY()); }

const pet = {
  x: W - 300, y: floorPx - 1, vx: 0, vy: 0, facing: -1,
  mode: 'idle', modeT: 0, modeDur: 0, target: null, then: null, speed: 200,
  walkPhase: 0, alpha: 1, glitch: 0, spin: 0, hairPulse: 0,
  look: { x: 0, y: 0 }, lookT: { x: 0, y: 0 }, lookTimer: 0, turn: 0,
  sitIdx: 0, sitTimer: 3, bobAmp: 0,
};
const pose = { rot: 0, sx: 1, sy: 1, oy: 0 };
let curFrame = ATLAS.idle[0];

let T = 0;
let nextDecision = 4;
let lastInteract = Date.now();
let following = false;
let talkUntil = 0;
let greetCD = 0, stareCD = 0, farFor = 0, stareT = 0, petAcc = 0, petCD = 0, microGlitchAt = 6;

function setMode(m, dur = 0) { pet.mode = m; pet.modeT = 0; pet.modeDur = dur; }
function sendState() { api.sendState({ following, sleeping: pet.mode === 'sleep', scale: S }); }

// ---------- cursor ----------
const cur = { x: -9999, y: -9999, speed: 0, t: 0 };
api.onCursor((p) => {
  const now = performance.now();
  const dt = Math.max(1, now - (cur.t || now - 30));
  const d = Math.hypot(p.x - cur.x, p.y - cur.y);
  const sp = cur.x < -9000 ? 0 : (d / dt) * 1000;
  cur.speed = lerp(cur.speed, sp, 0.4);
  cur.x = p.x; cur.y = p.y; cur.t = now;
});

const bob = () => Math.sin(T * 2.2) * 7 * S * pet.bobAmp;
const baseY = () => pet.y + bob() + pose.oy * S;
function headWorld() {
  // la cabeza está aprox. a 55% de la altura del cuadro por encima del ancla
  return { x: pet.x, y: baseY() - curFrame.ay * S * 0.55 };
}
function hit(px, py) {
  const f = curFrame;
  const half = Math.max(f.ax, f.w - f.ax) * S * 0.75;
  const top = baseY() - f.ay * S * 0.95;
  const bot = baseY() + (f.h - f.ay) * S * 0.9;
  return px > pet.x - half && px < pet.x + half && py > top && py < bot;
}

// ---------- globo de texto ----------
const bub = { text: '', start: 0, until: 0, active: false };
const GLYPHS = '01#$%&@<>/\\|=+*';
function say(text, hold = 2.8) {
  if (!text) return;
  bub.text = text; bub.start = T; bub.active = true;
  bub.until = T + text.length * 0.03 + hold;
  talkUntil = T + text.length * 0.03 + 0.3;
  bubbleEl.classList.add('show');
}
function updateBubble() {
  if (!bub.active) return;
  const n = Math.floor((T - bub.start) / 0.03);
  let s = bub.text.slice(0, n);
  const rest = Math.min(3, bub.text.length - n);
  for (let i = 0; i < rest; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  if (bubbleText.textContent !== s) bubbleText.textContent = s;
  const bw = bubbleEl.offsetWidth, bh = bubbleEl.offsetHeight;
  const top0 = baseY() - curFrame.ay * S;
  let left = clamp(pet.x - bw / 2, 8, W - bw - 8);
  let top = top0 - bh - 4;
  if (top < 8) {
    const hw = headWorld();
    top = clamp(hw.y - bh / 2, 8, H - bh - 8);
    const off = EXT.side * S * 0.7;
    left = pet.x + off + bw < W ? pet.x + off : pet.x - off - bw;
  }
  bubbleEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  if (T > bub.until) { bub.active = false; bubbleEl.classList.remove('show'); }
}

// ---------- partículas ----------
const parts = [];
function emit(x, y, o = {}) {
  parts.push({ x, y, vx: o.vx ?? rand(-40, 40), vy: o.vy ?? rand(-40, 40), life: o.life ?? rand(0.4, 0.9),
    max: o.life ?? 0.8, size: o.size ?? rand(2, 5) * S * 1.4, col: o.col ?? pick([C.pink, C.pink, C.green, C.white]),
    txt: o.txt, g: o.g ?? 0 });
  if (parts.length > 400) parts.shift();
}
function burst(n) {
  for (let i = 0; i < n; i++) {
    emit(pet.x + rand(-130, 130) * S, baseY() - rand(10, 300) * S, { vx: rand(-170, 170), vy: rand(-170, 120), life: rand(0.3, 0.9) });
  }
}

// ---------- acciones ----------
function goTo(target, then = null, speed) {
  const tgt = { x: clamp(target.x, margin(), W - margin()), y: clamp(target.y, minY(), floorY()) };
  pet.target = tgt; pet.then = then;
  pet.speed = speed || rand(170, 270) * (S / 0.75);
  if (onFloor() && tgt.y < floorY() - 30) setMode('takeoff', 0.32); // impulso antes de volar
  else setMode('float');
}
function randomPoint() {
  return { x: rand(margin(), W - margin()), y: chance(0.5) ? floorY() : rand(minY(), floorY() - 60) };
}
function doGlitch(talk = true) { pet.glitch = 1; burst(25); if (talk && chance(0.35)) say(line('glitch')); }
function startTeleport() { setMode('tpOut', 0.4); }
function startSleep() {
  if (!onFloor()) { goTo({ x: pet.x, y: floorY() }, startSleep); return; }
  setMode('sleep', rand(40, 120)); say(line('sleep'), 2); sendState();
}
function wake() { setMode('stretch', 1.4); say(line('wake')); lastInteract = Date.now(); sendState(); }
function doJump(dur = 0.8) { setMode('jump', dur); pet.hairPulse = 1; }
function doWave() { if (pet.mode !== 'sit') setMode('wave', 1.6); say(line('wave')); }

const STATIC = new Set(['idle', 'talk', 'look', 'wave', 'stretch', 'dizzy']);
const INTERRUPTIBLE = new Set(['idle', 'look', 'sit', 'walk', 'talk']);

function decide() {
  nextDecision = T + rand(3, 8);
  if (following) return;
  const idleSec = (Date.now() - lastInteract) / 1000;
  if (idleSec > 150 && chance(0.45)) return startSleep();
  const fl = onFloor();
  const opts = [
    ['float', 20], ['walk', fl ? 22 : 0], ['floor', fl ? 0 : 12], ['sit', 14], ['sky', 4], ['dance', 4],
    ['jump', 5], ['glitch', 5], ['teleport', 4], ['muse', 6], ['look', 10],
  ];
  const total = opts.reduce((a, o) => a + o[1], 0);
  let r = Math.random() * total, choice = 'look';
  for (const [k, w] of opts) { if ((r -= w) <= 0) { choice = k; break; } }
  switch (choice) {
    case 'float': goTo(randomPoint()); break;
    case 'floor': goTo({ x: pet.x + rand(-300, 300), y: floorY() }); break;
    case 'walk':
      setMode('walk');
      pet.target = { x: clamp(pet.x + rand(-500, 500), margin(), W - margin()), y: floorY() };
      break;
    case 'sit':
      if (fl) startSit();
      else goTo({ x: pet.x + rand(-200, 200), y: floorY() }, startSit);
      break;
    case 'sky': setMode('sky', 3.5); if (chance(0.6)) say(line('sky')); break;
    case 'dance': setMode('dance', rand(3.2, 5)); if (chance(0.5)) say(line('dance')); break;
    case 'jump': doJump(); break;
    case 'glitch': doGlitch(); break;
    case 'teleport': startTeleport(); break;
    case 'muse': setMode('talk', 4); say(line(isNight() && chance(0.4) ? 'night' : 'muse'), 3.5); break;
    default: setMode('look', rand(2.5, 4.5));
  }
}
function startSit() { setMode('sit', rand(14, 35)); pet.sitIdx = 0; pet.sitTimer = rand(2, 4); }

// ---------- mouse ----------
let down = null;
let dragVx = 0, dragVy = 0, clickTimer = null;
let ignoring = true;

function updateIgnore() {
  const want = !(down || hit(cur.x, cur.y));
  if (want !== ignoring) { ignoring = want; api.setIgnore(want); }
}

addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !hit(e.clientX, e.clientY)) return;
  down = { x: e.clientX, y: e.clientY, ox: pet.x - e.clientX, oy: pet.y - e.clientY, moved: false,
    lx: e.clientX, ly: e.clientY, lt: performance.now(), shake: 0, lastSign: 0 };
});
addEventListener('mousemove', (e) => {
  if (!down) return;
  cur.x = e.clientX; cur.y = e.clientY;
  if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
    down.moved = true;
    setMode('drag');
    lastInteract = Date.now();
    if (chance(0.6)) say(line('drag'), 1.5);
  }
  if (down.moved) {
    const now = performance.now();
    const dt = Math.max(1, now - down.lt);
    const vx = ((e.clientX - down.lx) / dt) * 1000, vy = ((e.clientY - down.ly) / dt) * 1000;
    dragVx = lerp(dragVx, vx, 0.35); dragVy = lerp(dragVy, vy, 0.35);
    const sg = Math.sign(dragVx);
    if (Math.abs(dragVx) > 500 && sg !== down.lastSign) { if (down.lastSign !== 0) down.shake++; down.lastSign = sg; }
    down.lx = e.clientX; down.ly = e.clientY; down.lt = now;
    pet.x = clamp(e.clientX + down.ox, margin(), W - margin());
    pet.y = clamp(e.clientY + down.oy, minY(), floorY());
  }
});
addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !down) return;
  const d = down; down = null;
  if (d.moved) endDrag(d);
  else {
    if (clickTimer) return;
    clickTimer = setTimeout(() => { clickTimer = null; onClick(); }, 240);
  }
});
addEventListener('dblclick', (e) => {
  if (!hit(e.clientX, e.clientY)) return;
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
  lastInteract = Date.now();
  if (pet.mode === 'sleep') { wake(); return; }
  setMode('spin', 0.9);
  pet.glitch = 0.6; burst(20);
  say(line('spin'), 1.2);
});
addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (hit(e.clientX, e.clientY)) api.showMenu({ following, sleeping: pet.mode === 'sleep', scale: S });
});

function endDrag(d) {
  lastInteract = Date.now();
  if (d.shake >= 5) {
    setMode('dizzy', 3.2); say(line('dizzy'));
  } else if (Math.hypot(dragVx, dragVy) > 900) {
    setMode('fling'); pet.vx = dragVx * 0.7; pet.vy = dragVy * 0.7;
    if (chance(0.5)) say(line('fling'), 1.2);
  } else {
    if (pet.y > floorY() - 15 * S) { pet.y = floorY(); setMode('land', 0.25); }
    else setMode('idle');
    nextDecision = T + rand(3, 6);
    if (chance(0.45)) say(line('drop'));
  }
  dragVx = dragVy = 0;
}

function onClick() {
  lastInteract = Date.now();
  if (pet.mode === 'sleep') { wake(); return; }
  pet.hairPulse = 1;
  if (chance(0.25)) { doJump(); say(line('pet')); return; }
  if (pet.mode !== 'sit') setMode('talk', 3.5);
  pet.glitch = Math.max(pet.glitch, 0.35);
  say(line(isNight() && chance(0.3) ? 'night' : 'click'), 3.2);
}

api.onAction((a) => {
  lastInteract = Date.now();
  if (a === 'talk') onClick();
  else if (a === 'dance') { setMode('dance', 5); say(line('dance')); }
  else if (a === 'sky') { setMode('sky', 4); say(line('sky')); }
  else if (a === 'teleport') startTeleport();
  else if (a === 'sleep') startSleep();
  else if (a === 'wake') wake();
  else if (a === 'follow') {
    following = !following;
    if (following) { setMode('follow'); say(line('follow')); } else { setMode('idle'); say(line('unfollow')); }
    sendState();
  } else if (a.startsWith('scale:')) {
    const wasFloor = onFloor();
    S = parseFloat(a.slice(6));
    localStorage.setItem('capri.scale3', String(S));
    buildBuffers();
    keepInside(); if (wasFloor) pet.y = floorY();
    sendState();
  }
});

// ---------- lógica por frame ----------
function steer(tx, ty, maxSp, dt) {
  const dx = tx - pet.x, dy = ty - pet.y, dist = Math.hypot(dx, dy);
  const desired = Math.min(maxSp, dist * 2.4);
  const dvx = dist > 0.01 ? (dx / dist) * desired : 0, dvy = dist > 0.01 ? (dy / dist) * desired : 0;
  const k = Math.min(1, dt * 3.2);
  pet.vx += (dvx - pet.vx) * k; pet.vy += (dvy - pet.vy) * k;
  pet.x += pet.vx * dt; pet.y += pet.vy * dt;
  if (Math.abs(pet.vx) > 18) pet.facing = Math.sign(pet.vx);
  return dist;
}

function update(dt) {
  T += dt; pet.modeT += dt;
  const m = pet.mode;

  // --- percepción del cursor ---
  const hw = headWorld();
  const dx = cur.x - hw.x, dy = cur.y - hw.y, dist = Math.hypot(dx, dy);
  const NEAR = 360;
  const near = dist < NEAR && m !== 'sleep' && m !== 'tpOut';
  if (near) {
    pet.lookT.x = clamp(dx / 220, -1, 1);
    pet.lookT.y = clamp(dy / 220, -1, 1);
    if (farFor > 8 && T > greetCD && INTERRUPTIBLE.has(m)) { doWave(); greetCD = T + 25; }
    farFor = 0;
  } else {
    farFor += dt;
    pet.lookTimer -= dt;
    if (pet.lookTimer <= 0) {
      pet.lookTimer = m === 'look' ? rand(0.7, 1.3) : rand(1.5, 4);
      if (m === 'look' || chance(0.45)) pet.lookT = { x: rand(-1, 1), y: rand(-0.6, 0.4) };
      else pet.lookT = { x: 0, y: 0 };
    }
  }
  const lk = Math.min(1, dt * 6);
  pet.look.x = lerp(pet.look.x, pet.lookT.x, lk); pet.look.y = lerp(pet.look.y, pet.lookT.y, lk);
  // girar el cuerpo hacia donde mira (cuadros de IDLE: de frente -> perfil)
  if (STATIC.has(pet.mode)) {
    if (Math.abs(pet.look.x) > 0.12) pet.facing = Math.sign(pet.look.x);
  }
  pet.turn = lerp(pet.turn, clamp(Math.abs(pet.look.x) * 4.4, 0, 4), Math.min(1, dt * 5));

  // caricias
  if (dist < 120 * S / 0.75 && cur.speed > 250 && m !== 'drag' && !down) {
    petAcc += cur.speed * dt;
    if (petAcc > 900 && T > petCD) {
      petAcc = 0; petCD = T + 6; lastInteract = Date.now();
      if (m === 'sleep') wake(); else { doJump(); say(line('pet')); }
    }
  }
  petAcc = Math.max(0, petAcc - 300 * dt);

  if (dist < 170 && cur.speed < 30 && m !== 'sleep' && m !== 'drag') {
    stareT += dt;
    if (stareT > 7 && T > stareCD) { stareCD = T + 90; stareT = 0; say(line('stare')); }
  } else stareT = 0;

  if (m === 'sleep' && dist < 90 && cur.speed > 400) wake();

  // --- vida ---
  pet.glitch = Math.max(0, pet.glitch - dt * 1.8);
  pet.hairPulse = Math.max(m === 'dance' ? 0.7 : 0, pet.hairPulse - dt * 0.8);
  if (T > microGlitchAt) { microGlitchAt = T + rand(5, 16); if (m !== 'sleep') pet.glitch = Math.max(pet.glitch, rand(0.25, 0.5)); }

  const moving = m === 'float' || m === 'follow' || m === 'fling' || m === 'drag';
  if (!moving && m !== 'walk') { pet.vx *= Math.pow(0.02, dt); pet.vy *= Math.pow(0.02, dt); }

  switch (m) {
    case 'idle': case 'look': case 'talk': case 'sky': case 'wave': case 'stretch': case 'dance': case 'jump':
      if (pet.modeDur && pet.modeT > pet.modeDur) { setMode('idle'); nextDecision = T + rand(2, 5); }
      else if (m === 'idle' && T > nextDecision) decide();
      if ((m === 'dance' || m === 'jump') && chance(dt * 10)) emit(pet.x + rand(-120, 120) * S, baseY() - rand(0, 40) * S, { col: C.green, vy: rand(-60, -10) });
      break;
    case 'takeoff':
      if (pet.modeT >= pet.modeDur) { setMode('float'); pet.vy = -260 * (S / 0.75); burst(8); }
      break;
    case 'land':
      if (pet.modeT >= pet.modeDur) { setMode('idle'); nextDecision = T + rand(2, 5); }
      break;
    case 'float': {
      const d = steer(pet.target.x, pet.target.y, pet.speed, dt);
      if (Math.hypot(pet.vx, pet.vy) > 80 && chance(dt * 35)) {
        emit(pet.x - pet.facing * rand(0, 140) * S, baseY() - rand(100, 320) * S, { vx: -pet.vx * 0.15, vy: rand(-20, 20), life: rand(0.3, 0.7) });
      }
      if (d < 4) {
        const landed = pet.target.y >= floorY() - 1;
        pet.x = pet.target.x; pet.y = pet.target.y; pet.vx = pet.vy = 0;
        const then = pet.then; pet.then = null;
        if (then) then();
        else if (landed) { setMode('land', 0.28); burst(6); }
        else { setMode('idle'); nextDecision = T + rand(2, 6); }
      }
      break;
    }
    case 'walk': {
      const ddx = pet.target.x - pet.x;
      const sp = 110 * (S / 0.75);
      pet.facing = Math.sign(ddx) || pet.facing;
      pet.vx = pet.facing * sp;
      pet.x += pet.vx * dt; pet.y = floorY();
      pet.walkPhase += dt * 10;
      if (Math.abs(ddx) < 3) { pet.vx = 0; setMode('idle'); nextDecision = T + rand(2, 5); }
      break;
    }
    case 'follow': {
      const side = cur.x > pet.x ? -1 : 1;
      const tx = clamp(cur.x + side * 170 * S, margin(), W - margin());
      const ty = clamp(cur.y + 200 * S, minY(), floorY());
      if (Math.hypot(tx - pet.x, ty - pet.y) > 25) steer(tx, ty, 340 * (S / 0.75), dt);
      else { pet.vx *= 0.9; pet.vy *= 0.9; if (Math.abs(dx) > 30) pet.facing = Math.sign(dx); }
      break;
    }
    case 'fling': {
      pet.x += pet.vx * dt; pet.y += pet.vy * dt;
      const f = Math.pow(0.08, dt); pet.vx *= f; pet.vy *= f;
      pet.spin += (pet.vx / 400) * dt * 6;
      let bonk = false;
      if (pet.x < margin()) { pet.x = margin(); pet.vx = Math.abs(pet.vx) * 0.6; bonk = true; }
      if (pet.x > W - margin()) { pet.x = W - margin(); pet.vx = -Math.abs(pet.vx) * 0.6; bonk = true; }
      if (pet.y < minY()) { pet.y = minY(); pet.vy = Math.abs(pet.vy) * 0.6; bonk = true; }
      if (pet.y > floorY()) { pet.y = floorY(); pet.vy = -Math.abs(pet.vy) * 0.5; bonk = true; }
      if (bonk && Math.hypot(pet.vx, pet.vy) > 250) { pet.glitch = 0.8; burst(10); if (chance(0.5)) say(line('bonk'), 1.5); }
      if (chance(dt * 40)) emit(pet.x + rand(-80, 80) * S, baseY() - rand(60, 280) * S, { vx: -pet.vx * 0.1 });
      if (Math.hypot(pet.vx, pet.vy) < 25) setMode('dizzy', 1.6);
      break;
    }
    case 'dizzy':
      if (chance(dt * 3)) emit(hw.x + rand(-30, 30) * S, hw.y - 60 * S, { txt: pick(['@', '*', '?']), col: C.green, vy: -40, life: 0.8 });
      if (pet.modeT > pet.modeDur) { setMode('idle'); nextDecision = T + rand(2, 4); }
      break;
    case 'spin':
      pet.spin = (1 - Math.pow(1 - Math.min(1, pet.modeT / pet.modeDur), 3)) * TAU;
      if (pet.modeT >= pet.modeDur) { pet.spin = 0; setMode('idle'); nextDecision = T + rand(2, 4); }
      break;
    case 'sit':
      pet.y = floorY();
      pet.sitTimer -= dt;
      if (pet.sitTimer <= 0) {
        const r = Math.random();
        pet.sitIdx = pet.sitIdx !== 0 ? 0 : r < 0.4 ? 1 : r < 0.7 ? 2 : 3;
        pet.sitTimer = pet.sitIdx === 0 ? rand(2.5, 6) : rand(1.5, 3.5);
      }
      if (pet.modeT > pet.modeDur) setMode('stretch', 1.2);
      break;
    case 'sleep':
      if (chance(dt * 1.4)) {
        emit(pet.x + rand(0, 60) * S * pet.facing, baseY() - 90 * S, { txt: pick(['z', 'Z', '0', '1']), col: pick([C.green, C.white, C.pink]),
          vx: rand(5, 25), vy: rand(-45, -25), life: 2.2 });
      }
      if (pet.modeT > pet.modeDur) wake();
      break;
    case 'tpOut':
      pet.alpha = 1 - pet.modeT / pet.modeDur; pet.glitch = 1;
      if (chance(dt * 60)) burst(3);
      if (pet.modeT >= pet.modeDur) {
        const p = randomPoint(); pet.x = p.x; pet.y = p.y; pet.vx = pet.vy = 0;
        setMode('tpIn', 0.45); burst(25);
      }
      break;
    case 'tpIn':
      pet.alpha = Math.min(1, pet.modeT / pet.modeDur); pet.glitch = 1 - pet.alpha * 0.6;
      if (pet.modeT >= pet.modeDur) {
        pet.alpha = 1; setMode('idle'); nextDecision = T + rand(3, 6);
        if (chance(0.35)) say(line('teleport'));
      }
      break;
    case 'drag':
      dragVx *= Math.pow(0.05, dt); dragVy *= Math.pow(0.05, dt);
      pet.vx = dragVx; pet.vy = dragVy;
      break;
  }
  if (pet.mode !== 'fling' && pet.mode !== 'spin') pet.spin *= Math.pow(0.001, dt);
  const grounded = onFloor() && !['float', 'follow', 'drag', 'fling'].includes(pet.mode);
  pet.bobAmp = lerp(pet.bobAmp, grounded || pet.mode === 'drag' ? 0 : 1, Math.min(1, dt * 3));

  const P = poseTarget(T);
  const k = Math.min(1, dt * (pet.mode === 'drag' ? 12 : 9));
  for (const key in pose) pose[key] = lerp(pose[key], P[key], k);
  if (pet.mode === 'jump' || pet.mode === 'dance') pose.oy = P.oy; // el salto no se suaviza

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }

  curFrame = pickFrame();
  updateBubble();
  updateIgnore();
}

// Secuencia de REACCIÓN/SALTO: agacharse, impulso, salto, cima, aterrizar, recuperar
function jumpIdx(t) { return t < 0.1 ? 0 : t < 0.2 ? 1 : t < 0.32 ? 2 : t < 0.48 ? 3 : t < 0.62 ? 4 : 5; }
function jumpHop(t) { return -Math.sin(Math.PI * clamp((t - 0.2) / 0.42, 0, 1)) * 45; }

function pickFrame() {
  const m = pet.mode, t = pet.modeT;
  const talking = T < talkUntil;
  const sp = Math.hypot(pet.vx, pet.vy);
  const air = !onFloor();
  switch (m) {
    case 'walk': return ATLAS.walk[Math.floor(pet.walkPhase) % ATLAS.walk.length];
    case 'sit': return ATLAS.sit[talking ? 4 : pet.sitIdx];
    case 'sleep': return ATLAS.sleep[[0, 1, 2, 3, 4, 3, 2, 1][Math.floor(T * 2.2) % 8]];
    case 'jump': return ATLAS.jump[jumpIdx(t)];
    case 'dance': return ATLAS.jump[jumpIdx(t % 0.8)];
    case 'takeoff': return ATLAS.jump[t < 0.12 ? 0 : t < 0.24 ? 1 : 2];
    case 'land': return ATLAS.jump[t < 0.12 ? 4 : 5];
    case 'drag': case 'fling': return ATLAS.jump[3];
    case 'wave': case 'stretch': return ATLAS.jump[4];
    case 'sky': return ATLAS.jump[3];
    case 'float': case 'follow':
      if (sp > 60) return ATLAS.jump[air || pet.vy < -20 ? 3 : 2];
      return ATLAS.idle[Math.round(pet.turn)];
    default:
      return ATLAS.idle[Math.round(pet.turn)];
  }
}

function poseTarget(t) {
  const m = pet.mode;
  const breath = Math.sin(t * 2) * 0.01;
  const P = { rot: 0, sx: 1 - breath * 0.4, sy: 1 + breath, oy: 0 };
  const sp = Math.hypot(pet.vx, pet.vy);
  if ((m === 'float' || m === 'follow') && sp > 30) {
    P.rot = clamp(pet.vx / 1500, -0.15, 0.15);
  }
  switch (m) {
    case 'walk': P.oy = -Math.abs(Math.sin(pet.walkPhase * Math.PI / 3.5)) * 3; break;
    case 'jump': P.oy = jumpHop(pet.modeT); P.sx = P.sy = 1; break;
    case 'dance': P.oy = jumpHop(pet.modeT % 0.8) * 0.6; P.rot = Math.sin(t * 4) * 0.06; break;
    case 'wave': P.rot = Math.sin(t * 10) * 0.05; P.oy = -Math.abs(Math.sin(t * 5)) * 5; break;
    case 'sky': P.oy = -6; P.rot = -0.04; break;
    case 'stretch': {
      const k = Math.sin(Math.min(1, pet.modeT / pet.modeDur) * Math.PI);
      P.sy = 1 + k * 0.06; P.sx = 1 - k * 0.03;
      break;
    }
    case 'sleep': P.sy = 1 + Math.sin(t * 1.3) * 0.015; P.sx = 1 - Math.sin(t * 1.3) * 0.008; break;
    case 'sit': P.oy = -SIT_LIFT; break;
    case 'dizzy': P.rot = Math.sin(t * 5) * 0.12; break;
    case 'talk': if (T < talkUntil) P.oy = -Math.abs(Math.sin(t * 6)) * 2; break;
    case 'drag': P.rot = clamp(dragVx / 1600, -0.5, 0.5) + Math.sin(t * 6) * 0.05; break;
  }
  return P;
}

// ---------- dibujo ----------
function drawFrame(c, f, t) {
  c.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.clearRect(0, 0, CW, CH);
  if (!atlasReady) return;
  const windX = clamp(-pet.vx * pet.facing * 0.03, -24, 24) + (pet.mode === 'drag' ? clamp(-dragVx * pet.facing * 0.02, -26, 26) : 0);
  const windY = clamp(-pet.vy * 0.025, -18, 18);
  const sleep = pet.mode === 'sleep';
  const pulse = pet.hairPulse;
  const ox = AX - f.ax, oy = AY - f.ay;
  for (let ly = 0; ly < f.h; ly += TILE) {
    const th = Math.min(TILE, f.h - ly);
    for (let lx = 0; lx < f.w; lx += TILE) {
      const tw = Math.min(TILE, f.w - lx);
      const cx = lx + tw / 2, cy = ly + th / 2;
      // el pelo está arriba (o a la izquierda cuando duerme)
      const w = sleep ? smooth(1 - cx / (f.w * 0.55)) * 0.5 : smooth(1 - cy / (f.h * 0.5));
      let dx = 0, dy = 0;
      if (w > 0.01) {
        dx = w * (2.6 * Math.sin(t * 1.4 + cy * 0.035 + cx * 0.01) + 1.2 * Math.sin(t * 2.6 + cx * 0.04) + windX * w);
        dy = w * (1.8 * Math.sin(t * 1.8 + cx * 0.03) + windY * w * 0.6 - pulse * 4 * (1 - cy / f.h));
      }
      c.drawImage(atlasImg, f.x + lx * AS, f.y + ly * AS, tw * AS, th * AS, ox + lx + dx - 0.5, oy + ly + dy - 0.5, tw + 1, th + 1);
    }
  }
}

function tint(tc, col) {
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.globalCompositeOperation = 'copy';
  tc.drawImage(charCv, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = col; tc.fillRect(0, 0, tc.canvas.width, tc.canvas.height);
  tc.globalCompositeOperation = 'source-over';
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawFrame(charCtx, curFrame, T);
  const g = pet.glitch;
  if (g > 0.05) { tint(tintCtxA, C.purple); tint(tintCtxC, C.cyan); }

  // borde holográfico donde se sienta
  const ledge = clamp(-pose.oy / SIT_LIFT, 0, 1) * (pet.mode === 'sit' ? 1 : 0.6);
  if (ledge > 0.05 && pet.mode !== 'jump' && pet.mode !== 'dance') {
    const ly = baseY() + 2 * S, x0 = pet.x - (pet.facing > 0 ? 120 : 150) * S, x1 = pet.x + (pet.facing > 0 ? 150 : 120) * S;
    ctx.save();
    ctx.globalAlpha = ledge * pet.alpha * (0.85 + Math.sin(T * 3) * 0.15);
    ctx.shadowColor = C.pink; ctx.shadowBlur = 12;
    ctx.fillStyle = C.pink; ctx.fillRect(x0, ly, x1 - x0, 3 * S + 1);
    ctx.shadowColor = C.green; ctx.fillStyle = C.green;
    ctx.fillRect(x0 + 6, ly + 4 * S + 1, (x1 - x0) * 0.35, 1.5);
    ctx.fillRect(x0 + (x1 - x0) * 0.6, ly + 4 * S + 1, (x1 - x0) * 0.3, 1.5);
    ctx.restore();
  }

  const dw = CW * S, dh = CH * S, dx = -AX * S, dy = -AY * S;
  const pivot = -curFrame.ay * S * 0.45;
  ctx.save();
  ctx.globalAlpha = pet.alpha;
  ctx.translate(pet.x, baseY());
  ctx.translate(0, pivot);
  ctx.rotate(pose.rot + pet.spin);
  ctx.translate(0, -pivot);
  ctx.scale(pet.facing * pose.sx, pose.sy);
  if (g > 0.05) {
    ctx.globalAlpha = pet.alpha * Math.min(1, g * 1.3);
    ctx.drawImage(tintA, dx - 4 - g * 8, dy + 1, dw, dh);
    ctx.drawImage(tintC, dx + 4 + g * 8, dy - 1, dw, dh);
    ctx.globalAlpha = pet.alpha;
  }
  if (g > 0.3) {
    const slices = 12, srcH = charCv.height / slices, dstH = dh / slices;
    for (let i = 0; i < slices; i++) {
      const off = chance(g * 0.6) ? rand(-16, 16) * g * S * 2 : 0;
      ctx.drawImage(charCv, 0, i * srcH, charCv.width, srcH, dx + off, dy + i * dstH, dw, dstH);
    }
  } else {
    ctx.drawImage(charCv, dx, dy, dw, dh);
  }
  ctx.restore();

  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.col;
    if (p.txt) { ctx.font = `bold ${Math.round(15 * S / 0.75)}px Consolas, monospace`; ctx.fillText(p.txt, p.x, p.y); }
    else ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ---------- arranque ----------
setMode('tpIn', 0.8);
pet.alpha = 0;
setTimeout(() => {
  const h = new Date().getHours();
  say(line(h >= 5 && h < 12 ? 'greetMorning' : h < 19 && h >= 12 ? 'greetAfternoon' : 'greetNight'), 3.5);
}, 900);
sendState();

// Modo demo (CAPRI_DEMO=1): recorre cada animación en el mismo lugar, para revisarlas.
const DEMO_Q = new URLSearchParams(location.search).get('demo');
const DEMO = !!DEMO_Q;
const DEMO_SEQ = DEMO_Q && DEMO_Q !== '1' ? DEMO_Q.split(',') : ['idle', 'look', 'walk', 'sit', 'sleep', 'jump', 'float', 'drag'];
let demoI = -1, demoNext = 1.5;
function demoStep() {
  if (T < demoNext) return;
  demoI = (demoI + 1) % DEMO_SEQ.length; demoNext = T + 2.5;
  const m = DEMO_SEQ[demoI];
  pet.x = W / 2; pet.y = floorY(); pet.alpha = 1;
  if (m === 'walk') { setMode('walk'); pet.target = { x: -1e6, y: floorY() }; }
  else if (m === 'sit') startSit();
  else if (m === 'sleep') setMode('sleep', 99);
  else if (m === 'jump') setMode('dance', 99);
  else if (m === 'float') { setMode('float'); pet.y = floorY() - 200; pet.target = { x: W / 2 + 1e6, y: floorY() - 200 }; }
  else if (m === 'drag') setMode('drag');
  else if (m === 'look') { setMode('look', 99); }
  else setMode('idle', 99);
  say('demo: ' + m, 1.5);
}

let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (DEMO) { demoStep(); nextDecision = T + 99; if (pet.mode === 'walk' || pet.mode === 'float') pet.x = W / 2; }
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
