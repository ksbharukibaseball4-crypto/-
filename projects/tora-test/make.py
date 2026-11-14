import numpy as np, cv2, math, subprocess, sys, wave
from PIL import Image
sys.path.insert(0, '/home/user/-/.claude/skills/kinyu-kaisetsu-douga/scripts'); import sfx
W, H, FPS = 1080, 1920, 30
S, R, PI = math.sin, math.radians, math.pi
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def band(x0, x1, y0, y1, f=40): return lambda X, Y: ss(x0 - f, x0 + f, X) * (1 - ss(x1 - f, x1 + f, X)) * ss(y0 - f, y0 + f, Y) * (1 - ss(y1 - f, y1 + f, Y))
def disc(cx, cy, r0, r1): return lambda X, Y: 1 - ss(r0, r1, np.hypot(X - cx, Y - cy))
def above(y0, y1, x0, x1, f=50): return lambda X, Y: (1 - ss(y0, y1, Y)) * ss(x0 - f, x0 + f, X) * (1 - ss(x1 - f, x1 + f, X))
def warp(img, parts, t, cache):
    h, w = img.shape[:2]
    if 'XY' not in cache: cache['XY'] = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32)); cache['W'] = [p['w'](*cache['XY']).astype(np.float32) for p in parts]
    X, Y = cache['XY']; DX = np.zeros_like(X); DY = np.zeros_like(Y)
    for p, wt in zip(parts, cache['W']):
        if p['kind'] == 'rot':
            a = -p['amp'](t) * wt; c, s_ = np.cos(a), np.sin(a); dx, dy = X - p['piv'][0], Y - p['piv'][1]
            DX += p['piv'][0] + c * dx - s_ * dy - X; DY += p['piv'][1] + s_ * dx + c * dy - Y
        elif p['kind'] == 'breath':
            k = p['amp'](t); DY -= (Y - p['piv'][1]) * k * wt; DX -= (X - p['piv'][0]) * k * 0.4 * wt
        elif p['kind'] == 'shift':
            ox, oy = p['amp'](t); DX -= ox * wt; DY -= oy * wt
    return cv2.remap(img, X + DX, Y + DY, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
def cam(img, z, fx, fy):   # zoom z around focus (fraction of image), output W x H
    h, w = img.shape[:2]; s = W / w * z; M = np.float32([[s, 0, W / 2 - fx * w * s], [0, s, H / 2 - fy * h * s]])
    # clamp so no border shows
    M[0, 2] = min(0, max(W - w * s, M[0, 2])); M[1, 2] = min(0, max(H - h * s, M[1, 2]))
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
laugh = lambda t: max(0, S(t * 2 * PI * 2.6)) ** 2
SCENES = [
 dict(img='assets/s1.png', tel='t1.png', dur=5.0, z=(1.0, 1.07), f=((0.5, 0.42), (0.47, 0.38)), parts=[
   dict(kind='rot', piv=(400, 505), w=above(470, 545, 250, 560), amp=lambda t: R(2.2) * laugh(t) - R(1.0)),
   dict(kind='breath', piv=(420, 1150), w=band(150, 700, 500, 1150, 80), amp=lambda t: 0.006 * laugh(t)),
   dict(kind='rot', piv=(80, 740), w=disc(70, 610, 110, 190), amp=lambda t: R(2.5) * laugh(t + 0.13)),
   dict(kind='rot', piv=(180, 1100), w=disc(220, 960, 120, 210), amp=lambda t: R(-2.0) * laugh(t + 0.21)),
   dict(kind='rot', piv=(820, 880), w=disc(820, 750, 100, 180), amp=lambda t: R(-2.5) * laugh(t + 0.07)),
   dict(kind='rot', piv=(30, 470), w=lambda X, Y: (1 - ss(220, 420, Y)) * (1 - ss(700, 900, X)), amp=lambda t: R(0.8) * S(t * 2 * PI / 2.6)),
 ]),
 dict(img='assets/s2.png', tel='t2.png', dur=5.0, z=(1.0, 1.18), f=((0.5, 0.5), (0.5, 0.36)), parts=[
   dict(kind='breath', piv=(470, 1090), w=band(90, 880, 560, 1090, 80), amp=lambda t: 0.008 * S(t * 2 * PI / 3.0)),
   dict(kind='rot', piv=(470, 585), w=above(545, 625, 320, 640), amp=lambda t: R(2.0) * S(t * 2 * PI / 4.2) + R(1.0) * max(0, S((t - 1.2) * 2 * PI / 2.4)) ** 4),
 ]),
 dict(img='assets/s3.png', tel='t3.png', dur=5.0, z=(1.12, 1.0), f=((0.5, 0.55), (0.5, 0.5)), parts=[
   dict(kind='breath', piv=(520, 1150), w=band(200, 870, 640, 1150, 80), amp=lambda t: 0.007 * S(t * 2 * PI / 3.2)),
   dict(kind='rot', piv=(500, 650), w=above(610, 690, 300, 690), amp=lambda t: R(2.5) * max(0, S(t * 2 * PI / 1.6)) ** 2),
   dict(kind='rot', piv=(380, 1110), w=disc(440, 1250, 90, 175), amp=lambda t: R(-3.5) * max(0, S(t * 2 * PI / 0.8)) ** 6),
   dict(kind='shift', w=disc(285, 1265, 40, 95), amp=lambda t: (4 * S(t * 2 * PI * 3.1), 2 * S(t * 2 * PI * 4.3))),
 ]),
]
XF = 8   # crossfade frames
def pop(t):  # telop entrance: alpha and scale
    k = min(1, t / 0.25); return k, 0.92 + 0.08 * (1 - (1 - k) ** 3)
frames = []
p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', 'visual.mp4'], stdin=subprocess.PIPE)
prev_tail = None
for sc in SCENES:
    img = np.asarray(Image.open(sc['img']).convert('RGB')); tel = Image.open(sc['tel']).convert('RGBA'); cache = {}
    n = int(sc['dur'] * FPS)
    for i in range(n):
        t = i / FPS; k = i / (n - 1); e = k * k * (3 - 2 * k)
        z = sc['z'][0] + (sc['z'][1] - sc['z'][0]) * e; fx = sc['f'][0][0] + (sc['f'][1][0] - sc['f'][0][0]) * e; fy = sc['f'][0][1] + (sc['f'][1][1] - sc['f'][0][1]) * e
        fr = cam(warp(img, sc['parts'], t, cache), z, fx, fy)
        a, s = pop(t - 0.15)
        if a > 0:
            tl = tel.resize((int(W * s), int(H * s)), Image.LANCZOS) if s < 1 else tel; base = Image.fromarray(fr)
            ox, oy = (W - tl.width) // 2, int((H - tl.height) * 0.62)
            al = tl.getchannel('A').point(lambda v: int(v * a)); tl.putalpha(al); base.paste(tl, (ox, oy), tl); fr = np.asarray(base)
        if prev_tail is not None and i < XF:
            m = (i + 1) / (XF + 1); fr = (fr * m + prev_tail[i] * (1 - m)).astype(np.uint8)
        if i >= n - XF and sc is not SCENES[-1]:
            prev_tail = prev_tail if False else None
        p.stdin.write(np.ascontiguousarray(fr).tobytes())
        if i >= n - XF: frames.append(fr)
    prev_tail = frames[-XF:]; frames = []
p.stdin.close(); p.wait()
# sound
dur = sum(s['dur'] for s in SCENES); mix = np.zeros(int(dur * sfx.SR) + sfx.SR, np.float32)
def put(t, x):
    i = int(t * sfx.SR); mix[i:i + len(x)] += x[:len(mix) - i]
put(0.0, sfx.whoosh(0.4)); put(0.2, sfx.chord()); put(0.25, sfx.sparkle())
for k in range(5): put(0.6 + k / 2.6, sfx.bubble(380 + 40 * (k % 2)) * 0.5)
put(5.0, sfx.whoosh(0.35, 2)); put(5.25, sfx.stamp()); put(5.3, sfx.bell())
put(10.0, sfx.swish(3)); put(10.3, sfx.marimba(660))
for k in range(6): put(10.2 + k * 0.8, sfx.woodblock(1100) * 0.7)
mix = np.clip(mix, -1, 1); pcm = (mix * 32767).astype(np.int16)
with wave.open('audio.wav', 'wb') as wv: wv.setnchannels(1); wv.setsampwidth(2); wv.setframerate(sfx.SR); wv.writeframes(pcm.tobytes())
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', 'visual.mp4', '-i', 'audio.wav', '-af', 'loudnorm=I=-18:TP=-1.5', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', 'tora_test.mp4'], check=True)
print('ok')
