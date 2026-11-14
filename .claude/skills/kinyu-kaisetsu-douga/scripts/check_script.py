#!/usr/bin/env python3
"""Lint scenes.json against the 台本 / 規制 rules (kisei.md, daihon.md).

Usage: check_script.py scenes.json [--out out] [--test] [--timeline]
  --test      5-10s test video: skip length / structure / disclaimer-scene rules
  --timeline  also check scene durations from <out>/timeline.json (after tts.py)
Exit code 1 if any ERROR.
"""
from __future__ import annotations

import argparse
import ast
import json
import operator
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import MAX_SCENE, MIN_SCENE, display_text, load_spec, split_sentences  # noqa: E402

MAX_CHARS = 20

# (pattern, message) — 断定・保証・売買推奨・煽り
NG = [
    (r"必ず(増|儲|もうか|上が|勝|得)", "断定表現（必ず〜）"),
    (r"絶対(に)?(増|儲|もうか|上が|損し|得)", "断定表現（絶対〜）"),
    (r"確実に(増|儲|もうか|上が|勝|得)", "断定表現（確実に〜）"),
    (r"(損|失敗)(しません|しない|はない)", "断定表現（損しない）"),
    (r"利回り(を|が)?保証|保証(します|された|付き)?利回り|配当保証|利益保証", "利回り・利益の保証"),
    (r"ノーリスク|リスク(が)?(ゼロ|なし|ありません)", "リスクがないとの表示"),
    (r"(買う|売る)べき|買い時|売り時|今すぐ(買|売)|(買|売)いましょう|おすすめ(の)?銘柄|推奨銘柄|狙い目", "売買推奨"),
    (r"爆上げ|爆益|一攫千金|億り人|放置で(儲|稼)|誰でも(儲|稼)", "射幸心をあおる表現"),
]
WARN = [
    (r"元本保証", "「元本保証」は預金・個人向け国債など対象を明示した場合のみ。投資商品には使わない"),
    (r"(株式会社|ホールディングス|\(\d{4}\)|（\d{4}）|証券コード)", "個別企業名／銘柄コードの可能性。売買推奨に見えないか確認"),
    (r"(儲か|稼げ)", "射幸的に聞こえないか確認"),
]
ASOF_RE = re.compile(r"\d{4}年\d{1,2}月(\d{1,2}日)?時点")
DIGIT = re.compile(r"[0-9０-９]|[一二三四五六七八九十百千万億兆]+(円|%|％|年|倍)")

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod}


def safe_eval(expr: str) -> float:
    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.operand))
        if isinstance(n, ast.Call) and getattr(n.func, "id", "") in ("round", "int", "floor"):
            import math
            f = {"round": round, "int": int, "floor": math.floor}[n.func.id]
            return f(*[ev(a) for a in n.args])
        raise ValueError(f"使えない式: {ast.dump(n)[:60]}")
    return ev(ast.parse(expr.replace("_", ""), mode="eval"))


def strings_in(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k not in ("type", "color", "label_color"):
                yield from strings_in(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings_in(v)


def has_number(obj) -> bool:
    if isinstance(obj, (int, float)) and not isinstance(obj, bool):
        return True
    return any(DIGIT.search(s) for s in strings_in(obj))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", default="out")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--timeline", action="store_true")
    a = ap.parse_args()
    spec = load_spec(a.spec)
    out = Path(a.out)
    errs, warns = [], []

    def E(m): errs.append(m)
    def Wn(m): warns.append(m)

    scenes = spec.get("scenes", [])
    if not scenes:
        E("scenes が空です")
    if "pr" not in spec:
        E('"pr": true/false を必ず明示（案件ならtrue→PR表示）')
    asof = spec.get("asof", "")
    any_num = False

    for i, sc in enumerate(scenes, 1):
        disp = display_text(sc.get("text", ""))
        if not disp:
            E(f"シーン{i}: ナレーションが空")
        for s in split_sentences(disp):
            n = len(re.sub(r"[。？！?!、]", "", s))
            if n > MAX_CHARS:
                E(f"シーン{i}: 1文{n}字（20字以内）「{s}」")
        if not s_desu(disp) and not str(sc.get("visual", {}).get("type", "")).startswith(("hook", "money_hook", "disclaimer")):
            Wn(f"シーン{i}: です・ます調か確認「{disp}」")
        texts = [disp] + list(strings_in(sc.get("visual", {}))) + [sc.get("note", "")]
        blob = "\n".join(texts)
        for pat, msg in NG:
            m = re.search(pat, blob)
            if m:
                E(f"シーン{i}: NG表現 {msg}「{m.group(0)}」")
        for pat, msg in WARN:
            m = re.search(pat, blob)
            if m:
                Wn(f"シーン{i}: {msg}「{m.group(0)}」")
        if has_number(sc.get("visual", {})) or DIGIT.search(disp):
            any_num = True
            if not sc.get("asof") and not str(sc.get("visual", {}).get("type", "")).startswith("disclaimer"):
                E(f'シーン{i}: 数字があるので "asof": true（〇年〇月時点の表示）が必要')
        if "calc" in sc:
            c = sc["calc"]
            try:
                got = safe_eval(c["expr"])
                tol = float(c.get("tol", 0.5))
                if abs(got - float(c["expect"])) > tol:
                    E(f"シーン{i}: 検算NG {c['expr']} = {got:,.4f} ≠ {c['expect']}")
                else:
                    print(f"[check] 検算OK シーン{i}: {c['expr']} = {got:,.2f}")
            except Exception as ex:
                E(f"シーン{i}: calc を評価できません ({ex})")
        elif re.search(r"万円なら|円なら|円を", disp) and DIGIT.search(disp):
            E(f'シーン{i}: 具体例には "calc": {{"expr":..,"expect":..}} で検算を付ける')
        v = sc.get("visual", {})
        if v.get("type") == "steps" and len(v.get("steps", [])) > 3:
            E(f"シーン{i}: 仕組みは3ステップ以内")

    if any_num and not ASOF_RE.search(asof):
        E('トップレベル "asof": "2026年11月時点" の形式で日付が必要')
    all_text = "".join(display_text(s.get("text", "")) for s in scenes)
    if not a.test:
        last = scenes[-1] if scenes else {}
        lt = display_text(last.get("text", ""))
        if not str(last.get("visual", {}).get("type", "")).startswith("disclaimer") or "情報提供目的" not in lt or "投資判断はご自身で" not in lt:
            E("最後のシーンは disclaimer で「情報提供目的です。投資判断はご自身で」を読み上げる")
        roles = [s.get("role") for s in scenes]
        for r in ("hook", "premise", "mechanism", "example", "summary", "disclaimer"):
            if r not in roles:
                E(f'role "{r}" のシーンがありません（フック→前提→仕組み→具体例→まとめ→注意書き）')
        if roles and roles[0] != "hook":
            E("最初のシーンは role=hook（0〜3秒のフック）")
        first = display_text(scenes[0].get("text", "")) if scenes else ""
        if not (re.search(r"[？?]", first) or DIGIT.search(first)):
            Wn("フックに意外な数字か疑問（？）を入れる")
        if not (out / "sources.md").exists():
            E(f"{out/'sources.md'} がありません（出典と取得日）")
    else:
        if "情報提供目的" not in all_text and not any(
                "情報提供目的" in s for sc in scenes for s in strings_in([sc.get("visual", {}), sc.get("note", "")])):
            Wn("テストでも免責文の画面表示を推奨")
    if (out / "sources.md").exists():
        src = (out / "sources.md").read_text(encoding="utf-8")
        if not re.search(r"\d{4}[-/年]\d{1,2}[-/月]\d{1,2}", src):
            E("sources.md に確認日（YYYY-MM-DD）がありません")

    if a.timeline:
        tl = json.loads((out / "timeline.json").read_text(encoding="utf-8"))
        for s in tl["scenes"]:
            d = s["end"] - s["start"]
            if d > MAX_SCENE + 0.05 or d < MIN_SCENE - 0.05:
                E(f"シーン{s['index'] + 1}: {d:.2f}秒（2〜4秒）→ 文を分割/結合")
        if tl["scenes"] and tl["scenes"][0]["chunks"]:
            hook_end = tl["scenes"][0]["end"]
            if hook_end > 3.05:
                E(f"フックが {hook_end:.2f}秒で終わる（0〜3秒以内に）")
        if not a.test and not (60 <= tl["duration"] <= 90):
            E(f"全体 {tl['duration']:.1f}秒（60〜90秒）")
        print(f"[check] 尺 {tl['duration']:.2f}s / {len(tl['scenes'])} シーン")

    for w in warns:
        print("[WARN ]", w)
    for e in errs:
        print("[ERROR]", e)
    print(f"[check] errors={len(errs)} warnings={len(warns)}")
    sys.exit(1 if errs else 0)


def s_desu(t: str) -> bool:
    sents = split_sentences(t)
    ok = ("です", "ます", "ません", "でした", "ました", "ですか", "ますか", "でしょう", "ください", "ましょう")
    return all(re.sub(r"[。？！?!、]+$", "", s).endswith(ok) or s.endswith(("？", "?")) for s in sents)


if __name__ == "__main__":
    main()
