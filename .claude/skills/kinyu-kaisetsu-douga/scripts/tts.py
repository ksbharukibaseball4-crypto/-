#!/usr/bin/env python3
"""Synthesize narration per scene and produce word (chunk) timestamps.

Backends (--engine):
  edge      Microsoft Edge neural TTS (edge-tts). Needs network access to
            speech.platform.bing.com. Gives real WordBoundary timestamps.
  openjtalk Offline Open JTalk (pyopenjtalk-plus). No network. Timestamps are
            estimated from mora counts + detected pauses (accuracy ~±0.1s).
  recorded  Use human-recorded WAVs: out/rec/scene_XX.wav (one per scene).
            Timestamps estimated like openjtalk.
  none      No narration. Subtitles are timed by reading speed (cps, default
            7 chars/s) and the track holds sound effects only (sfx.py).
  auto      edge if reachable, otherwise openjtalk (default).

Sound effects are added for every engine unless --no-sfx. Per scene you can
override with "sfx": ["coin", "chime", ...] (names in sfx.NAMED) or [] for none.

Outputs: <out>/audio.wav and <out>/timeline.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sfx import NAMED, scene_sfx  # noqa: E402
from common import MAX_SCENE, MIN_SCENE, PUNCT, load_spec, out_dir, parse_chunks  # noqa: E402

SR = 48000
LEAD = 0.12   # silence before narration inside each scene
TAIL = 0.18   # silence after narration inside each scene


# ---------------------------------------------------------------- helpers
def mora_count(reading: str) -> float:
    try:
        import pyopenjtalk
        n = sum(max(0, int(t["mora_size"])) for t in pyopenjtalk.run_frontend(reading))
    except Exception:
        n = 0
    if n == 0:
        n = sum(1 for c in reading if c not in PUNCT + " 　")
    return max(1.0, float(n))


def decode_to_array(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def voiced_mask(x: np.ndarray, hop: int = 480) -> np.ndarray:
    n = len(x) // hop
    if n == 0:
        return np.zeros(0, bool)
    rms = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    thr = max(rms.max() * 0.06, 1e-4)
    return rms > thr


def speech_bounds(x: np.ndarray, hop: int = 480) -> tuple[int, int]:
    v = voiced_mask(x, hop)
    idx = np.nonzero(v)[0]
    if len(idx) == 0:
        return 0, len(x)
    return max(0, idx[0] * hop - hop), min(len(x), (idx[-1] + 2) * hop)


def estimate_times(x: np.ndarray, chunks: list[dict]) -> list[tuple[float, float]]:
    """Estimate chunk (start,end) seconds within already-trimmed speech x."""
    hop = 480
    dur = len(x) / SR
    v = voiced_mask(x, hop)
    # internal silences >= 120 ms
    sil = []
    i = 0
    while i < len(v):
        if not v[i]:
            j = i
            while j < len(v) and not v[j]:
                j += 1
            if i > 0 and j < len(v) and (j - i) * hop / SR >= 0.12:
                sil.append((i * hop / SR, j * hop / SR))
            i = j
        else:
            i += 1
    pause_after = [k for k, c in enumerate(chunks[:-1]) if c["reading"].rstrip()[-1:] in PUNCT]
    morae = [mora_count(c["reading"]) for c in chunks]

    groups: list[list[int]] = []
    bounds: list[tuple[float, float]] = []
    if pause_after and len(sil) >= len(pause_after):
        chosen = sorted(sorted(sil, key=lambda s: s[1] - s[0], reverse=True)[: len(pause_after)])
        starts = [0.0] + [s[1] for s in chosen]
        ends = [s[0] for s in chosen] + [dur]
        cuts = [-1] + pause_after + [len(chunks) - 1]
        for g in range(len(cuts) - 1):
            groups.append(list(range(cuts[g] + 1, cuts[g + 1] + 1)))
            bounds.append((starts[g], ends[g]))
    else:
        groups = [list(range(len(chunks)))]
        bounds = [(0.0, dur)]

    times: list[tuple[float, float]] = [(0.0, 0.0)] * len(chunks)
    for g, (a, b) in zip(groups, bounds):
        total = sum(morae[k] for k in g)
        t = a
        for k in g:
            d = (b - a) * morae[k] / total
            times[k] = (t, t + d)
            t += d
    return times


# ---------------------------------------------------------------- engines
def synth_openjtalk(text: str, cfg: dict) -> np.ndarray:
    import pyopenjtalk
    y, sr = pyopenjtalk.tts(text, speed=float(cfg.get("speed", 1.15)),
                            half_tone=float(cfg.get("half_tone", 0.0)))
    y = y.astype(np.float32) / 32768.0
    if sr != SR:
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        write_wav(tmp, y, sr)
        y = decode_to_array(tmp)
    return y


def synth_edge(text: str, cfg: dict) -> tuple[np.ndarray, list[dict]]:
    import edge_tts

    voice = cfg.get("voice", "ja-JP-NanamiNeural")
    rate = cfg.get("rate", "+10%")
    audio = bytearray()
    bounds: list[dict] = []

    async def run():
        try:
            com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
        except TypeError:  # older edge-tts
            com = edge_tts.Communicate(text, voice, rate=rate)
        async for ch in com.stream():
            if ch["type"] == "audio":
                audio.extend(ch["data"])
            elif ch["type"] in ("WordBoundary", "SentenceBoundary"):
                bounds.append({"text": ch["text"], "start": ch["offset"] / 1e7,
                               "end": (ch["offset"] + ch["duration"]) / 1e7})

    asyncio.run(asyncio.wait_for(run(), timeout=60))
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
    Path(tmp).write_bytes(bytes(audio))
    return decode_to_array(tmp), bounds


def edge_chunk_times(chunks, bounds, offset) -> list[tuple[float, float]] | None:
    reading = "".join(c["reading"] for c in chunks)
    spans, pos = [], 0
    for c in chunks:
        spans.append((pos, pos + len(c["reading"])))
        pos += len(c["reading"])
    located = []
    cur = 0
    for b in bounds:
        t = b["text"].strip()
        if not t:
            continue
        p = reading.find(t, cur)
        if p < 0:
            continue
        located.append((p, p + len(t), b["start"] - offset, b["end"] - offset))
        cur = p + len(t)
    if not located:
        return None
    out: list = []
    for a, z in spans:
        hit = [l for l in located if l[0] < z and l[1] > a]
        out.append((min(h[2] for h in hit), max(h[3] for h in hit)) if hit else None)
    # fill chunks without boundaries (punctuation-only etc.)
    for k in range(len(out)):
        if out[k] is None:
            prev = out[k - 1][1] if k > 0 and out[k - 1] else 0.0
            out[k] = (prev, prev + 0.05)
    return [(max(0.0, a), max(0.0, b)) for a, b in out]


def edge_reachable() -> bool:
    try:
        import edge_tts  # noqa: F401
        x, _ = synth_edge("テスト", {})
        return len(x) > 0
    except Exception:
        return False


# ---------------------------------------------------------------- io
def write_wav(path, y: np.ndarray, sr: int = SR):
    import wave
    pcm = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", help="scenes.json")
    ap.add_argument("--out", default="out")
    ap.add_argument("--engine", default="auto", choices=["auto", "edge", "openjtalk", "recorded", "none"])
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--cps", type=float, default=None, help="none: reading speed chars/sec")
    a = ap.parse_args()

    spec = load_spec(a.spec)
    out = out_dir(a.out)
    cfg = spec.get("voice", {})
    engine = a.engine
    if engine == "auto":
        engine = "edge" if edge_reachable() else "openjtalk"
    print(f"[tts] engine = {engine}")

    pieces, scenes_tl, t0, sent = [], [], 0.0, 0
    for si, sc in enumerate(spec["scenes"]):
        chunks = parse_chunks(sc["text"])
        reading = "".join(c["reading"] for c in chunks)
        bounds = None
        if engine == "none":
            cps = a.cps or float(cfg.get("cps", 7.0))
            lens = [max(1, len(re.sub(r"[、。？！?!\s]", "", c["display"]))) for c in chunks]
            read = sum(lens) / cps
            speech = np.zeros(int(read * SR), np.float32)
            times, acc = [], 0.0
            for n in lens:
                times.append((acc, acc + n / cps))
                acc += n / cps
        if engine == "none":
            y = None
        elif engine == "edge":
            y, bounds = synth_edge(reading, cfg)
        elif engine == "recorded":
            y = decode_to_array(str(out / "rec" / f"scene_{si + 1:02d}.wav"))
        else:
            y = synth_openjtalk(reading, cfg)
        if engine != "none":
            a0, a1 = speech_bounds(y)
            speech = y[a0:a1]
            times = edge_chunk_times(chunks, bounds, a0 / SR) if bounds else None
            if times is None:
                times = estimate_times(speech, chunks)
        sp_dur = len(speech) / SR
        tail = 0.6 if engine == "none" else TAIL   # time to finish reading
        dur = max(MIN_SCENE, float(sc.get("min_duration", 0)), LEAD + sp_dur + tail)
        if dur > MAX_SCENE + 1e-6:
            print(f"[tts] 警告: シーン{si + 1} が {dur:.2f}s（4秒超）。分割してください。")
        buf = np.zeros(int(round(dur * SR)), np.float32)
        buf[int(LEAD * SR): int(LEAD * SR) + len(speech)] = speech
        if not a.no_sfx:
            fx = 0.45 if engine != "none" else 1.0
            vis = sc.get("visual", {})
            if "sfx" in sc:
                cues = [(0.05 + 0.25 * k, NAMED[n]()) for k, n in enumerate(sc["sfx"])]
            else:
                cues = scene_sfx(vis, dur, si)
            for off, smp in cues:
                i0 = int(off * SR)
                seg = smp[: max(0, len(buf) - i0)]
                buf[i0:i0 + len(seg)] += seg * fx
        pieces.append(buf)
        ctl = []
        for c, (s, e) in zip(chunks, times):
            ctl.append({"display": c["display"], "reading": c["reading"], "sentence": sent,
                        "start": round(t0 + LEAD + s, 3), "end": round(t0 + LEAD + e, 3)})
            if c["display"].rstrip()[-1:] in "。？！?!":
                sent += 1
        if ctl and ctl[-1]["display"].rstrip()[-1:] not in "。？！?!":
            sent += 1
        scenes_tl.append({"index": si, "start": round(t0, 3), "end": round(t0 + dur, 3),
                          "speech": round(sp_dur, 3), "chunks": ctl})
        t0 += len(buf) / SR

    audio = np.concatenate(pieces)
    peak = float(np.abs(audio).max() or 0)
    if peak > 0:
        audio = audio * (0.89 / peak)
    write_wav(out / "audio.wav", audio)
    tl = {"engine": engine, "duration": round(len(audio) / SR, 3), "fps": 30, "scenes": scenes_tl}
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[tts] {len(scenes_tl)} scenes, {tl['duration']:.2f}s -> {out/'audio.wav'}, {out/'timeline.json'}")


if __name__ == "__main__":
    main()
