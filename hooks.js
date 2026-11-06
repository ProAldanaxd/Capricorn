'use strict';
// =====================================================================
//  Avisos de Claude Code y Antigravity en Capri (hooks).
//
//  Las dos apps corren hooks/capri-hook.js en ciertos momentos; el script se lo pasa a
//  Capri por un servidor local (solo 127.0.0.1, con token) y regresa lo que tú elijas.
//
//  Claude Code (~/.claude/settings.json):
//    · PermissionRequest            -> permiso: Permitir / Negar / En Claude
//    · PreToolUse AskUserQuestion   -> pregunta con opciones (se contesta desde Capri)
//    · PreToolUse wrap_up           -> botones de respuesta ("Sí, hazlo"...)
//    · PreToolUse (todas) y Stop    -> la línea de "qué está haciendo"
//  Antigravity (~/.gemini/config/hooks.json):
//    · PreToolUse de comandos y escritura de archivos -> Permitir / Negar / En Antigravity
//    · PreToolUse ask_question      -> aviso con la pregunta (se contesta en Antigravity)
//    · PreToolUse (todas) y Stop    -> la línea de "qué está haciendo" y "ya acabó"
//
//  Si Capri no contesta a tiempo, si eliges "En Claude/Antigravity" o si esa app está al
//  frente, la respuesta es la neutral y la app sigue como siempre. Capri nunca aprueba sola.
// =====================================================================
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WAIT_MS = 100 * 1000;     // lo que Capri espera tu respuesta en Claude Code
const AG_WAIT_MS = 90 * 1000;   // en Antigravity (su hook tiene 110 s)
const REPLY_MS = 4 * 60 * 1000; // lo que duran a la vista los botones de respuesta / avisos

// Antigravity: herramientas por las que Capri pregunta (leer y buscar pasan directo)
const AG_GATED = new Set(['run_command', 'write_to_file', 'replace_file_content', 'multi_replace_file_content']);

let server = null, token = '', infoFile = '';
let nextId = 1;
const pending = new Map(); // id -> { finish(value) }

function short(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
const base = (p) => path.basename(String(p || '').replace(/[\\/]+$/, '')) || String(p || '');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return short(u, 30); } };

function toolLabel(name) {
  const m = /^mcp__(.+?)__(.+)$/.exec(name || '');
  return m ? m[1] + ' · ' + m[2] : String(name || 'una herramienta');
}
function toolDetail(input) {
  const i = input || {};
  const v = i.command || i.file_path || i.notebook_path || i.url || i.query || i.pattern;
  if (v) return short(v, 220);
  try { return short(JSON.stringify(i), 220); } catch { return ''; }
}

// ---------------------------------------------------------------- "qué está haciendo"
function claudeActivity(tool, i = {}) {
  const f = base(i.file_path || i.notebook_path || '');
  switch (tool) {
    case 'Read': return 'leyendo ' + f;
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return 'editando ' + f;
    case 'Write': return 'escribiendo ' + f;
    // la descripción del comando se lee mejor que el comando (que puede ser un script largo)
    case 'Bash': case 'PowerShell': return 'corriendo: ' + short(i.description || String(i.command || '').split('\n')[0], 46);
    case 'Grep': return 'buscando "' + short(i.pattern, 28) + '"';
    case 'Glob': return 'buscando archivos ' + short(i.pattern, 28);
    case 'WebFetch': return 'leyendo ' + host(i.url);
    case 'WebSearch': return 'buscando en internet';
    case 'Agent': case 'Task': return 'mandó a un ayudante';
    case 'AskUserQuestion': return 'te está preguntando algo';
    case 'TodoWrite': case 'mcp__ccd_turn__update_plan': return 'organizando sus pendientes';
    case 'mcp__ccd_turn__wrap_up': return 'terminando';
    case 'ToolSearch': return 'buscando herramientas';
    case 'Skill': return 'usando una habilidad';
  }
  if (/^mcp__(Claude_Browser|claude-in-chrome)__/.test(tool)) return 'usando el navegador';
  const m = /^mcp__(.+?)__/.exec(tool);
  return 'usando ' + (m ? m[1] : tool);
}
function agFile(a = {}) { return a.TargetFile || a.AbsolutePath || a.File || a.FilePath || a.Path || a.DirectoryPath || a.SearchPath || ''; }
function agActivity(tool, a = {}) {
  const f = base(agFile(a));
  switch (tool) {
    case 'view_file': return 'leyendo ' + f;
    case 'write_to_file': return 'escribiendo ' + f;
    case 'replace_file_content': case 'multi_replace_file_content': return 'editando ' + f;
    case 'list_dir': return 'viendo la carpeta ' + f;
    case 'find_by_name': return 'buscando archivos';
    case 'grep_search': return 'buscando "' + short(a.Query || a.Pattern || '', 28) + '"';
    case 'search_web': return 'buscando en internet';
    case 'read_url_content': return 'leyendo ' + host(a.Url || a.URL || '');
    case 'run_command': return 'corriendo: ' + short(String(a.CommandLine || '').split('\n')[0], 46);
    case 'ask_question': return 'te está preguntando algo';
    case 'manage_task': return 'organizando sus pendientes';
    case 'generate_image': return 'haciendo una imagen';
    case 'invoke_subagent': case 'define_subagent': case 'send_message': case 'manage_subagents': return 'trabajando con ayudantes';
  }
  if (/^browser_/.test(tool)) return 'usando el navegador';
  return 'usando ' + String(tool || 'una herramienta').replace(/_/g, ' ');
}

function start({ userData, getWin, isFront, sessionTitle, onReply, onAgFocus, log }) {
  token = crypto.randomBytes(24).toString('hex');
  infoFile = path.join(userData, 'hooks.json');

  const toWin = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  const status = (src, key, session, text) => toWin('status', { src, key, session, text });
  const statusDone = (src, key, notify, reason) => toWin('status', { src, key, done: true, notify, reason });

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
        toWin('prompt-close', id);
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), waitMs);
      pending.set(id, { finish });
      win.webContents.send('prompt', { id, ...prompt });
    });
  }

  // ------------------------------------------------------------ Claude Code
  async function handleClaude(input) {
    const ev = input.hook_event_name;
    const tool = input.tool_name || '';
    const key = input.session_id || '';
    const session = sessionTitle('claude', key) || '';

    if (ev === 'Stop') { statusDone('claude', key, false); return ''; }
    if (ev === 'PreToolUse') status('claude', key, session, claudeActivity(tool, input.tool_input));

    // si estás viendo Claude, que conteste ahí mismo
    const gated = ev === 'PermissionRequest' || (ev === 'PreToolUse' && (tool === 'AskUserQuestion' || tool === 'mcp__ccd_turn__wrap_up'));
    if (!gated) return '';
    if (isFront('claude') && !process.env.CAPRI_HOOKS_ALWAYS) { log('llegó ' + ev + ' ' + tool + ' (Claude al frente: se queda en Claude)'); return ''; }

    if (ev === 'PermissionRequest') {
      if (tool === 'AskUserQuestion' || tool === 'ExitPlanMode') return ''; // esos van por su propio camino
      log('permiso ' + tool);
      const v = await ask({ kind: 'permission', app: 'claude', session, title: 'Claude quiere usar ' + toolLabel(tool), detail: toolDetail(input.tool_input) }, WAIT_MS);
      log('permiso ' + tool + ' -> ' + (v || 'sin respuesta'));
      if (v === 'allow') return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
      if (v === 'deny') return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'El usuario lo negó desde Capri.' } } });
      return '';
    }

    if (tool === 'AskUserQuestion') {
      const qs = (input.tool_input && input.tool_input.questions) || [];
      if (!qs.length) return '';
      log('pregunta (' + qs.length + ')');
      const v = await ask({ kind: 'question', app: 'claude', session, questions: qs.map((q) => ({
        question: String(q.question || ''), header: String(q.header || ''), multiSelect: !!q.multiSelect,
        options: (q.options || []).map((o) => ({ label: String(o.label || ''), description: String(o.description || '') })),
      })) }, WAIT_MS * 2);
      log('pregunta -> ' + (v && v.answers ? 'contestada' : 'sin respuesta'));
      if (!v || !v.answers) return '';
      return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow',
        updatedInput: { ...input.tool_input, answers: v.answers } } });
    }

    // wrap_up: solo los botones que mandan texto (los de la app, como "commit", se quedan en Claude)
    const ti = input.tool_input || {};
    const labels = (Array.isArray(ti.actions) ? ti.actions : []).filter((a) => a && a.label && !a.action).map((a) => String(a.label));
    if (!ti.ask || !labels.length) return '';
    log('botones (' + labels.length + ')');
    // no esperamos: Claude sigue y los botones se quedan en Capri un rato
    ask({ kind: 'reply', app: 'claude', session, question: String(ti.ask), buttons: labels }, REPLY_MS).then((v) => {
      if (typeof v === 'string' && labels.includes(v)) onReply(key, v);
    });
    return '';
  }

  // ------------------------------------------------------------ Antigravity
  async function handleAg(input, ev) {
    const key = input.conversationId || '';
    const session = sessionTitle('ag', key) || '';
    const ALLOW = JSON.stringify({ decision: 'allow' }); // = seguir con lo que Antigravity haría normalmente

    if (ev === 'stop') {
      const front = isFront('antigravity');
      statusDone('ag', key, !front, String(input.terminationReason || ''));
      log('antigravity terminó (' + (input.terminationReason || '?') + ')');
      return '{}';
    }
    if (ev !== 'pre') return '{}';

    const call = input.toolCall || {};
    const tool = String(call.name || '');
    const a = call.args || {};
    status('ag', key, session, agActivity(tool, a));

    if (!AG_GATED.has(tool) && tool !== 'ask_question') return ALLOW;
    if (isFront('antigravity') && !process.env.CAPRI_HOOKS_ALWAYS) { log('llegó antigravity ' + tool + ' (Antigravity al frente: se queda ahí)'); return ALLOW; }

    if (tool === 'ask_question') {
      const qs = Array.isArray(a.questions) ? a.questions : [];
      const q = qs[0] || {};
      const opts = (q.options || []).map((o) => (typeof o === 'string' ? o : o && (o.label || o.text || o.title)) || '').filter(Boolean);
      log('antigravity pregunta (' + qs.length + ')');
      ask({ kind: 'notice', app: 'ag', session, title: 'Antigravity te está preguntando',
        question: String(q.question || '') + (qs.length > 1 ? `  (y ${qs.length - 1} más)` : ''),
        detail: opts.length ? opts.map((o) => '· ' + o).join('\n') : '', buttons: ['Ir a Antigravity', 'Ok'] }, REPLY_MS).then((v) => {
        if (v === 'Ir a Antigravity') onAgFocus();
      });
      return ALLOW;
    }

    const f = agFile(a);
    const title = tool === 'run_command' ? 'Antigravity quiere correr un comando'
      : tool === 'write_to_file' ? 'Antigravity quiere escribir ' + base(f) : 'Antigravity quiere editar ' + base(f);
    const detail = tool === 'run_command' ? short(a.CommandLine, 220) : short(f, 220);
    log('antigravity permiso ' + tool);
    const v = await ask({ kind: 'permission', app: 'ag', session, title, detail }, AG_WAIT_MS);
    log('antigravity permiso ' + tool + ' -> ' + (v || 'sin respuesta'));
    if (v === 'allow') return JSON.stringify({ decision: 'auto_approve', reason: 'Lo aprobaste desde Capri.' });
    if (v === 'deny') return JSON.stringify({ decision: 'deny', reason: 'El usuario lo negó desde Capri.' });
    return ALLOW;
  }

  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'POST' || u.pathname !== '/hook' || req.headers['x-capri-token'] !== token) { res.writeHead(403); res.end(); return; }
    const isAg = u.searchParams.get('src') === 'ag', ev = u.searchParams.get('ev') || '';
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 4e6) req.destroy(); });
    req.on('end', async () => {
      let out = '';
      try {
        const input = JSON.parse(body.replace(/^﻿/, '') || '{}');
        out = isAg ? await handleAg(input, ev) : await handleClaude(input);
      } catch (e) { log('hook error: ' + String(e && e.message || e)); out = isAg ? (ev === 'pre' ? '{"decision":"allow"}' : '{}') : ''; }
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
