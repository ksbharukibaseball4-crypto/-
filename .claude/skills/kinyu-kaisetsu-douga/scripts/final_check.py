#!/usr/bin/env python3
"""Final technical check of <out>/video.mp4 and a contact sheet for visual review.

Checks: 1080x1920, 30fps, H.264 + AAC, duration (60-90s or --test), loudness,
no frozen picture >= 3s (ffmpeg freezedetect).  Writes <out>/check/sheet.jpg
(frames every ~2s, red = TikTok UI zones) for Claude / the user to eyeball.
Usage: final_check.py scenes.json --out out [--test]
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import FPS, H, SAFE_BOTTOM, SAFE_RIGHT, W, font  # noqa: E402


def probe(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(p)],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", default="out")
    ap.add_argument("--test", action="store_true")
    a = ap.parse_args()
    out = Path(a.out)
    vid = out / "video.mp4"
    errs, info = [], []
    pr = probe(vid)
    v = next(s for s in pr["streams"] if s["codec_type"] == "video")
    au = [s for s in pr["streams"] if s["codec_type"] == "audio"]
    dur = float(pr["format"]["duration"])
    num, den = map(int, v["r_frame_rate"].split("/"))
    if (v["width"], v["height"]) != (W, H):
        errs.append(f"解像度 {v['width']}x{v['height']}")
    if abs(num / den - FPS) > 0.01:
        errs.append(f"fps {num/den}")
    if v["codec_name"] != "h264" or v.get("pix_fmt") != "yuv420p":
        errs.append(f"映像 {v['codec_name']}/{v.get('pix_fmt')}")
    if not au or au[0]["codec_name"] != "aac":
        errs.append("音声(AAC)がない")
    if not a.test and not (60 <= dur <= 90):
        errs.append(f"尺 {dur:.1f}s（60〜90秒）")
    info.append(f"{v['width']}x{v['height']} {num/den:.0f}fps {dur:.2f}s video={v['codec_name']} audio={au[0]['codec_name'] if au else None}")

    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(vid), "-vf", "freezedetect=n=0.0005:d=3",
                        "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    fz = re.findall(r"freeze_duration: ([\d.]+)", r.stderr)
    if fz:
        errs.append(f"3秒以上止まっている箇所あり: {fz}")
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    if m:
        lufs = float(m[-1])
        info.append(f"loudness {lufs} LUFS (目標 -14)")
        if abs(lufs + 14) > 2:
            errs.append(f"ラウドネス {lufs} LUFS")

    # contact sheet
    chk = out / "check"
    chk.mkdir(exist_ok=True)
    step = 2.0 if dur > 12 else 0.5
    times = [round(t * step + step / 2, 2) for t in range(int(dur // step))] or [dur / 2]
    thumbs = []
    for t in times:
        p = chk / f"f_{t:06.2f}.png"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(t), "-i", str(vid), "-frames:v", "1",
                        "-vf", "scale=270:480", str(p)], check=True)
        im = Image.open(p).convert("RGBA")
        d = ImageDraw.Draw(im, "RGBA")
        d.rectangle((SAFE_RIGHT // 4, 0, 270, 480), fill=(255, 0, 0, 60))
        d.rectangle((0, SAFE_BOTTOM // 4, 270, 480), fill=(255, 0, 0, 60))
        d.text((6, 4), f"{t:.1f}s", font=font(20), fill=(255, 255, 0, 255))
        thumbs.append(im.convert("RGB"))
    cols = 6
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 274, rows * 484), (30, 30, 30))
    for i, im in enumerate(thumbs):
        sheet.paste(im, ((i % cols) * 274 + 2, (i // cols) * 484 + 2))
    sheet.save(chk / "sheet.jpg", quality=88)
    for f in chk.glob("f_*.png"):
        f.unlink()

    for x in info:
        print("[final]", x)
    print(f"[final] contact sheet -> {chk / 'sheet.jpg'}（赤＝TikTok UIで隠れる領域。重要要素が入っていないか目視）")
    for e in errs:
        print("[ERROR]", e)
    print("[final] 目視チェック: 字幕と音声のズレ / 増加=緑・減少=赤 / 時点表記 / PR表示 / 最後の免責文")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
