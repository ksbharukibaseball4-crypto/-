#!/usr/bin/env python3
"""One-shot pipeline: lint -> (approval gate) -> TTS -> timing check -> render -> mux -> final check.

Usage:
  build.py out/scenes.json --out out [--save projects/<動画名>] [--engine auto|edge|openjtalk|recorded|none] [--no-sfx] [--bgm file] [--test]

The gate: <out>/APPROVED must exist (create it only after the user approved out/script.md).
--test skips the gate and the 60-90s / structure rules (for 5s smoke tests).
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(*args):
    print("$", " ".join(map(str, args)), flush=True)
    r = subprocess.run([sys.executable, *map(str, args)])
    if r.returncode != 0:
        sys.exit(f"失敗: {args[0]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", default="out")
    ap.add_argument("--engine", default="auto")
    ap.add_argument("--bgm", default=None)
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--save", default=None,
                    help="完成後に入力と成果物をこのフォルダ（例 projects/<動画名>）へコピーして残す")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    t = ["--test"] if a.test else []
    run(HERE / "check_script.py", a.spec, "--out", out, *t)
    if not a.test and not (out / "APPROVED").exists():
        sys.exit(f"台本が未承認です。ユーザーの承認後に {out/'APPROVED'} を作成してください。")
    run(HERE / "tts.py", a.spec, "--out", out, "--engine", a.engine, *(["--no-sfx"] if a.no_sfx else []))
    run(HERE / "check_script.py", a.spec, "--out", out, "--timeline", *t)
    import json
    if json.loads(Path(a.spec).read_text(encoding="utf-8")).get("renderer") == "3d":
        r3 = HERE.parent / "render3d"
        if not (r3 / "node_modules" / "three").exists():
            subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=r3, check=True)
        print("$ node render3d.js", a.spec, flush=True)
        if subprocess.run(["node", str(r3 / "render3d.js"), str(a.spec), "--out", str(out), "--workers", "3"]).returncode:
            sys.exit("失敗: render3d.js")
    else:
        run(HERE / "render.py", a.spec, "--out", out)
    run(HERE / "mux.py", "--out", out, *(["--bgm", a.bgm] if a.bgm else []))
    run(HERE / "final_check.py", a.spec, "--out", out, *t)
    print(f"完成: {out / 'video.mp4'}")
    if a.save:
        save(out, Path(a.spec), Path(a.save))


def save(out: Path, spec: Path, dest: Path):
    """Copy inputs + deliverables to a folder that is committed to git (out/ is ignored)."""
    import shutil
    dest.mkdir(parents=True, exist_ok=True)
    files = [(spec, "scenes.json"), (out / "script.md", "script.md"), (out / "sources.md", "sources.md"),
             (out / "video.mp4", "video.mp4"), (out / "check" / "sheet.jpg", "sheet.jpg")]
    for src, name in files:
        if src.exists() and src.resolve() != (dest / name).resolve():
            shutil.copy2(src, dest / name)
    print(f"保存: {dest}/ (scenes.json, script.md, sources.md, video.mp4, sheet.jpg) → git add してコミットすること")


if __name__ == "__main__":
    main()
