'use strict';
// =====================================================================
//  Pasarle texto a la app de escritorio de Claude (chat o Claude Code).
//
//  - Primer mensaje: link claude://.../new?q=... -> conversación nueva con el texto
//    ya escrito (la app se abre si está cerrada o viene al frente si está abierta).
//  - Mensajes siguientes: siguen en la MISMA conversación hasta que pidas una nueva
//    o se cierre Capri. Como los links no dejan escribir en una conversación abierta,
//    Capri trae Claude al frente, pega el texto con el portapapeles y le da Enter.
//      · Claude Code: regresa a la sesión correcta con claude://code/continue?session=ID
//      · Chat: pega en el chat que esté abierto en ese momento.
//  - Nunca presiona teclas si la ventana del frente no es Claude.
// =====================================================================
const { shell, clipboard } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX = 14000; // la app recorta a ~14k caracteres

// Conversación en curso (se olvida al cerrar Capri)
const convo = { chat: false, code: null }; // code: id de la sesión ('local_...') o null
let codeTitle = '';

function buildNewUrl(target, text, config) {
  const p = new URLSearchParams();
  p.set('q', String(text || '').slice(0, MAX));
  if (target === 'code') {
    const folder = String(config.carpetaClaudeCode || '').trim();
    if (folder) p.append('folder', folder);
    return 'claude://code/new?' + p.toString();
  }
  p.set('surface', 'chat');
  return 'claude://claude.ai/new?' + p.toString();
}

function isRunning() {
  return new Promise((res) => execFile('tasklist.exe', ['/FI', 'IMAGENAME eq claude.exe', '/NH'], { windowsHide: true },
    (err, out) => res(!err && /claude\.exe/i.test(String(out)))));
}

// ---------------------------------------------------------------- sesiones de Claude Code
// La app guarda cada sesión en %LOCALAPPDATA%\Claude-Data\claude_*\claude-code-sessions\...\local_*.json
function sessionDirs() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Claude-Data');
  try {
    return fs.readdirSync(base).filter((d) => d.startsWith('claude_'))
      .map((d) => path.join(base, d, 'claude-code-sessions')).filter((d) => fs.existsSync(d));
  } catch { return []; }
}
function walk(dir, out) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/^local_[A-Za-z0-9-]+\.json$/.test(e.name)) out.push(p);
  }
  return out;
}
function listCodeSessions(limit = 10) {
  const files = [];
  for (const d of sessionDirs()) walk(d, files);
  const all = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!j.sessionId || j.isArchived) continue;
      all.push({ id: j.sessionId, title: String(j.title || 'Sin título'), cwd: String(j.cwd || ''),
        last: j.lastActivityAt || j.createdAt || 0, created: j.createdAt || 0 });
    } catch { /* archivo a medio escribir */ }
  }
  all.sort((a, b) => b.last - a.last);
  return limit ? all.slice(0, limit) : all;
}
// Después de abrir una sesión nueva, buscar cuál es (la creada después de 'since')
async function findNewCodeSession(since, waitMs = 20000) {
  const end = Date.now() + waitMs;
  while (Date.now() < end) {
    const s = listCodeSessions(0).filter((x) => x.created >= since - 3000).sort((a, b) => b.created - a.created)[0];
    if (s) return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// ---------------------------------------------------------------- teclas
// keys: 'enter' (el texto ya está escrito) | 'paste' (Ctrl+V y luego Enter)
// pull: traer Claude al frente desde el principio (cuando no se abrió ningún link)
function focusAndType({ timeout, settle, keys, enter, minimize, pull }) {
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Name F -Namespace W -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, System.UIntPtr e);
'@
function Fg { [uint32]$p = 0; [void][W.F]::GetWindowThreadProcessId([W.F]::GetForegroundWindow(), [ref]$p); $x = Get-Process -Id $p; if ($x) { $x.ProcessName } else { '' } }
function Key([byte]$k) { [W.F]::keybd_event($k, 0, 0, [UIntPtr]::Zero); [W.F]::keybd_event($k, 0, 2, [UIntPtr]::Zero) }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
# Pone el cursor en la caja de escribir de Claude (un editor "ProseMirror" llamado "Prompt").
# La primera consulta a veces llega vacía mientras la app activa su accesibilidad: reintenta.
function FocusPrompt($h) {
  $AE = [System.Windows.Automation.AutomationElement]
  $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  for ($i = 0; $i -lt 8; $i++) {
    $root = $AE::FromHandle($h)
    $best = $null
    foreach ($e in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
      $c = $e.Current
      if ($c.IsOffscreen -or $c.ClassName -notmatch 'ProseMirror') { continue }
      if ($c.HasKeyboardFocus) { return 'already' }
      if (-not $best -or $c.BoundingRectangle.Bottom -gt $best.Current.BoundingRectangle.Bottom) { $best = $e }
    }
    if ($best) { try { $best.SetFocus(); Start-Sleep -Milliseconds 200; return 'focused' } catch { } }
    Start-Sleep -Milliseconds 500
  }
  return 'noprompt'
}
function Pull {
  $h = (Get-Process claude | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
  if (-not $h) { return }
  if ([W.F]::IsIconic($h)) { [void][W.F]::ShowWindow($h, 9) }
  Key 0x12
  [void][W.F]::SetForegroundWindow($h)
}
$start = [DateTime]::Now; $end = $start.AddSeconds(${timeout}); $pulled = 0
if (${pull ? '$true' : '$false'}) { Pull; $pulled = 1 }
while ((Fg) -ne 'claude') {
  if ([DateTime]::Now -gt $end) { 'nofocus'; exit }
  if (([DateTime]::Now - $start).TotalSeconds -gt 2.5 -and $pulled -lt 3) { Pull; $pulled++ }
  Start-Sleep -Milliseconds 250
}
Start-Sleep -Milliseconds ${settle}
if ((Fg) -ne 'claude') { 'nofocus'; exit }
$win = [W.F]::GetForegroundWindow()
$fp = FocusPrompt $win
"prompt:$fp"
if ((Fg) -ne 'claude') { 'nofocus'; exit }
if (${keys === 'paste' ? '$true' : '$false'}) {
  if ($fp -eq 'noprompt') { 'noprompt'; exit }
  [W.F]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); Key 0x56; [W.F]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 500
}
if (${enter ? '$true' : '$false'}) {
  if ((Fg) -ne 'claude') { 'nofocus'; exit }
  Key 0x0D
  if (${minimize ? '$true' : '$false'}) { Start-Sleep -Milliseconds 1200; [void][W.F]::ShowWindow($win, 6); 'sent-min' } else { 'sent' }
} else { 'focused' }
`;
  return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
    { windowsHide: true, timeout: (timeout + 15) * 1000 },
    (err, out) => {
      const lines = String(out || '').trim().split(/\s+/);
      const s = lines.pop();
      log(`teclas=${keys} pull=${pull} -> ${lines.join(' ')} ${s}${err ? ' ERR ' + String(err.message || err).slice(0, 200) : ''}`);
      // sin caja de escribir: lo tratamos como "no pude pegar" (el texto queda copiado)
      res(s === 'sent-min' ? 'sent' : s === 'noprompt' ? 'nofocus' : ['sent', 'nofocus', 'focused'].includes(s) ? s : 'error');
    }));
}

// registro de envíos para revisar fallas: %APPDATA%\capricorn\claude.log (sin el texto que mandaste)
function log(msg) {
  try {
    const { app } = require('electron');
    const f = path.join(app.getPath('userData'), 'claude.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 200000) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, new Date().toISOString() + ' ' + msg + '\n');
  } catch { /* sin permisos */ }
}

// Pegar con el portapapeles sin perder lo que tenías copiado.
// Si no se pudo pegar ('nofocus'), el texto se queda copiado para que lo pegues tú.
// (Electron 45 solo maneja texto en el portapapeles: si tenías una imagen copiada, se reemplaza.)
async function withClipboard(text, fn) {
  // en Electron 45 el portapapeles es asíncrono (readText/writeText regresan promesas)
  let saved = '';
  try { saved = String(await clipboard.readText() || ''); } catch { /* portapapeles ocupado */ }
  await clipboard.writeText(text);
  let result;
  try { result = await fn(); return result; }
  catch (e) { log('error al pegar: ' + String(e && e.message || e)); return 'error'; }
  finally {
    if (result !== 'nofocus') setTimeout(() => { Promise.resolve(clipboard.writeText(saved)).catch(() => {}); }, 600);
  }
}

// ---------------------------------------------------------------- enviar
// target: 'chat' | 'code' · opts.minimize: minimizar Claude después del Enter (opción "Ventanas")
async function send(target, text, config, opts = {}) {
  const q = String(text || '').trim().slice(0, MAX);
  if (!q) return { ok: false, error: 'empty' };
  const enter = config.claudeDarEnter !== false;
  const truncated = String(text).trim().length > MAX;
  const cont = target === 'code' ? !!convo.code : convo.chat;
  const dry = !!process.env.CAPRI_CLAUDE_DRY;
  const warm = dry ? true : await isRunning();

  // seguir en la misma conversación
  if (cont && (warm || target === 'code')) {
    if (dry) { console.log('[claude dry] continuar', target, target === 'code' ? convo.code : '(chat abierto)', JSON.stringify(q)); return { ok: true, result: 'dry', mode: 'continue', title: codeTitle }; }
    let pull = true;
    if (target === 'code') {
      try { await shell.openExternal('claude://code/continue?session=' + encodeURIComponent(convo.code)); pull = false; }
      catch (e) { return { ok: false, error: 'open', detail: String(e && e.message || e) }; }
    }
    log(`continuar ${target} ${target === 'code' ? convo.code : ''} (${q.length} letras)`);
    // tras abrir la sesión, darle tiempo a que cargue antes de buscar la caja de escribir
    const result = await withClipboard(q, () => focusAndType({ timeout: warm ? 12 : 40, settle: warm ? (pull ? 600 : 2200) : 5000, keys: 'paste', enter, minimize: !!opts.minimize, pull }));
    return { ok: result !== 'error', result, mode: 'continue', title: target === 'code' ? codeTitle : '', minimized: result === 'sent' && !!opts.minimize, truncated };
  }

  // conversación nueva
  const url = buildNewUrl(target, q, config);
  if (dry) { console.log('[claude dry] nueva', url, 'enter=' + enter, 'minimize=' + !!opts.minimize); mark(target, null); return { ok: true, result: 'dry', mode: 'new' }; }
  const since = Date.now();
  log(`nueva ${target} (${q.length} letras) app ${warm ? 'abierta' : 'cerrada'}`);
  try { await shell.openExternal(url); }
  catch (e) { return { ok: false, error: 'open', detail: String(e && e.message || e) }; }
  // en frío la app tarda en cargar la conversación: esperamos más antes del Enter
  const result = await focusAndType({ timeout: warm ? 12 : 40, settle: warm ? 1800 : 5000, keys: 'enter', enter, minimize: !!opts.minimize });
  if (result !== 'error') {
    if (target === 'code') { const s = await findNewCodeSession(since); mark('code', s); log('sesión nueva: ' + (s ? s.id : 'no encontrada, uso la última')); }
    else mark('chat');
  }
  return { ok: result !== 'error', result, mode: 'new', title: target === 'code' ? codeTitle : '', minimized: result === 'sent' && !!opts.minimize, cold: !warm, truncated };
}
function mark(target, s) {
  if (target === 'code') { convo.code = s ? s.id : (process.env.CAPRI_CLAUDE_DRY ? 'local_prueba' : 'last'); codeTitle = s ? s.title : ''; }
  else convo.chat = true;
}

// Empezar de nuevo (la próxima vez abre conversación nueva)
function reset(target) {
  if (target === 'code' || target === 'all') { convo.code = null; codeTitle = ''; }
  if (target === 'chat' || target === 'all') convo.chat = false;
}
// Elegir una sesión de Claude Code existente para lo que sigue
function pickCodeSession(id, title) { convo.code = id; codeTitle = title || ''; }
function current() { return { chat: convo.chat, code: convo.code, codeTitle }; }

// send() pero sin tronar: cualquier error se registra y se responde como 'error'
async function safeSend(...args) {
  try { return await send(...args); }
  catch (e) { log('error: ' + String(e && e.stack || e).slice(0, 400)); return { ok: true, result: 'error' }; }
}

module.exports = { withClipboard, log, send, safeSend, reset, pickCodeSession, current, listCodeSessions, buildNewUrl };
