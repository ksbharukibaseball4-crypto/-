"""Offline synthesized sound effects (no files / network needed).

Each function returns a float32 mono array at SR. Kept subtle so that the
video still works with TikTok/Shorts music added on top.
"""
from __future__ import annotations

import numpy as np

SR = 48000


def _t(d):
    return np.arange(int(d * SR)) / SR


def _env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    return att * np.exp(-t / max(r, 1e-4))


def whoosh(d=0.28):
    n = int(d * SR)
    rng = np.random.default_rng(1)
    x = rng.standard_normal(n)
    # sweep a simple one-pole low-pass cutoff upward
    out = np.zeros(n)
    y = 0.0
    for i in range(n):
        k = 0.02 + 0.25 * (i / n)
        y += k * (x[i] - y)
        out[i] = y
    env = np.sin(np.pi * np.arange(n) / n) ** 2
    return (out * env * 0.5).astype(np.float32)


def pop(f=520):
    t = _t(0.12)
    freq = f * (1 + 1.5 * np.exp(-t * 60))
    return (np.sin(2 * np.pi * np.cumsum(freq) / SR) * _env(len(t), 0.002, 0.03) * 0.6).astype(np.float32)


def coin():
    t = _t(0.5)
    x = (np.sin(2 * np.pi * 1976 * t) + 0.6 * np.sin(2 * np.pi * 2637 * t)) * _env(len(t), 0.002, 0.12)
    x[: int(0.06 * SR)] *= 0.6
    y = np.sin(2 * np.pi * 2637 * t) * _env(len(t), 0.002, 0.18)
    y = np.roll(y, int(0.07 * SR))
    y[: int(0.07 * SR)] = 0
    return ((x + y) * 0.22).astype(np.float32)


def tick():
    t = _t(0.03)
    return (np.sin(2 * np.pi * 3000 * t) * _env(len(t), 0.0005, 0.006) * 0.25).astype(np.float32)


def rise(d=0.9, up=True):
    t = _t(d)
    f0, f1 = (300, 900) if up else (900, 300)
    freq = f0 + (f1 - f0) * (t / d)
    env = np.sin(np.pi * t / d) ** 1.5
    return (np.sin(2 * np.pi * np.cumsum(freq) / SR) * env * 0.15).astype(np.float32)


def chime():
    t = _t(1.0)
    x = sum(a * np.sin(2 * np.pi * f * t) for f, a in ((1047, 1), (1319, .7), (1568, .5)))
    return (x * _env(len(t), 0.004, 0.35) * 0.13).astype(np.float32)


def alert():
    t = _t(0.35)
    x = np.sign(np.sin(2 * np.pi * 440 * t)) * 0.3 + np.sin(2 * np.pi * 880 * t) * 0.7
    return (x * _env(len(t), 0.003, 0.1) * 0.14).astype(np.float32)


def scene_sfx(visual: dict, dur: float, idx: int) -> list[tuple[float, np.ndarray]]:
    """Default SE cues for a scene: [(offset_seconds, samples)]."""
    typ = visual.get("type")
    cues = [] if idx == 0 else [(0.0, whoosh())]
    if typ == "hook":
        cues += [(0.05, pop(620)), (0.35, coin())]
    elif typ in ("coins",):
        n = len(visual.get("stacks", [])) or 4
        per = 0.7 * dur / n
        cues += [(i * per + per * 0.6, coin()) for i in range(n)]
    elif typ == "bills":
        n = int(visual.get("count", 4))
        cues += [(0.1 + i * 0.22 + 0.2, pop(300)) for i in range(n)] + [(0.3, coin())]
    elif typ == "number":
        up = visual.get("to", 0) >= visual.get("from", 0)
        span = 0.65 * dur
        cues += [(0.1 + k * span / 10, tick()) for k in range(10)]
        cues += [(span, coin() if up else alert())]
    elif typ == "graph":
        vals = (visual.get("series") or [{"values": [0, 1]}])[0]["values"]
        cues += [(0.15, rise(0.7 * dur, vals[-1] >= vals[0]))]
    elif typ == "bars":
        cues += [(0.1 + i * 0.3 + 0.5, pop(400 + 120 * i)) for i in range(len(visual.get("items", [])))]
    elif typ in ("steps", "headline"):
        n = len(visual.get("steps", visual.get("items", [])))
        cues += [(0.1 + i * 0.25, pop(480 + 80 * i)) for i in range(n)]
    elif typ == "summary":
        cues += [(0.1, chime())]
    elif typ == "disclaimer":
        cues += [(0.1, pop(400))]
    return cues


NAMED = {"whoosh": whoosh, "pop": pop, "coin": coin, "tick": tick, "chime": chime, "alert": alert,
         "rise": lambda: rise(1.0, True), "fall": lambda: rise(1.0, False)}
