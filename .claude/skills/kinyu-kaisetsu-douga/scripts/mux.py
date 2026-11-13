#!/usr/bin/env python3
"""Combine <out>/visual.mp4 + <out>/audio.wav (+ optional BGM) -> <out>/video.mp4 with ffmpeg.

Loudness is normalised to -14 LUFS (TikTok / Shorts). BGM is ducked to -22 dB under voice.
Usage: mux.py --out out [--bgm path/to/bgm.mp3]
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

TARGET = "I=-14:TP=-1.5:LRA=11"


def measure(inputs, pre):
    """Pass 1 of two-pass loudnorm: returns the measured_* argument string."""
    r = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", *inputs, "-filter_complex",
                        f"{pre}loudnorm={TARGET}:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    j = json.loads(re.findall(r"\{[^{}]+\}", r.stderr)[-1])
    return (f"measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:"
            f"measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--bgm", default=None)
    a = ap.parse_args()
    out = Path(a.out)
    dur = json.loads((out / "timeline.json").read_text(encoding="utf-8"))["duration"]
    audio_in = ["-i", str(out / "audio.wav")]
    if a.bgm:
        audio_in += ["-stream_loop", "-1", "-i", a.bgm]

    def pre(base):  # base = index of the narration input
        if a.bgm:
            return (f"[{base + 1}:a]volume=-22dB[b];"
                    f"[{base}:a][b]amix=inputs=2:duration=first:normalize=0,")
        return f"[{base}:a]"

    m = measure(audio_in, pre(0))                       # pass 1: audio inputs only
    fc = f"{pre(1)}loudnorm={TARGET}:{m},aresample=48000[a]"  # pass 2: after the video input
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(out / "visual.mp4"), *audio_in,
           "-filter_complex", fc, "-map", "0:v", "-map", "[a]"]
    cmd += ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-t", f"{dur:.3f}",
            "-movflags", "+faststart", str(out / "video.mp4")]
    subprocess.run(cmd, check=True)
    print(f"[mux] -> {out / 'video.mp4'}")


if __name__ == "__main__":
    main()
