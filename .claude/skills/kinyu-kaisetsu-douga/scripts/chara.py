"""People illustrations and icons drawn with Pillow primitives (no image assets).

draw_chara(d, who, pose, x, floor_y, t, talking=False, flip=False, scale=1.0)
  who  : guide (解説役) / part (パートさん) / salary (会社員) / student (学生)
  pose : idle, point, explain, wave, think, happy, surprise, worry, ok
draw_icon(d, name, cx, cy, size, col=GOLD, a=255)
  name : receipt, house, shield, calendar, building, calculator, person, doc,
         clock, coin, check, piggy, plant, handshake
"""
from __future__ import annotations

import math

from common import GOLD, GOLD_DARK, GOLD_LIGHT, NAVY_TOP, WHITE, font

INK = (18, 24, 52)
SKIN = (252, 222, 198)
BLUSH = (246, 150, 150)

CHARAS = {
    "guide": dict(hair=(70, 44, 32), hair_style="bob", top=(43, 179, 163), inner=(245, 247, 252),
                  pants=(38, 52, 92), glasses=True, extra="badge"),
    "part": dict(hair=(120, 72, 40), hair_style="pony", top=(236, 240, 248), inner=None,
                 pants=(60, 70, 110), glasses=False, extra="apron"),
    "salary": dict(hair=(30, 30, 38), hair_style="short", top=(61, 111, 216), inner=(245, 247, 252),
                   pants=(40, 60, 120), glasses=False, extra="tie"),
    "student": dict(hair=(40, 30, 30), hair_style="short", top=(232, 120, 160), inner=None,
                    pants=(50, 60, 100), glasses=False, extra="hood"),
}


def _rgba(c, a=255):
    return (c[0], c[1], c[2], int(max(0, min(255, a))))


def _dir(angle_deg, side):
    a = math.radians(angle_deg)
    return side * math.sin(a), math.cos(a)


def _limb(d, p0, p1, col, w):
    d.line((p0, p1), fill=_rgba(INK), width=w + 8)
    d.ellipse((p1[0] - (w + 8) / 2, p1[1] - (w + 8) / 2, p1[0] + (w + 8) / 2, p1[1] + (w + 8) / 2), fill=_rgba(INK))
    d.line((p0, p1), fill=_rgba(col), width=w)
    d.ellipse((p1[0] - w / 2, p1[1] - w / 2, p1[0] + w / 2, p1[1] + w / 2), fill=_rgba(col))


def _arm(d, shoulder, side, a1, a2, k, sleeve):
    l1, l2 = 58 * k, 52 * k
    dx, dy = _dir(a1, side)
    elbow = (shoulder[0] + dx * l1, shoulder[1] + dy * l1)
    dx, dy = _dir(a2, side)
    hand = (elbow[0] + dx * l2, elbow[1] + dy * l2)
    _limb(d, shoulder, elbow, sleeve, int(24 * k))
    _limb(d, elbow, hand, sleeve, int(22 * k))
    r = 14 * k
    d.ellipse((hand[0] - r, hand[1] - r, hand[0] + r, hand[1] + r), fill=_rgba(SKIN), outline=_rgba(INK), width=3)
    return hand


POSES = {
    #          right(a1,a2)          left(a1,a2)        emote     mouth    jump
    "idle":     ((14, 6), (14, 6), None, "smile", 0),
    "point":    ((128, 150), (12, 4), None, "smile", 0),
    "explain":  ((78, 100), (12, 4), None, "smile", 0),
    "wave":     ((150, 165), (12, 4), "sparkle", "open", 0),
    "think":    ((35, -150), (25, -70), "?", "flat", 0),
    "happy":    ((150, 172), (150, 172), "♪", "open", 1),
    "surprise": ((112, 145), (112, 145), "!", "o", 1),
    "worry":    ((22, -35), (22, -35), "sweat", "worry", 0),
    "ok":       ((70, 178), (12, 4), "sparkle", "open", 0),
}


def draw_chara(d, who, pose, x, fy, t, talking=False, flip=False, scale=1.0, phase=0.0):
    c = CHARAS.get(who, CHARAS["guide"])
    k = scale
    (r1, r2), (l1, l2), emote, mouth, jump = POSES.get(pose, POSES["idle"])
    tt = t * 2.2 + phase
    bob = 4 * k * math.sin(tt * 1.5)
    if jump:
        bob -= abs(math.sin(tt * 2.2)) * 16 * k
    y0 = fy + bob
    s_front = -1 if flip else 1   # side of the "front" (gesturing) arm
    sway = 6 * math.sin(tt * 1.8)
    if pose == "wave":
        r2 += 25 * math.sin(t * 8)
    if pose in ("point", "explain"):
        r1 += 4 * math.sin(t * 3)

    # shadow
    d.ellipse((x - 80 * k, fy - 10 * k, x + 80 * k, fy + 14 * k), fill=(0, 0, 0, 70))
    # legs + shoes
    for sd in (-1, 1):
        lx = x + sd * 22 * k
        d.rounded_rectangle((lx - 17 * k, y0 - 98 * k, lx + 17 * k, y0 - 12 * k), int(10 * k),
                            fill=_rgba(c["pants"]), outline=_rgba(INK), width=4)
        d.ellipse((lx - 24 * k + sd * 4, y0 - 22 * k, lx + 24 * k + sd * 4, y0 + 2 * k), fill=_rgba(INK))
    sh_y = y0 - 190 * k
    # back arm (non-front)
    back_side = -s_front
    _arm(d, (x + back_side * 50 * k, sh_y), back_side, l1 + sway, l2 + sway, k, c["top"])
    # torso
    d.rounded_rectangle((x - 60 * k, y0 - 210 * k, x + 60 * k, y0 - 88 * k), int(28 * k),
                        fill=_rgba(c["top"]), outline=_rgba(INK), width=4)
    if c["inner"]:
        d.polygon([(x - 22 * k, y0 - 208 * k), (x + 22 * k, y0 - 208 * k), (x, y0 - 160 * k)], fill=_rgba(c["inner"]))
    ex = c["extra"]
    if ex == "tie":
        d.polygon([(x - 8 * k, y0 - 200 * k), (x + 8 * k, y0 - 200 * k), (x + 11 * k, y0 - 140 * k),
                   (x, y0 - 128 * k), (x - 11 * k, y0 - 140 * k)], fill=_rgba((210, 60, 70)))
    elif ex == "apron":
        d.rounded_rectangle((x - 46 * k, y0 - 170 * k, x + 46 * k, y0 - 70 * k), int(12 * k),
                            fill=_rgba((243, 156, 74)), outline=_rgba(INK), width=3)
        d.line((x - 30 * k, y0 - 170 * k, x - 20 * k, y0 - 206 * k), fill=_rgba((243, 156, 74)), width=int(7 * k))
        d.line((x + 30 * k, y0 - 170 * k, x + 20 * k, y0 - 206 * k), fill=_rgba((243, 156, 74)), width=int(7 * k))
        d.rounded_rectangle((x - 20 * k, y0 - 140 * k, x + 20 * k, y0 - 115 * k), 6, outline=_rgba((200, 110, 40)), width=3)
    elif ex == "badge":
        d.rounded_rectangle((x + 18 * k, y0 - 170 * k, x + 46 * k, y0 - 152 * k), 4, fill=_rgba(GOLD))
    elif ex == "hood":
        d.ellipse((x - 40 * k, y0 - 218 * k, x + 40 * k, y0 - 190 * k), fill=_rgba((200, 90, 130)))
    # head
    hy = y0 - 262 * k
    hr = 64 * k
    style = c["hair_style"]
    hair = _rgba(c["hair"])
    if style == "bob":
        d.ellipse((x - hr - 10 * k, hy - hr - 8 * k, x + hr + 10 * k, hy + hr * 0.75), fill=hair, outline=_rgba(INK), width=4)
    elif style == "pony":
        pxo = x + s_front * -1 * (hr + 6 * k) + 8 * math.sin(tt * 2)
        d.ellipse((pxo - 26 * k, hy - 30 * k, pxo + 26 * k, hy + 56 * k), fill=hair, outline=_rgba(INK), width=4)
        d.ellipse((x - hr - 4 * k, hy - hr - 6 * k, x + hr + 4 * k, hy + hr * 0.3), fill=hair, outline=_rgba(INK), width=4)
    d.ellipse((x - hr, hy - hr, x + hr, hy + hr), fill=_rgba(SKIN), outline=_rgba(INK), width=4)
    # bangs
    if style in ("bob", "pony"):
        d.chord((x - hr - 2, hy - hr - 6, x + hr + 2, hy + hr * 0.55), 180, 360, fill=hair)
        d.polygon([(x - 18 * k, hy - 22 * k), (x - 2 * k, hy - 4 * k), (x + 14 * k, hy - 24 * k)], fill=hair)
    else:
        d.chord((x - hr - 4, hy - hr - 10, x + hr + 4, hy + hr * 0.25), 180, 360, fill=hair)
    # face
    blink = (t * 0.7 + phase) % 3.0 < 0.12
    for sd in (-1, 1):
        exx = x + sd * 22 * k
        if blink:
            d.line((exx - 7 * k, hy + 8 * k, exx + 7 * k, hy + 8 * k), fill=_rgba(INK), width=4)
        else:
            d.ellipse((exx - 7 * k, hy - 2 * k, exx + 7 * k, hy + 16 * k), fill=_rgba(INK))
            d.ellipse((exx - 2 * k, hy + 1 * k, exx + 3 * k, hy + 6 * k), fill=_rgba(WHITE))
        d.ellipse((x + sd * 40 * k - 10 * k, hy + 22 * k, x + sd * 40 * k + 10 * k, hy + 32 * k), fill=_rgba(BLUSH, 150))
        brow_y = hy - 14 * k - (6 * k if emote in ("!", "♪") else 0)
        tilt = 5 * k * (-sd if emote == "sweat" else (sd * 0.5 if emote == "?" else 0))
        d.line((exx - 10 * k, brow_y + tilt, exx + 10 * k, brow_y - tilt), fill=_rgba(INK), width=4)
    if c["glasses"]:
        for sd in (-1, 1):
            exx = x + sd * 22 * k
            d.ellipse((exx - 17 * k, hy - 10 * k, exx + 17 * k, hy + 22 * k), outline=_rgba(INK), width=3)
        d.line((x - 5 * k, hy + 4 * k, x + 5 * k, hy + 4 * k), fill=_rgba(INK), width=3)
    my = hy + 34 * k
    m = mouth
    if talking:
        m = "talk"
    if m == "smile":
        d.arc((x - 16 * k, my - 14 * k, x + 16 * k, my + 8 * k), 20, 160, fill=_rgba(INK), width=4)
    elif m == "open":
        d.chord((x - 15 * k, my - 10 * k, x + 15 * k, my + 14 * k), 0, 180, fill=_rgba((190, 60, 70)), outline=_rgba(INK), width=3)
    elif m == "talk":
        h = (4 + 9 * abs(math.sin(t * 13))) * k
        d.ellipse((x - 11 * k, my - h / 2, x + 11 * k, my + h / 2), fill=_rgba((190, 60, 70)), outline=_rgba(INK), width=3)
    elif m == "o":
        d.ellipse((x - 9 * k, my - 9 * k, x + 9 * k, my + 9 * k), fill=_rgba((190, 60, 70)), outline=_rgba(INK), width=3)
    elif m == "worry":
        d.arc((x - 14 * k, my - 2 * k, x + 14 * k, my + 16 * k), 200, 340, fill=_rgba(INK), width=4)
    else:
        d.line((x - 10 * k, my, x + 10 * k, my), fill=_rgba(INK), width=4)
    # front arm last (over the body)
    _arm(d, (x + s_front * 50 * k, sh_y), s_front, r1 - sway * 0.3, r2 - sway * 0.3, k, c["top"])
    # emote
    ex_, ey_ = x + s_front * 78 * k, hy - 92 * k + 6 * math.sin(t * 5)
    if emote in ("?", "!", "♪"):
        text = emote
        d.text((ex_, ey_), text, font=font(int(60 * k)), fill=_rgba(GOLD), anchor="mm",
               stroke_width=4, stroke_fill=_rgba(INK))
    elif emote == "sweat":
        sx, sy = x - s_front * 70 * k, hy - 30 * k + (t * 40 % 30)
        d.polygon([(sx, sy - 18 * k), (sx - 10 * k, sy + 4 * k), (sx + 10 * k, sy + 4 * k)], fill=_rgba((140, 200, 255)))
        d.ellipse((sx - 10 * k, sy - 6 * k, sx + 10 * k, sy + 14 * k), fill=_rgba((140, 200, 255)))
    elif emote == "sparkle":
        for i in range(3):
            ang = t * 2 + i * 2.1
            sx = ex_ + 30 * math.cos(ang) * k
            sy = ey_ + 20 * math.sin(ang) * k
            star(d, sx, sy, (10 + 5 * math.sin(t * 6 + i)) * k, GOLD_LIGHT)


def star(d, cx, cy, r, col, a=255):
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * 0.32
        ang = math.pi / 4 * i
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=_rgba(col, a))


# ------------------------------------------------------------------ icons
def draw_icon(d, name, cx, cy, sz, col=GOLD, a=255):
    if sz < 8:
        return
    s = sz / 100.0
    C = _rgba(col, a)
    D = _rgba(NAVY_TOP, a)
    O = _rgba(INK, a)

    def R(x0, y0, x1, y1):
        return (cx + x0 * s, cy + y0 * s, cx + x1 * s, cy + y1 * s)

    def P(pts):
        return [(cx + x * s, cy + y * s) for x, y in pts]

    if name == "receipt":
        pts = [(-34, -46), (34, -46), (34, 40)] + [(34 - 68 * i / 6, 40 + (8 if i % 2 else 0)) for i in range(1, 7)] + [(-34, -46)]
        d.polygon(P(pts), fill=_rgba(WHITE, a), outline=O)
        for yy in (-28, -12, 4):
            d.line(P([(-22, yy), (22, yy)]), fill=_rgba((150, 160, 190), a), width=max(2, int(4 * s)))
        d.text((cx + 12 * s, cy + 24 * s), "¥", font=font(int(30 * s)), fill=C, anchor="mm", stroke_width=1, stroke_fill=O)
    elif name == "house":
        d.polygon(P([(-48, -6), (0, -48), (48, -6)]), fill=C, outline=O)
        d.rectangle(R(-36, -8, 36, 44), fill=_rgba(WHITE, a), outline=O, width=3)
        d.rectangle(R(-10, 14, 10, 44), fill=C)
        d.rectangle(R(18, 4, 30, 16), fill=_rgba((140, 200, 255), a))
    elif name == "shield":
        d.polygon(P([(0, -50), (42, -34), (38, 12), (0, 50), (-38, 12), (-42, -34)]), fill=C, outline=O)
        d.rectangle(R(-7, -26, 7, 22), fill=_rgba(WHITE, a))
        d.rectangle(R(-22, -9, 22, 5), fill=_rgba(WHITE, a))
    elif name == "calendar":
        d.rounded_rectangle(R(-44, -38, 44, 44), int(8 * s), fill=_rgba(WHITE, a), outline=O, width=3)
        d.rectangle(R(-44, -38, 44, -18), fill=C)
        for xx in (-24, 24):
            d.rounded_rectangle(R(xx - 4, -48, xx + 4, -30), 3, fill=O)
        for i in range(3):
            for j in range(4):
                d.rectangle(R(-32 + j * 18, -8 + i * 16, -24 + j * 18, -1 + i * 16), fill=_rgba((150, 160, 190), a))
    elif name == "building":
        d.rectangle(R(-34, -50, 34, 48), fill=_rgba((220, 228, 245), a), outline=O, width=3)
        for i in range(4):
            for j in range(3):
                d.rectangle(R(-24 + j * 18, -40 + i * 20, -14 + j * 18, -30 + i * 20), fill=C)
        d.rectangle(R(-8, 30, 8, 48), fill=O)
    elif name == "calculator":
        d.rounded_rectangle(R(-34, -48, 34, 48), int(8 * s), fill=_rgba((220, 228, 245), a), outline=O, width=3)
        d.rectangle(R(-24, -38, 24, -16), fill=_rgba((60, 90, 70), a))
        for i in range(3):
            for j in range(3):
                d.rounded_rectangle(R(-24 + j * 18, -8 + i * 18, -12 + j * 18, 4 + i * 18), 3, fill=C if (i + j) % 3 == 0 else O)
    elif name == "person":
        d.ellipse(R(-18, -48, 18, -12), fill=C, outline=O, width=3)
        d.pieslice(R(-38, -6, 38, 70), 180, 360, fill=C, outline=O, width=3)
    elif name == "doc":
        d.polygon(P([(-34, -48), (18, -48), (34, -32), (34, 48), (-34, 48)]), fill=_rgba(WHITE, a), outline=O)
        d.polygon(P([(18, -48), (18, -32), (34, -32)]), fill=_rgba((190, 200, 220), a))
        for yy in (-22, -6, 10, 26):
            d.line(P([(-22, yy), (22, yy)]), fill=_rgba((150, 160, 190), a), width=max(2, int(4 * s)))
        d.ellipse(R(6, 22, 30, 46), outline=C, width=max(2, int(5 * s)))
    elif name == "clock":
        d.ellipse(R(-46, -46, 46, 46), fill=_rgba(WHITE, a), outline=O, width=4)
        d.line(P([(0, 0), (0, -30)]), fill=O, width=max(3, int(6 * s)))
        d.line(P([(0, 0), (22, 10)]), fill=C, width=max(3, int(6 * s)))
    elif name == "coin":
        d.ellipse(R(-44, -44, 44, 44), fill=_rgba(GOLD_DARK, a))
        d.ellipse(R(-38, -38, 38, 38), fill=_rgba(GOLD, a))
        d.text((cx, cy), "¥", font=font(int(48 * s)), fill=_rgba(GOLD_DARK, a), anchor="mm")
    elif name == "check":
        d.line(P([(-30, 0), (-8, 24), (34, -26)]), fill=C, width=max(4, int(12 * s)), joint="curve")
    elif name == "piggy":
        d.ellipse(R(-48, -30, 40, 36), fill=_rgba((246, 170, 190), a), outline=O, width=3)
        d.ellipse(R(28, -10, 56, 14), fill=_rgba((240, 150, 175), a), outline=O, width=3)
        d.polygon(P([(-20, -26), (-8, -46), (0, -26)]), fill=_rgba((240, 150, 175), a), outline=O)
        for xx in (-30, 18):
            d.rectangle(R(xx, 28, xx + 12, 46), fill=_rgba((240, 150, 175), a), outline=O)
        d.rectangle(R(-14, -32, 10, -27), fill=O)
        d.ellipse(R(8, -14, 14, -8), fill=O)
    elif name == "plant":
        d.polygon(P([(-28, 10), (28, 10), (20, 50), (-20, 50)]), fill=_rgba((200, 110, 70), a), outline=O)
        for ang, ln in ((-40, 50), (0, 62), (40, 50), (-75, 36), (75, 36)):
            rad = math.radians(ang)
            tx, ty = 0 + ln * math.sin(rad), 10 - ln * math.cos(rad)
            d.line(P([(0, 10), (tx, ty)]), fill=_rgba((70, 170, 110), a), width=max(3, int(6 * s)))
            d.ellipse(R(tx - 12, ty - 8, tx + 12, ty + 8), fill=_rgba((80, 190, 120), a))
    elif name == "handshake":
        d.rounded_rectangle(R(-50, -14, 0, 14), 10, fill=C, outline=O, width=3)
        d.rounded_rectangle(R(0, -14, 50, 14), 10, fill=_rgba(SKIN, a), outline=O, width=3)
    else:
        d.ellipse(R(-40, -40, 40, 40), fill=C)
