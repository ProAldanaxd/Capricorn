'use strict';
// =====================================================================
//  Avisos de Claude Code en Capri (hooks).
//
//  Claude Code corre hooks/capri-hook.js cuando:
//    · PermissionRequest  -> pide permiso para usar una herramienta
//    · PreToolUse AskUserQuestion -> te hace una pregunta con opciones
//    · PreToolUse mcp__ccd_turn__wrap_up -> deja botones de respuesta ("Sí, hazlo"...)
//  El script se lo pasa a Capri por un servidor local (solo 127.0.0.1, con token)
//  y espera. Capri te enseña botones; lo que TÚ elijas regresa a Claude Code.
//
//  Si Capri no contesta a tiempo, si eliges "En Claude" o si Claude está al frente,
//  la respuesta va vacía y Claude sigue como siempre (su propia ventanita).
//  Capri nunca aprueba nada sola.
// =====================================================================
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WAIT_MS = 100 * 1000; // lo que Capri espera tu respuesta antes de regresarle la pregunta a Claude
const REPLY_MS = 4 * 60 * 1000; // lo que duran a la vista los botones de respuesta

let server = null, token = '', infoFile = '';
let nextId = 1;
const pending = new Map(); // id -> { finish(value) }

function short(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function toolLabel(name) {
  const m = /^mcp__(.+?)__(.+)$/.exec(name || '');
  return m ? m[1] + ' · ' + m[2] : String(name || 'una herramienta');
}
function toolDetail(name, input) {
  const i = input || {};
  if (i.command) return short(i.command, 220);
  if (i.file_path || i.notebook_path) return short(i.file_path || i.notebook_path, 220);
  if (i.url) return short(i.url, 220);
  if (i.query) return short(i.query, 220);
  if (i.pattern) return short(i.pattern, 220);
  try { return short(JSON.stringify(i), 220); } catch { return ''; }
}

function start({ userData, getWin, isClaudeFront, sessionTitle, onReply, log }) {
  token = crypto.randomBytes(24).toString('hex');
  infoFile = path.join(userData, 'hooks.json');

  // manda un aviso a la ventana de Capri y espera tu respuesta (o el tiempo límite)
  function ask(prompt, waitMs) {
    const win = getWin();
    if (!win || win.isDestroyed()) return Promise.resolve(null);
    const id = nextId++;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true; clearTimeout(timer); pending.delete(id);
        const w = getWin();
        if (w && !w.isDestroyed()) w.webContents.send('prompt-close', id);
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), waitMs);
      pending.set(id, { finish });
      win.webContents.send('prompt', { id, ...prompt });
    });
  }

  async function handle(input) {
    const ev = input.hook_event_name;
    const tool = input.tool_name || '';
    const session = sessionTitle(input.session_id) || '';
    // si estás viendo Claude, que conteste ahí mismo
    if (isClaudeFront() && !process.env.CAPRI_HOOKS_ALWAYS) { log('llegó ' + ev + ' ' + tool + ' (Claude al frente: se queda en Claude)'); return ''; }

    if (ev === 'PermissionRequest') {
      if (tool === 'AskUserQuestion' || tool === 'ExitPlanMode') return ''; // esos van por su propio camino
      log('permiso ' + tool);
      const v = await ask({ kind: 'permission', session, tool: toolLabel(tool), detail: toolDetail(tool, input.tool_input) }, WAIT_MS);
      log('permiso ' + tool + ' -> ' + (v || 'sin respuesta'));
      if (v === 'allow') return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
      if (v === 'deny') return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'El usuario lo negó desde Capri.' } } });
      return '';
    }

    if (ev === 'PreToolUse' && tool === 'AskUserQuestion') {
      const qs = (input.tool_input && input.tool_input.questions) || [];
      if (!qs.length) return '';
      log('pregunta (' + qs.length + ')');
      const v = await ask({ kind: 'question', session, questions: qs.map((q) => ({
        question: String(q.question || ''), header: String(q.header || ''), multiSelect: !!q.multiSelect,
        options: (q.options || []).map((o) => ({ label: String(o.label || ''), description: String(o.description || '') })),
      })) }, WAIT_MS * 2);
      log('pregunta -> ' + (v && v.answers ? 'contestada' : 'sin respuesta'));
      if (!v || !v.answers) return '';
      return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow',
        updatedInput: { ...input.tool_input, answers: v.answers } } });
    }

    if (ev === 'PreToolUse' && tool === 'mcp__ccd_turn__wrap_up') {
      const ti = input.tool_input || {};
      // solo los botones que mandan texto (los de la app, como "commit", se quedan en Claude)
      const labels = (Array.isArray(ti.actions) ? ti.actions : []).filter((a) => a && a.label && !a.action).map((a) => String(a.label));
      if (!ti.ask || !labels.length) return '';
      const cli = input.session_id;
      log('botones (' + labels.length + ')');
      // no esperamos: Claude sigue y los botones se quedan en Capri un rato
      ask({ kind: 'reply', session, question: String(ti.ask), buttons: labels }, REPLY_MS).then((v) => {
        if (typeof v === 'string' && labels.includes(v)) onReply(cli, v);
      });
      return '';
    }
    return '';
  }

  server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/hook' || req.headers['x-capri-token'] !== token) { res.writeHead(403); res.end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      let out = '';
      try { out = await handle(JSON.parse(body.replace(/^﻿/, ''))); } catch (e) { log('hook error: ' + String(e && e.message || e)); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(out || '');
    });
  });
  server.listen(0, '127.0.0.1', () => {
    try { fs.writeFileSync(infoFile, JSON.stringify({ port: server.address().port, token, pid: process.pid })); } catch { /* sin permisos */ }
  });
  server.on('error', (e) => log('hooks server: ' + String(e && e.message || e)));
}

// la ventana contestó un aviso
function answer(id, value) {
  const p = pending.get(id);
  if (p) p.finish(value);
}

function stop() {
  for (const p of [...pending.values()]) p.finish(null);
  try { if (infoFile && JSON.parse(fs.readFileSync(infoFile, 'utf8')).token === token) fs.unlinkSync(infoFile); } catch { /* ya no está */ }
  if (server) server.close();
}

module.exports = { start, answer, stop };
