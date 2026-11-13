#!/usr/bin/env python3
"""Render scenes + word-highlight subtitles to <out>/visual.mp4 (no audio).

Usage: render.py scenes.json --out out [--workers N] [--still SECONDS]
Needs <out>/timeline.json from tts.py.

Layout (1080x1920, symmetric margins so it looks centered in any player):
  y 150-470  PR badge + subtitles (top center)
  y 500-1090 main visual
  y 1100-1440 stage: people illustrations + speech bubble with 時点/注記
  y >= 1440  floor / decoration only (TikTok caption area)
  x >= 918   decoration only (TikTok buttons); left margin mirrors it (162)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chara import draw_chara, draw_icon, star  # noqa: E402
from common import (BILL, DISCLAIMER, DOWN, FLOOR_Y, FPS, GOLD, GOLD_DARK, GOLD_LIGHT, H,  # noqa: E402
                    MUTED, NAVY_BOTTOM, NAVY_CARD, NAVY_TOP, SAFE_BOTTOM, SAFE_CX, SAFE_LEFT,
                    SAFE_RIGHT, SAFE_TOP, SUB_BOTTOM, SUB_TOP, UP, VIS_BOTTOM, VIS_TOP,
                    W, WHITE, font, load_spec, out_dir)

L, R, CX = SAFE_LEFT, SAFE_RIGHT, SAFE_CX
CW = R - L                      # content width (756)
VT, VB = VIS_TOP, VIS_BOTTOM
VCY = (VT + VB) // 2
ENTER = 0.42                    # scene entrance duration (s)
G: dict = {}


# ------------------------------------------------------------------ basics
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_back(x):
    x = clamp(x)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def lerp(a, b, k):
    return a + (b - a) * k


def rgba(c, a=255):
    return (c[0], c[1], c[2], int(clamp(a / 255) * 255))


def fmt_num(v, decimals=0):
    return f"{v:,.{decimals}f}"


def color_of(name, default=GOLD):
    return {"up": UP, "down": DOWN, "gold": GOLD, "muted": MUTED, "white": WHITE}.get(name, default)


def text_size(txt, size):
    b = font(int(size)).getbbox(txt)
    return b[2] - b[0], b[3] - b[1]


def text_c(d, xy, txt, size, fill, stroke=4, stroke_fill=(5, 12, 35), anchor="mm"):
    d.text(xy, txt, font=font(int(size)), fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)


def wrap(txt, size, maxw):
    lines, cur = [], ""
    for ch in txt:
        if text_size(cur + ch, size)[0] > maxw and cur:
            if ch in "、。？！）」":
                cur += ch
                continue
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def fit_lines(txt, size, maxw, maxlines):
    while size > 30:
        ls = wrap(txt, size, maxw)
        if len(ls) <= maxlines:
            return ls, size
        size -= 4
    return wrap(txt, size, maxw), size


def fit_one(txt, size, maxw, min_size=34):
    while size > min_size and text_size(txt, size)[0] > maxw:
        size -= 2
    return size


def title_c(d, txt, y, size=80, col=GOLD, maxw=CW - 40):
    """One-line title (shrinks); wraps to 2 lines only if it must. Returns bottom y."""
    f = fit_one(txt, size, maxw, 52)
    if text_size(txt, f)[0] <= maxw:
        text_c(d, (CX, y), txt, f, col, stroke=6)
        return y + f * 0.6
    ls, f = fit_lines(txt, 60, maxw, 2)
    for i, ln in enumerate(ls):
        text_c(d, (CX, y + (i - 0.5) * f * 1.15), ln, f, col, stroke=5)
    return y + f * 1.2


def card(d, box, fill=NAVY_CARD, outline=None, width=4, r=32, a=235):
    d.rounded_rectangle(box, r, fill=rgba(fill, a), outline=outline, width=width)


def coin(d, cx, cy, r, flip=1.0, alpha=255):
    w = max(2, abs(flip) * r)
    d.ellipse((cx - w, cy - r, cx + w, cy + r), fill=rgba(GOLD_DARK, alpha))
    d.ellipse((cx - w * 0.86, cy - r * 0.86, cx + w * 0.86, cy + r * 0.86), fill=rgba(GOLD, alpha))
    if abs(flip) > 0.45:
        d.text((cx, cy), "¥", font=font(int(r * 1.1)), fill=rgba(GOLD_DARK, alpha), anchor="mm")


def coin_side(d, cx, cy, r, h=20, th=9):
    d.ellipse((cx - r, cy - h * 0.5 + th, cx + r, cy + h * 0.5 + th), fill=rgba(GOLD_DARK))
    d.rectangle((cx - r, cy, cx + r, cy + th), fill=rgba(GOLD_DARK))
    d.line((cx - r, cy + th * 0.5, cx + r, cy + th * 0.5), fill=rgba((150, 105, 20)), width=2)
    d.ellipse((cx - r, cy - h * 0.5, cx + r, cy + h * 0.5), fill=rgba(GOLD))
    d.ellipse((cx - r * 0.7, cy - h * 0.32, cx + r * 0.7, cy + h * 0.32), outline=rgba(GOLD_LIGHT), width=2)


def bill_bundle(d, cx, cy, w=200, h=96):
    for k in range(3):
        o = (2 - k) * 6
        d.rounded_rectangle((cx - w / 2 + o, cy - h / 2 - o, cx + w / 2 + o, cy + h / 2 - o), 10,
                            fill=rgba(tuple(int(c * (0.75 + 0.1 * k)) for c in BILL)),
                            outline=rgba((40, 80, 50)), width=2)
    d.rectangle((cx - 20, cy - h / 2, cx + 20, cy + h / 2), fill=rgba((235, 230, 205)))
    d.text((cx, cy), "¥", font=font(40), fill=rgba((60, 90, 60)), anchor="mm")
    d.ellipse((cx - w / 2 + 16, cy - 20, cx - w / 2 + 56, cy + 20), outline=rgba((215, 235, 205)), width=3)


def item_text(it):
    return it if isinstance(it, str) else it.get("text", "")


def item_icon(it):
    return None if isinstance(it, str) else it.get("icon")


# ------------------------------------------------------------------ backgrounds
_BASE = None
_GLOW = None
BG_STYLES = ["rays", "city", "grid", "bokeh", "chart"]


def base_image():
    global _BASE, _GLOW
    if _BASE is None:
        y = np.linspace(0, 1, H)[:, None, None]
        top, bot = np.array(NAVY_TOP, float), np.array(NAVY_BOTTOM, float)
        arr = (top * (1 - y) + bot * y).repeat(W, axis=1)
        fy = FLOOR_Y
        fl = np.linspace(0, 1, H - fy)[:, None, None]
        ftop, fbot = np.array((26, 50, 110), float), np.array((8, 16, 42), float)
        arr[fy:] = (ftop * (1 - fl) + fbot * fl).repeat(W, axis=1)
        img = Image.fromarray(arr.astype(np.uint8), "RGB")
        d = ImageDraw.Draw(img, "RGBA")
        for i in range(-8, 9):
            d.line((CX + i * 40, fy, CX + i * 260, H), fill=(90, 130, 220, 40), width=2)
        for j in range(1, 7):
            yy = fy + (H - fy) * (j / 7) ** 1.7
            d.line((0, yy, W, yy), fill=(90, 130, 220, 30), width=2)
        d.line((0, fy, W, fy), fill=rgba(GOLD, 110), width=3)
        _BASE = img
        g = Image.new("L", (1400, 1400), 0)
        ImageDraw.Draw(g).ellipse((420, 420, 980, 980), fill=46)
        g = g.filter(ImageFilter.GaussianBlur(170))
        _GLOW = (Image.new("RGB", (1400, 1400), GOLD), g)
    return _BASE


_RNG = random.Random(7)
CITY = []
_x = -60
while _x < W + 200:
    _w = _RNG.randint(70, 150)
    CITY.append((_x, _w, _RNG.randint(140, 400), _RNG.random()))
    _x += _w + _RNG.randint(4, 20)
BOKEH = [(_RNG.random(), _RNG.random(), _RNG.randint(40, 120), _RNG.choice([GOLD, (90, 200, 220), (120, 140, 255)]))
         for _ in range(14)]
CANDLES = []
_v = 0.0
for _ in range(60):
    _o = _v
    _v += _RNG.uniform(-1, 1.1)
    CANDLES.append((_o, _v, max(_o, _v) + _RNG.random() * 0.6, min(_o, _v) - _RNG.random() * 0.6))
PARTICLES = [(random.Random(i).random(), random.Random(i * 7 + 1).random(), random.Random(i * 13 + 2).random())
             for i in range(26)]


def draw_background(img, style, t):
    glow, gmask = _GLOW
    img.paste(glow, (int(CX - 700 + 160 * math.sin(t * 0.5)), int(800 - 700 + 200 * math.cos(t * 0.4))), gmask)
    d = ImageDraw.Draw(img, "RGBA")
    if style == "rays":
        ox, oy = CX, 360
        for i in range(12):
            a0 = t * 0.12 + i * math.pi / 6
            a1 = a0 + 0.13
            d.polygon([(ox, oy), (ox + 2200 * math.cos(a0), oy + 2200 * math.sin(a0)),
                       (ox + 2200 * math.cos(a1), oy + 2200 * math.sin(a1))], fill=rgba(GOLD, 13))
    elif style == "city":
        off = 30 * math.sin(t * 0.3)
        for bx, bw, bh, ph in CITY:
            x0 = bx + off
            top = FLOOR_Y - bh
            d.rectangle((x0, top, x0 + bw, FLOOR_Y), fill=(14, 30, 72, 255))
            d.rectangle((x0, top, x0 + bw, top + 4), fill=(40, 70, 140, 255))
            for wy in range(int(top) + 18, FLOOR_Y - 20, 34):
                for wx in range(int(x0) + 12, int(x0 + bw) - 18, 26):
                    on = (math.sin(wx * 12.9898 + wy * 78.233 + int(t * 1.5 + ph * 5)) * 43758.5) % 1
                    if on > 0.55:
                        d.rectangle((wx, wy, wx + 12, wy + 16), fill=rgba(GOLD_LIGHT, 70))
    elif style == "grid":
        hy = 980
        for i in range(-12, 13):
            d.line((CX + i * 30, hy, CX + i * 220, FLOOR_Y + 300), fill=(70, 110, 210, 40), width=2)
        ph = (t * 0.25) % 1
        for j in range(10):
            f = ((j + ph) / 10) ** 2
            yy = hy + (FLOOR_Y + 300 - hy) * f
            d.line((0, yy, W, yy), fill=(70, 110, 210, int(20 + 40 * f)), width=2)
        for j in range(5):
            d.line((0, 200 + j * 160, W, 200 + j * 160), fill=(70, 110, 210, 14), width=1)
    elif style == "bokeh":
        for bx, by, br, col in BOKEH:
            x0 = (bx * W + 40 * math.sin(t * 0.4 + by * 6)) % (W + 200) - 100
            y0 = (by * H - t * 18) % (H + 200) - 100
            d.ellipse((x0 - br, y0 - br, x0 + br, y0 + br), fill=rgba(col, 22))
            d.ellipse((x0 - br * 0.6, y0 - br * 0.6, x0 + br * 0.6, y0 + br * 0.6), fill=rgba(col, 14))
    elif style == "chart":
        sc, base = 26, 860
        span = len(CANDLES) * 30
        for i, (o, c, hi, lo) in enumerate(CANDLES):
            x0 = (i * 30 - t * 30) % span - 60
            if x0 < -40 or x0 > W + 40:
                continue
            col = UP if c >= o else DOWN
            d.line((x0, base - hi * sc, x0, base - lo * sc), fill=rgba(col, 40), width=2)
            d.rectangle((x0 - 8, base - max(o, c) * sc, x0 + 8, base - min(o, c) * sc), fill=rgba(col, 36))
    for px, py, ps in PARTICLES:
        xx = (px * W + 25 * math.sin(t * (0.4 + ps) + px * 9)) % W
        yy = (py * H - t * (20 + 40 * ps)) % H
        r = 2 + 4 * ps
        a = 40 + 80 * (0.5 + 0.5 * math.sin(t * 1.6 + ps * 20))
        d.ellipse((xx - r, yy - r, xx + r, yy + r), fill=rgba(GOLD_LIGHT, a))


# ------------------------------------------------------------------ visuals
def v_hook(d, v, lt, D, t):
    size = int(v.get("size", 150))
    k = ease_back(lt / 0.6)
    cy = VCY - 40
    for i in range(6):
        ang = t * 0.9 + i * 2 * math.pi / 6
        coin(d, CX + 320 * math.cos(ang), cy + 10 + 170 * math.sin(ang), 36 + 9 * math.sin(ang),
             flip=math.cos(t * 3 + i), alpha=200 * clamp(k))
    big = v.get("big", "")
    s = fit_one(big, size, CW - 40, 30)
    s = max(8, int(s * (0.3 + 0.7 * k) * (1 + 0.03 * math.sin(t * 4))))
    text_c(d, (CX, cy), big, s, color_of(v.get("color"), GOLD), stroke=8)
    if v.get("sub"):
        a = 255 * ease_out((lt - 0.45) / 0.4)
        text_c(d, (CX, cy + 190), v["sub"], fit_one(v["sub"], 60, CW - 60), rgba(WHITE, a), stroke=5)


def v_section(d, v, lt, D, t):
    k = ease_back(lt / 0.55)
    cy = VT + 175
    r = 120 * clamp(k, 0, 1.2)
    glow = 8 + 4 * math.sin(t * 4)
    d.ellipse((CX - r - glow, cy - r - glow, CX + r + glow, cy + r + glow), fill=rgba(GOLD, 50))
    d.ellipse((CX - r, cy - r, CX + r, cy + r), fill=rgba(NAVY_CARD), outline=rgba(GOLD), width=8)
    if k > 0.3:
        draw_icon(d, v.get("icon", "coin"), CX, cy + 4 * math.sin(t * 3), 150 * clamp(k))
    if v.get("num"):
        nb = (CX + 95, cy - 95)
        d.ellipse((nb[0] - 42, nb[1] - 42, nb[0] + 42, nb[1] + 42), fill=rgba(GOLD), outline=rgba(NAVY_TOP), width=4)
        text_c(d, nb, str(v["num"]), 52, NAVY_TOP, stroke=0)
    kt = ease_out((lt - 0.25) / 0.45)
    ty = VT + 390 + (1 - kt) * 40
    title = v.get("title", "")
    f = fit_one(title, 120, CW - 40, 60)
    text_c(d, (CX, ty), title, f, rgba(GOLD, 255 * kt), stroke=8)
    tw = text_size(title, f)[0]
    ul = ease_out((lt - 0.5) / 0.5)
    if ul > 0:
        d.rounded_rectangle((CX - tw / 2 * ul, ty + f * 0.62, CX + tw / 2 * ul, ty + f * 0.62 + 8), 4, fill=rgba(GOLD))
    if v.get("sub"):
        a = 255 * ease_out((lt - 0.6) / 0.4)
        text_c(d, (CX, ty + f * 0.62 + 70), v["sub"], fit_one(v["sub"], 54, CW - 40), rgba(WHITE, a), stroke=4)


def v_headline(d, v, lt, D, t):
    y = title_c(d, v.get("title", ""), VT + 60, 84) + 70
    items = v.get("items", [])
    ih = 104 if len(items) <= 3 else 86
    for i, it in enumerate(items):
        k = ease_out((lt - 0.3 - i * 0.4) / 0.45)
        if k <= 0:
            y += ih + 22
            continue
        x0 = L + 20 + (1 - k) * 90
        card(d, (x0, y, R - 20, y + ih), a=225 * k, r=26)
        ic = item_icon(it)
        if ic:
            draw_icon(d, ic, x0 + 55, y + ih / 2, 70, a=255 * k)
            tx = x0 + 105
        else:
            d.ellipse((x0 + 26, y + ih / 2 - 18, x0 + 62, y + ih / 2 + 18), fill=rgba(GOLD, 255 * k))
            tx = x0 + 84
        txt = item_text(it)
        text_c(d, (tx, y + ih / 2), txt, fit_one(txt, 52, R - 40 - tx, 30), rgba(WHITE, 255 * k), stroke=3, anchor="lm")
        y += ih + 22


def v_steps(d, v, lt, D, t):
    steps = v.get("steps", [])[:3]
    n = max(1, len(steps))
    cur = v.get("current")
    if cur is None:
        cur = min(n - 1, int(lt / max(0.7, D / n)))
    gap = 54
    h = min(160, (VB - VT - 30 - (n - 1) * gap) / n)
    top = VT + 15 + ((VB - VT - 30) - (n * h + (n - 1) * gap)) / 2
    for i, st in enumerate(steps):
        k = ease_out((lt - i * 0.22) / 0.45)
        y = top + i * (h + gap) + (1 - k) * 50
        on = i == cur
        pulse = 1 + (0.025 * math.sin(t * 5) if on else 0)
        hw = (CW - 30) / 2 * pulse
        card(d, (CX - hw, y, CX + hw, y + h), outline=rgba(GOLD if on else MUTED, 255 * k),
             width=8 if on else 3, a=230 * k)
        cr = h * 0.3
        ccx = CX - hw + 30 + cr
        d.ellipse((ccx - cr, y + h / 2 - cr, ccx + cr, y + h / 2 + cr), fill=rgba(GOLD if on else MUTED, 255 * k))
        text_c(d, (ccx, y + h / 2), str(i + 1), cr * 1.2, rgba(NAVY_TOP, 255 * k), stroke=0)
        tx = ccx + cr + 26
        maxw = CX + hw - 24 - tx
        f1 = fit_one(st, 54, maxw, 38)
        ls, s = ([st], f1) if text_size(st, f1)[0] <= maxw else fit_lines(st, 48, maxw, 2)
        for j, ln in enumerate(ls):
            text_c(d, (tx, y + h / 2 + (j - (len(ls) - 1) / 2) * s * 1.15), ln, s,
                   rgba(WHITE if on else MUTED, 255 * k), stroke=3, anchor="lm")
        if i < n - 1 and k > 0.5:
            ay = y + h + 8 + 6 * math.sin(t * 5)
            d.polygon([(CX - 24, ay), (CX + 24, ay), (CX, ay + 34)], fill=rgba(GOLD, 220))


def v_coins(d, v, lt, D, t):
    stacks = (v.get("stacks") or [1, 2, 3, 4])[:5]
    labels = v.get("labels", [])
    n = len(stacks)
    base = VB - 100
    r = 58
    ch = min(42, (base - VT - 170) / max(1, max(stacks)))
    per = 0.7 * D / max(1, n)
    for i, cnt in enumerate(stacks):
        cx = L + 30 + (CW - 60) * (i + 0.5) / n
        p = clamp((lt - i * per) / per)
        shown = int(round(cnt * ease_out(p))) if p > 0 else 0
        d.ellipse((cx - r - 6, base + 6, cx + r + 6, base + 30), fill=(0, 0, 0, 60))
        for c in range(shown):
            coin_side(d, cx, base - c * ch, r, th=max(8, ch - 2))
        if 0 < p < 1:
            coin(d, cx, lerp(VT + 120, base - shown * ch, ease_out(p * 1.3)), r * 0.75, flip=math.cos(t * 9))
        if i < len(labels):
            text_c(d, (cx, base + 62), labels[i], fit_one(labels[i], 42, CW / n - 10, 26), MUTED, stroke=2)
        if p >= 1 and i > 0 and stacks[i] != stacks[i - 1]:
            col = UP if stacks[i] > stacks[i - 1] else DOWN
            text_c(d, (cx, base - cnt * ch - 60 + 6 * math.sin(t * 5)), "▲" if col == UP else "▼", 46, col, stroke=2)
    if v.get("label"):
        title_c(d, v["label"], VT + 50, 66)


def v_bills(d, v, lt, D, t):
    n = min(6, int(v.get("count", 4)))
    rows = [3, 2, 1] if n >= 6 else ([2, 2, 1] if n == 5 else ([2, 2] if n == 4 else [n]))
    base = VB - 70
    idx = 0
    for ri, cnt in enumerate(rows):
        for j in range(cnt):
            k = ease_back((lt - 0.15 - idx * 0.25) / 0.4)
            idx += 1
            if k <= 0:
                continue
            cx = CX + (j - (cnt - 1) / 2) * 215
            y = lerp(VT + 120, base - 50 - ri * 92, k)
            bill_bundle(d, cx + 3 * math.sin(t * 2 + idx), y)
    if "value_to" in v:
        p = ease_out(lt / (0.75 * D))
        val = lerp(float(v.get("value_from", 0)), float(v["value_to"]), p)
        col = color_of(v["color"]) if v.get("color") else (UP if v["value_to"] >= v.get("value_from", 0) else DOWN)
        txt = v.get("prefix", "") + fmt_num(val, v.get("decimals", 0)) + v.get("unit", "")
        text_c(d, (CX, VT + 70), txt, fit_one(txt, 110, CW - 40), col, stroke=7)
    elif v.get("amount"):
        text_c(d, (CX, VT + 70), v["amount"], 110, GOLD, stroke=7)
    if v.get("label"):
        text_c(d, (CX, VT + 170), v["label"], fit_one(v["label"], 52, CW - 40), WHITE, stroke=4)


def v_number(d, v, lt, D, t):
    p = ease_out(lt / (0.7 * D))
    a, b = float(v.get("from", 0)), float(v.get("to", 0))
    val = lerp(a, b, p)
    col = color_of(v.get("color")) if v.get("color") else (UP if b > a else DOWN if b < a else GOLD)
    cy = VCY + 10
    if v.get("label"):
        text_c(d, (CX, cy - 190), v["label"], fit_one(v["label"], 60, CW - 40), WHITE, stroke=5)
    txt = v.get("prefix", "") + fmt_num(val, v.get("decimals", 0))
    s = 190 if len(txt) <= 4 else 140
    s = int(s * (1 + 0.04 * math.sin(t * 4) * (p >= 1)))
    unit = v.get("unit", "")
    tw = text_size(txt, s)[0]
    us = fit_one(unit, 76, CW - tw - 40, 40)
    uw = text_size(unit, us)[0]
    x0 = CX - (tw + uw + 12) / 2
    text_c(d, (x0, cy), txt, s, col, stroke=8, anchor="lm")
    text_c(d, (x0 + tw + 12, cy + s * 0.18), unit, us, col, stroke=5, anchor="lm")
    if b != a and p > 0.9:
        text_c(d, (CX, cy + 160 + 8 * math.sin(t * 5)), "▲" if b > a else "▼", 72, col, stroke=3)
    elif b == a:
        rr = 150 + 10 * math.sin(t * 3)
        d.rounded_rectangle((CX - min(rr * 1.8, CW / 2), cy - rr * 0.62, CX + min(rr * 1.8, CW / 2), cy + rr * 0.62), 30,
                            outline=rgba(GOLD, 120), width=4)


def v_graph(d, v, lt, D, t):
    series = v.get("series", [])
    x0, x1 = L + 90, R - 40
    y0, y1 = VT + 140, VB - 80
    card(d, (L + 10, VT + 10, R - 10, VB - 10), a=200)
    if v.get("label"):
        text_c(d, (CX, VT + 70), v["label"], fit_one(v["label"], 54, CW - 60), GOLD, stroke=4)
    allv = [x for s in series for x in s["values"]]
    lo = v.get("y_min", min(allv) * 0.95 if allv else 0)
    hi = v.get("y_max", max(allv) * 1.03 if allv else 1)
    hi = hi if hi != lo else lo + 1
    d.line((x0, y1, x1, y1), fill=rgba(MUTED, 160), width=3)
    d.line((x0, y0, x0, y1), fill=rgba(MUTED, 160), width=3)
    xl = v.get("x_labels", [])
    for i, lab in enumerate(xl):
        text_c(d, (x0 + (x1 - x0) * (i / max(1, len(xl) - 1)), y1 + 40), lab, 36, MUTED, stroke=2)
    p = ease_out(lt / (0.7 * D))
    labels = []
    for si, s in enumerate(series):
        vals = s["values"]
        n = len(vals)
        trend = s.get("color", "auto")
        col = (UP if vals[-1] >= vals[0] else DOWN) if trend == "auto" else color_of(trend)
        pts = [(x0 + (x1 - x0) * i / (n - 1), y1 - (y1 - y0) * (vals[i] - lo) / (hi - lo)) for i in range(n)]
        f = p * (n - 1)
        k = int(f)
        dr = pts[: k + 1]
        if k < n - 1:
            dr.append((lerp(pts[k][0], pts[k + 1][0], f - k), lerp(pts[k][1], pts[k + 1][1], f - k)))
        if len(dr) >= 2:
            if si == 0 and s.get("fill", True):
                d.polygon(dr + [(dr[-1][0], y1), (dr[0][0], y1)], fill=rgba(col, 45))
            d.line(dr, fill=rgba(col), width=10 if si == 0 else 7, joint="curve")
        ex, ey = dr[-1]
        rr = 13 + 4 * math.sin(t * 6)
        d.ellipse((ex - rr, ey - rr, ex + rr, ey + rr), fill=rgba(col))
        cur_val = vals[-1] if k >= n - 1 else lerp(vals[k], vals[k + 1], f - k)
        txt = f"{s.get('name', '')} {fmt_num(cur_val, s.get('decimals', v.get('decimals', 0)))}{v.get('unit', '')}".strip()
        labels.append([ey - 48, ex, txt, col])
    labels.sort(key=lambda l: l[0])
    for i in range(1, len(labels)):
        labels[i][0] = max(labels[i][0], labels[i - 1][0] + 52)
    for ly, ex, txt, col in labels:
        tw = text_size(txt, 42)[0]
        text_c(d, (clamp(ex - tw - 26, x0 + 10, x1 - tw), clamp(ly, y0 - 30, y1 - 20)), txt, 42, col, stroke=4, anchor="lm")


def v_bars(d, v, lt, D, t):
    items = v.get("items", [])[:4]
    n = len(items)
    base, top = VB - 70, VT + 170
    mx = max((it["value"] for it in items), default=1) or 1
    bw = CW / n * 0.55
    if v.get("label"):
        text_c(d, (CX, VT + 55), v["label"], fit_one(v["label"], 58, CW - 40), GOLD, stroke=5)
    for i, it in enumerate(items):
        k = ease_out((lt - 0.15 - i * 0.35) / 0.7)
        cx = L + CW * (i + 0.5) / n
        h = (base - top) * it["value"] / mx * k
        col = color_of(it.get("color", "gold"))
        if h > 2:
            d.rounded_rectangle((cx - bw / 2, base - h, cx + bw / 2, base), 14, fill=rgba(col))
            if h > 30:
                d.rounded_rectangle((cx - bw / 2 + 8, base - h + 6, cx - bw / 2 + 22, base - 6), 6, fill=(255, 255, 255, 40))
        text_c(d, (cx, base + 40), it["label"], fit_one(it["label"], 44, CW / n - 10, 28), WHITE, stroke=3)
        if k > 0.05:
            val = fmt_num(it["value"] * k, it.get("decimals", 0)) + v.get("unit", "")
            text_c(d, (cx, base - h - 38), val, fit_one(val, 46, CW / n), col, stroke=4)


def v_summary(d, v, lt, D, t):
    txt = v.get("text", "")
    k = ease_back(lt / 0.5)
    mw = CW - 120
    if "\n" in txt:
        ls = txt.split("\n")
        s = min(fit_one(l, 76, mw, 40) for l in ls)
    else:
        ls, s = fit_lines(txt, 76, mw, 4)
    hh = len(ls) * s * 1.35 + 110
    hw = (CW - 30) / 2 * (0.85 + 0.15 * clamp(k))
    glow = 6 + 3 * math.sin(t * 4)
    card(d, (CX - hw, VCY - hh / 2, CX + hw, VCY + hh / 2), outline=rgba(GOLD), width=int(glow))
    tag = v.get("tag", "まとめ")
    tw = text_size(tag, 44)[0] / 2 + 34
    d.rounded_rectangle((CX - tw, VCY - hh / 2 - 32, CX + tw, VCY - hh / 2 + 28), 20, fill=rgba(GOLD))
    text_c(d, (CX, VCY - hh / 2 - 2), tag, 44, NAVY_TOP, stroke=0)
    for i, ln in enumerate(ls):
        text_c(d, (CX, VCY + 10 + (i - (len(ls) - 1) / 2) * s * 1.35), ln, s, WHITE, stroke=4)
    for i in range(4):
        ang = t * 1.2 + i * math.pi / 2
        star(d, CX + (hw + 10) * math.cos(ang), VCY + (hh / 2 + 10) * math.sin(ang), 10 + 4 * math.sin(t * 5 + i), GOLD_LIGHT)


def v_disclaimer(d, v, lt, D, t):
    k = ease_out(lt / 0.5)
    card(d, (L + 10, VCY - 240, R - 10, VCY + 240), outline=rgba(GOLD, 200 * k), width=4)
    draw_icon(d, "doc", CX, VCY - 150 + 5 * math.sin(t * 2), 90, a=255 * k)
    text_c(d, (CX, VCY - 60), "ご注意", 60, rgba(GOLD, 255 * k), stroke=4)
    ls, s = fit_lines(v.get("text", DISCLAIMER), 54, CW - 100, 3)
    for i, ln in enumerate(ls):
        text_c(d, (CX, VCY + 30 + i * s * 1.35), ln, s, rgba(WHITE, 255 * k), stroke=3)
    if G["spec"].get("asof"):
        text_c(d, (CX, VCY + 190), f"数値は{G['spec']['asof']}", 38, rgba(MUTED, 255 * k), stroke=2)


def v_timeline(d, v, lt, D, t):
    title_c(d, v.get("label", ""), VT + 50, 70)
    years = v.get("years", [])
    n = len(years)
    ax, bx = L + 60, R - 60
    ay = VT + 250
    k = ease_out(lt / 0.5)
    d.line((ax, ay, ax + (bx - ax) * k, ay), fill=rgba(MUTED), width=6)
    xs = [ax + (bx - ax) * i / max(1, n - 1) for i in range(n)]
    rg = v.get("range", [0, 0])
    kb = ease_out((lt - 0.45) / 0.5)
    if kb > 0 and xs:
        x0, x1 = xs[rg[0]] - 40, xs[rg[1]] + 40
        d.rounded_rectangle((x0, ay - 30 - 90 * kb, x1, ay - 30), 18, fill=rgba(GOLD, 70), outline=rgba(GOLD), width=4)
        if kb > 0.6:
            rl = v.get("range_label", "")
            text_c(d, ((x0 + x1) / 2, ay - 76), rl, fit_one(rl, 44, x1 - x0 - 20), GOLD_LIGHT, stroke=3)
    for i, (x, y) in enumerate(zip(xs, years)):
        on = rg[0] <= i <= rg[1]
        rr = (16 if on else 11) + (3 * math.sin(t * 5) if on else 0)
        d.ellipse((x - rr, ay - rr, x + rr, ay + rr), fill=rgba(GOLD if on else MUTED))
        text_c(d, (x, ay + 50), y, 40, GOLD if on else MUTED, stroke=2)
    y = ay + 120
    for i, it in enumerate(v.get("items", [])):
        ki = ease_out((lt - 0.8 - i * 0.35) / 0.4)
        if ki > 0:
            card(d, (L + 30, y, R - 30, y + 86), a=225 * ki, r=24)
            txt = item_text(it)
            text_c(d, (CX + (1 - ki) * 60, y + 43), txt, fit_one(txt, 50, CW - 100), rgba(WHITE, 255 * ki), stroke=3)
        y += 104


def v_calendar(d, v, lt, D, t):
    title_c(d, v.get("label", ""), VT + 50, 72)
    hl = set(v.get("highlight", [12]))
    cw, chh, g = 158, 100, 14
    gx = CX - (4 * cw + 3 * g) / 2
    gy = VT + 125
    prog = clamp((lt - 0.4) / (0.6 * D)) * 12
    for m in range(1, 13):
        i, j = (m - 1) // 4, (m - 1) % 4
        k = ease_back((lt - (m - 1) * 0.03) / 0.35)
        if k <= 0:
            continue
        x0 = gx + j * (cw + g)
        y0 = gy + i * (chh + g)
        on = m in hl
        lit = on and prog >= m - 0.5
        done = m <= prog and not on
        pulse = 4 * math.sin(t * 5) if lit else 0
        card(d, (x0 - pulse, y0 - pulse, x0 + cw + pulse, y0 + chh + pulse), fill=(GOLD if lit else NAVY_CARD),
             outline=rgba(GOLD if on else MUTED), width=5 if on else 2, r=16, a=240 * clamp(k))
        tc = NAVY_TOP if lit else (WHITE if not done else MUTED)
        text_c(d, (x0 + cw / 2, y0 + chh / 2), f"{m}月", 46, tc, stroke=0 if lit else 2)
        if done:
            d.line((x0 + 104, y0 + 70, x0 + 120, y0 + 86, x0 + 146, y0 + 52), fill=rgba(GOLD), width=6)
    if v.get("sub"):
        a = 255 * ease_out((lt - 0.6 * D) / 0.4)
        text_c(d, (CX, gy + 3 * (chh + g) + 40), v["sub"], fit_one(v["sub"], 52, CW - 40), rgba(WHITE, a), stroke=4)


def v_flow(d, v, lt, D, t):
    if v.get("label"):
        title_c(d, v["label"], VT + 50, 66)
    nodes = v.get("nodes", [])[:3]
    n = len(nodes)
    cy = VT + 250
    xs = [L + CW * (i + 0.5) / n for i in range(n)]
    rr = 92
    for i in range(n - 1):
        k = ease_out((lt - 0.4 - i * 0.4) / 0.4)
        if k <= 0:
            continue
        a0, a1 = xs[i] + rr + 8, xs[i + 1] - rr - 8
        d.line((a0, cy, lerp(a0, a1, k), cy), fill=rgba(GOLD), width=8)
        if k >= 1:
            d.polygon([(a1, cy), (a1 - 20, cy - 16), (a1 - 20, cy + 16)], fill=rgba(GOLD))
            ph = ((t * 0.7) + i * 0.5) % 1
            coin(d, lerp(a0, a1 - 20, ph), cy - 34, 18, flip=math.cos(t * 6))
    for i, nd in enumerate(nodes):
        k = ease_back((lt - i * 0.4) / 0.45)
        if k <= 0:
            continue
        x = xs[i]
        r = rr * clamp(k, 0, 1.15)
        d.ellipse((x - r, cy - r, x + r, cy + r), fill=rgba(NAVY_CARD), outline=rgba(GOLD), width=5)
        draw_icon(d, nd.get("icon", "coin"), x, cy + 3 * math.sin(t * 3 + i), 110 * clamp(k))
        lab = nd.get("label", "")
        f1 = fit_one(lab.replace("\n", ""), 42, CW / n - 12, 28)
        if "\n" in lab:
            ls = lab.split("\n")
            s = min(fit_one(x, 42, CW / n - 12, 28) for x in ls)
        else:
            ls, s = ([lab], f1) if text_size(lab, f1)[0] <= CW / n - 12 else fit_lines(lab, 36, CW / n - 12, 2)
        for j, ln in enumerate(ls):
            text_c(d, (x, cy + rr + 50 + j * s * 1.2), ln, s, rgba(WHITE, 255 * clamp(k)), stroke=3)


def v_stamp(d, v, lt, D, t):
    k = ease_out(lt / 0.4)
    card(d, (L + 20, VT + 110, R - 20, VT + 390), outline=rgba(MUTED, 200 * k), width=4)
    title = v.get("title", "")
    f = fit_one(title, 104, CW - 100, 50)
    text_c(d, (CX, VT + 215), title, f, rgba(WHITE, 255 * k), stroke=6)
    if v.get("sub"):
        text_c(d, (CX, VT + 320), v["sub"], fit_one(v["sub"], 48, CW - 100), rgba(MUTED, 255 * k), stroke=3)
    t0 = max(0.5, 0.35 * D)
    ks = clamp((lt - t0) / 0.25)
    if ks > 0:
        tw = text_size(title, f)[0]
        d.line((CX - tw / 2 - 10, VT + 215, CX - tw / 2 - 10 + (tw + 20) * ks, VT + 215), fill=rgba(DOWN), width=12)
        sc = lerp(2.2, 1.0, ease_out(ks))
        st = v.get("stamp", "撤廃")
        sw, sh = 300, 150
        im = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
        sd = ImageDraw.Draw(im)
        sd.rounded_rectangle((8, 8, sw - 8, sh - 8), 22, outline=DOWN + (235,), width=12)
        sd.text((sw / 2, sh / 2), st, font=font(84), fill=DOWN + (235,), anchor="mm")
        im = im.rotate(14, expand=True, resample=Image.BICUBIC)
        im = im.resize((int(im.width * sc), int(im.height * sc)), Image.BICUBIC)
        G["layer"].alpha_composite(im, (int(CX + 190 - im.width / 2), int(VT + 440 - im.height / 2)))
    if v.get("date"):
        a = 255 * ease_out((lt - t0 - 0.3) / 0.4)
        text_c(d, (L + 20, VT + 450), v["date"], fit_one(v["date"], 50, CW / 2 - 40), rgba(GOLD, a), stroke=4, anchor="lm")


def v_checklist(d, v, lt, D, t):
    y = title_c(d, v.get("title", ""), VT + 50, 70) + 60
    ih = 108
    for i, it in enumerate(v.get("items", [])[:4]):
        k = ease_out((lt - 0.2 - i * 0.12) / 0.4)
        if k <= 0:
            y += ih
            continue
        card(d, (L + 20, y, R - 20, y + ih - 14), a=220 * k, r=24)
        bx, by = L + 50, y + (ih - 14) / 2
        d.rounded_rectangle((bx, by - 30, bx + 60, by + 30), 10, outline=rgba(GOLD, 255 * k), width=5)
        kc = clamp((lt - 0.6 - i * 0.5) / 0.3)
        if kc > 0:
            p0, p1, p2 = (bx + 10, by), (bx + 26, by + 18), (bx + 56, by - 26)
            if kc < 0.5:
                d.line((p0, (lerp(p0[0], p1[0], kc * 2), lerp(p0[1], p1[1], kc * 2))), fill=rgba(GOLD), width=9)
            else:
                q = (lerp(p1[0], p2[0], (kc - 0.5) * 2), lerp(p1[1], p2[1], (kc - 0.5) * 2))
                d.line((p0, p1, q), fill=rgba(GOLD), width=9, joint="curve")
        txt = item_text(it)
        text_c(d, (bx + 90, by), txt, fit_one(txt, 50, R - 50 - bx - 90, 30), rgba(WHITE if kc > 0 else MUTED, 255 * k),
               stroke=3, anchor="lm")
        y += ih


def v_wall(d, v, lt, D, t):
    if v.get("label"):
        title_c(d, v["label"], VT + 50, 64)
    x0, x1 = L + 30, R - 30
    rows, bh = 7, 48
    ybot = VB - 100
    for r_ in range(rows):
        k = ease_back((lt - r_ * 0.08) / 0.4)
        if k <= 0:
            continue
        yy = ybot - (r_ + 1) * bh + (1 - clamp(k)) * 80
        xx = x0 - (0 if r_ % 2 == 0 else 60)
        while xx < x1:
            a0, a1 = max(x0, xx), min(x1, xx + 120)
            if a1 - a0 > 10:
                col = (164, 92, 72) if (int((xx - x0) / 120) + r_) % 3 else (148, 80, 64)
                d.rectangle((a0 + 3, yy + 3, a1 - 3, yy + bh - 3), fill=rgba(col, 255 * clamp(k)))
                d.line((a0 + 6, yy + 8, a1 - 8, yy + 8), fill=(255, 255, 255, int(40 * clamp(k))), width=3)
            xx += 120
    kv = ease_back((lt - 0.7) / 0.4)
    if kv > 0:
        shake = 6 * math.sin(lt * 60) * clamp(1 - (lt - 0.7) / 0.4)
        val = v.get("value", "")
        f = max(20, int(fit_one(val, 140, x1 - x0 - 80, 60) * clamp(kv, 0.3, 1.2)))
        ym = ybot - rows * bh / 2
        hw = text_size(val, f)[0] / 2 + 30
        d.rounded_rectangle((CX - hw + shake, ym - f * 0.7, CX + hw + shake, ym + f * 0.7), 24, fill=rgba(NAVY_TOP, 200))
        text_c(d, (CX + shake, ym), val, f, GOLD, stroke=8)
    if v.get("sub"):
        a = 255 * ease_out((lt - 1.0) / 0.4)
        text_c(d, (CX, ybot + 42), v["sub"], fit_one(v["sub"], 48, CW - 40), rgba(WHITE, a), stroke=4)


OPS = ("+", "−", "-", "×", "÷", "=", "＝", "→", ">", "＞", "<", "＜")


def v_equation(d, v, lt, D, t):
    title_c(d, v.get("title", ""), VT + 50, 68)
    terms = v.get("terms", [])
    f = 84
    while True:
        rows, cur, w = [], [], 0
        for tk in terms:
            tw = text_size(tk, f)[0] + 22
            if cur and w + tw > CW - 40:
                rows.append(cur)
                cur, w = [], 0
            cur.append((tk, tw))
            w += tw
        if cur:
            rows.append(cur)
        if len(rows) <= 2 or f <= 44:
            break
        f -= 6
    eq_i = max([i for i, tk in enumerate(terms) if tk in ("=", "＝", "→", ">", "＞")] or [-1])
    step = min(0.28, 0.45 * D / max(1, len(terms)))
    lh = f * 1.6
    y = VT + 150 + (VB - VT - 260 - lh * len(rows)) / 2 + lh / 2
    idx = 0
    for row in rows:
        x = CX - sum(tw for _, tw in row) / 2
        for tk, tw in row:
            k = ease_back((lt - 0.15 - idx * step) / 0.3)
            if k > 0:
                is_op = tk in OPS
                res = idx > eq_i >= 0
                col = WHITE if is_op else (color_of(v.get("result_color", "gold")) if res else GOLD_LIGHT)
                if res and k >= 1:
                    pad = 10 + 3 * math.sin(t * 5)
                    d.rounded_rectangle((x - pad + 4, y - f * 0.65, x + tw + pad - 18, y + f * 0.65), 18,
                                        outline=rgba(col), width=5, fill=rgba(col, 40))
                text_c(d, (x + (tw - 22) / 2, y), tk, int(f * clamp(k, 0.4, 1.15)), col, stroke=5)
            x += tw
            idx += 1
        y += lh
    if v.get("result"):
        a = 255 * ease_out((lt - 0.3 - len(terms) * step) / 0.3)
        text_c(d, (CX, VB - 70), v["result"], fit_one(v["result"], 56, CW - 40), rgba(WHITE, a), stroke=4)


def v_payslip(d, v, lt, D, t):
    k = ease_out(lt / 0.45)
    x0, x1 = L + 40, R - 40
    y0, y1 = VT + 40 + (1 - k) * 60, VB - 30
    d.rounded_rectangle((x0 + 10, y0 + 12, x1 + 10, y1 + 12), 20, fill=(0, 0, 0, int(70 * k)))
    d.rounded_rectangle((x0, y0, x1, y1), 20, fill=rgba((246, 247, 251), 255 * k))
    d.rounded_rectangle((x0, y0, x1, y0 + 90), 20, fill=rgba(NAVY_CARD, 255 * k))
    d.rectangle((x0, y0 + 60, x1, y0 + 90), fill=rgba(NAVY_CARD, 255 * k))
    text_c(d, (CX, y0 + 46), v.get("title", "給与明細"), 50, rgba(GOLD, 255 * k), stroke=0)
    yy = y0 + 140
    rows = v.get("rows", [])
    for i, row in enumerate(rows):
        kr = ease_out((lt - 0.4 - i * 0.45) / 0.35)
        if kr > 0:
            cname = row.get("color", "white")
            col = (40, 50, 85) if cname == "white" else color_of(cname)
            lab = row.get("label", "")
            text_c(d, (x0 + 40 + (1 - kr) * 40, yy), lab, fit_one(lab, 46, (x1 - x0) * 0.55), rgba((40, 50, 80), 255 * kr),
                   stroke=0, anchor="lm")
            val = row.get("value", "")
            text_c(d, (x1 - 40, yy), val, fit_one(val, 50, (x1 - x0) * 0.4), rgba(col, 255 * kr), stroke=0, anchor="rm")
            d.line((x0 + 30, yy + 44, x1 - 30, yy + 44), fill=(200, 205, 220, int(255 * kr)), width=2)
        yy += 96
    if v.get("footer"):
        a = 255 * ease_out((lt - 0.5 - len(rows) * 0.45) / 0.4)
        ls, s = fit_lines(v["footer"], 38, x1 - x0 - 60, 2)
        for j, ln in enumerate(ls):
            text_c(d, (CX, y1 - 60 + (j - (len(ls) - 1) / 2) * s * 1.25), ln, s, rgba((60, 70, 110), a), stroke=0)


VISUALS = {"hook": v_hook, "section": v_section, "headline": v_headline, "steps": v_steps, "coins": v_coins,
           "bills": v_bills, "number": v_number, "graph": v_graph, "bars": v_bars, "summary": v_summary,
           "disclaimer": v_disclaimer, "timeline": v_timeline, "calendar": v_calendar, "flow": v_flow,
           "stamp": v_stamp, "checklist": v_checklist, "wall": v_wall, "equation": v_equation, "payslip": v_payslip}

POSE_BY_TYPE = {"hook": "surprise", "section": "wave", "headline": "point", "steps": "explain", "coins": "happy",
                "bills": "happy", "graph": "point", "bars": "point", "summary": "ok", "disclaimer": "wave",
                "timeline": "explain", "calendar": "point", "flow": "explain", "stamp": "surprise",
                "checklist": "ok", "wall": "think", "equation": "think", "payslip": "worry"}


# ------------------------------------------------------------------ stage
def notes_of(scene):
    n = []
    asof = scene.get("asof")
    if asof:
        n.append(asof if isinstance(asof, str) else G["spec"].get("asof", ""))
    if scene.get("note"):
        n.append(scene["note"])
    return [x for x in n if x]


PARTNERS = ["student", "salary", "part", "part", "salary"]
PARTNER_POSE = {"hook": "surprise", "section": "happy", "stamp": "surprise", "payslip": "worry", "summary": "happy",
                "checklist": "ok", "wall": "think", "equation": "think", "number": "surprise", "bars": "think",
                "disclaimer": "wave", "coins": "happy", "bills": "happy", "calendar": "think", "flow": "think"}


def scene_charas(scene, vis, section):
    c = scene.get("chara")
    if c is False:
        return []
    if c:
        return c if isinstance(c, list) else [c]
    typ = vis.get("type")
    pose = POSE_BY_TYPE.get(typ, "explain")
    if typ == "number":
        b, a = vis.get("to", 0), vis.get("from", 0)
        pose = "happy" if b > a else ("worry" if b < a else "explain")
    who2 = "part" if scene.get("role") == "example" else PARTNERS[section % len(PARTNERS)]
    return [{"who": "guide", "pose": pose}, {"who": who2, "pose": PARTNER_POSE.get(typ, "think")}]


PROPS = ["piggy", "plant", "coin", "calculator", "plant"]


def draw_bubble(d, lines, bx0, bx1, by1, kb, size, tail_to=None):
    lh = int(size * 1.32)
    bh = len(lines) * lh + 30
    by0 = by1 - bh
    fill = (246, 247, 252, int(235 * kb))
    d.rounded_rectangle((bx0, by0, bx1, by1), 22, fill=fill, outline=rgba(GOLD, 200 * kb), width=3)
    if tail_to == "left":
        d.polygon([(bx0 + 4, by0 + 34), (bx0 - 30, by0 + 14), (bx0 + 4, by0 + 62)], fill=fill)
    for i, (ln, is_asof) in enumerate(lines):
        col = (176, 120, 20) if is_asof else (40, 50, 85)
        d.text((bx0 + 18, by0 + 15 + i * lh), ln, font=font(size), fill=rgba(col, 255 * kb), anchor="la")


def note_lines(scene, maxw, size):
    lines = []
    for i, n in enumerate(notes_of(scene)):
        ls, _ = fit_lines(n, size, maxw, 4)
        lines += [(ln, i == 0 and bool(scene.get("asof"))) for ln in ls]
    return lines


def draw_stage(d, scene, vis, lt, t, talking, section):
    charas = scene_charas(scene, vis, section)
    has_notes = bool(notes_of(scene))
    hop = 22 * math.sin(math.pi * clamp(lt / 0.35)) if lt < 0.35 else 0
    kb = ease_out((lt - 0.2) / 0.35)
    two = len(charas) > 1
    sc = 0.86 if two else 1.0
    if charas:
        c0 = charas[0]
        draw_chara(d, c0.get("who", "guide"), c0.get("pose", "explain"), L + (95 if two else 125), FLOOR_Y - hop, t,
                   talking=talking, scale=sc)
    if two:
        c1 = charas[1]
        hop2 = 18 * math.sin(math.pi * clamp((lt - 0.25) / 0.35)) if 0.25 < lt < 0.6 else 0
        draw_chara(d, c1.get("who", "part"), c1.get("pose", "think"), R - 95, FLOOR_Y - hop2, t,
                   flip=True, scale=sc, phase=1.7)
    if has_notes:
        if two:
            bx0, bx1, size = L + 200, R - 200, 26
        elif charas:
            bx0, bx1, size = L + 255, R - 8, 30
        else:
            bx0, bx1, size = L + 20, R - 20, 30
        lines = note_lines(scene, bx1 - bx0 - 36, size)
        draw_bubble(d, lines, bx0, bx1, FLOOR_Y - 30, kb, size, tail_to="left" if charas else None)
    elif not two:
        draw_icon(d, PROPS[section % len(PROPS)], R - 120, FLOOR_Y - 70 + 6 * math.sin(t * 2), 130)
        d.ellipse((R - 190, FLOOR_Y - 14, R - 50, FLOOR_Y + 12), fill=(0, 0, 0, 60))


# ------------------------------------------------------------------ subtitles
SUB_SIZE = 62


def layout_sentence(chunks, size):
    maxw = CW - 60
    gap = 6
    while True:
        lines, cur, w = [], [], 0
        for c in chunks:
            cw = text_size(c["display"], size)[0] + 28
            if cur and w + gap + cw > maxw:
                lines.append(cur)
                cur, w = [], 0
            cur.append((c, cw))
            w += cw + (gap if len(cur) > 1 else 0)
        if cur:
            lines.append(cur)
        if len(lines) <= 2 or size <= 40:
            return lines, size
        size -= 4


def draw_subtitles(d, scene_tl, t):
    chunks = scene_tl["chunks"]
    if not chunks:
        return False
    active = None
    for i, c in enumerate(chunks):
        if c["start"] <= t:
            active = i
    sent = chunks[active]["sentence"] if active is not None else chunks[0]["sentence"]
    sc = [c for c in chunks if c["sentence"] == sent]
    lines, size = layout_sentence(sc, SUB_SIZE)
    lh = size * 1.55
    total_h = lh * len(lines)
    cy0 = (SUB_TOP + SUB_BOTTOM) / 2 - total_h / 2
    d.rounded_rectangle((L, cy0 - 24, R, cy0 + total_h + 24), 30, fill=rgba((4, 10, 30), 165))
    gap = 6
    talking = False
    for li, line in enumerate(lines):
        x = CX - (sum(cw for _, cw in line) + gap * (len(line) - 1)) / 2
        yc = cy0 + lh * (li + 0.5)
        for c, cw in line:
            is_act = active is not None and c is chunks[active] and t <= c["end"] + 0.35
            talking = talking or (is_act and t <= c["end"])
            if is_act:
                pad = 6 * (1 - ease_out((t - c["start"]) / 0.15))
                d.rounded_rectangle((x - pad, yc - size * 0.72 - pad, x + cw + pad, yc + size * 0.72 + pad),
                                    16, fill=rgba(GOLD, 55), outline=rgba(GOLD), width=6)
            col = GOLD_LIGHT if is_act else (WHITE if c["start"] <= t else MUTED)
            text_c(d, (x + cw / 2, yc), c["display"], size, col, stroke=4)
            x += cw + gap
    return talking


# ------------------------------------------------------------------ frame
def init_worker(spec, tl):
    G["spec"], G["tl"] = spec, tl
    sec, styles = -1, []
    for i, sc in enumerate(spec["scenes"]):
        if i == 0 or sc.get("visual", {}).get("type") == "section":
            sec += 1
        styles.append((sc.get("bg") or BG_STYLES[sec % len(BG_STYLES)], max(0, sec)))
    G["styles"] = styles
    base_image()


def scene_at(t):
    for sc in G["tl"]["scenes"]:
        if sc["start"] <= t < sc["end"]:
            return sc
    return G["tl"]["scenes"][-1]


TRANS = ["slide", "rise", "zoom", "fade", "slide_l"]


def render_frame(fi, debug_safe=False):
    spec, t = G["spec"], fi / FPS
    stl = scene_at(t)
    si = stl["index"]
    scene = spec["scenes"][si]
    lt, D = t - stl["start"], stl["end"] - stl["start"]
    style, section = G["styles"][si]
    img = base_image().copy()
    draw_background(img, style, t)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    G["layer"] = layer
    vis = scene.get("visual", {"type": "summary", "text": ""})
    VISUALS[vis["type"]](ImageDraw.Draw(layer, "RGBA"), vis, lt, D, t)
    k = ease_out(lt / ENTER)
    if k < 1:
        kind = scene.get("transition") or TRANS[si % len(TRANS)]
        dx = dy = 0
        if kind == "zoom":
            sc = 0.86 + 0.14 * k
            layer = layer.resize((int(W * sc), int(H * sc)), Image.BILINEAR)
            dx = int(W * (1 - sc) / 2)
            dy = int(VCY * (1 - sc))
        elif kind == "slide":
            dx = int((1 - k) * 110)
        elif kind == "slide_l":
            dx = -int((1 - k) * 110)
        elif kind == "rise":
            dy = int((1 - k) * 110)
        img.paste(layer, (dx, dy), layer.getchannel("A").point(lambda a: int(a * k)))
    else:
        img.paste(layer, (0, 0), layer.getchannel("A"))

    d = ImageDraw.Draw(img, "RGBA")
    if spec.get("pr"):
        d.rounded_rectangle((L, SAFE_TOP, L + 96, SAFE_TOP + 50), 10, fill=rgba(WHITE))
        text_c(d, (L + 48, SAFE_TOP + 25), "PR", 36, NAVY_TOP, stroke=0)
    talking = draw_subtitles(d, stl, t)
    draw_stage(d, scene, vis, lt, t, talking, section)
    if debug_safe:
        d.rectangle((SAFE_RIGHT, 0, W, H), fill=(255, 0, 0, 70))
        d.rectangle((0, SAFE_BOTTOM, W, H), fill=(255, 0, 0, 70))
    return img


def _frame_bytes(fi):
    return render_frame(fi).tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", default="out")
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--still", type=float, nargs="*", default=None,
                    help="render PNG(s) at these times (s) with the safe-area overlay")
    a = ap.parse_args()
    out = out_dir(a.out)
    spec = load_spec(a.spec)
    tl = json.loads((out / "timeline.json").read_text(encoding="utf-8"))
    init_worker(spec, tl)
    if a.still is not None:
        for s in a.still:
            p = out / f"still_{s:05.2f}.png"
            render_frame(int(s * FPS), debug_safe=True).save(p)
            print(p)
        return
    n = int(math.ceil(tl["duration"] * FPS))
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", str(out / "visual.mp4")]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    workers = a.workers or max(1, min(8, (os.cpu_count() or 2) - 1))
    with Pool(workers, initializer=init_worker, initargs=(spec, tl)) as pool:
        for i, fb in enumerate(pool.imap(_frame_bytes, range(n), chunksize=4)):
            proc.stdin.write(fb)
            if i % 300 == 0:
                print(f"[render] {i}/{n}", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")
    print(f"[render] {n} frames -> {out / 'visual.mp4'}")


if __name__ == "__main__":
    main()
