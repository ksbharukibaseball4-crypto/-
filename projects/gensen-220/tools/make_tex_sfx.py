#!/usr/bin/env python3
"""Generate paper texture and opening sound effects (all synthesized here, no third-party audio)."""
import sys, wave, numpy as np, pathlib
from PIL import Image, ImageFilter
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, '/home/user/-/.claude/skills/kinyu-kaisetsu-douga/scripts'); import sfx as A, sfx_more as B
rng = np.random.default_rng(7)
# aged paper: low-frequency blotches + fibres + fine grain (grayscale, used with multiply blend)
W, H = 1920, 1080
base = rng.normal(0, 1, (H // 8, W // 8)); base = np.array(Image.fromarray(((base - base.min()) / np.ptp(base) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30)), float) / 255
grain = rng.normal(0, 1, (H, W)) * 0.035
fib = np.zeros((H, W)); 
for _ in range(900):
    x, y, l, a = rng.integers(0, W), rng.integers(0, H), rng.integers(20, 90), rng.uniform(0, np.pi)
    xs = (x + np.cos(a) * np.arange(l)).astype(int) % W; ys = (y + np.sin(a) * np.arange(l)).astype(int) % H; fib[ys, xs] += 0.05
yy, xx = np.mgrid[0:H, 0:W]; vig = ((xx / W - .5) ** 2 + (yy / H - .5) ** 2) ** .5
v = np.clip(0.93 - 0.10 * base + grain - fib - 0.28 * np.clip(vig - 0.25, 0, 1), 0, 1)
Image.fromarray((v * 255).astype(np.uint8)).save(ROOT / 'public/tex/paper.png')
g = (rng.normal(0.5, 0.18, (540, 960)) * 255).clip(0, 255).astype(np.uint8); Image.fromarray(g).save(ROOT / 'public/tex/grain.png')
def wav(name, x, g=1.0):
    x = np.clip(x * g, -1, 1); 
    with wave.open(str(ROOT / 'public/sfx' / f'{name}.wav'), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(A.SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
wav('paper', B.paper_slide(0.7, 3), 0.8); wav('pen', B.scribble(0.9, 5), 0.9); wav('click', B.click(3), 0.8)
cz = np.zeros(int(1.2 * A.SR))
for i in range(4):
    c = A.coin(1 + i * 0.1); s0 = int(i * 0.09 * A.SR); n = min(len(c), len(cz) - s0); cz[s0:s0 + n] += c[:n]
wav('coins', cz * 0.6)
wav('xmark', B.soft_error(), 0.7)
t = np.arange(int(2.6 * A.SR)) / A.SR
tick = np.zeros_like(t)
for k in range(10):
    c = B.click(k + 9); i = int(k * 0.24 * A.SR); n = min(len(c), len(tick) - i); tick[i:i + n] += c[:n]
wav('rewind', tick * 0.7 + np.pad(B.reverse_swell(440, 2.2), (0, len(t) - int(2.2 * A.SR)))[:len(t)] * 0.6)
cannon = np.zeros(int(4.6 * A.SR))
for s0, amp in [(0.2, 0.5), (1.7, 0.35), (2.9, 0.25)]:
    bm = B.boom(1.4); i = int(s0 * A.SR); n = min(len(bm), len(cannon) - i); cannon[i:i + n] += bm[:n] * amp
wav('cannon', cannon, 0.6)
n = len(t); wind = np.convolve(rng.normal(0, 1, int(8 * A.SR)), np.ones(400) / 400, 'same'); wav('wind', wind / np.abs(wind).max() * 0.18)
wav('stamp', A.stamp(), 0.9); wav('boom', B.boom(1.6), 0.8)
print('ok')
