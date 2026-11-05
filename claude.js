'use strict';
// =====================================================================
//  Pasarle texto a la app de escritorio de Claude (chat o Claude Code).
//  La app registra el link claude:// : si está cerrada la abre, si está abierta
//  la trae al frente, y deja el texto escrito en una conversación nueva.
//  Después Capri espera a que Claude sea la ventana activa y le da Enter.
//  Nunca presiona Enter si la ventana del frente no es Claude.
// =====================================================================
const { shell } = require('electron');
const { execFile } = require('child_process');

const MAX = 14000; // la app recorta a ~14k caracteres

function buildUrl(target, text, config) {
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

// Espera a que Claude quede al frente (si no se deja, la trae él mismo), espera a que
// el texto aparezca y presiona Enter. Responde 'sent', 'nofocus' o 'error'.
function focusAndEnter({ timeout, settle, enter }) {
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
function Pull {
  $h = (Get-Process claude | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
  if (-not $h) { return }
  if ([W.F]::IsIconic($h)) { [void][W.F]::ShowWindow($h, 9) }
  [W.F]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [W.F]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [void][W.F]::SetForegroundWindow($h)
}
$start = [DateTime]::Now; $end = $start.AddSeconds(${timeout}); $pulled = 0
while ((Fg) -ne 'claude') {
  if ([DateTime]::Now -gt $end) { 'nofocus'; exit }
  if (([DateTime]::Now - $start).TotalSeconds -gt 2.5 -and $pulled -lt 3) { Pull; $pulled++ }
  Start-Sleep -Milliseconds 250
}
Start-Sleep -Milliseconds ${settle}
if ((Fg) -ne 'claude') { 'nofocus'; exit }
if (${enter ? '$true' : '$false'}) { [W.F]::keybd_event(0x0D, 0, 0, [UIntPtr]::Zero); [W.F]::keybd_event(0x0D, 0, 2, [UIntPtr]::Zero); 'sent' } else { 'focused' }
`;
  return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
    { windowsHide: true, timeout: (timeout + 15) * 1000 },
    (err, out) => { const s = String(out || '').trim().split(/\s+/).pop(); res(['sent', 'nofocus', 'focused'].includes(s) ? s : 'error'); }));
}

// target: 'chat' | 'code'
async function send(target, text, config) {
  const q = String(text || '').trim();
  if (!q) return { ok: false, error: 'empty' };
  const url = buildUrl(target, q, config);
  const enter = config.claudeDarEnter !== false;
  if (process.env.CAPRI_CLAUDE_DRY) { console.log('[claude dry]', url, 'enter=' + enter); return { ok: true, result: 'dry', url }; }
  const warm = await isRunning();
  try { await shell.openExternal(url); }
  catch (e) { return { ok: false, error: 'open', detail: String(e && e.message || e) }; }
  // en frío la app tarda en cargar la conversación: esperamos más antes del Enter
  const result = await focusAndEnter({ timeout: warm ? 12 : 40, settle: warm ? 1800 : 5000, enter });
  return { ok: result !== 'error', result, cold: !warm, truncated: q.length > MAX };
}

module.exports = { send, buildUrl };
