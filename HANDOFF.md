# 引き継ぎメモ：金融解説の縦型動画づくり

最終更新: 2026-11-13（ブランチ `claude/determined-brahmagupta-cuzt5f`）

次のセッションは、まずこのファイルを読み、次に `.claude/skills/kinyu-kaisetsu-douga/SKILL.md` を読んでください。

---

## 1. 何を作っているか
- 金融テーマの縦型解説動画（TikTok / Shorts / リール）。60〜90秒、1080x1920、30fps。
- 作り方はスキル `.claude/skills/kinyu-kaisetsu-douga/` にまとめてある。
  - 手順: テーマ受付 → 公式情報で数字確認（`sources.md`）→ 台本（`script.md`、**ユーザー承認制**）→ 音声 or 字幕タイミング → 描画 → 字幕 → ffmpeg 結合 → 最終チェック
  - ルール: `daihon.md`（台本）、`enshutsu.md`（演出）、`kisei.md`（規制・表現）

## 2. ユーザーの好み（これまでの指示）
| 項目 | 指示 |
|---|---|
| 音声 | **ナレーションなし。字幕＋効果音のみ**（`--engine none`） |
| 配置 | **画面中央に左右対称**。左寄りに見えるのはNG（右15%を避けつつ左にも同じ余白） |
| テンポ | 「もう少しゆっくり」→ 現在は `voice.cps 6.5`（字/秒）、`voice.tail 0.7`（秒）。アニメも遅め |
| 効果音 | **同じ音の繰り返しはNG**。種類・音程をシーンごとに変える（`sfx.py`） |
| 絵 | **人物イラストと動きが欲しい**。同じイラスト・背景の使い回しはNG（`chara.py`、セクションごとの背景、多種のビジュアル） |
| 色 | 濃紺背景、ゴールド強調、増加=緑・減少=赤 |
| 字幕 | 上部中央、読んでいる語をゴールド枠でハイライト |
| UI回避 | 右端15%・下部25%に重要な要素を置かない |
| 規制 | 売買推奨なし、断定・保証なし、数字に「〇年〇月時点」、最後に「情報提供目的です。投資判断はご自身で」、案件ならPR表示 |
| 台本 | 1文20字以内、です・ます調、専門用語は直後に言い換え、具体例は必ず検算 |

## 3. 制作した動画：令和8年の年収の壁（所得税・住民税・社会保険）
- 入力ファイル（リポジトリに保存済み）: `projects/nenshu-kabe-2026/`
  - `scenes.json` … **最新・正**（30シーン、88.8秒、音声なし、`pr: false`）
  - `script.md` … ユーザーが「OK」と承認した台本 v1。字幕の文言は今の `scenes.json` と同じ。**「画面」列は v1 のままで古い**（その後ユーザーの指示で見た目を作り直したため）
  - `sources.md` … 出典と確認日（2026-11-13）
- 主な数字（2026年11月時点）: 所得税の壁 178万円（給与所得控除74万＋基礎控除104万、令和8年分、年末調整で反映）／住民税の非課税目安 119万円（令和8年の収入→令和9年度課税、単身）／106万円の壁（賃金要件）は2026年10月に撤廃／130万円の壁は残る（2026年4月から契約上の賃金で判定）
- **未決事項（ユーザーの返事待ち）**: もっとゆっくりにするなら、
  - A: 台本から3〜4シーン削る（推奨。候補例: #2「2026年の年収の壁を整理します。」、#14「会社が1年分の税金を精算します。」）→ 削ったら再承認が必要
  - B: 90秒超えを許容する
- **ユーザーへの依頼済み事項**: `sources.md` の出典URLを投稿前に本人が開いて確認する（このセッションからは政府サイトに直接アクセスできず、公式ドメイン限定の検索結果で確認したため）

### 再ビルド手順
```bash
pip install -r .claude/skills/kinyu-kaisetsu-douga/scripts/requirements.txt   # 新しいコンテナでは毎回必要
mkdir -p out/nenshu-kabe-2026
cp projects/nenshu-kabe-2026/* out/nenshu-kabe-2026/
touch out/nenshu-kabe-2026/APPROVED           # 承認済みの台本なので可。台本を変えたら再承認を取ってから
S=.claude/skills/kinyu-kaisetsu-douga/scripts
python3 $S/build.py out/nenshu-kabe-2026/scenes.json --out out/nenshu-kabe-2026 --engine none
# 出力: out/nenshu-kabe-2026/video.mp4 と check/sheet.jpg（約1分40秒）
# 1枚だけ確認: python3 $S/render.py out/nenshu-kabe-2026/scenes.json --out out/nenshu-kabe-2026 --still 12.5 30
```
変更後は `projects/nenshu-kabe-2026/` にもコピーし直してコミットすること（`out/` は .gitignore 対象で消える）。

## 4. 環境の制約（このクラウド環境）
- **ネットワーク**: Edge TTS / gTTS / 政府サイト（nta.go.jp、soumu.go.jp、mhlw.go.jp 等）に `curl` も WebFetch も届かない。
  - 数字確認 → `WebSearch` に `allowed_domains`（例 `nta.go.jp`, `mof.go.jp`, `mhlw.go.jp`, `nenkin.go.jp`, 自治体）を付けて公式ページの内容を確認する。
  - 音声が必要になったら → オフラインの `openjtalk`（`pyopenjtalk-plus`）が動く。自然な声にするには、環境の許可ホストに `speech.platform.bing.com` を追加して `edge` を使う。
- ツール: ffmpeg、Pillow、numpy あり。日本語フォントは IPAGothic を自動検出。pip パッケージは新しいコンテナで入れ直しが必要。

## 5. スキルのファイル構成
```
.claude/skills/kinyu-kaisetsu-douga/
  SKILL.md  daihon.md  enshutsu.md  kisei.md
  scripts/
    build.py         一括実行（lint→承認ゲート→tts→尺チェック→render→mux→final_check）
    check_script.py  台本リント（NG表現・20字・時点表記・検算・構成・尺）
    tts.py           音声合成 or 字幕タイミング（engine: auto/edge/openjtalk/recorded/none）＋効果音の配置
    sfx.py           効果音（オフライン合成、シーンの種類ごとに変化）
    render.py        描画（背景5種、ビジュアル19種、人物ステージ、字幕ハイライト、場面転換5種）
    chara.py         人物イラスト（guide/part/salary/student × 9ポーズ）とアイコン
    mux.py           ffmpeg 結合（音声なし -18 LUFS / ナレーションあり -14 LUFS、2パス）
    final_check.py   解像度・fps・尺・音量・3秒以上の静止の検出、コマ一覧の作成
    common.py        サイズ・安全領域・色・フォント・`/` 区切りの分解
    samples/fukuri_test.json  5秒の動作確認用
```

## 6. 経緯（時系列）
1. スキル作成。「複利ってなに？」5秒テスト（Open JTalk 音声）で動作確認。
2. ユーザー「音声は効果音以外なしでいい」→ `none` エンジン（字幕タイミング＋効果音）を追加。
3. 「令和8年の年収の壁（所得税・社会保険・住民税）」の出典確認 → 台本 v1 → ユーザー「OK」→ 動画 v1（81.9秒）。
4. ユーザーの指摘「左上にズレている／効果音がずっと同じ／もう少しゆっくり／イラストも背景も使い回し／人のイラストや動きが欲しい」→ 左右対称の配置、人物イラスト、セクションごとの背景、新しいビジュアル9種、効果音ライブラリを追加 → 動画 v2（88.8秒）。
5. この引き継ぎメモを作成。次は §3 の未決事項（A/B）の返事待ち。
