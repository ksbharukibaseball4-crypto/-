#!/usr/bin/env python3
"""Render scenes + word-highlight subtitles to <out>/visual.mp4 (no audio).

Usage: render.py scenes.json --out out [--workers N] [--preview-every 1.0]
Needs <out>/timeline.json from tts.py.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (DISCLAIMER, DOWN, FPS, GOLD, GOLD_DARK, GOLD_LIGHT, H, MUTED,  # noqa: E402
                    NAVY_BOTTOM, NAVY_CARD, NAVY_TOP, SAFE_BOTTOM, SAFE_CX, SAFE_LEFT,
                    SAFE_RIGHT, SAFE_TOP, SUB_BOTTOM, SUB_TOP, UP, VIS_BOTTOM, VIS_TOP, W,
                    WHITE, BILL, font, load_spec, out_dir)

# ------------------------------------------------------------------ easing
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
    s = f"{v:,.{decimals}f}"
    return s


def color_of(name, default=GOLD):
    return {"up": UP, "down": DOWN, "gold": GOLD, "muted": MUTED, "white": WHITE}.get(name, default)


# ------------------------------------------------------------------ background
_BG = None
_GLOW = None


def background():
    global _BG, _GLOW
    if _BG is None:
        y = np.linspace(0, 1, H)[:, None, None]
        top, bot = np.array(NAVY_TOP, float), np.array(NAVY_BOTTOM, float)
        arr = (top * (1 - y) + bot * y).repeat(W, axis=1)
        _BG = Image.fromarray(arr.astype(np.uint8), "RGB")
        g = Image.new("L", (1400, 1400), 0)
        ImageDraw.Draw(g).ellipse((420, 420, 980, 980), fill=46)
        g = g.filter(ImageFilter.GaussianBlur(170))
        _GLOW = (Image.new("RGB", (1400, 1400), GOLD), g)
    return _BG, _GLOW


PARTICLES = [(random.Random(i).random(), random.Random(i * 7 + 1).random(),
              random.Random(i * 13 + 2).random()) for i in range(34)]


def draw_ambient(img: Image.Image, t: float):
    _, (glow, gmask) = background()
    gx = int(SAFE_CX - 700 + 160 * math.sin(t * 0.6))
    gy = int(850 - 700 + 220 * math.cos(t * 0.45))
    img.paste(glow, (gx, gy), gmask)
    d = ImageDraw.Draw(img, "RGBA")
    for px, py, ps in PARTICLES:
        x = (px * W + 25 * math.sin(t * (0.5 + ps) + px * 9)) % W
        y = (py * H - t * (30 + 60 * ps)) % H
        r = 2 + 4 * ps
        a = 50 + 90 * (0.5 + 0.5 * math.sin(t * 2 + ps * 20))
        d.ellipse((x - r, y - r, x + r, y + r), fill=rgba(GOLD_LIGHT, a))


# ------------------------------------------------------------------ text helpers
def text_size(txt, size):
    b = font(size).getbbox(txt)
    return b[2] - b[0], b[3] - b[1]


def text_c(d, xy, txt, size, fill, stroke=4, stroke_fill=(5, 12, 35), anchor="mm"):
    d.text(xy, txt, font=font(size), fill=fill, anchor=anchor,
           stroke_width=stroke, stroke_fill=stroke_fill)


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


def card(d, box, fill=NAVY_CARD, outline=None, width=4, r=36, a=235):
    d.rounded_rectangle(box, r, fill=rgba(fill, a), outline=outline, width=width)


# ------------------------------------------------------------------ money sprites
def coin(d, cx, cy, r, flip=1.0, alpha=255):
    w = max(2, abs(flip) * r)
    d.ellipse((cx - w, cy - r, cx + w, cy + r), fill=rgba(GOLD_DARK, alpha))
    d.ellipse((cx - w * 0.86, cy - r * 0.86, cx + w * 0.86, cy + r * 0.86), fill=rgba(GOLD, alpha))
    if abs(flip) > 0.45:
        d.text((cx, cy), "¥", font=font(int(r * 1.1)), fill=rgba(GOLD_DARK, alpha), anchor="mm")


def coin_side(d, cx, cy, r, h=20, th=9):
    """A coin seen in a stack (flat ellipse)."""
    d.ellipse((cx - r, cy - h * 0.5 + th, cx + r, cy + h * 0.5 + th), fill=rgba(GOLD_DARK))
    d.rectangle((cx - r, cy, cx + r, cy + th), fill=rgba(GOLD_DARK))
    d.line((cx - r, cy + th * 0.5, cx + r, cy + th * 0.5), fill=rgba((150, 105, 20)), width=2)
    d.ellipse((cx - r, cy - h * 0.5, cx + r, cy + h * 0.5), fill=rgba(GOLD))
    d.ellipse((cx - r * 0.7, cy - h * 0.32, cx + r * 0.7, cy + h * 0.32), outline=rgba(GOLD_LIGHT), width=2)


def bill_bundle(d, cx, cy, w=230, h=110):
    for k in range(3):
        o = (2 - k) * 6
        d.rounded_rectangle((cx - w / 2 + o, cy - h / 2 - o, cx + w / 2 + o, cy + h / 2 - o), 10,
                            fill=rgba(tuple(int(c * (0.75 + 0.1 * k)) for c in BILL)),
                            outline=rgba((40, 80, 50)), width=2)
    d.rectangle((cx - 22, cy - h / 2, cx + 22, cy + h / 2), fill=rgba((235, 230, 205)))
    d.text((cx, cy), "¥", font=font(46), fill=rgba((60, 90, 60)), anchor="mm")
    d.ellipse((cx - w / 2 + 18, cy - 22, cx - w / 2 + 62, cy + 22), outline=rgba((215, 235, 205)), width=3)


# ------------------------------------------------------------------ visuals
def v_hook(d, v, lt, D, t):
    big = v.get("big", "")
    size = int(v.get("size", 150))
    k = ease_back(lt / 0.45)
    s = max(8, int(size * (0.3 + 0.7 * k) * (1 + 0.03 * math.sin(t * 6))))
    cy = (VIS_TOP + VIS_BOTTOM) // 2 - 60
    # orbiting coins
    n = 6
    for i in range(n):
        ang = t * 1.3 + i * 2 * math.pi / n
        x = SAFE_CX + 330 * math.cos(ang)
        y = cy + 20 + 210 * math.sin(ang)
        coin(d, x, y, 38 + 10 * math.sin(ang), flip=math.cos(t * 4 + i), alpha=200 * k)
    ls, s2 = fit_lines(big, s, SAFE_RIGHT - SAFE_LEFT - 60, 2)
    for i, ln in enumerate(ls):
        text_c(d, (SAFE_CX, cy + (i - (len(ls) - 1) / 2) * s2 * 1.15), ln, s2,
               color_of(v.get("color"), GOLD), stroke=8)
    if v.get("sub"):
        a = 255 * ease_out((lt - 0.35) / 0.3)
        text_c(d, (SAFE_CX, cy + 330), v["sub"], 64, rgba(WHITE, a), stroke=5)


def v_headline(d, v, lt, D, t):
    title = v.get("title", "")
    ls, s = fit_lines(title, 92, SAFE_RIGHT - SAFE_LEFT - 60, 2)
    y = VIS_TOP + 90
    for i, ln in enumerate(ls):
        text_c(d, (SAFE_CX, y + i * s * 1.2), ln, s, GOLD, stroke=6)
    y += len(ls) * s * 1.2 + 60
    for i, it in enumerate(v.get("items", [])):
        k = ease_out((lt - 0.25 - i * 0.35) / 0.35)
        if k <= 0:
            continue
        x0 = SAFE_LEFT + 40 + (1 - k) * 80
        card(d, (x0, y, SAFE_RIGHT - 40, y + 130), a=220 * k)
        d.ellipse((x0 + 30, y + 45, x0 + 70, y + 85), fill=rgba(GOLD, 255 * k))
        text_c(d, (x0 + 100, y + 65), it, 58, rgba(WHITE, 255 * k), stroke=3, anchor="lm")
        y += 160


def v_steps(d, v, lt, D, t):
    steps = v.get("steps", [])[:3]
    cur = v.get("current", None)
    if cur is None:  # auto-advance
        cur = min(len(steps) - 1, int(lt / max(0.6, D / max(1, len(steps)))))
    top = VIS_TOP + 40
    h, gap = 200, 70
    for i, st in enumerate(steps):
        k = ease_out((lt - i * 0.18) / 0.35)
        y = top + i * (h + gap) + (1 - k) * 60
        on = i == cur
        pulse = 1 + (0.02 * math.sin(t * 7) if on else 0)
        x0, x1 = SAFE_LEFT + 40, SAFE_RIGHT - 40
        cx = (x0 + x1) / 2
        hw = (x1 - x0) / 2 * pulse
        card(d, (cx - hw, y, cx + hw, y + h), fill=NAVY_CARD,
             outline=rgba(GOLD if on else MUTED, 255 * k), width=8 if on else 3, a=230 * k)
        d.ellipse((cx - hw + 30, y + 50, cx - hw + 130, y + 150), fill=rgba(GOLD if on else MUTED, 255 * k))
        text_c(d, (cx - hw + 80, y + 100), str(i + 1), 64, rgba(NAVY_TOP, 255 * k), stroke=0)
        ls, s = fit_lines(st, 62, 2 * hw - 200, 2)
        for j, ln in enumerate(ls):
            text_c(d, (cx - hw + 165, y + 100 + (j - (len(ls) - 1) / 2) * s * 1.15), ln, s,
                   rgba(WHITE if on else MUTED, 255 * k), stroke=3, anchor="lm")
        if i < len(steps) - 1 and k > 0.5:
            ay = y + h + 12 + 8 * math.sin(t * 6)
            d.polygon([(cx - 26, ay), (cx + 26, ay), (cx, ay + 40)], fill=rgba(GOLD, 220))


def v_coins(d, v, lt, D, t):
    stacks = v.get("stacks") or list(range(int(v.get("from", 1)), int(v.get("to", 6)) + 1))
    stacks = stacks[:6]
    labels = v.get("labels", [])
    n = len(stacks)
    span = SAFE_RIGHT - SAFE_LEFT - 120
    base = VIS_BOTTOM - 170
    r = 62
    ch = min(44, (base - VIS_TOP - 300) / max(1, max(stacks)))
    per = 0.7 * D / max(1, n)
    grow = v.get("color", "up")
    for i, cnt in enumerate(stacks):
        cx = SAFE_LEFT + 60 + span * (i + 0.5) / n
        p = clamp((lt - i * per) / per)
        shown = int(round(cnt * ease_out(p))) if p > 0 else 0
        for c in range(shown):
            coin_side(d, cx, base - c * ch, r, th=max(8, ch - 2))
        if 0 < p < 1:  # falling coin
            yy = lerp(VIS_TOP, base - shown * ch, ease_out(p * 1.3))
            coin(d, cx, yy, r * 0.8, flip=math.cos(t * 10))
        if i < len(labels):
            text_c(d, (cx, base + 70), labels[i], 44, MUTED, stroke=2)
        if p >= 1 and i > 0 and stacks[i] != stacks[i - 1]:
            col = UP if stacks[i] > stacks[i - 1] else DOWN
            arrow = "▲" if stacks[i] > stacks[i - 1] else "▼"
            text_c(d, (cx, base - cnt * ch - 70 + 6 * math.sin(t * 6)), arrow, 50, col, stroke=2)
    if v.get("label"):
        text_c(d, (SAFE_CX, VIS_TOP + 60), v["label"], 70, color_of(grow, GOLD) if v.get("label_color") else GOLD, stroke=6)


def v_bills(d, v, lt, D, t):
    n = int(v.get("count", 4))
    base = VIS_BOTTOM - 160
    for i in range(n):
        k = ease_back((lt - 0.1 - i * 0.22) / 0.35)
        if k <= 0:
            continue
        y = lerp(VIS_TOP + 100, base - i * 70, k)
        x = SAFE_CX + (24 if i % 2 else -24) + 4 * math.sin(t * 3 + i)
        bill_bundle(d, x, y)
    if "value_to" in v:
        p = ease_out(lt / (0.75 * D))
        val = lerp(float(v.get("value_from", 0)), float(v["value_to"]), p)
        col = UP if v["value_to"] >= v.get("value_from", 0) else DOWN
        if v.get("color"):
            col = color_of(v["color"])
        txt = v.get("prefix", "") + fmt_num(val, v.get("decimals", 0)) + v.get("unit", "")
        text_c(d, (SAFE_CX, VIS_TOP + 90), txt, 110, col, stroke=7)
    elif v.get("amount"):
        text_c(d, (SAFE_CX, VIS_TOP + 90), v["amount"], 110, GOLD, stroke=7)
    if v.get("label"):
        text_c(d, (SAFE_CX, VIS_TOP + 220), v["label"], 56, WHITE, stroke=4)


def v_number(d, v, lt, D, t):
    p = ease_out(lt / (0.65 * D))
    a, b = float(v.get("from", 0)), float(v.get("to", 0))
    val = lerp(a, b, p)
    col = color_of(v.get("color")) if v.get("color") else (UP if b > a else DOWN if b < a else GOLD)
    cy = (VIS_TOP + VIS_BOTTOM) // 2 - 40
    if v.get("label"):
        text_c(d, (SAFE_CX, cy - 200), v["label"], 66, WHITE, stroke=5)
    txt = v.get("prefix", "") + fmt_num(val, v.get("decimals", 0))
    s = 170 if len(txt) <= 6 else 130
    s = int(s * (1 + 0.04 * math.sin(t * 5) * (p >= 1)))
    tw = text_size(txt, s)[0]
    uw = text_size(v.get("unit", ""), 80)[0]
    x0 = SAFE_CX - (tw + uw + 10) / 2
    text_c(d, (x0, cy), txt, s, col, stroke=8, anchor="lm")
    text_c(d, (x0 + tw + 10, cy + 30), v.get("unit", ""), 80, col, stroke=5, anchor="lm")
    if b != a:
        arrow = "▲" if b > a else "▼"
        text_c(d, (SAFE_CX, cy + 170 + 10 * math.sin(t * 6)), arrow, 80, col, stroke=3)


def v_graph(d, v, lt, D, t):
    series = v.get("series", [])
    x0, x1 = SAFE_LEFT + 110, SAFE_RIGHT - 70
    y0, y1 = VIS_TOP + 170, VIS_BOTTOM - 110
    card(d, (SAFE_LEFT + 20, VIS_TOP + 20, SAFE_RIGHT - 20, VIS_BOTTOM - 20), a=200)
    if v.get("label"):
        text_c(d, (SAFE_CX, VIS_TOP + 85), v["label"], 58, GOLD, stroke=4)
    allv = [x for s in series for x in s["values"]]
    lo = v.get("y_min", min(allv) * 0.95 if allv else 0)
    hi = v.get("y_max", max(allv) * 1.03 if allv else 1)
    if hi == lo:
        hi = lo + 1
    d.line((x0, y1, x1, y1), fill=rgba(MUTED, 160), width=3)
    d.line((x0, y0, x0, y1), fill=rgba(MUTED, 160), width=3)
    for gy in range(1, 4):
        yy = y1 - (y1 - y0) * gy / 4
        d.line((x0, yy, x1, yy), fill=rgba(MUTED, 50), width=2)
    xl = v.get("x_labels", [])
    if xl:
        for i, lab in enumerate(xl):
            xx = x0 + (x1 - x0) * (i / max(1, len(xl) - 1))
            text_c(d, (xx, y1 + 45), lab, 38, MUTED, stroke=2)
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
        draw = pts[: k + 1]
        if k < n - 1:
            fr = f - k
            draw.append((lerp(pts[k][0], pts[k + 1][0], fr), lerp(pts[k][1], pts[k + 1][1], fr)))
        if len(draw) >= 2:
            if si == 0 and s.get("fill", True):
                d.polygon(draw + [(draw[-1][0], y1), (draw[0][0], y1)], fill=rgba(col, 45))
            d.line(draw, fill=rgba(col), width=10 if si == 0 else 7, joint="curve")
        ex, ey = draw[-1]
        rr = 14 + 4 * math.sin(t * 8)
        d.ellipse((ex - rr, ey - rr, ex + rr, ey + rr), fill=rgba(col))
        cur_val = vals[min(n - 1, k)] if k >= n - 1 else lerp(vals[k], vals[k + 1], f - k)
        lab = s.get("name", "")
        txt = f"{lab} {fmt_num(cur_val, s.get('decimals', v.get('decimals', 0)))}{v.get('unit', '')}".strip()
        labels.append([ey - 50, ex, txt, col])
    # endpoint labels: keep >= 56px apart vertically
    labels.sort(key=lambda l: l[0])
    for i in range(1, len(labels)):
        labels[i][0] = max(labels[i][0], labels[i - 1][0] + 56)
    for ly, ex, txt, col in labels:
        tw = text_size(txt, 46)[0]
        tx = clamp(ex - tw - 30, x0 + 10, x1 - tw)
        text_c(d, (tx, clamp(ly, y0 - 40, y1 - 20)), txt, 46, col, stroke=4, anchor="lm")


def v_bars(d, v, lt, D, t):
    items = v.get("items", [])[:4]
    n = len(items)
    x0, x1 = SAFE_LEFT + 60, SAFE_RIGHT - 60
    base = VIS_BOTTOM - 140
    top = VIS_TOP + 200
    mx = max((it["value"] for it in items), default=1) or 1
    bw = (x1 - x0) / n * 0.6
    if v.get("label"):
        text_c(d, (SAFE_CX, VIS_TOP + 80), v["label"], 62, GOLD, stroke=5)
    for i, it in enumerate(items):
        k = ease_out((lt - 0.1 - i * 0.3) / 0.6)
        cx = x0 + (x1 - x0) * (i + 0.5) / n
        h = (base - top) * it["value"] / mx * k
        col = color_of(it.get("color", "gold"))
        d.rounded_rectangle((cx - bw / 2, base - h, cx + bw / 2, base), 14, fill=rgba(col))
        text_c(d, (cx, base + 55), it["label"], 48, WHITE, stroke=3)
        if k > 0.05:
            val = fmt_num(it["value"] * k, it.get("decimals", 0)) + v.get("unit", "")
            text_c(d, (cx, base - h - 45), val, 50, col, stroke=4)


def v_summary(d, v, lt, D, t):
    txt = v.get("text", "")
    k = ease_back(lt / 0.4)
    ls, s = fit_lines(txt, 84, SAFE_RIGHT - SAFE_LEFT - 160, 4)
    hh = len(ls) * s * 1.3 + 120
    cy = (VIS_TOP + VIS_BOTTOM) / 2
    hw = (SAFE_RIGHT - SAFE_LEFT - 60) / 2 * (0.85 + 0.15 * k)
    glow = 6 + 3 * math.sin(t * 5)
    card(d, (SAFE_CX - hw, cy - hh / 2, SAFE_CX + hw, cy + hh / 2), outline=rgba(GOLD), width=int(glow))
    d.rounded_rectangle((SAFE_CX - 110, cy - hh / 2 - 42, SAFE_CX + 110, cy - hh / 2 + 22), 20, fill=rgba(GOLD))
    text_c(d, (SAFE_CX, cy - hh / 2 - 10), "まとめ", 46, NAVY_TOP, stroke=0)
    for i, ln in enumerate(ls):
        text_c(d, (SAFE_CX, cy + (i - (len(ls) - 1) / 2) * s * 1.3), ln, s, WHITE, stroke=4)


def v_disclaimer(d, v, lt, D, t, spec=None):
    cy = (VIS_TOP + VIS_BOTTOM) / 2
    k = ease_out(lt / 0.4)
    card(d, (SAFE_LEFT + 30, cy - 260, SAFE_RIGHT - 30, cy + 260), outline=rgba(GOLD, 200 * k), width=4)
    text_c(d, (SAFE_CX, cy - 170), "ご注意", 64, rgba(GOLD, 255 * k), stroke=4)
    ls, s = fit_lines(v.get("text", DISCLAIMER), 60, SAFE_RIGHT - SAFE_LEFT - 160, 3)
    for i, ln in enumerate(ls):
        text_c(d, (SAFE_CX, cy - 40 + i * s * 1.35), ln, s, rgba(WHITE, 255 * k), stroke=3)
    if spec and spec.get("asof"):
        text_c(d, (SAFE_CX, cy + 190), f"数値は{spec['asof']}", 42, rgba(MUTED, 255 * k), stroke=2)
    coin(d, SAFE_CX + 300, cy - 230 + 10 * math.sin(t * 3), 34, flip=math.cos(t * 3))


VISUALS = {"hook": v_hook, "headline": v_headline, "steps": v_steps, "coins": v_coins,
           "bills": v_bills, "number": v_number, "graph": v_graph, "bars": v_bars,
           "summary": v_summary, "disclaimer": v_disclaimer}


# ------------------------------------------------------------------ subtitles
SUB_SIZE = 64


def layout_sentence(chunks, size):
    maxw = SAFE_RIGHT - SAFE_LEFT - 80
    gap = 6
    while True:
        lines, cur, w = [], [], 0
        for c in chunks:
            cw = text_size(c["display"], size)[0] + 2 * 14
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
        return
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
    d.rounded_rectangle((SAFE_LEFT + 10, cy0 - 26, SAFE_RIGHT - 10, cy0 + total_h + 26), 30,
                        fill=rgba((4, 10, 30), 150))
    gap = 6
    for li, line in enumerate(lines):
        lw = sum(cw for _, cw in line) + gap * (len(line) - 1)
        x = SAFE_CX - lw / 2
        yc = cy0 + lh * (li + 0.5)
        for c, cw in line:
            is_act = active is not None and c is chunks[active] and t <= c["end"] + 0.25
            spoken = c["start"] <= t
            if is_act:
                k = ease_out((t - c["start"]) / 0.12)
                pad = 6 * (1 - k)
                d.rounded_rectangle((x - pad, yc - size * 0.72 - pad, x + cw + pad, yc + size * 0.72 + pad),
                                    16, fill=rgba(GOLD, 55), outline=rgba(GOLD), width=6)
            col = GOLD_LIGHT if is_act else (WHITE if spoken else MUTED)
            text_c(d, (x + cw / 2, yc), c["display"], size, col, stroke=4)
            x += cw + gap


# ------------------------------------------------------------------ badges
def draw_badges(d, spec, scene, t):
    if spec.get("pr"):
        d.rounded_rectangle((SAFE_LEFT, SAFE_TOP, SAFE_LEFT + 96, SAFE_TOP + 50), 10, fill=rgba(WHITE))
        text_c(d, (SAFE_LEFT + 48, SAFE_TOP + 25), "PR", 36, NAVY_TOP, stroke=0)
    notes = []
    asof = scene.get("asof")
    if asof:
        notes.append(asof if isinstance(asof, str) else f"{spec.get('asof', '')}")
    if scene.get("note"):
        notes.append(scene["note"])
    if notes:
        txt = "　".join(n for n in notes if n)
        ls, s = fit_lines(txt, 32, SAFE_RIGHT - SAFE_LEFT - 20, 2)
        lh = s * 1.3
        y0 = SAFE_BOTTOM - 14 - lh * (len(ls) - 0.5)
        for i, ln in enumerate(ls):
            text_c(d, (SAFE_CX, y0 + i * lh), ln, s, MUTED, stroke=2)


# ------------------------------------------------------------------ frame
G = {}


def init_worker(spec, tl):
    G["spec"], G["tl"] = spec, tl
    background()


def scene_at(t):
    for sc in G["tl"]["scenes"]:
        if sc["start"] <= t < sc["end"]:
            return sc
    return G["tl"]["scenes"][-1]


def render_frame(fi, debug_safe=False):
    spec, t = G["spec"], fi / FPS
    stl = scene_at(t)
    scene = spec["scenes"][stl["index"]]
    lt, D = t - stl["start"], stl["end"] - stl["start"]
    bg, _ = background()
    img = bg.copy()
    draw_ambient(img, t)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer, "RGBA")
    vis = scene.get("visual", {"type": "summary", "text": ""})
    fn = VISUALS[vis["type"]]
    if vis["type"] == "disclaimer":
        fn(ld, vis, lt, D, t, spec)
    else:
        fn(ld, vis, lt, D, t)
    k = ease_out(lt / 0.22)
    mask = layer.getchannel("A")
    if k < 1:
        mask = mask.point(lambda a: int(a * k))
    img.paste(layer, (int((1 - k) * 70), 0), mask)

    d = ImageDraw.Draw(img, "RGBA")
    draw_badges(d, spec, scene, t)
    draw_subtitles(d, stl, t)
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
    ap.add_argument("--still", type=float, default=None, help="render one PNG at this time (s) with safe-area overlay")
    a = ap.parse_args()
    out = out_dir(a.out)
    spec = load_spec(a.spec)
    tl = json.loads((out / "timeline.json").read_text(encoding="utf-8"))
    init_worker(spec, tl)
    if a.still is not None:
        p = out / f"still_{a.still:05.2f}.png"
        render_frame(int(a.still * FPS), debug_safe=True).save(p)
        print(p)
        return
    n = int(math.ceil(tl["duration"] * FPS))
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", str(out / "visual.mp4")]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    import os
    workers = a.workers or max(1, min(8, (os.cpu_count() or 2) - 1))
    with Pool(workers, initializer=init_worker, initargs=(spec, tl)) as pool:
        for i, fb in enumerate(pool.imap(_frame_bytes, range(n), chunksize=4)):
            proc.stdin.write(fb)
            if i % 150 == 0:
                print(f"[render] {i}/{n}", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")
    print(f"[render] {n} frames -> {out / 'visual.mp4'}")


if __name__ == "__main__":
    main()
