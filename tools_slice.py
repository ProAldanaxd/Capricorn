"""Corta el spritesheet (fondo gris) en cuadros, quita el fondo y arma assets/atlas.png + atlas.js.
Uso: python -I tools_slice.py assets/sheet_src.jpg assets [debug_dir]
"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

src, outdir = sys.argv[1], sys.argv[2]
dbg = sys.argv[3] if len(sys.argv) > 3 else None
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
Hh, Ww = a.shape[:2]

# color de fondo = mediana de los bordes
border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
bg = np.median(border, axis=0)
d = np.abs(a - bg).max(-1)

m = d > 30
# quitar líneas horizontales delgadas (el "asiento" de SIT): píxeles marcados cuyo
# vecino 5 px arriba y 5 px abajo es fondo
thin = m & ~np.roll(m, 5, 0) & ~np.roll(m, -5, 0)
lab, n = ndi.label(thin, structure=[[0, 0, 0], [1, 1, 1], [0, 0, 0]])
seat_rows = []
if n:
    sl = ndi.find_objects(lab)
    for i, s in enumerate(sl):
        if s[1].stop - s[1].start > 30:
            seat_rows.append(((s[0].start + s[0].stop) // 2, s[1].start, s[1].stop))
line_kill = np.zeros_like(m)
for y, x0, x1 in seat_rows:
    line_kill[y - 3:y + 4, x0 - 2:x1 + 2] = True
# solo se borra donde arriba y abajo hay fondo (no bajo el cuerpo)
clear_ab = ~np.roll(m, 6, 0) & ~np.roll(m, -6, 0)
m &= ~(line_kill & clear_ab)
m = ndi.binary_opening(m, structure=np.ones((3, 1)))
m = ndi.binary_closing(m, iterations=1)
m = ndi.binary_fill_holes(m)
# quitar etiquetas de texto (arriba a la izquierda de cada fila)
LABELS = [(10, 45, 0, 460), (345, 380, 0, 460), (672, 702, 0, 460), (975, 1003, 0, 460), (1188, 1220, 0, 460)]
for y0, y1, x0, x1 in LABELS:
    m[y0:y1, x0:x1] = False

BANDS = {  # nombre: (y0, y1)
    'idle': (45, 348), 'walk': (378, 668), 'sit': (702, 998), 'sleep': (1003, 1145), 'jump': (1146, 1500),
}

alpha_full = np.clip((d - 18) / 40, 0, 1) * ndi.binary_dilation(m, iterations=1)
alpha_full[m & (d > 30)] = np.maximum(alpha_full[m & (d > 30)], 0.999)
# des-mezclar el gris del borde
af = np.maximum(alpha_full, 1e-3)[..., None]
rgb = np.clip((a - bg * (1 - af)) / af, 0, 255)

frames = {}
for name, (y0, y1) in BANDS.items():
    band = m[y0:y1]
    col = band.sum(0)
    on = col > 2
    # cerrar huecos pequeños entre columnas (chispas, mechones)
    on = ndi.binary_closing(on, structure=np.ones(25))
    segs, ns = ndi.label(on)
    boxes = []
    for i in range(1, ns + 1):
        xs = np.where(segs == i)[0]
        if xs.max() - xs.min() < 60:
            continue
        x0, x1 = xs.min(), xs.max() + 1
        sub = band[:, x0:x1]
        ys = np.where(sub.any(1))[0]
        boxes.append([int(x0), int(y0 + ys.min()), int(x1), int(y0 + ys.max() + 1)])
    frames[name] = boxes

# anclas
def torso_cx(box, f0, f1):
    x0, y0, x1, y1 = box
    sub = m[y0:y1, x0:x1]
    h = y1 - y0
    r = sub[int(h * f0):int(h * f1)]
    xs = np.where(r)[1]
    return x0 + (xs.mean() if len(xs) else (x1 - x0) / 2)

meta = {}
tiles = []
for name, boxes in frames.items():
    base = max(b[3] for b in boxes)
    seat = None
    if name == 'sit' and seat_rows:
        seat = int(np.median([r[0] for r in seat_rows if BANDS['sit'][0] <= r[0] <= BANDS['sit'][1]]))
    out = []
    for b in boxes:
        x0, y0, x1, y1 = b
        if name == 'sleep':
            cx = (x0 + x1) / 2
        elif name == 'sit':
            cx = torso_cx(b, 0.45, 0.62)
        else:
            cx = torso_cx(b, 0.5, 0.72)
        ay = seat if seat else base
        out.append({'box': b, 'ax': float(cx), 'ay': float(ay)})
    meta[name] = out

# empaquetar en atlas
pad = 4
rows_img = []
cur_x, cur_y, row_h, ATW = pad, pad, 0, 2048
placed = []
for name in ['idle', 'walk', 'sit', 'sleep', 'jump']:
    for f in meta[name]:
        x0, y0, x1, y1 = f['box']
        w, h = x1 - x0, y1 - y0
        if cur_x + w + pad > ATW:
            cur_x, cur_y, row_h = pad, cur_y + row_h + pad, 0
        placed.append((name, f, cur_x, cur_y))
        cur_x += w + pad
        row_h = max(row_h, h)
ATH = cur_y + row_h + pad
atlas = np.zeros((ATH, ATW, 4), np.uint8)
out_meta = {k: [] for k in meta}
for name, f, px, py in placed:
    x0, y0, x1, y1 = f['box']
    w, h = x1 - x0, y1 - y0
    al = alpha_full[y0:y1, x0:x1]
    atlas[py:py + h, px:px + w, :3] = rgb[y0:y1, x0:x1].astype(np.uint8)
    atlas[py:py + h, px:px + w, 3] = (al * 255).astype(np.uint8)
    out_meta[name].append({'x': px, 'y': py, 'w': w, 'h': h, 'ax': round(f['ax'] - x0, 1), 'ay': round(f['ay'] - y0, 1)})
Image.fromarray(atlas, 'RGBA').save(f'{outdir}/atlas.png', optimize=True)
with open(f'{outdir}/atlas.js', 'w', encoding='utf8') as fh:
    fh.write('// generado por tools_slice.py\nwindow.ATLAS = ' + json.dumps(out_meta) + ';\n')
print(json.dumps({k: len(v) for k, v in out_meta.items()}), 'atlas', ATW, ATH, 'seats', seat_rows[:6])

if dbg:
    # hoja de verificación: cada animación alineada por su ancla, sobre fondo claro
    rows = []
    for name, fl in out_meta.items():
        cw = 330
        top = max(f['ay'] for f in fl)
        bot = max(f['h'] - f['ay'] for f in fl)
        sheet = Image.new('RGBA', (cw * len(fl), int(top + bot) + 20), (215, 215, 215, 255))
        A = Image.fromarray(atlas, 'RGBA')
        dr = ImageDraw.Draw(sheet)
        for i, f in enumerate(fl):
            crop = A.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
            ox, oy = int(i * cw + cw / 2 - f['ax']), int(10 + top - f['ay'])
            sheet.alpha_composite(crop, (max(0, ox), max(0, oy)))
            ax, ay = i * cw + cw // 2, int(10 + top)
            dr.line([(ax - 8, ay), (ax + 8, ay)], fill=(0, 120, 255, 255), width=2)
            dr.line([(ax, ay - 8), (ax, ay + 8)], fill=(0, 120, 255, 255), width=2)
        sheet.save(f'{dbg}/check_{name}.png')
