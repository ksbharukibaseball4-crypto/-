---
name: kinyu-kaisetsu-douga
description: 金融・お金のテーマ（複利、NISA、iDeCo、金利、税金、インフレ等）を、60〜90秒・1080x1920・30fpsの縦型解説動画（TikTok / YouTube Shorts / リール）にする。公式情報での数字確認→台本（ユーザー承認制）→音声合成＋単語タイムスタンプ→コード描画のシーン→単語ハイライト字幕→ffmpeg結合→最終チェックまで行う。「金融の縦型動画」「お金の解説ショート」「〇〇を60秒で解説する動画」などで使う。
---

# 金融解説 縦型動画（kinyu-kaisetsu-douga）

60〜90秒 / 1080x1920 / 30fps の金融解説ショート動画を作る。
詳細ルールは同じフォルダの3ファイルにある。**該当ステップの前に必ず読むこと。**

| ファイル | 内容 | 読むタイミング |
|---|---|---|
| `daihon.md` | 台本の構成・文体ルール、`scenes.json` の書き方 | 手順3 |
| `enshutsu.md` | 色・レイアウト・セーフエリア・シーン種類と動き | 手順3・5・8 |
| `kisei.md` | 規制・表現ルール、NG表現、免責・PR・時点表記 | 手順2・3・8 |

スクリプトは `scripts/`（以下 `S=.claude/skills/kinyu-kaisetsu-douga/scripts`）。出力はすべて `out/`（別の場所にするなら全コマンドで `--out` を揃える）。

## 初回セットアップ

```bash
pip install -r $S/requirements.txt     # Pillow, numpy, pyopenjtalk-plus, edge-tts
ffmpeg -version                        # 必須（未導入なら apt-get install -y ffmpeg）
```
日本語フォントは自動検出。見つからなければ `KKD_FONT=/path/to/font.ttf` を指定する。

## 手順

### 1. テーマ受付
ユーザーに確認する（分かっている項目は聞かない）:
- テーマ（例「複利ってなに？」）と想定視聴者（初心者向けか）
- **案件（広告・PR）かどうか** → `scenes.json` の `"pr"` に反映。不明なら必ず聞く
- 尺の希望（既定 60〜90 秒）、BGM ファイルの有無

### 2. 公式情報で数字を確認 → `out/sources.md`
- 動画に出す数字・制度は、すべて**一次情報（公式）**で確認する。優先順: 金融庁 / 日本銀行 / 財務省 / 国税庁 / 総務省統計局 / J-FLEC / GPIF / 取引所（JPX）/ 商品提供会社の公式ページ。まとめサイトやSNSは出典にしない。
- 調べ方: WebSearch、ページ本文は web-fetch（WebFetch）で読む。`curl` はネットワーク制限で失敗することがある。
- 取れなかった数字は使わない。台本からその数字を外すか、ユーザーに確認する。
- 書式（必須）:
  ```markdown
  # 出典（テーマ名）
  確認日: 2026-11-13

  | # | 数字・事実 | 動画での使い方 | 出典（ページ名） | URL | 公表日・時点 |
  |---|---|---|---|---|---|
  | 1 | NISA 年間投資枠 360万円 | シーン5 | 金融庁「NISA特設ウェブサイト」 | https://... | 2026年11月時点 |

  ## 仮定値（公式データではない）
  - 年利3%: 説明用の仮定。動画内に「※年3%と仮定」を表示
  ```

### 3. 台本 → `out/script.md` と `out/scenes.json` → **承認待ち**
1. `daihon.md` に従って書く。`out/script.md` は人間が読む台本（シーン表）、`out/scenes.json` は描画用の仕様。内容は一致させる。
2. 具体例（「100万円なら」等）は Python で検算し、`scenes.json` の `calc` に式と期待値を入れる。
3. リントする（エラー0になるまで直す）:
   ```bash
   python3 $S/check_script.py out/scenes.json --out out
   ```
4. `out/script.md` の内容をチャットに要約して見せ、**ユーザーの承認を待つ。承認前に手順4以降へ進まない。**
5. 承認されたら `touch out/APPROVED`。承認後に台本を変えたら `out/APPROVED` を消して再承認を得る。

### 4〜8. 音声合成 → 描画 → 字幕 → 結合 → チェック（一括）
```bash
python3 $S/build.py out/scenes.json --out out [--engine auto|edge|openjtalk|recorded] [--bgm bgm.mp3]
```
`build.py` は次を順に実行する（個別実行も可）:

| # | スクリプト | 出力 |
|---|---|---|
| 4 音声合成＋単語タイムスタンプ | `tts.py scenes.json --out out --engine auto` | `audio.wav`, `timeline.json` |
| — 尺チェック（2〜4秒/シーン、フック3秒以内、全体60〜90秒） | `check_script.py ... --timeline` | |
| 5・6 シーン描画＋単語ハイライト字幕 | `render.py scenes.json --out out` | `visual.mp4` |
| 7 ffmpeg 結合（-14 LUFS 2パス正規化） | `mux.py --out out [--bgm f]` | `video.mp4` |
| 8 最終チェック | `final_check.py scenes.json --out out` | `check/sheet.jpg` |

尺チェックでシーンが4秒を超えたら、そのシーンの文を2シーンに分けて手順3に戻る（文言が変わるなら再承認）。

### 8. 最終チェック（必ず目で見る）
- `final_check.py` のエラー（解像度・fps・音声・尺・ラウドネス・3秒以上の静止）を0にする。
- `out/check/sheet.jpg` を Read で開いて目視（赤い部分＝TikTok UIで隠れる領域）。気になる時刻は
  `render.py scenes.json --out out --still 12.5` で1枚を拡大確認。
- `kisei.md` 末尾のチェックリストを1項目ずつ確認し、結果をユーザーに報告する。

## 音声合成エンジン（`--engine`）
| engine | 必要なもの | タイムスタンプ | 備考 |
|---|---|---|---|
| `edge` | `speech.platform.bing.com` への通信 | 実測（WordBoundary） | 自然なニューラル音声（既定 ja-JP-NanamiNeural） |
| `openjtalk` | なし（オフライン） | 推定（モーラ数＋無音検出、±0.1秒程度） | 合成音声らしさが残る。ネット制限下の代替 |
| `recorded` | `out/rec/scene_01.wav`… をシーンごとに用意 | 推定 | 人の声で収録する場合 |
| `auto` | — | — | edge が使えれば edge、ダメなら openjtalk |

ネットワーク制限で `edge` が使えない場合は、ユーザーに次を提案する:
1. そのまま `openjtalk`（オフライン）で作る
2. 環境のネットワーク許可に `speech.platform.bing.com` を追加して `edge` を使う
3. 自分の声を `out/rec/` に録音して `recorded` を使う
4. 有料のクラウドTTS（Google Cloud TTS、ElevenLabs等）のAPIキーを用意してもらい、`tts.py` にエンジンを追加する

## テスト
5秒の動作確認用サンプル: `python3 $S/build.py $S/samples/fukuri_test.json --out out --test`
（`--test` は承認ゲート・尺・構成ルールを省略する。本番では使わない。）
