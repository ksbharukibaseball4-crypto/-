import numpy as np, cv2, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
W, H, FPS = 1080, 1920, 30
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def rot_field(X, Y, piv, ang, wt):
    a = -ang * wt; c, s = np.cos(a), np.sin(a); dx, dy = X - piv[0], Y - piv[1]
    return piv[0] + c * dx - s * dy - X, piv[1] + s * dx + c * dy - Y
def anim(img, parts, t):
    h, w = img.shape[:2]; X, Y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    DX = np.zeros_like(X); DY = np.zeros_like(Y)
    for p in parts:
        wt = p['w'](X, Y).astype(np.float32)
        if p['kind'] == 'rot':
            dx, dy = rot_field(X, Y, p['piv'], p['amp'](t), wt); DX += dx; DY += dy
        elif p['kind'] == 'breath':
            k = p['amp'](t); DY += -(Y - p['piv'][1]) * k * wt; DX += -(X - p['piv'][0]) * k * 0.4 * wt
    return cv2.remap(img, X + DX, Y + DY, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
def band(x0, x1, y0, y1, f=40):
    return lambda X, Y: ss(x0 - f, x0 + f, X) * (1 - ss(x1 - f, x1 + f, X)) * ss(y0 - f, y0 + f, Y) * (1 - ss(y1 - f, y1 + f, Y))
def disc(cx, cy, r0, r1):
    return lambda X, Y: 1 - ss(r0, r1, np.hypot(X - cx, Y - cy))
S = math.sin; R = math.radians
CHARS = {
 'tiger': dict(src='tiger.png', parts=[
   dict(kind='breath', piv=(450, 760), w=band(120, 780, 300, 760, 80), amp=lambda t: 0.010 * S(t * 2 * math.pi / 3.2)),
   dict(kind='rot', piv=(440, 315), w=lambda X, Y: (1 - ss(250, 330, Y)) * band(230, 620, -200, 400, 50)(X, Y), amp=lambda t: R(3.0) * S(t * 2 * math.pi / 4.0) + R(1.2) * S(t * 2 * math.pi / 1.7)),
   dict(kind='rot', piv=(735, 505), w=disc(845, 375, 110, 220), amp=lambda t: R(-5.0) * max(0, S(t * 2 * math.pi / 3.0)) ** 2),
 ], cap='トラ先生'),
 'shiba': dict(src='shiba.png', parts=[
   dict(kind='breath', piv=(620, 980), w=band(220, 1020, 330, 960, 80), amp=lambda t: 0.010 * S(t * 2 * math.pi / 3.4)),
   dict(kind='rot', piv=(600, 335), w=lambda X, Y: (1 - ss(270, 350, Y)) * band(450, 780, -200, 400, 50)(X, Y), amp=lambda t: R(4.0) * S(t * 2 * math.pi / 3.6)),
   dict(kind='rot', piv=(300, 880), w=lambda X, Y: (1 - ss(250, 330, X)) * band(-100, 400, 780, 1010, 40)(X, Y), amp=lambda t: R(6.0) * S(t * 2 * math.pi / 0.9)),
 ], cap='シバ先生'),
}
font = ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf', 64)
def frame(ch, t, dur):
    c = CHARS[ch]; img = c['img']; out = anim(img, c['parts'], t)
    col = tuple(int(v) for v in img[3, 3]); bg = Image.new('RGB', (W, H), col); d = ImageDraw.Draw(bg)
    z = 1.0 + 0.04 * (t / dur); sc0 = min(1000 / img.shape[1], 1120 / img.shape[0]) * z; sw = int(img.shape[1] * sc0); sh = int(img.shape[0] * sc0)
    pim = Image.fromarray(out).resize((sw, sh), Image.LANCZOS)
    m = Image.new('L', (sw, sh), 255); md = ImageDraw.Draw(m)
    for i in range(40): md.rectangle((i, i, sw - 1 - i, sh - 1 - i), outline=int(255 * i / 40))
    bg.paste(pim, ((W - sw) // 2, 1450 - sh), m)
    tw = d.textlength(c['cap'], font=font); d.rounded_rectangle(((W - tw) / 2 - 40, 190, (W + tw) / 2 + 40, 300), 55, fill=(20, 22, 28)); d.text(((W - tw) / 2, 208), c['cap'], font=font, fill=(255, 216, 74))
    return np.asarray(bg)
p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
                      '-shortest', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', 'anim_test.mp4'], stdin=subprocess.PIPE)
for ch in ['tiger', 'shiba']:
    CHARS[ch]['img'] = np.asarray(Image.open(CHARS[ch]['src']).convert('RGB'))
    for f in range(FPS * 6): p.stdin.write(frame(ch, f / FPS, 6).tobytes())
p.stdin.close(); p.wait(); print('done')
