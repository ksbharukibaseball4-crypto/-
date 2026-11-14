#!/usr/bin/env python3
"""Extra synthesized sound effects (offline, no samples) — more variety for infographic videos.

All functions return float32 mono arrays at sfx.SR. Combine with sfx.py's set.
"""
import numpy as np

from sfx import SR, _env, _f32, _noise, _t


def _lp(x, fc):
    """one-pole low-pass with cutoff fc (Hz), vectorised in blocks"""
    k = 1 - np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += k * (x[i] - acc); y[i] = acc
    return y


def _bandpass(x, lo, hi):
    return _lp(x, hi) - _lp(x, lo)


def pop(f=700, d=0.07):
    t = _t(d); ph = 2 * np.pi * np.cumsum(f * np.exp(-t * 28)) / SR
    return _f32(np.sin(ph) * np.exp(-t * 45), 0.5)


def click(seed=1):
    n = int(0.018 * SR); x = _noise(n, seed) * np.exp(-np.arange(n) / (0.002 * SR))
    return _f32(x + 0.3 * np.sin(2 * np.pi * 4200 * _t(0.018)) * np.exp(-_t(0.018) * 300), 0.35)


def pluck(f=440, d=0.7, seed=2):
    n = int(d * SR); p = int(SR / f); buf = np.random.default_rng(seed).uniform(-1, 1, p); out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]; buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return _f32(out, 0.4)


def kalimba(f=880, d=0.9):
    t = _t(d)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 5) + 0.35 * np.sin(2 * np.pi * f * 5.43 * t) * np.exp(-t * 18)
    return _f32(x * _env(len(t), 0.002, 0.3), 0.4)


def glass(f=1568, d=1.6):
    t = _t(d)
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * k) for a, m, k in [(1, 1, 2.2), (0.5, 2.76, 4), (0.25, 5.4, 7)])
    return _f32(x, 0.3)


def ding():
    return np.concatenate([glass(1319, 0.12), glass(1760, 1.0)])


def scribble(d=0.6, seed=7):
    n = int(d * SR); x = _bandpass(_noise(n, seed), 1800, 6000)
    am = (np.sin(2 * np.pi * 9 * _t(d)) * 0.5 + 0.5) ** 2
    return _f32(x * am * _env(n, 0.02, 0.1), 0.35)


def paper_slide(d=0.45, seed=8):
    n = int(d * SR); x = _lp(_noise(n, seed), 2500)
    return _f32(x * np.sin(np.linspace(0, np.pi, n)) ** 1.5, 0.5)


def boom(d=1.4):
    t = _t(d); f = 70 * np.exp(-t * 2.5) + 38
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2) + 0.6 * _lp(_noise(len(t), 9), 300) * np.exp(-t * 9)
    return _f32(x, 0.8)


def reverse_swell(f=880, d=0.8):
    x = glass(f, d)[::-1].copy(); return _f32(x, 0.35)


def tick_roll(n=10, gap=0.045, f=3200):
    out = np.zeros(int((n * gap + 0.05) * SR), np.float32)
    for i in range(n):
        s = int(i * gap * SR); c = click(i + 3); out[s:s + len(c)] += c * (0.6 + 0.4 * i / n)
    return out


def success():
    out = np.zeros(int(1.3 * SR), np.float32)
    for i, f in enumerate([784, 988, 1175, 1568]):
        k = kalimba(f, 0.9); s = int(i * 0.09 * SR); out[s:s + len(k)] += k
    return out


def soft_error():
    t = _t(0.36); f = np.where(t < 0.16, 330, 247)
    x = np.sign(np.sin(2 * np.pi * f * t)) * _env(len(t), 0.005, 0.1)
    return _f32(_lp(x, 1200), 0.3)


def shutter():
    a = click(11); b = click(12)
    out = np.zeros(int(0.12 * SR), np.float32); out[:len(a)] += a; s = int(0.06 * SR); out[s:s + len(b)] += b * 0.8
    return out


def snap(seed=13):
    n = int(0.05 * SR); x = _bandpass(_noise(n, seed), 1500, 7000) * np.exp(-np.arange(n) / (0.006 * SR))
    return _f32(x, 0.6)


def swoop_up(d=0.5):
    t = _t(d); f = 300 + 1600 * (t / d) ** 2
    return _f32(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) * 0.6, 0.3)


def swoop_down(d=0.5):
    t = _t(d); f = 1900 - 1600 * (t / d) ** 0.5
    return _f32(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) * 0.6, 0.3)


def tape_stop(d=0.5):
    t = _t(d); f = 520 * (1 - t / d) ** 2 + 40
    return _f32(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * (1 - t / d), 0.12)


def heartbeat():
    out = np.zeros(int(0.7 * SR), np.float32)
    for s in (0.0, 0.22):
        t = _t(0.18); x = np.sin(2 * np.pi * 55 * t) * np.exp(-t * 22); i = int(s * SR); out[i:i + len(x)] += _f32(x, 0.7)
    return out


def chime_down():
    out = np.zeros(int(1.4 * SR), np.float32)
    for i, f in enumerate([1568, 1319, 1047, 784]):
        k = glass(f, 1.0); s = int(i * 0.11 * SR); out[s:s + len(k)] += k * 0.8
    return out
