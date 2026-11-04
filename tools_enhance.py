"""Mejora los cuadros del atlas: 2x de resolución, limpieza de artefactos JPEG,
nitidez, y cara redibujada (visor verde, ojos espiral, sonrisa) en cuadros de frente.

  Vista previa:  python -I tools_enhance.py preview <carpeta_salida>
  Aplicar:       python -I tools_enhance.py apply
"""
import json, re, sys, os
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS_JS = os.path.join(HERE, 'assets', 'atlas.js')
ATLAS_PNG = os.path.join(HERE, 'assets', 'atlas.png')
UP = 2  # factor de escala

meta = json.loads(re.search(r'=\s*(\{.*\});', open(ATLAS_JS, encoding='utf8').read(), re.S).group(1))
atlas = cv2.imread(ATLAS_PNG, cv2.IMREAD_UNCHANGED)  # BGRA

# ---------------------------------------------------------------- cara
# Cara de frente según las referencias. Todas las medidas en unidades del ANCHO del visor (W),
# con origen en la esquina superior izquierda del visor detectado en el cuadro.
#  - Máscara verde ancha sobre la parte alta de la cara.
#  - Mechón ROSA (pelo con brillos) que baja en V entre los ojos hasta la altura de las pupilas.
#  - Ojos grandes y redondos: contorno negro con pestañas en pico, anillo verde, anillo negro,
#    iris azul y pupila blanca.
#  - Parte baja de la cara negra, con la boca como una línea blanca fina en zigzag, bastante abajo.
MASK = [(-0.04, 0.04), (0.35, 0.0), (0.5, 0.34), (0.65, 0.0), (1.04, 0.04), (1.07, 0.3), (0.82, 0.52),
        (0.5, 0.57), (0.18, 0.52), (-0.07, 0.3)]
LOCK = [(0.335, -0.01), (0.665, -0.01), (0.5, 0.34)]        # mechón rosa entre los ojos
CHIN = [(0.16, 0.46), (0.84, 0.46), (0.66, 0.84), (0.5, 0.94), (0.34, 0.84)]  # cara negra, mentón en punta
EYES = [(0.25, 0.29, 0.185, -1), (0.75, 0.29, 0.185, 1)]   # (u, v, radio, lado)
MOUTH = [(0.37, 0.75), (0.43, 0.715), (0.48, 0.755), (0.54, 0.705), (0.6, 0.745), (0.66, 0.705)]
FACE_ASPECT = 0.56


def find_visor(fr):
    b, g, r, a = [fr[..., i].astype(int) for i in range(4)]
    green = (g > 110) & (g - r > 40) & (a > 128)
    merged = ndi.binary_closing(green, structure=np.ones((3, 3)), iterations=2)
    lab, n = ndi.label(merged)
    cands = []
    H = fr.shape[0]
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if w >= 11 and w / max(h, 1) >= 1.2 and (lab[sl] == i).sum() > 30 and ys.start < H * 0.62:
            cands.append((ys.start, xs.start, ys.start, xs.stop, ys.stop))
    if not cands:
        return None
    cands.sort()
    x0, y0, x1, y1 = cands[0][1:]
    # mismas proporciones que el visor original; un poco más ancho para tapar el verde viejo
    w = x1 - x0
    x0, x1 = x0 - w * 0.03, x1 + w * 0.03
    y0 = y0 - w * 0.03
    y1 = y0 + (x1 - x0) * FACE_ASPECT
    return (x0, y0, x1, y1)


def draw_face(rgba, box, k):
    """Dibuja la cara de frente (proporciones de las referencias) sobre la caja del visor."""
    x0, y0, x1, _ = [v * k for v in box]
    W = x1 - x0
    ss = 8  # superresolución para antialias
    pad = int(W * 0.35)
    X0, Y0 = int(x0 - pad), int(y0 - pad)
    PW, PH = int(W + 2 * pad), int(W * 1.0 + 2 * pad)
    big = Image.new('RGBA', (PW * ss, PH * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    P = lambda u, v: (((x0 - X0) + u * W) * ss, ((y0 - Y0) + v * W) * ss)
    S_ = W * ss  # unidad en px de superresolución
    black = (12, 8, 18, 255)
    green = (46, 242, 143, 255)
    pink = (255, 32, 92, 255)
    # parte baja de la cara (negra) – tapa también la boca vieja
    d.polygon([P(u, v) for u, v in CHIN], fill=black)
    # máscara verde con contorno negro
    cu = sum(u for u, _ in MASK) / len(MASK); cv = sum(v for _, v in MASK) / len(MASK)
    d.polygon([P(cu + (u - cu) * 1.06, cv + (v - cv) * 1.1) for u, v in MASK], fill=black)
    d.polygon([P(u, v) for u, v in MASK], fill=green)
    # mechón rosa: sale del pelo (sin borde arriba), contorno fino solo en los lados de la V
    d.polygon([P(u, v) for u, v in LOCK], fill=pink)
    lw2 = max(1, int(S_ * 0.025))
    d.line([P(0.35, 0.0), P(0.5, 0.34), P(0.65, 0.0)], fill=black, width=lw2, joint='curve')
    rng = np.random.default_rng(7)
    for _ in range(18):
        v = rng.uniform(0.0, 0.24)
        half = 0.2 * (0.34 - v) / 0.64
        u = 0.5 + rng.uniform(-half, half) * 0.85
        r = S_ * rng.uniform(0.006, 0.013)
        cx, cy = P(u, v)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 235, 245, 230))
    # ojos
    for u, v, rr, side in EYES:
        cx, cy = P(u, v)
        R = rr * S_
        ring = lambda q: [cx - R * q, cy - R * q, cx + R * q, cy + R * q]
        # pestañas en pico hacia afuera (lado exterior)
        for ang in (165, 222):
            a = np.radians(ang if side < 0 else 180 - ang)
            base1 = np.radians((ang - 12) if side < 0 else 180 - ang + 12)
            base2 = np.radians((ang + 12) if side < 0 else 180 - ang - 12)
            d.polygon([(cx + np.cos(base1) * R * 0.95, cy + np.sin(base1) * R * 0.95),
                       (cx + np.cos(a) * R * 1.24, cy + np.sin(a) * R * 1.24),
                       (cx + np.cos(base2) * R * 0.95, cy + np.sin(base2) * R * 0.95)], fill=black)
        d.ellipse(ring(1.0), fill=black)                     # contorno negro
        d.ellipse(ring(0.88), fill=green)                    # anillo verde
        d.ellipse(ring(0.72), fill=black)                    # anillo negro
        d.ellipse(ring(0.64), fill=(26, 92, 214, 255))       # iris azul
        px, py = cx - side * R * 0.04, cy - R * 0.04
        pr = R * 0.32
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(250, 252, 255, 255))  # pupila blanca
    # boca: zigzag blanco fino
    d.line([P(u, v) for u, v in MOUTH], fill=(240, 240, 250, 255), width=max(2, int(S_ * 0.022)), joint='curve')
    patch = big.resize((PW, PH), Image.LANCZOS)
    base = Image.fromarray(rgba, 'RGBA')
    base.alpha_composite(patch, (max(0, X0), max(0, Y0)), (max(0, -X0), max(0, -Y0)))
    return np.asarray(base).copy()


# ---------------------------------------------------------------- limpieza
# ---------------------------------------------------------------- cara copiada de la foto
# assets/ref_cara.png = foto de referencia (ya girada 180°). Se recorta la cara por el contorno
# de la máscara y la barbilla, se escala al ancho del visor y se rota según la inclinación.
REF_IMG = os.path.join(HERE, 'assets', 'ref_cara.png')
REF_HULL = [(135, 228), (306, 229), (303, 322), (285, 330), (255, 368), (165, 368), (125, 335), (101, 322), (101, 290)]
REF_MASK_X0, REF_MASK_X1, REF_MASK_TOP = 101, 305, 229
_REF = {}


def ref_face():
    if 'rgba' in _REF:
        return _REF['rgba']
    im = Image.open(REF_IMG).convert('RGB')
    SS = 4
    m = Image.new('L', (im.width * SS, im.height * SS), 0)
    ImageDraw.Draw(m).polygon([(x * SS, y * SS) for x, y in REF_HULL], fill=255)
    m = m.resize(im.size, Image.LANCZOS)
    rgba = np.dstack([np.asarray(im), np.asarray(m)])
    _REF['rgba'] = rgba
    return rgba


def visor_angle(fr, box):
    """Inclinación del visor (grados) por PCA de los píxeles verdes dentro de la caja."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    sub = fr[y0:y1 + 1, x0:x1 + 1].astype(int)
    b, g, r, a = [sub[..., i] for i in range(4)]
    ys, xs = np.where((g > 110) & (g - r > 40) & (a > 128))
    if len(xs) < 20:
        return 0.0
    cov = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()]))
    vals, vecs = np.linalg.eigh(cov)
    vx, vy = vecs[:, np.argmax(vals)]
    if vx < 0:
        vx, vy = -vx, -vy
    # el propio visor es diagonal (~-15° de "inclinación" aparente aunque la cabeza esté derecha)
    raw = np.degrees(np.arctan2(vy, vx))
    return float(np.clip((raw + 15.5) * 0.8, -12, 12))


def paste_ref_face(rgba, box, angle, k):
    src = ref_face()
    x0, y0, x1, _ = [v * k for v in box]
    W = x1 - x0
    s = W / (REF_MASK_X1 - REF_MASK_X0)
    # recortar la zona útil de la referencia y escalar
    hx0 = min(x for x, _ in REF_HULL); hx1 = max(x for x, _ in REF_HULL)
    hy0 = min(y for _, y in REF_HULL); hy1 = max(y for _, y in REF_HULL)
    crop = Image.fromarray(src[hy0:hy1 + 1, hx0:hx1 + 1], 'RGBA')
    tw, th = max(1, round(crop.width * s)), max(1, round(crop.height * s))
    small = crop.resize((tw, th), Image.LANCZOS)
    # punto de anclaje: centro superior de la máscara
    ax = ((REF_MASK_X0 + REF_MASK_X1) / 2 - hx0) * s
    ay = (REF_MASK_TOP - hy0) * s
    # rotar alrededor del ancla (en lienzo con margen)
    padc = int(max(tw, th))
    canvas = Image.new('RGBA', (tw + 2 * padc, th + 2 * padc), (0, 0, 0, 0))
    canvas.paste(small, (padc, padc))
    cx, cy = padc + ax, padc + ay
    rot = canvas.rotate(-angle, resample=Image.BICUBIC, center=(cx, cy))
    tx, ty = (x0 + x1) / 2, y0
    ox, oy = round(tx - cx), round(ty - cy)
    # limpiar restos de la cara vieja alrededor: verde del visor y boca blanca -> piel oscura
    def clean(rx0, rx1, ry0, ry1, test):
        rx0, rx1 = int(max(0, rx0)), int(min(rgba.shape[1], rx1))
        ry0, ry1 = int(max(0, ry0)), int(min(rgba.shape[0], ry1))
        reg = rgba[ry0:ry1, rx0:rx1]
        c = reg[..., :3].astype(int)
        kill = ndi.binary_dilation(test(c), iterations=2) & (reg[..., 3] > 60)
        reg[kill, :3] = (14, 9, 20)
    # verde del visor viejo: solo alrededor del visor
    clean(x0 - W * 0.12, x1 + W * 0.12, y0 - W * 0.08, y0 + W * 0.5,
          lambda c: (c[..., 1] > 110) & (c[..., 1] - c[..., 0] > 40))
    # boca blanca vieja: solo en la zona de la boca
    clean(x0 + W * 0.15, x1 - W * 0.15, y0 + W * 0.3, y0 + W * 1.0, lambda c: c.min(-1) > 150)
    base = Image.fromarray(rgba, 'RGBA')
    base.alpha_composite(rot, (max(0, ox), max(0, oy)), (max(0, -ox), max(0, -oy)))
    return np.asarray(base).copy()


def enhance(fr_bgra, face=False):
    h, w = fr_bgra.shape[:2]
    bgr = fr_bgra[..., :3]
    a = fr_bgra[..., 3]
    up = cv2.resize(bgr, (w * UP, h * UP), interpolation=cv2.INTER_LANCZOS4)
    # quitar ruido JPEG conservando bordes
    clean = cv2.bilateralFilter(up, 7, 38, 5)
    clean = cv2.bilateralFilter(clean, 7, 30, 5)
    # el pelo conserva su brillo (detalle fino); el resto queda más plano y limpio
    hsv = cv2.cvtColor(up, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    pinkish = ((hue > 150) | (hue < 8)) & (sat > 60) & (val > 140)
    glitter = (sat < 90) & (val > 200)
    hair = ndi.binary_dilation(pinkish, iterations=3) & (pinkish | glitter)
    hair = cv2.GaussianBlur(hair.astype(np.float32), (0, 0), 2)[..., None]
    detail = up.astype(np.float32) - cv2.GaussianBlur(up, (0, 0), 1.2).astype(np.float32)
    out = clean.astype(np.float32) + detail * (0.25 + 0.85 * hair)
    # nitidez de bordes
    blur = cv2.GaussianBlur(out, (0, 0), 1.6)
    out = out + (out - blur) * 0.55
    # líneas oscuras más definidas y colores un poco más vivos
    o8 = np.clip(out, 0, 255).astype(np.uint8)
    hsv2 = cv2.cvtColor(o8, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv2[..., 1] = np.clip(hsv2[..., 1] * 1.12, 0, 255)
    v = hsv2[..., 2]
    hsv2[..., 2] = np.where(v < 80, v * 0.78, v)
    out = cv2.cvtColor(hsv2.astype(np.uint8), cv2.COLOR_HSV2BGR)
    # alfa con bordes nítidos
    au = cv2.resize(a, (w * UP, h * UP), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
    au = np.clip((au - 0.3) / 0.4, 0, 1)
    au = au * au * (3 - 2 * au)
    au = cv2.GaussianBlur(au, (0, 0), 0.5)
    rgba = np.dstack([out[..., ::-1], (au * 255).astype(np.uint8)])
    box = find_visor(fr_bgra) if face else None
    if box is not None:
        rgba = fit_ref_face(rgba, fr_bgra, UP)
    return rgba, box


def _green(img_rgb_or_bgra, bgr=True):
    c = img_rgb_or_bgra.astype(int)
    r, g = (c[..., 2], c[..., 1]) if bgr else (c[..., 0], c[..., 1])
    return (g > 110) & (g - r > 40)


def _visor_blob(fr):
    """Máscara del visor viejo (grupo verde ancho más alto) en el cuadro original."""
    green = _green(fr) & (fr[..., 3] > 128)
    lab, n = ndi.label(ndi.binary_closing(green, structure=np.ones((3, 3)), iterations=2))
    H = fr.shape[0]
    best = None
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if w >= 11 and w / max(h, 1) >= 1.2 and (lab[sl] == i).sum() > 30 and ys.start < H * 0.62:
            if best is None or ys.start < best[0]:
                best = (ys.start, i)
    return None if best is None else ndi.binary_fill_holes(lab == best[1])


def _rect(mask):
    ys, xs = np.where(mask)
    (cx, cy), (w, h), ang = cv2.minAreaRect(np.column_stack([xs, ys]).astype(np.float32))
    if w < h:
        w, h, ang = h, w, ang - 90
    while ang > 45:
        ang -= 90
    while ang < -45:
        ang += 90
    return cx, cy, w, h, ang


_REF_RECT = {}


def ref_rect():
    if 'r' not in _REF_RECT:
        src = ref_face()
        m = _green(src[..., :3], bgr=False) & (src[..., 3] > 128)
        m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=3))
        _REF_RECT['r'] = _rect(m)
    return _REF_RECT['r']


def fit_ref_face(rgba, fr, k):
    """Ajusta la cara de la foto al rectángulo real del visor viejo y la recorta a la silueta de la cabeza."""
    blob = _visor_blob(fr)
    if blob is None:
        return rgba
    cx, cy, w, h, ang = _rect(blob)
    rcx, rcy, rw, rh, rang = ref_rect()
    s = (w * k) / rw * 1.04
    # el visor viejo es diagonal y exagera la inclinación medida: se atenúa
    theta = np.radians(np.clip((ang - rang) * 0.55, -14, 14))
    cs, sn = s * np.cos(theta), s * np.sin(theta)
    tx, ty = cx * k, cy * k
    M = np.array([[cs, -sn, tx - (cs * rcx - sn * rcy)], [sn, cs, ty - (sn * rcx + cs * rcy)]], np.float32)
    Hh, Ww = rgba.shape[:2]
    face = cv2.warpAffine(ref_face(), M, (Ww, Hh), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    # silueta de la cabeza: todo lo que NO es rosa (pelo/cuerpo) dentro del personaje
    c = rgba[..., :3].astype(int)
    pink = (c[..., 0] > 140) & (c[..., 0] - c[..., 1] > 70)
    head = (rgba[..., 3] > 100) & ~pink
    blob_up = cv2.resize(blob.astype(np.uint8), (Ww, Hh), interpolation=cv2.INTER_NEAREST) > 0
    allowed = ndi.binary_dilation(head | ndi.binary_dilation(blob_up, iterations=2), iterations=1)
    soft = cv2.GaussianBlur(allowed.astype(np.float32), (0, 0), 0.8)
    fa = face[..., 3].astype(np.float32) / 255 * soft
    # tapar restos: verde viejo cerca del visor y boca blanca vieja debajo, si quedan fuera de la cara nueva
    near = ndi.binary_dilation(blob_up, iterations=int(4 * k))
    below = np.zeros_like(near)
    y_top, y_bot = int(cy * k), int(min(Hh, cy * k + w * k * 0.9))
    x_l, x_r = int(max(0, cx * k - w * k * 0.4)), int(min(Ww, cx * k + w * k * 0.4))
    below[y_top:y_bot, x_l:x_r] = True
    old = ((_green(rgba[..., :3], bgr=False) & near) | ((c.min(-1) > 150) & below)) & (rgba[..., 3] > 60)
    old = ndi.binary_dilation(old, iterations=1) & (fa < 0.5)
    out = rgba.copy()
    out[old, :3] = (14, 9, 20)
    # componer
    o = out[..., :3].astype(np.float32)
    o = o * (1 - fa[..., None]) + face[..., :3].astype(np.float32) * fa[..., None]
    out[..., :3] = np.clip(o, 0, 255).astype(np.uint8)
    out[..., 3] = np.maximum(out[..., 3], (fa * 255).astype(np.uint8))
    return out


NO_FACE = {('walk', 1)}  # cuadros de perfil donde la detección encuentra un brazo


def frame(name, i):
    f = meta[name][i]
    return atlas[f['y']:f['y'] + f['h'], f['x']:f['x'] + f['w']]


def on_bg(rgba, col=(70, 70, 78)):
    im = Image.new('RGBA', (rgba.shape[1], rgba.shape[0]), col + (255,))
    im.alpha_composite(Image.fromarray(rgba, 'RGBA'))
    return im.convert('RGB')


def preview(outdir):
    os.makedirs(outdir, exist_ok=True)
    picks = [('idle', 0), ('sit', 0), ('jump', 4), ('walk', 2), ('sit', 2), ('jump', 0)]
    cols = []
    faces = []
    for name, i in picks:
        fr = frame(name, i)
        before = cv2.cvtColor(fr, cv2.COLOR_BGRA2RGBA)
        before = cv2.resize(before, (fr.shape[1] * UP, fr.shape[0] * UP), interpolation=cv2.INTER_LINEAR)
        after, box = enhance(fr)
        b, a_ = on_bg(before), on_bg(after)
        pair = Image.new('RGB', (b.width, b.height * 2 + 10), (40, 40, 46))
        pair.paste(b, (0, 0)); pair.paste(a_, (0, b.height + 10))
        cols.append(pair)
        if box is not None:
            x0, y0, x1, y1 = [v * UP for v in box]
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2 + 6
            r = 70
            cb = b.crop((cx - r, cy - r, cx + r, cy + r)).resize((280, 280), Image.LANCZOS)
            ca = a_.crop((cx - r, cy - r, cx + r, cy + r)).resize((280, 280), Image.LANCZOS)
            fp = Image.new('RGB', (570, 280), (40, 40, 46))
            fp.paste(cb, (0, 0)); fp.paste(ca, (290, 0))
            faces.append(fp)
    W = sum(c.width for c in cols) + 10 * (len(cols) - 1)
    H = max(c.height for c in cols)
    sheet = Image.new('RGB', (W, H), (40, 40, 46))
    x = 0
    for c in cols:
        sheet.paste(c, (x, 0)); x += c.width + 10
    sheet.save(os.path.join(outdir, 'antes_despues_cuerpo.png'))
    fs = Image.new('RGB', (570, len(faces) * 290), (40, 40, 46))
    for j, f in enumerate(faces):
        fs.paste(f, (0, j * 290))
    fs.save(os.path.join(outdir, 'antes_despues_cara.png'))
    print('ok', len(faces), 'caras')


def apply():
    frames_out, out_meta = [], {}
    for name, frs in meta.items():
        out_meta[name] = []
        for i, f in enumerate(frs):
            rgba, _ = enhance(frame(name, i), face=False)  # solo nitidez; la cara no se toca
            frames_out.append((name, f, rgba))
    pad, ATW = 6, 4096
    x, y, rowh = pad, pad, 0
    placed = []
    for name, f, rgba in frames_out:
        h, w = rgba.shape[:2]
        if x + w + pad > ATW:
            x, y, rowh = pad, y + rowh + pad, 0
        placed.append((name, f, rgba, x, y)); x += w + pad; rowh = max(rowh, h)
    ATH = y + rowh + pad
    big = np.zeros((ATH, ATW, 4), np.uint8)
    for name, f, rgba, px, py in placed:
        h, w = rgba.shape[:2]
        big[py:py + h, px:px + w] = rgba
        out_meta[name].append({'x': px, 'y': py, 'w': w, 'h': h, 'ax': round(f['ax'] * UP, 1), 'ay': round(f['ay'] * UP, 1)})
    Image.fromarray(big, 'RGBA').save(os.path.join(HERE, 'assets', 'atlas_hd.png'), optimize=True)
    with open(os.path.join(HERE, 'assets', 'atlas_hd.js'), 'w', encoding='utf8') as fh:
        fh.write(f'// generado por tools_enhance.py\nwindow.ATLAS_SCALE = {UP};\nwindow.ATLAS = ' + json.dumps(out_meta) + ';\n')
    print('atlas_hd', ATW, ATH)


if __name__ == '__main__':
    if sys.argv[1] == 'preview':
        preview(sys.argv[2])
    else:
        apply()



