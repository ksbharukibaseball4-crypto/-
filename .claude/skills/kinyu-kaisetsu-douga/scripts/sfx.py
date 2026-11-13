"""Offline synthesized sound effects (no files / network needed).

A small library of varied sounds; scene_sfx() picks a different transition
sound per scene and type-specific cues, with slight random pitch variation so
nothing repeats identically. Kept subtle so platform music can sit on top.
"""
from __future__ import annotations

import random

import numpy as np

SR = 48000
PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5]


def _t(d):
    return np.arange(int(d * SR)) / SR


def _env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    return np.clip(t / max(a, 1e-4), 0, 1) * np.exp(-t / max(r, 1e-4))


def _noise(n, seed=1):
    return np.random.default_rng(seed).standard_normal(n)


def _lowpass(x, k):
    y = np.zeros_like(x)
    acc = 0.0
    kk = np.broadcast_to(k, x.shape)
    for i in range(len(x)):
        acc += kk[i] * (x[i] - acc)
        y[i] = acc
    return y


def _f32(x, g):
    return (x * g).astype(np.float32)


# ---- transitions
def whoosh(d=0.32, seed=1):
    n = int(d * SR)
    y = _lowpass(_noise(n, seed), np.linspace(0.02, 0.22, n))
    return _f32(y * np.sin(np.pi * np.arange(n) / n) ** 2, 0.5)


def swish(seed=2):
    n = int(0.18 * SR)
    x = _noise(n, seed)
    y = x - _lowpass(x, 0.3)          # high-passed noise
    return _f32(y * np.sin(np.pi * np.arange(n) / n) ** 3, 0.18)


def woodblock(f=900):
    t = _t(0.12)
    return _f32((np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.7 * t)) * _env(len(t), 0.001, 0.025), 0.35)


def bubble(f=400):
    t = _t(0.14)
    freq = f * (1 + 2.2 * t / 0.14)
    return _f32(np.sin(2 * np.pi * np.cumsum(freq) / SR) * _env(len(t), 0.002, 0.05), 0.4)


# ---- musical
def marimba(f=660):
    t = _t(0.45)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 30)
    return _f32(x * _env(len(t), 0.002, 0.13), 0.28)


def bell(root=1046.5):
    t = _t(1.1)
    x = sum(a * np.sin(2 * np.pi * root * m * t) for m, a in ((1, 1), (2.01, .4), (2.76, .25), (5.4, .1)))
    return _f32(x * _env(len(t), 0.003, 0.4), 0.11)


def chord(freqs=(1047, 1319, 1568), d=1.0):
    t = _t(d)
    x = sum(np.sin(2 * np.pi * f * t) for f in freqs)
    return _f32(x * _env(len(t), 0.004, 0.35), 0.11)


def sparkle(seed=3):
    rng = random.Random(seed)
    out = np.zeros(int(0.7 * SR), np.float32)
    for i in range(6):
        f = rng.choice(PENTA) * 2
        s = marimba(f) * 0.5
        o = int(i * 0.08 * SR)
        out[o:o + len(s)] += s[: len(out) - o]
    return out


# ---- money / objects
def coin(pitch=1.0):
    t = _t(0.5)
    a, b = 1976 * pitch, 2637 * pitch
    x = (np.sin(2 * np.pi * a * t) + 0.6 * np.sin(2 * np.pi * b * t)) * _env(len(t), 0.002, 0.12)
    y = np.sin(2 * np.pi * b * t) * _env(len(t), 0.002, 0.18)
    y = np.roll(y, int(0.07 * SR))
    y[: int(0.07 * SR)] = 0
    return _f32(x + y, 0.2)


def register():
    out = np.concatenate([coin(1.0), np.zeros(1, np.float32)])
    c2 = coin(1.12)
    out[int(0.09 * SR):int(0.09 * SR) + len(c2)] += c2[: len(out) - int(0.09 * SR)]
    return out


def tick(f=3000):
    t = _t(0.03)
    return _f32(np.sin(2 * np.pi * f * t) * _env(len(t), 0.0005, 0.006), 0.25)


def typekey(seed=4):
    n = int(0.04 * SR)
    return _f32(_noise(n, seed) * _env(n, 0.0005, 0.008), 0.25)


def page(seed=5):
    n = int(0.25 * SR)
    y = _lowpass(_noise(n, seed), np.linspace(0.3, 0.05, n))
    return _f32(y * np.sin(np.pi * np.arange(n) / n), 0.35)


def stamp():
    t = _t(0.35)
    thump = np.sin(2 * np.pi * (120 * np.exp(-t * 10) + 50) * t) * _env(len(t), 0.001, 0.08)
    n = _noise(len(t), 9) * _env(len(t), 0.001, 0.02)
    return _f32(thump + 0.4 * n, 0.55)


def thud(seed=6):
    t = _t(0.2)
    x = np.sin(2 * np.pi * 90 * t) * _env(len(t), 0.001, 0.05) + 0.2 * _noise(len(t), seed) * _env(len(t), 0.001, 0.01)
    return _f32(x, 0.45)


def boing():
    t = _t(0.5)
    freq = 300 + 120 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 4) + 200 * t
    return _f32(np.sin(2 * np.pi * np.cumsum(freq) / SR) * _env(len(t), 0.003, 0.18), 0.25)


def drum():
    t = _t(0.3)
    return _f32(np.sin(2 * np.pi * (150 * np.exp(-t * 18) + 45) * t) * _env(len(t), 0.001, 0.12), 0.6)


def rise(d=0.9, up=True):
    t = _t(d)
    f0, f1 = (300, 900) if up else (900, 300)
    freq = f0 + (f1 - f0) * (t / d)
    return _f32(np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.sin(np.pi * t / d) ** 1.5, 0.13)


def alert():
    t = _t(0.35)
    x = np.sign(np.sin(2 * np.pi * 440 * t)) * 0.3 + np.sin(2 * np.pi * 880 * t) * 0.7
    return _f32(x * _env(len(t), 0.003, 0.1), 0.12)


NAMED = {"whoosh": whoosh, "swish": swish, "wood": woodblock, "bubble": bubble, "marimba": marimba,
         "bell": bell, "chime": chord, "sparkle": sparkle, "coin": coin, "register": register, "tick": tick,
         "type": typekey, "page": page, "stamp": stamp, "thud": thud, "boing": boing, "drum": drum,
         "alert": alert, "rise": lambda: rise(1.0, True), "fall": lambda: rise(1.0, False)}


def scene_sfx(visual: dict, dur: float, idx: int) -> list[tuple[float, np.ndarray]]:
    """Cue list [(offset_s, samples)] for one scene. Varies by index and type."""
    rng = random.Random(idx * 7919 + 11)
    pv = 1 + rng.uniform(-0.07, 0.07)
    typ = visual.get("type")
    cues: list = []
    if idx > 0:
        tr = idx % 5
        cues.append((0.0, [lambda: whoosh(seed=idx), lambda: swish(seed=idx), lambda: woodblock(820 * pv),
                           lambda: bubble(380 * pv), lambda: page(seed=idx)][tr]()))
    base = rng.randrange(0, 3)
    if typ == "hook":
        cues += [(0.05, boing()), (0.45, sparkle(idx))]
    elif typ == "section":
        cues += [(0.05, drum()), (0.3, chord((784 * pv, 988 * pv, 1175 * pv), 1.2))]
    elif typ in ("headline", "checklist"):
        n = len(visual.get("items", []))
        step = 0.4 if typ == "headline" else 0.5
        off = 0.3 if typ == "headline" else 0.6
        cues += [(off + i * step, marimba(PENTA[base + i * 2] * pv)) for i in range(n)]
    elif typ == "steps":
        n = len(visual.get("steps", []))
        cur = visual.get("current")
        if cur is None:
            cues += [(i * 0.22, marimba(PENTA[base + i * 2] * pv)) for i in range(n)]
        else:
            cues += [(0.15, marimba(PENTA[min(7, base + cur * 2)] * pv)), (0.4, tick(2400 * pv))]
    elif typ == "coins":
        n = len(visual.get("stacks", [])) or 4
        per = 0.7 * dur / n
        cues += [(i * per + per * 0.6, coin(pv * (1 + 0.05 * i))) for i in range(n)]
    elif typ == "bills":
        n = min(6, int(visual.get("count", 4)))
        cues += [(0.15 + i * 0.25 + 0.25, thud(i)) for i in range(n)] + [(0.75 * dur, register())]
    elif typ == "number":
        up = visual.get("to", 0) >= visual.get("from", 0)
        span = 0.7 * dur
        cues += [(0.1 + k * span / 12, tick((2200 + 120 * k) * pv)) for k in range(12)]
        cues += [(span, register() if up else alert())]
    elif typ == "graph":
        vals = (visual.get("series") or [{"values": [0, 1]}])[0]["values"]
        cues += [(0.15, rise(0.7 * dur, vals[-1] >= vals[0]))]
    elif typ == "bars":
        cues += [(0.6 + i * 0.35, marimba(PENTA[base + i * 2] * pv)) for i in range(len(visual.get("items", [])))]
    elif typ == "timeline":
        cues += [(0.05, swish(idx + 50)), (0.6, bell(880 * pv))]
    elif typ == "calendar":
        cues += [(0.4 + i * 0.6 * dur / 12, page(seed=i) * 0.5) for i in range(0, 12, 3)] + [(0.4 + 0.6 * dur, bell(1047 * pv))]
    elif typ == "flow":
        cues += [(i * 0.4, bubble((420 + 80 * i) * pv)) for i in range(len(visual.get("nodes", [])))]
        cues += [(1.3, coin(pv))]
    elif typ == "stamp":
        cues += [(max(0.5, 0.35 * dur), stamp())]
    elif typ == "wall":
        cues += [(i * 0.08 + 0.2, thud(i) * 0.6) for i in range(0, 7, 2)] + [(0.75, drum())]
    elif typ == "equation":
        cues += [(0.2 + i * 0.28, typekey(i)) for i in range(len(visual.get("terms", [])))]
        cues += [(0.3 + len(visual.get("terms", [])) * 0.28, bell(1175 * pv))]
    elif typ == "payslip":
        cues += [(0.05, page(seed=idx))] + [(0.4 + i * 0.45, typekey(i + 20)) for i in range(len(visual.get("rows", [])))]
    elif typ == "summary":
        cues += [(0.1, chord((1047 * pv, 1319 * pv, 1568 * pv))), (0.5, sparkle(idx))]
    elif typ == "disclaimer":
        cues += [(0.1, bell(784))]
    return cues
