#!/usr/bin/env python3
"""Self-made copper-engraving style illustrations (fallback when archival prints are unavailable).

Each scene is painted as a set of layers: a mask (where the layer is opaque), a "darkness" map
(0 = paper, 1 = full ink) and extra ink strokes. Darkness becomes engraving lines whose width
follows the tone (line-width halftone), with cross-hatching in the darkest areas.
Output: public/img/eng/<scene>_<layer>.png (RGBA) + <scene>.json (layer list, parallax, hotspots).

Shown in the video with the label ［再現イメージ］ — these are not historical documents.
"""
import json
import os
import sys

import cv2
import numpy as np

W, H = 2880, 1620
INK = np.array([52, 38, 26], np.float32)
PAPER = np.array([236, 225, 200], np.float32)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
RNG = np.random.default_rng(1799)


def P(pts):
    return np.array([[int(x * W), int(y * H)] for x, y in pts], np.int32)


def poly(m, pts, v=1.0):
    cv2.fillPoly(m, [P(pts)], float(v), lineType=cv2.LINE_AA)


def rect(m, x0, y0, x1, y1, v=1.0):
    poly(m, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], v)


def ell(m, cx, cy, rx, ry, v=1.0, a0=0, a1=360):
    cv2.ellipse(m, (int(cx * W), int(cy * H)), (int(rx * W), int(ry * H)), 0, a0, a1, float(v), -1, cv2.LINE_AA)


def line(m, pts, t=3, v=1.0):
    cv2.polylines(m, [P(pts)], False, float(v), t, cv2.LINE_AA)


def engrave(dark, angle, spacing, warp=None, maxw=0.92):
    a = np.deg2rad(angle)
    u = -xx * np.sin(a) + yy * np.cos(a)  # angle = line direction (0 = horizontal)
    if warp is not None:
        u = u + warp
    f = (u / spacing) % 1.0
    d = np.abs(f - 0.5) * spacing
    w = np.clip(dark, 0, 1) * spacing * maxw
    return np.clip(w / 2 - d + 0.5, 0, 1) * np.clip(w / 0.8, 0, 1)


def hatch(dark, angle, spacing, warp=None, cross=60):
    ink = engrave(dark, angle, spacing, warp)
    deep = np.clip((dark - 0.55) / 0.45, 0, 1)
    if cross is not None:
        ink = np.maximum(ink, engrave(deep * 0.75, angle + cross, spacing * 1.1, warp))
    return ink


def outline(mask, t=2, v=0.85):
    m = (mask > 0.5).astype(np.uint8)
    e = cv2.morphologyEx(m, cv2.MORPH_GRADIENT, np.ones((t, t), np.uint8)).astype(np.float32)
    return cv2.GaussianBlur(e, (3, 3), 0) * v


def blur(a, s):
    return cv2.GaussianBlur(a, (0, 0), s)


def stipple(dark, density=0.5, seed=3):
    r = np.random.default_rng(seed).random((H, W)).astype(np.float32)
    return (r < np.clip(dark, 0, 1) * density * 0.25).astype(np.float32)


def save_layer(name, mask, ink, wash, out):
    """wash: HxWx3 or rgb tuple. alpha = mask ∪ ink"""
    if not isinstance(wash, np.ndarray):
        wash = np.broadcast_to(np.array(wash, np.float32), (H, W, 3))
    ink = cv2.GaussianBlur(np.clip(ink, 0, 1).astype(np.float32), (0, 0), 0.65)[..., None]  # band-limit: avoids moire when downscaled
    rgb = wash * (1 - ink) + INK * ink
    a = np.clip(np.maximum(mask, ink[..., 0]), 0, 1)
    img = np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(out, name + '.png'), cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA))


def vgrad(c0, c1, y0, y1):
    k = np.clip((yy - y0 * H) / ((y1 - y0) * H), 0, 1)[..., None]
    return np.array(c0, np.float32) * (1 - k) + np.array(c1, np.float32) * k


# ------------------------------------------------------------------ London from the Thames
def london(out):
    layers = []
    HZ = 0.585  # base of skyline
    WL = 0.648  # waterline

    # --- sky (opaque)
    m = np.ones((H, W), np.float32)
    dark = 0.06 + 0.30 * np.clip(1 - yy / (HZ * H), 0, 1) ** 1.6
    cloud = np.zeros((H, W), np.float32)
    for cx, cy, rx, ry in [(0.18, 0.16, 0.16, 0.05), (0.30, 0.12, 0.10, 0.06), (0.62, 0.22, 0.20, 0.05), (0.80, 0.14, 0.12, 0.05),
                           (0.47, 0.30, 0.14, 0.035), (0.92, 0.30, 0.10, 0.03), (0.08, 0.34, 0.09, 0.03)]:
        for k in range(7):
            ell(cloud, cx + RNG.uniform(-rx, rx) * 0.7, cy + RNG.uniform(-ry, ry) * 0.6, rx * RNG.uniform(0.35, 0.6), ry * RNG.uniform(0.6, 1.1))
    cloud = blur(cloud, 14)
    under = np.clip(np.roll(cloud, 26, axis=0) - cloud, 0, 1)
    dark = dark * (1 - 0.9 * cloud) + 0.22 * under
    warp = 3 * np.sin(xx / 170 + yy / 60) + 1.5 * np.sin(xx / 47)
    ink = engrave(dark, 0, 7, warp) + outline(cloud, 2, 0.25)
    # gulls
    for gx, gy in [(0.36, 0.40), (0.39, 0.37), (0.71, 0.33), (0.555, 0.42)]:
        line(ink, [(gx - 0.008, gy - 0.004), (gx, gy), (gx + 0.008, gy - 0.005)], 3)
    save_layer('london_sky', m, ink, vgrad((196, 204, 206), (238, 226, 200), 0.0, HZ), out)
    layers.append({'src': 'london_sky.png', 'speed': 0.15})

    # --- far city
    m = np.zeros((H, W), np.float32); dark = np.zeros((H, W), np.float32); strokes = np.zeros((H, W), np.float32)
    x = 0.0
    while x < 1.0:
        w = RNG.uniform(0.012, 0.04); h = RNG.uniform(0.018, 0.06)
        rect(m, x, HZ - h, x + w, HZ + 0.02); rect(dark, x, HZ - h, x + w, HZ + 0.02, 0.28)
        rect(dark, x + w * 0.62, HZ - h, x + w, HZ + 0.02, 0.45)
        if RNG.random() < 0.45:
            poly(m, [(x, HZ - h), (x + w / 2, HZ - h - 0.018), (x + w, HZ - h)]); poly(dark, [(x + w / 2, HZ - h - 0.018), (x + w, HZ - h), (x + w / 2, HZ - h)], 0.5)
        if RNG.random() < 0.5:  # chimney
            cx = x + RNG.uniform(0.2, 0.8) * w; rect(m, cx, HZ - h - 0.014, cx + 0.003, HZ - h); rect(dark, cx, HZ - h - 0.014, cx + 0.003, HZ - h, 0.55)
        x += w * RNG.uniform(0.75, 1.0)
    # St Paul's
    cx = 0.60
    rect(m, cx - 0.10, HZ - 0.085, cx + 0.10, HZ + 0.02); rect(dark, cx - 0.10, HZ - 0.085, cx + 0.10, HZ + 0.02, 0.30); rect(dark, cx + 0.04, HZ - 0.085, cx + 0.10, HZ + 0.02, 0.48)
    for tx in (cx - 0.085, cx + 0.065):  # west towers
        rect(m, tx, HZ - 0.17, tx + 0.02, HZ - 0.08); rect(dark, tx, HZ - 0.17, tx + 0.02, HZ - 0.08, 0.32); rect(dark, tx + 0.012, HZ - 0.17, tx + 0.02, HZ - 0.08, 0.5)
        ell(m, tx + 0.01, HZ - 0.17, 0.011, 0.02, 1, 180, 360); ell(dark, tx + 0.01, HZ - 0.17, 0.011, 0.02, 0.4, 180, 360)
        rect(m, tx + 0.008, HZ - 0.215, tx + 0.012, HZ - 0.185); rect(dark, tx + 0.008, HZ - 0.215, tx + 0.012, HZ - 0.185, 0.6)
    rect(m, cx - 0.045, HZ - 0.19, cx + 0.045, HZ - 0.085); rect(dark, cx - 0.045, HZ - 0.19, cx + 0.045, HZ - 0.085, 0.22)  # drum
    for k in range(13):  # colonnade
        px = cx - 0.042 + k * 0.007; rect(dark, px, HZ - 0.178, px + 0.0025, HZ - 0.1, 0.62)
    rect(dark, cx + 0.02, HZ - 0.19, cx + 0.045, HZ - 0.085, 0.42)
    ell(m, cx, HZ - 0.19, 0.05, 0.12, 1, 180, 360)
    dome = np.zeros((H, W), np.float32); ell(dome, cx, HZ - 0.19, 0.05, 0.12, 1, 180, 360)
    ddark = 0.18 + 0.5 * np.clip((xx / W - (cx - 0.03)) / 0.08, 0, 1)
    dark = np.where(dome > 0.5, ddark, dark)
    for k in range(-3, 4):  # dome ribs
        line(strokes, [(cx + k * 0.013 * np.cos(t), HZ - 0.19 - 0.12 * np.sin(t)) for t in np.linspace(0, np.pi / 2, 12)] if False else
             [(cx + 0.05 * np.sin(np.arcsin(k / 3.5)) * np.cos(t), HZ - 0.19 - 0.12 * np.sin(t)) for t in np.linspace(0, np.pi / 2, 14)], 2, 0.5)
    rect(m, cx - 0.008, HZ - 0.345, cx + 0.008, HZ - 0.30); rect(dark, cx - 0.008, HZ - 0.345, cx + 0.008, HZ - 0.30, 0.35)
    ell(m, cx, HZ - 0.352, 0.005, 0.01); line(strokes, [(cx, HZ - 0.36), (cx, HZ - 0.39)], 4); line(strokes, [(cx - 0.005, HZ - 0.38), (cx + 0.005, HZ - 0.38)], 4)
    # steeples
    for sx, sh in [(0.12, 0.17), (0.25, 0.21), (0.37, 0.15), (0.47, 0.19), (0.75, 0.2), (0.90, 0.16)]:
        rect(m, sx, HZ - sh, sx + 0.012, HZ); rect(dark, sx, HZ - sh, sx + 0.012, HZ, 0.3); rect(dark, sx + 0.007, HZ - sh, sx + 0.012, HZ, 0.52)
        rect(m, sx + 0.002, HZ - sh - 0.03, sx + 0.010, HZ - sh); rect(dark, sx + 0.002, HZ - sh - 0.03, sx + 0.010, HZ - sh, 0.4)
        poly(m, [(sx + 0.002, HZ - sh - 0.03), (sx + 0.006, HZ - sh - 0.11), (sx + 0.010, HZ - sh - 0.03)])
        poly(dark, [(sx + 0.006, HZ - sh - 0.11), (sx + 0.010, HZ - sh - 0.03), (sx + 0.006, HZ - sh - 0.03)], 0.55)
        poly(dark, [(sx + 0.002, HZ - sh - 0.03), (sx + 0.006, HZ - sh - 0.11), (sx + 0.006, HZ - sh - 0.03)], 0.3)
    # the Monument
    rect(m, 0.815, HZ - 0.24, 0.822, HZ); rect(dark, 0.815, HZ - 0.24, 0.822, HZ, 0.42); ell(m, 0.8185, HZ - 0.245, 0.005, 0.012)
    # windows
    for _ in range(420):
        wx, wy = RNG.uniform(0, 1), HZ - RNG.uniform(0.005, 0.05)
        if abs(wx - 0.60) > 0.11 and m[int(wy * H), int(wx * W)] > 0.5 and m[int((wy - 0.01) * H), int(wx * W)] > 0.5:
            rect(dark, wx, wy, wx + 0.0025, wy + 0.006, 0.75)
    # chimney smoke
    smoke = np.zeros((H, W), np.float32)
    for sx in (0.07, 0.33, 0.52, 0.70, 0.95):
        for k in range(8):
            ell(smoke, sx + k * 0.008 + RNG.uniform(-0.004, 0.004), HZ - 0.07 - k * 0.022, 0.006 + k * 0.0025, 0.01 + k * 0.002)
    smoke = blur(smoke, 10) * 0.45
    m *= (dark > 0) | (m > 0.5)
    dark = dark * 0.82  # aerial perspective
    ink = hatch(dark, 90, 6, cross=None) + outline(m, 2, 0.55) + strokes * 0.8
    ink = np.maximum(ink * (1 - smoke * 0.7), engrave(smoke * 0.18, 20, 7))
    mm = np.maximum(m, smoke * 0.6)
    save_layer('london_city', mm, ink, (222, 212, 192), out)
    layers.append({'src': 'london_city.png', 'speed': 0.35})

    # --- middle: warehouses (left) + bridge (right) + moored barges
    m = np.zeros((H, W), np.float32); dark = np.zeros((H, W), np.float32); strokes = np.zeros((H, W), np.float32)
    x = -0.01
    while x < 0.40:
        w = RNG.uniform(0.04, 0.075); top = RNG.uniform(0.50, 0.555)
        rect(m, x, top, x + w, WL + 0.005); rect(dark, x, top, x + w, WL + 0.005, 0.42); rect(dark, x + w * 0.7, top, x + w, WL + 0.005, 0.62)
        poly(m, [(x - 0.003, top), (x + w * 0.5, top - 0.03), (x + w + 0.003, top)]); poly(dark, [(x - 0.003, top), (x + w * 0.5, top - 0.03), (x + w + 0.003, top)], 0.66)
        for r in range(4):
            for c in range(3):
                wx = x + w * (0.15 + c * 0.25); wy = top + 0.015 + r * 0.025
                if wy < WL - 0.02:
                    rect(dark, wx, wy, wx + w * 0.12, wy + 0.012, 0.9)
        rect(dark, x + w * 0.35, WL - 0.03, x + w * 0.6, WL + 0.005, 0.95)  # loading door
        x += w
    rect(m, -0.01, WL - 0.004, 0.42, WL + 0.012); rect(dark, -0.01, WL - 0.004, 0.42, WL + 0.012, 0.7)  # quay
    # bridge with arches
    by0, by1 = 0.598, 0.618
    bridge = np.zeros((H, W), np.float32); rect(bridge, 0.50, by0, 1.01, WL + 0.01)
    rect(m, 0.50, by0 - 0.012, 1.01, by0); rect(dark, 0.50, by0 - 0.012, 1.01, by0, 0.35)  # parapet
    for k in range(25):
        px = 0.503 + k * 0.021; rect(dark, px, by0 - 0.010, px + 0.006, by0 - 0.002, 0.75)  # balusters
    holes = np.zeros((H, W), np.float32); under = np.zeros((H, W), np.float32)
    for k, ax in enumerate(np.arange(0.535, 1.05, 0.085)):
        ell(holes, ax, WL + 0.01, 0.034, 0.03 + 0.0, 1, 180, 360); rect(holes, ax - 0.034, WL - 0.002, ax + 0.034, WL + 0.02)
        ell(under, ax, WL + 0.01, 0.034, 0.03, 1, 180, 360)
    bridge = np.clip(bridge - holes, 0, 1)
    m = np.maximum(m, bridge)
    bd = 0.4 + 0.25 * np.clip(blur(holes, 6) * 2.0, 0, 1)
    dark = np.where(bridge > 0.5, bd, dark)
    for k, ax in enumerate(np.arange(0.535, 1.05, 0.085)):  # voussoirs
        line(strokes, [(ax + 0.038 * np.cos(t), WL + 0.01 - 0.034 * np.sin(t)) for t in np.linspace(0, np.pi, 20)], 3, 0.8)
        ell(m, ax + 0.0425, by1 + 0.01, 0.006, 0.006); rect(dark, ax + 0.039, by1, ax + 0.046, WL, 0.6)  # pier columns
    # moored barges + masts
    for bx, s in [(0.06, 1.0), (0.17, 0.85), (0.30, 0.9), (0.43, 0.75)]:
        hull = [(bx - 0.04 * s, WL - 0.005), (bx + 0.045 * s, WL - 0.005), (bx + 0.05 * s, WL - 0.016 * s), (bx - 0.045 * s, WL - 0.018 * s)]
        hull = [(a, b + 0.012) for a, b in hull]
        poly(m, hull); poly(dark, hull, 0.78)
        line(strokes, [(bx, WL - 0.005), (bx, WL - 0.26 * s)], 4)
        line(strokes, [(bx - 0.03 * s, WL - 0.2 * s), (bx + 0.03 * s, WL - 0.21 * s)], 3)
        line(strokes, [(bx, WL - 0.26 * s), (bx - 0.04 * s, WL + 0.0)], 1, 0.6); line(strokes, [(bx, WL - 0.26 * s), (bx + 0.045 * s, WL - 0.002)], 1, 0.6)
        sail = [(bx + 0.003, WL - 0.24 * s), (bx + 0.028 * s, WL - 0.22 * s), (bx + 0.026 * s, WL - 0.07 * s), (bx + 0.003, WL - 0.06 * s)]
        poly(m, sail); poly(dark, sail, 0.38)
    ink = hatch(dark, 90, 6) + outline(m, 2, 0.75) + strokes
    wash = np.broadcast_to(np.array((214, 196, 168), np.float32), (H, W, 3)).copy()
    save_layer('london_mid', m, ink, wash, out)
    layers.append({'src': 'london_mid.png', 'speed': 0.6})
    mid_mask = m

    # --- water (front band)
    m = (yy > (WL + 0.004) * H).astype(np.float32)
    k = np.clip((yy / H - WL) / (1 - WL), 0, 1)
    dark = 0.10 + 0.36 * k ** 1.1
    refl = np.zeros((H, W), np.float32)
    src = mid_mask[int((WL - 0.12) * H):int(WL * H)][::-1]
    refl[int(WL * H):int(WL * H) + src.shape[0]] = src
    refl = cv2.GaussianBlur(refl, (0, 0), sigmaX=4, sigmaY=22)
    dark = dark + 0.32 * refl * (1 - k)
    glint = np.exp(-((xx / W - 0.62) / 0.05) ** 2) * (1 - k) * 0.6
    dark = dark * (1 - glint)
    warp = (1.0 + 1.6 * k) * np.sin(xx / 70 + yy / 140) + 0.7 * np.sin(xx / 23 + yy / 300)
    ink = engrave(dark, 0, 6, warp)
    save_layer('london_water', m, ink, vgrad((208, 206, 186), (176, 176, 158), WL, 1.0), out)
    layers.append({'src': 'london_water.png', 'speed': 0.9})

    # --- foreground boats
    m = np.zeros((H, W), np.float32); dark = np.zeros((H, W), np.float32); strokes = np.zeros((H, W), np.float32)
    hull = [(0.665, 0.775), (0.70, 0.785), (0.86, 0.785), (0.895, 0.765), (0.885, 0.80), (0.86, 0.84), (0.70, 0.84), (0.672, 0.81)]
    poly(m, hull); poly(dark, hull, 0.72)
    poly(dark, [(0.70, 0.785), (0.86, 0.785), (0.858, 0.795), (0.702, 0.795)], 0.35)  # wale highlight
    line(strokes, [(0.77, 0.785), (0.77, 0.30)], 7)
    line(strokes, [(0.772, 0.72), (0.875, 0.335)], 5)  # sprit
    sail = [(0.774, 0.36), (0.872, 0.34), (0.858, 0.735), (0.776, 0.755)]
    poly(m, sail); sd = 0.3 + 0.3 * np.clip((xx / W - 0.78) / 0.09, 0, 1); sm = np.zeros((H, W), np.float32); poly(sm, sail)
    dark = np.where(sm > 0.5, sd, dark)
    jib = [(0.766, 0.39), (0.765, 0.765), (0.69, 0.77)]
    poly(m, jib); jm = np.zeros((H, W), np.float32); poly(jm, jib); dark = np.where(jm > 0.5, 0.25, dark)
    for t in (0.47, 0.56, 0.65):  # reef bands
        line(strokes, [(0.776, t + 0.02), (0.866, t - 0.006 + 0.01 * (t - 0.47))], 2, 0.6)
    line(strokes, [(0.77, 0.30), (0.665, 0.775)], 2, 0.7); line(strokes, [(0.77, 0.30), (0.89, 0.77)], 2, 0.7)
    # figure at the tiller
    ell(m, 0.70, 0.735, 0.0045, 0.009); ell(dark, 0.70, 0.735, 0.0045, 0.009, 0.8)
    poly(m, [(0.693, 0.745), (0.707, 0.745), (0.71, 0.785), (0.69, 0.785)]); poly(dark, [(0.693, 0.745), (0.707, 0.745), (0.71, 0.785), (0.69, 0.785)], 0.75)
    # rowing wherry (left)
    w = [(0.10, 0.865), (0.26, 0.862), (0.25, 0.885), (0.115, 0.888)]
    poly(m, w); poly(dark, w, 0.75)
    for fx in (0.15, 0.21):
        ell(m, fx, 0.832, 0.004, 0.008); ell(dark, fx, 0.832, 0.004, 0.008, 0.8)
        poly(m, [(fx - 0.007, 0.84), (fx + 0.007, 0.84), (fx + 0.009, 0.866), (fx - 0.009, 0.866)]); poly(dark, [(fx - 0.007, 0.84), (fx + 0.007, 0.84), (fx + 0.009, 0.866), (fx - 0.009, 0.866)], 0.65)
    line(strokes, [(0.20, 0.855), (0.29, 0.90)], 4); line(strokes, [(0.16, 0.855), (0.07, 0.90)], 4)
    # boat reflections
    rf = np.zeros((H, W), np.float32); poly(rf, [(0.67, 0.84), (0.89, 0.84), (0.87, 0.93), (0.69, 0.93)]); poly(rf, [(0.11, 0.888), (0.25, 0.888), (0.24, 0.93), (0.12, 0.93)])
    rf = cv2.GaussianBlur(rf, (0, 0), sigmaX=6, sigmaY=16)
    ink = hatch(dark, 75, 5) + outline(m, 3, 0.9) + strokes + engrave(rf * 0.5, 0, 6, 1.5 * np.sin(xx / 30 + yy / 200)) * (1 - m)
    wash = np.broadcast_to(np.array((206, 168, 132), np.float32), (H, W, 3)).copy()
    wash[sm > 0.5] = (192, 132, 98)
    save_layer('london_boats', np.maximum(m, rf * 0.0), ink, wash, out)
    layers.append({'src': 'london_boats.png', 'speed': 1.25})
    return {'layers': layers}


# ------------------------------------------------------------------ naval battle
def ship(m, dark, strokes, cx, wl, L, ports=None, facing=-1):
    """ship of the line, bow toward `facing` (-1 = left). L = hull length as fraction of W."""
    sx = lambda u: cx + facing * u * L
    hy = lambda v: wl - v * L * (W / H)
    top = [(sx(u), hy(0.11 + 0.06 * max(0, (u - 0.18) / 0.32) ** 1.5)) for u in np.linspace(-0.5, 0.5, 20)][::-1]
    bot = [(sx(u), hy(-0.01 - 0.008 * np.cos(u * np.pi))) for u in np.linspace(-0.46, 0.46, 20)]
    hull = top + [(sx(-0.46), hy(0.0))] + bot + [(sx(0.47), hy(0.02))]
    hm = np.zeros((H, W), np.float32); poly(hm, hull)
    m[:] = np.maximum(m, hm); dark[:] = np.where(hm > 0.5, 0.72, dark)
    port_pts = []
    for row, v in enumerate((0.035, 0.07)):
        band = [(sx(u), hy(v + 0.012)) for u in np.linspace(-0.42, 0.42, 2)] + [(sx(u), hy(v - 0.012)) for u in np.linspace(0.42, -0.42, 2)]
        poly(dark, band, 0.28)
        for u in np.arange(-0.38, 0.39, 0.048):
            px, py = sx(u), hy(v)
            rect(dark, px - 0.004 * L / 0.4, py - 0.006 * L / 0.4, px + 0.004 * L / 0.4, py + 0.006 * L / 0.4, 0.95)
            port_pts.append((px, py))
    line(strokes, [(sx(-0.5), hy(0.11)), (sx(-0.78), hy(0.24))], max(2, int(9 * L)))  # bowsprit
    masts = [(-0.27, 0.78), (0.02, 0.95), (0.29, 0.68)]
    for u, h in masts:
        mx = sx(u)
        line(strokes, [(mx, hy(0.1)), (mx, hy(0.1 + h))], max(2, int(12 * L)))
        tiers = [(0.17, 0.30, 0.25), (0.40, 0.24, 0.20), (0.60, 0.17, 0.15), (0.76, 0.11, 0.1)]
        for base, wid, hh in tiers:
            if base + hh > h + 0.06:
                continue
            y0, y1 = hy(0.1 + base + hh), hy(0.1 + base)
            hw = wid * L / 2
            pts = [(mx - hw, y0), (mx + hw, y0)] + [(mx + hw * np.cos(t), y1 + 0.012 * L / 0.4 * np.sin(t)) for t in np.linspace(0, np.pi, 12)]
            sm = np.zeros((H, W), np.float32); poly(sm, pts)
            m[:] = np.maximum(m, sm)
            shade = 0.06 + 0.26 * np.clip((xx / W - (mx - hw)) / (2 * hw), 0, 1) ** 1.5 + 0.12 * np.clip((yy / H - y0) / (y1 - y0 + 1e-6), 0, 1) ** 3
            dark[:] = np.where(sm > 0.5, shade, dark)
            line(strokes, [(mx - hw * 1.05, y0), (mx + hw * 1.05, y0)], max(2, int(6 * L)))  # yard
        line(strokes, [(mx, hy(0.1 + h)), (sx(u - 0.24), hy(0.11))], 1, 0.6)
        line(strokes, [(mx, hy(0.1 + h)), (sx(u + 0.2), hy(0.12))], 1, 0.6)
    # ensign at stern
    fx = sx(0.5); line(strokes, [(fx, hy(0.17)), (fx, hy(0.34))], 3)
    flag = [(fx, hy(0.34)), (fx + facing * -0.06 * L, hy(0.33)), (fx + facing * -0.055 * L, hy(0.27)), (fx, hy(0.28))]
    poly(m, flag); poly(dark, flag, 0.55)
    return port_pts


def battle(out):
    layers = []
    HZ = 0.63

    m = np.ones((H, W), np.float32)
    dark = 0.05 + 0.24 * np.clip(1 - yy / (HZ * H), 0, 1) ** 1.6
    cloud = np.zeros((H, W), np.float32)
    for _ in range(16):
        ell(cloud, RNG.uniform(0, 1), RNG.uniform(0.05, 0.45), RNG.uniform(0.04, 0.12), RNG.uniform(0.02, 0.06))
    cloud = blur(cloud, 45)
    dark = np.clip(dark - 0.12 * cloud + 0.14 * np.clip(np.roll(cloud, 40, 0) - cloud, 0, 1), 0, 1)
    sea = yy > HZ * H
    k = np.clip((yy / H - HZ) / (1 - HZ), 0, 1)
    dark = np.where(sea, 0.30 + 0.3 * k, dark)
    warp = np.where(sea, 0.0, 2 * np.sin(xx / 400 + yy / 500))
    ink = engrave(np.maximum(dark, 0.12), 0, 9, warp)
    
    wash = np.where(sea[..., None], vgrad((150, 158, 150), (120, 126, 118), HZ, 1.0), vgrad((196, 194, 184), (234, 220, 192), 0, HZ))
    save_layer('battle_sky', m, ink, wash, out)
    layers.append({'src': 'battle_sky.png', 'speed': 0.15})

    # far ship (right side, facing left? — it faces the near ship: facing right)
    m = np.zeros((H, W), np.float32); dark = np.zeros((H, W), np.float32); st = np.zeros((H, W), np.float32)
    far_ports = ship(m, dark, st, 0.25, HZ + 0.012, 0.22, facing=1)
    dark *= 0.8
    ink = hatch(dark, 80, 5) + outline(m, 2, 0.6) + st * 0.8
    save_layer('battle_far', m, ink, (196, 186, 166), out)
    layers.append({'src': 'battle_far.png', 'speed': 0.35})

    m = np.zeros((H, W), np.float32); dark = np.zeros((H, W), np.float32); st = np.zeros((H, W), np.float32)
    near_ports = ship(m, dark, st, 0.70, 0.80, 0.42, facing=-1)
    ink = hatch(dark, 78, 6) + outline(m, 3, 0.85) + st
    wash = np.broadcast_to(np.array((214, 200, 172), np.float32), (H, W, 3)).copy()
    save_layer('battle_near', m, ink, wash, out)
    layers.append({'src': 'battle_near.png', 'speed': 0.7, 'flashes': [[x * W, y * H] for x, y in near_ports if y > 0.74]})

    # gun smoke (in front)
    sm = np.zeros((H, W), np.float32)
    for x, y in near_ports[::3]:
        if x < 0.62:
            for j in range(3):
                ell(sm, x - RNG.uniform(0.0, 0.05), y - RNG.uniform(0.03, 0.09), RNG.uniform(0.015, 0.03), RNG.uniform(0.015, 0.03))
    for j in range(14):
        ell(sm, RNG.uniform(0.36, 0.52), RNG.uniform(0.50, 0.64), RNG.uniform(0.02, 0.05), RNG.uniform(0.02, 0.04))
    for x, y in far_ports[::3]:
        ell(sm, x + RNG.uniform(0, 0.03), y - RNG.uniform(0.01, 0.03), RNG.uniform(0.01, 0.02), RNG.uniform(0.01, 0.02))
    sm = np.clip(blur(sm, 28) * 1.5, 0, 1)
    sdark = 0.05 + 0.35 * np.clip(np.roll(sm, 30, 0) - sm * 0.6, 0, 1) + 0.1 * (1 - sm)
    ink = engrave(sdark, 0, 9, 2 * np.sin(xx / 90 + yy / 120)) * sm
    save_layer('battle_smoke', sm * 0.7, ink, (232, 222, 200), out)

    # foreground waves
    top = 0.86 + 0.02 * np.sin(xx / W * 13) + 0.012 * np.sin(xx / W * 37 + 1)
    m = (yy / H > top).astype(np.float32); m = blur(m, 1.5)
    k = np.clip((yy / H - 0.84) / 0.16, 0, 1)
    dark = 0.45 + 0.35 * k
    crest = np.clip(1 - np.abs(yy / H - top - 0.012) / 0.012, 0, 1)
    dark = dark * (1 - 0.85 * crest)
    ink = engrave(dark, 0, 9) + outline(m, 3, 0.7)
    save_layer('battle_waves', m, ink, (118, 124, 114), out)
    layers.append({'src': 'battle_waves.png', 'speed': 1.3})
    return {'layers': layers}


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/img/eng'
    os.makedirs(out, exist_ok=True)
    meta = {'size': [W, H]}
    for name, fn in [('london', london), ('battle', battle)]:
        if len(sys.argv) > 2 and name not in sys.argv[2:]:
            continue
        meta[name] = fn(out)
        print('done', name)
    old = os.path.join(out, 'scenes.json')
    if os.path.exists(old):
        prev = json.load(open(old)); prev.update(meta); meta = prev
    json.dump(meta, open(old, 'w'), indent=1)
