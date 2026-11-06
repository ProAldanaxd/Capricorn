'use strict';
// =====================================================================
//  Imágenes que pegas en el cuadro de Capri -> Claude / Antigravity.
//  Se guardan un momento como PNG/JPG en la carpeta temporal y un script de PowerShell
//  las pone en el portapapeles y las pega (Ctrl+V) en la caja de la app, una por una.
//  Después pega tu texto (si escribiste algo). Los archivos se borran al terminar.
// =====================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX = 4;
const psq = (s) => "'" + String(s || '').replace(/'/g, "''") + "'"; // texto literal para PowerShell

// data URLs -> archivos temporales (solo PNG, JPG, GIF, BMP o WEBP)
function saveTemp(dataUrls) {
  const out = [];
  for (const d of (Array.isArray(dataUrls) ? dataUrls : []).slice(0, MAX)) {
    const m = /^data:image\/(png|jpe?g|gif|bmp|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ''));
    if (!m) continue;
    const f = path.join(os.tmpdir(), `capri-img-${Date.now()}-${out.length}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    try { fs.writeFileSync(f, Buffer.from(m[2], 'base64')); out.push(f); } catch { /* sin espacio */ }
  }
  return out;
}
// el texto también va en un archivo (así no hay que escaparlo dentro del script)
function saveText(text) {
  if (!text) return '';
  const f = path.join(os.tmpdir(), `capri-txt-${Date.now()}.txt`);
  try { fs.writeFileSync(f, text, 'utf8'); return f; } catch { return ''; }
}
function cleanup(files) {
  setTimeout(() => { for (const f of files) if (f) fs.unlink(f, () => {}); }, 30000);
}

// Pedazo de PowerShell que pega las imágenes y luego el texto. Necesita las funciones
// Key y [W.F]::keybd_event del script que lo incluye, y que PowerShell corra con -STA.
// webp no lo entiende System.Drawing: esas se saltan (casi nunca vienen de una captura).
function psPasteBlock(paths, textFile) {
  return `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
function CtrlV { [W.F]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); Key 0x56; [W.F]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero) }
foreach ($ip in @(${paths.map(psq).join(', ')})) {
  try { $img = [System.Drawing.Image]::FromFile($ip); [System.Windows.Forms.Clipboard]::SetImage($img); $img.Dispose() } catch { 'img:bad'; continue }
  Start-Sleep -Milliseconds 200
  CtrlV
  Start-Sleep -Milliseconds 1800
  'img:ok'
}
$tf = ${psq(textFile)}
if ($tf) {
  [System.Windows.Forms.Clipboard]::SetText([IO.File]::ReadAllText($tf, [Text.Encoding]::UTF8))
  Start-Sleep -Milliseconds 200
  CtrlV
  Start-Sleep -Milliseconds 500
}
`;
}

module.exports = { saveTemp, saveText, cleanup, psPasteBlock };
