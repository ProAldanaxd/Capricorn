'use strict';
// =====================================================================
//  Pasarle texto a la app de escritorio de Antigravity.
//
//  Antigravity no tiene links para mandar texto, así que Capri:
//    1. abre la app si está cerrada o la trae al frente,
//    2. (si toca) regresa a la conversación de antes o abre una nueva
//       con su botón "New Conversation",
//    3. pone el cursor en "Message input", pega con el portapapeles
//    4. y presiona su botón "Send message" (o Enter si no lo encuentra).
//  Todo por accesibilidad de Windows (botones por su nombre). Nunca presiona teclas
//  si la ventana del frente no es Antigravity.
//
//  Conversaciones: la app guarda título e id en
//  %USERPROFILE%\.gemini\antigravity\conversation_summaries.db (SQLite, solo lectura).
// =====================================================================
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { withClipboard, log } = require('./claude');

const EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity', 'Antigravity.exe');
const DB = path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity', 'conversation_summaries.db');
const MAX = 14000;

// Conversación en curso (se olvida al cerrar Capri)
const convo = { started: false, id: null, title: '' };

function installed() { return fs.existsSync(EXE); }

// ---------------------------------------------------------------- conversaciones guardadas
function listConversations(limit = 10) {
  if (!fs.existsSync(DB)) return [];
  let db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(DB, { readOnly: true });
    const rows = db.prepare('select conversation_id id, title, preview, last_modified_time last, status from conversation_summaries order by last_modified_time desc limit ?').all(limit * 2);
    return rows.filter((r) => !/archiv/i.test(String(r.status || '')))
      .map((r) => ({ id: String(r.id), title: String(r.title || r.preview || 'Sin título').trim().slice(0, 120), last: Date.parse(r.last) || 0 }))
      .slice(0, limit);
  } catch (e) { log('antigravity: no pude leer conversaciones: ' + String(e && e.message || e)); return []; }
  finally { try { db && db.close(); } catch { /* nada */ } }
}
async function findNewConversation(since, waitMs = 15000) {
  const end = Date.now() + waitMs;
  while (Date.now() < end) {
    const c = listConversations(3).find((x) => x.last >= since - 5000);
    if (c) return c;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

// ---------------------------------------------------------------- el script de teclas
const psq = (s) => "'" + String(s || '').replace(/'/g, "''") + "'"; // texto literal para PowerShell
function drive({ newConvo, pickTitle, enter, minimize }) {
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
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]::Descendants
function Fg { [uint32]$p = 0; [void][W.F]::GetWindowThreadProcessId([W.F]::GetForegroundWindow(), [ref]$p); $x = Get-Process -Id $p; if ($x) { $x.ProcessName } else { '' } }
function Key([byte]$k) { [W.F]::keybd_event($k, 0, 0, [UIntPtr]::Zero); [W.F]::keybd_event($k, 0, 2, [UIntPtr]::Zero) }
function Win { (Get-Process Antigravity | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle }
function Pull($h) { if ([W.F]::IsIconic($h)) { [void][W.F]::ShowWindow($h, 9) }; Key 0x12; [void][W.F]::SetForegroundWindow($h) }
function Find($h, $name) {
  $c = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $name)
  foreach ($e in $AE::FromHandle($h).FindAll($TS, $c)) { if (-not $e.Current.IsOffscreen) { return $e } }
  return $null
}
function Press($e) {
  try { $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return $true } catch { }
  try { $e.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); return $true } catch { }
  return $false
}

# 1) abrir o traer al frente
$h = Win
if (-not $h) { Start-Process ${psq(EXE)}; 'abierta' }
$end = (Get-Date).AddSeconds(45)
while (-not ($h = Win)) { if ((Get-Date) -gt $end) { 'noapp'; exit }; Start-Sleep -Milliseconds 500 }
# esperar a que cargue su interfaz (la caja de escribir)
$box = $null; $end = (Get-Date).AddSeconds(40)
while (-not ($box = Find $h 'Message input')) { if ((Get-Date) -gt $end) { 'nobox'; exit }; Start-Sleep -Milliseconds 600 }
$tries = 0
while ((Fg) -ne 'Antigravity') { if ($tries -ge 12) { 'nofocus'; exit }; Pull $h; $tries++; Start-Sleep -Milliseconds 300 }

# 2) conversación: regresar a la de antes o abrir una nueva
$pick = ${psq(pickTitle)}
if ($pick) {
  $e = Find $h $pick
  if ($e -and (Press $e)) { 'pick:ok'; Start-Sleep -Milliseconds 1200 } else { 'pick:nf' }
}
if (${newConvo ? '$true' : '$false'}) {
  $nc = $null
  foreach ($e in $AE::FromHandle($h).FindAll($TS, (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, 'New Conversation')))) {
    if (-not $e.Current.IsOffscreen) { $nc = $e; if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) { break } }
  }
  if ($nc -and (Press $nc)) { 'new:ok'; Start-Sleep -Milliseconds 1000 } else { 'new:nf' }
}

# 3) cursor en la caja y pegar
$box = $null; for ($i = 0; $i -lt 10 -and -not $box; $i++) { $box = Find $h 'Message input'; if (-not $box) { Start-Sleep -Milliseconds 400 } }
if (-not $box) { 'nobox'; exit }
try { $box.SetFocus() } catch { }
Start-Sleep -Milliseconds 250
if ((Fg) -ne 'Antigravity') { 'nofocus'; exit }
[W.F]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); Key 0x56; [W.F]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 500

# 4) enviar
if (${enter ? '$true' : '$false'}) {
  if ((Fg) -ne 'Antigravity') { 'nofocus'; exit }
  $send = Find $h 'Send message'
  if ($send -and $send.Current.IsEnabled -and (Press $send)) { 'send:button' } else { Key 0x0D; 'send:enter' }
  if (${minimize ? '$true' : '$false'}) { Start-Sleep -Milliseconds 1200; [void][W.F]::ShowWindow($h, 6); 'sent-min' } else { 'sent' }
} else { 'focused' }
`;
  return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
    { windowsHide: true, timeout: 120000 },
    (err, out) => {
      const lines = String(out || '').trim().split(/\s+/).filter(Boolean);
      const s = lines.pop() || '';
      log(`antigravity: ${lines.join(' ')} ${s}${err ? ' ERR ' + String(err.message || err).slice(0, 200) : ''}`);
      const map = { 'sent-min': 'sent', sent: 'sent', focused: 'focused', nofocus: 'nofocus', nobox: 'nofocus', noapp: 'noapp' };
      res({ result: map[s] || 'error', pickFailed: lines.includes('pick:nf'), newFailed: lines.includes('new:nf'), opened: lines.includes('abierta') });
    }));
}

// ---------------------------------------------------------------- enviar
async function send(text, config, opts = {}) {
  const q = String(text || '').trim().slice(0, MAX);
  if (!q) return { ok: false, error: 'empty' };
  if (!installed()) return { ok: false, error: 'notinstalled' };
  const enter = config.claudeDarEnter !== false;
  const fresh = !convo.started;
  const pickTitle = !fresh && convo.title ? convo.title : '';
  if (process.env.CAPRI_CLAUDE_DRY) {
    console.log('[antigravity dry]', fresh ? 'nueva' : 'continuar', JSON.stringify(pickTitle), JSON.stringify(q), 'minimize=' + !!opts.minimize);
    if (fresh) { convo.started = true; convo.title = ''; }
    return { ok: true, result: 'dry', mode: fresh ? 'new' : 'continue', title: convo.title };
  }
  log(`antigravity: ${fresh ? 'nueva' : 'continuar'} (${q.length} letras)${pickTitle ? ' en "' + pickTitle.slice(0, 40) + '"' : ''}`);
  const since = Date.now();
  let info = null;
  const r = await withClipboard(q, async () => { info = await drive({ newConvo: fresh, pickTitle, enter, minimize: !!opts.minimize }); return info.result; });
  if (!info) info = { result: r };
  if (info.result === 'sent' && fresh) {
    convo.started = true;
    const c = await findNewConversation(since);
    convo.id = c ? c.id : null; convo.title = c ? c.title : '';
    log('antigravity: conversación ' + (c ? '"' + c.title.slice(0, 40) + '"' : 'sin identificar (sigo en la abierta)'));
  }
  return { ok: info.result !== 'error', result: info.result, mode: fresh ? 'new' : 'continue', title: convo.title,
    minimized: info.result === 'sent' && !!opts.minimize, pickFailed: info.pickFailed, newFailed: info.newFailed };
}
async function safeSend(...args) {
  try { return await send(...args); }
  catch (e) { log('antigravity error: ' + String(e && e.stack || e).slice(0, 400)); return { ok: true, result: 'error' }; }
}

function reset() { convo.started = false; convo.id = null; convo.title = ''; }
function pick(id, title) { convo.started = true; convo.id = id; convo.title = title || ''; }
function current() { return { ...convo }; }

module.exports = { safeSend, reset, pick, current, listConversations, installed };
