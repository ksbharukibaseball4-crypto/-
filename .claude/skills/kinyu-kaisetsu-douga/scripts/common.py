"""Shared constants and helpers for kinyu-kaisetsu-douga (financial explainer shorts)."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# ---- Video spec ---------------------------------------------------------
W, H, FPS = 1080, 1920, 30

# TikTok/Shorts UI covers the right 15% and the bottom 25%.
SAFE_RIGHT = int(W * 0.85)      # 918: nothing important at x >= this
SAFE_BOTTOM = int(H * 0.75)     # 1440: nothing important at y >= this
SAFE_LEFT = W - SAFE_RIGHT      # 162: symmetric margins so the layout looks centered
SAFE_TOP = 150                  # top tabs ("Following / For You")
SAFE_CX = W // 2                # 540: content is centered on the real screen center

# Subtitles: top center (inside the safe area)
SUB_TOP = 210
SUB_BOTTOM = 470
# Main visual area
VIS_TOP = 500
VIS_BOTTOM = 1090
# Character stage (people illustrations + speech bubble with notes)
STAGE_TOP = 1100
FLOOR_Y = 1440

# ---- Palette -------------------------------------------------------------
NAVY_TOP = (8, 18, 48)
NAVY_BOTTOM = (14, 34, 82)
NAVY_CARD = (24, 46, 102)
GOLD = (242, 194, 72)
GOLD_LIGHT = (255, 226, 140)
GOLD_DARK = (176, 128, 30)
WHITE = (245, 247, 252)
MUTED = (160, 176, 210)
UP = (46, 204, 113)      # increase = green
DOWN = (235, 77, 75)     # decrease = red
BILL = (120, 170, 120)

PUNCT = "、。？！?!，．,."
MIN_SCENE, MAX_SCENE = 2.0, 4.0
DISCLAIMER = "情報提供目的です。投資判断はご自身で"

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "C:/Windows/Fonts/meiryob.ttc",
]


def find_font() -> str:
    env = os.environ.get("KKD_FONT")
    if env and Path(env).exists():
        return env
    for c in FONT_CANDIDATES:
        if Path(c).exists():
            return c
    sys.exit("日本語フォントが見つかりません。KKD_FONT=/path/to/font.ttf を指定してください。")


_font_cache: dict = {}


def font(size: int):
    from PIL import ImageFont
    key = int(size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(find_font(), key)
    return _font_cache[key]


# ---- Spec / chunk parsing -----------------------------------------------
RUBY = re.compile(r"\{([^|{}]+)\|([^{}]+)\}")


def load_spec(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def parse_chunks(text: str) -> list[dict]:
    """Split narration into highlight chunks.

    Syntax: chunks separated by '/', reading override with {表示|よみ}.
    e.g. "{100万円|ひゃくまんえん}なら/約/134万円です。"
    Returns [{"display": str, "reading": str}].  If no '/' is present an
    automatic split (Open JTalk morphemes, particles merged) is attempted.
    """
    if "/" not in text:
        text = auto_slash(text)
    out = []
    for raw in text.split("/"):
        raw = raw.strip()
        if not raw:
            continue
        display = RUBY.sub(lambda m: m.group(1), raw)
        reading = RUBY.sub(lambda m: m.group(2), raw)
        out.append({"display": display, "reading": reading})
    return out


def display_text(text: str) -> str:
    return "".join(c["display"] for c in parse_chunks(text))


def auto_slash(text: str) -> str:
    """Best-effort bunsetsu-like split. Falls back to splitting at '、'."""
    if RUBY.search(text):
        return text.replace("、", "、/")
    try:
        import pyopenjtalk
        toks = pyopenjtalk.run_frontend(text)
    except Exception:
        return text.replace("、", "、/")
    if "".join(t["string"] for t in toks) != text:  # numbers get normalised
        return text.replace("、", "、/")
    chunks: list[str] = []
    for t in toks:
        attach = t["pos"] in ("助詞", "助動詞", "記号") or t["pos_group1"] in ("接尾", "非自立")
        if chunks and attach:
            chunks[-1] += t["string"]
        else:
            chunks.append(t["string"])
    return "/".join(chunks)


def split_sentences(display: str) -> list[str]:
    parts = re.findall(r"[^。？！?!]+[。？！?!]?", display)
    return [p for p in (s.strip() for s in parts) if p]


def out_dir(arg: str | None) -> Path:
    p = Path(arg or "out")
    p.mkdir(parents=True, exist_ok=True)
    return p
