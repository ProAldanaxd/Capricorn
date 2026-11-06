'use strict';
// =====================================================================
//  Pasarle texto (e imágenes) a Gemini en el navegador (Opera GX).
//
//  - Primer mensaje: abre una VENTANA nueva de Opera con gemini.google.com/app (chat nuevo),
//    pega y le da Enter. Luego lee la dirección del chat (gemini.google.com/app/<id>) y
//    recuerda esa ventana y ese chat.
//  - Mensajes siguientes: trae esa misma ventana al frente y pega ahí. Si la cerraste o
//    ya no está en el chat, abre el chat guardado en una ventana nueva.
//  - "nuevo" (o el menú) empieza otro chat. Se olvida al cerrar Capri.
//  - Encuentra la caja de escribir y la barra de direcciones con la accesibilidad de Windows.
//    Nunca presiona teclas si la ventana del frente no es Opera.
// =====================================================================
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { withClipboard, log } = require('./claude');
const { psPasteBlock, saveText } = require('./images');

const MAX = 30000;
const NEW_CHAT = 'https://gemini.google.com/app';
const convo = { hwnd: 0, url: '' }; // ventana de Opera y dirección del chat

const psq = (s) => "'" + String(s || '').replace(/'/g, "''") + "'";
function operaExe(config) {
  const cands = [config.navegadorGemini, path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera GX', 'opera.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'opera.exe')].filter(Boolean);
  return cands.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || '';
}

function drive({ exe, hwnd, url, enter, minimize, images = [], textFile = '' }) {
  const withImgs = images.length > 0;
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Name F -Namespace W -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, System.UIntPtr e);
'@
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]::Descendants
function Key([byte]$k) { [W.F]::keybd_event($k, 0, 0, [UIntPtr]::Zero); [W.F]::keybd_event($k, 0, 2, [UIntPtr]::Zero) }
function Title($h) { $sb = New-Object System.Text.StringBuilder 512; [void][W.F]::GetWindowText($h, $sb, 512); $sb.ToString() }
function OwnerIsOpera($h) { [uint32]$p = 0; [void][W.F]::GetWindowThreadProcessId($h, [ref]$p); $x = Get-Process -Id $p; $x -and $x.ProcessName -eq 'opera' }
function FgIs($h) { [W.F]::GetForegroundWindow() -eq $h }
function OperaWins { $l = New-Object System.Collections.ArrayList; $cb = [W.F+EnumProc]{ param($h, $x) if ([W.F]::IsWindowVisible($h) -and (OwnerIsOpera $h) -and (Title $h)) { [void]$l.Add($h) }; $true }; [void][W.F]::EnumWindows($cb, [IntPtr]::Zero); ,$l }
function Pull($h) { if ([W.F]::IsIconic($h)) { [void][W.F]::ShowWindow($h, 9) }; Key 0x12; [void][W.F]::SetForegroundWindow($h) }
# solo se revisan las cajas de texto (en chats largos la página tiene miles de elementos)
$EDITS = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
function Edits($h) { $AE::FromHandle($h).FindAll($TS, $EDITS) }
function Editor($h) { foreach ($e in (Edits $h)) { $c = $e.Current; if ($c.ClassName -match 'ql-editor' -and -not $c.IsOffscreen) { return $e } }; return $null }
function Url($h) {
  foreach ($e in (Edits $h)) { if ($e.Current.ClassName -eq 'AddressTextfieldView') { try { return $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { return '' } } }
  return ''
}

# 1) la ventana: la de antes (si sigue en el chat) o una nueva con el chat guardado / un chat nuevo
$h = [IntPtr][int64]${Number(hwnd) || 0}
$want = ${psq(url)}
if ($h -ne [IntPtr]::Zero -and -not ([W.F]::IsWindow($h) -and (OwnerIsOpera $h) -and ((Title $h) -match 'Gemini'))) { $h = [IntPtr]::Zero }
if ($h -ne [IntPtr]::Zero -and $want) { $u = Url $h; if ($u -and -not $u.StartsWith($want)) { 'moved'; $h = [IntPtr]::Zero } }
if ($h -eq [IntPtr]::Zero) {
  $before = OperaWins
  $open = if ($want) { $want } else { '${NEW_CHAT}' }
  Start-Process ${psq(exe)} -ArgumentList '--new-window', $open
  'abierta'
  $end = (Get-Date).AddSeconds(25)
  while ($h -eq [IntPtr]::Zero) {
    if ((Get-Date) -gt $end) { 'noapp'; exit }
    Start-Sleep -Milliseconds 500
    foreach ($w in (OperaWins)) { if ($before -notcontains $w -and (Title $w) -match 'Gemini') { $h = $w; break } }
  }
}
"hwnd:$([int64]$h)"

# 2) al frente y esperar la caja de escribir (la página puede tardar en cargar)
$tries = 0
while (-not (FgIs $h)) { if ($tries -ge 12) { 'nofocus'; exit }; Pull $h; $tries++; Start-Sleep -Milliseconds 300 }
$box = $null; $end = (Get-Date).AddSeconds(30)
while (-not ($box = Editor $h)) { if ((Get-Date) -gt $end) { 'nobox'; exit }; Start-Sleep -Milliseconds 600 }
try { $box.SetFocus() } catch { }
Start-Sleep -Milliseconds 300
if (-not (FgIs $h)) { 'nofocus'; exit }

# 3) pegar (imágenes primero, luego el texto)
if (${withImgs ? '$true' : '$false'}) {
  ${withImgs ? psPasteBlock(images, textFile) : ''}
  if (-not (FgIs $h)) { 'nofocus'; exit }
} else {
  [W.F]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); Key 0x56; [W.F]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 500
}

# 4) enviar y leer la dirección del chat (gemini.google.com/app/<id>)
if (${enter ? '$true' : '$false'}) {
  if (-not (FgIs $h)) { 'nofocus'; exit }
  Key 0x0D
  $end = (Get-Date).AddSeconds(10)
  do { Start-Sleep -Milliseconds 700; $u = Url $h } while ((Get-Date) -lt $end -and -not ($u -match '/app/[0-9a-zA-Z_-]+'))
  if ($u) { "url:$u" }
  if (${minimize ? '$true' : '$false'}) { Start-Sleep -Milliseconds 600; [void][W.F]::ShowWindow($h, 6); 'sent-min' } else { 'sent' }
} else { 'focused' }
`;
  return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', ps],
    { windowsHide: true, timeout: 120000 + images.length * 5000 },
    (err, out) => {
      const lines = String(out || '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const s = lines[lines.length - 1] || '';
      const get = (p) => { const l = lines.find((x) => x.startsWith(p)); return l ? l.slice(p.length) : ''; };
      log(`gemini: ${lines.filter((l) => !l.startsWith('url:')).join(' ')}${err ? ' ERR ' + String(err.message || err).slice(0, 200) : ''}`);
      const map = { 'sent-min': 'sent', sent: 'sent', focused: 'focused', nofocus: 'nofocus', nobox: 'nofocus', noapp: 'noapp' };
      res({ result: map[s] || 'error', hwnd: Number(get('hwnd:')) || 0, url: get('url:'), opened: lines.includes('abierta'), moved: lines.includes('moved') });
    }));
}

// ---------------------------------------------------------------- enviar
async function send(text, config, opts = {}) {
  const q = String(text || '').trim().slice(0, MAX);
  const imgs = Array.isArray(opts.images) ? opts.images : [];
  if (!q && !imgs.length) return { ok: false, error: 'empty' };
  const exe = operaExe(config);
  if (!exe) return { ok: false, error: 'notinstalled' };
  const enter = config.claudeDarEnter !== false;
  const fresh = !convo.url && !convo.hwnd;
  if (process.env.CAPRI_CLAUDE_DRY) {
    console.log('[gemini dry]', fresh ? 'nueva' : 'continuar', convo.url, JSON.stringify(q), 'imagenes=' + imgs.length, 'minimize=' + !!opts.minimize);
    if (fresh) convo.url = NEW_CHAT + '/prueba';
    return { ok: true, result: 'dry', mode: fresh ? 'new' : 'continue' };
  }
  log(`gemini: ${fresh ? 'nueva' : 'continuar'} (${q.length} letras${imgs.length ? ', ' + imgs.length + ' imágenes' : ''})`);
  const textFile = imgs.length ? saveText(q) : '';
  let info = null;
  const r = await withClipboard(q, async () => {
    info = await drive({ exe, hwnd: convo.hwnd, url: convo.url, enter, minimize: !!opts.minimize, images: imgs, textFile });
    return info.result;
  });
  if (textFile) fs.unlink(textFile, () => {});
  if (!info) info = { result: r };
  if (info.hwnd) convo.hwnd = info.hwnd;
  if (info.url && /\/app\/[0-9a-zA-Z_-]+/.test(info.url)) convo.url = info.url.split('?')[0];
  if (info.result === 'sent' && !convo.url) log('gemini: no pude leer la dirección del chat (sigo en esa ventana)');
  return { ok: info.result !== 'error', result: info.result, mode: fresh ? 'new' : 'continue', minimized: info.result === 'sent' && !!opts.minimize,
    reopened: !fresh && info.opened };
}
async function safeSend(...args) {
  try { return await send(...args); }
  catch (e) { log('gemini error: ' + String(e && e.stack || e).slice(0, 400)); return { ok: true, result: 'error' }; }
}
function reset() { convo.hwnd = 0; convo.url = ''; }
function current() { return { ...convo }; }

module.exports = { safeSend, reset, current };
