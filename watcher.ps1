# Vigila la ventana en primer plano y escribe una línea JSON cada vez que cambia.
# Solo lee: nombre del proceso, ruta del ejecutable, clase y título de la ventana.
# También avisa {"clip":"image"} cuando copias una imagen (no lee la imagen, solo que la hay).
# No guarda nada ni lo manda a ningún lado: main.js lo lee para que Capri reaccione.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int size);
  // portapapeles: solo si cambió y si trae una imagen (nunca lee lo que copiaste)
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] public static extern bool IsClipboardFormatAvailable(uint f);
  public static bool ClipHasImage() { return IsClipboardFormatAvailable(8) || IsClipboardFormatAvailable(2); }
  public static string Info() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return null;
    uint pid; GetWindowThreadProcessId(h, out pid);
    var t = new StringBuilder(256); GetWindowText(h, t, 256);
    var c = new StringBuilder(128); GetClassName(h, c, 128);
    string path = "";
    IntPtr p = OpenProcess(0x1000, false, pid);
    if (p != IntPtr.Zero) { var s = new StringBuilder(1024); int n = 1024; if (QueryFullProcessImageName(p, 0, s, ref n)) path = s.ToString(); CloseHandle(p); }
    return path + "\u0001" + c.ToString() + "\u0001" + t.ToString();
  }
}
"@
$last = ''
$clipSeq = [FG]::GetClipboardSequenceNumber() # lo que ya estaba copiado al arrancar no cuenta
while ($true) {
  # ¿se copió una imagen nueva? (Win+Shift+S, Impr Pant...) -> Capri ofrece adjuntarla
  $s = [FG]::GetClipboardSequenceNumber()
  if ($s -ne $clipSeq) {
    $clipSeq = $s
    if ([FG]::ClipHasImage()) { [Console]::Out.WriteLine('{"clip":"image"}'); [Console]::Out.Flush() }
  }
  $i = [FG]::Info()
  if ($i -and $i -ne $last) {
    $last = $i
    $p = $i.Split([char]1)
    [Console]::Out.WriteLine((@{ path = $p[0]; cls = $p[1]; title = $p[2] } | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  }
  Start-Sleep -Milliseconds 1500
}
