# 引き継ぎメモ：金融解説の縦型動画づくり

最終更新: 2026-11-14（ブランチ `claude/determined-brahmagupta-cuzt5f`）

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
| 3D | 参考TikTokのような3D＋吹き出しラベルが好評（「いいやん」）。さらに「具体的・ゆっくり・詳しく・楽しく」を希望 |
| 方向性 | 「皆と同じすぎるから風潮変えたい」。他と違う見た目を重視 → ジオラマ風。テキストも高品質に |

## 3. 制作した動画：令和8年の年収の壁（所得税・住民税・社会保険）
- 保存先（リポジトリにコミット済み）: `projects/nenshu-kabe-2026/`
  - `video.mp4` … 完成動画 v2（88.8秒）。`sheet.jpg` … 2秒ごとのコマ一覧
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
python3 $S/build.py out/nenshu-kabe-2026/scenes.json --out out/nenshu-kabe-2026 --engine none \
  --save projects/nenshu-kabe-2026
# 出力: out/nenshu-kabe-2026/video.mp4 と check/sheet.jpg（約1分40秒）
# --save で入力と完成動画が projects/nenshu-kabe-2026/ にコピーされる → git add / commit / push
# 1枚だけ確認: python3 $S/render.py out/nenshu-kabe-2026/scenes.json --out out/nenshu-kabe-2026 --still 12.5 30
```
**ファイルの保存ルール**: `out/` は .gitignore 対象でセッション終了とともに消える。完成したら必ず `--save projects/<動画名>` で保存し、コミット・プッシュする。ユーザーには SendUserFile で動画を渡す（ダウンロードして端末に保存できる）。

## 3b. 制作中：相続税の計算の仕組みと注意点（3D）
- 依頼（2026-11-14）: 参考TikTok（3D映像＋吹き出しラベルの解説）のように「3D映像を駆使して」相続税の計算と注意点を解説。
- 保存先: `projects/souzoku-2026/`（`scenes.json`・`script.md`・`sources.md`・プレビュー画像）
- 状態: ユーザーが「動画作って」→ 台本 v1 承認として **完成**（`video.mp4` 87.3秒、明るいスタジオ、PRなし、字幕＋効果音）。背景の濃紺版は未選択（希望があれば `"theme": "navy"` で再ビルド）。
- 3D本番レンダリングは約29分（2620フレーム、3並列）。
- 3Dの仕組み: `.claude/skills/kinyu-kaisetsu-douga/render3d/`（Three.js をヘッドレス Chromium で描画）
  - 準備: `cd .claude/skills/kinyu-kaisetsu-douga/render3d && npm install`
  - 静止画: `node render3d.js out/souzoku-2026/scenes.json --out out/souzoku-2026 --still 2 10 [--theme navy]`
  - 本番: tts.py（`--engine none`）→ `node render3d.js ... --workers 3` → mux.py → final_check.py
  - `scenes.json` の `"renderer": "3d"`、`"theme": "studio"|"navy"`。3Dのビジュアル種類は engine.js の `B.*`
- 直し済み: 贈与シーンの構図、注意の三角標識の向き、「3000万円」ラベル位置、人物の大きさ

## 3c. 制作中：学校で教えてほしいシリーズ（3本・3D教室）
- 依頼（2026-11-14）: 「もっと具体的にゆっくり詳しく、楽しく分かりやすく」。テーマ: 所得税とは／源泉徴収の理由／年末調整とは。コンセプト「学校で教えてほしいシリーズ」。ユーザーの選択で**3本のシリーズ**（各90秒以内）。
- 保存先: `projects/gakko-1-shotokuzei/`、`projects/gakko-2-gensen/`、`projects/gakko-3-nenmatsu/`（scenes.json・script.md・sources.md・プレビュー）。3本の scenes.json は `projects/gakko-make_scenes.py` から生成。
- 演出: 3Dの教室（黒板にチョーク文字・先生・生徒）、先生と生徒の掛け合い（字幕に「先生／生徒」タグ）。`"theme": "school"`、`"speaker"`、`"max_scene": 5.3`、`voice.cps 5.0`、`tail 1.0`（フックだけ `cps 7`）。
- 状態: **台本 v1（3本）を提示し、ユーザーの承認待ち**。承認後は各話 `build.py ... --engine none --save projects/<話>` で作成（3D描画は1本約30分）。

## 3d. 制作中：本当は学校で教えてほしいシリーズ「所得税」（ジオラマ版）
- 依頼（2026-11-14）: 「皆と同じすぎるから風潮変えたい」→ ジオラマ風を選択。ユーザーが大まかな台本を提供（所得税→源泉徴収→年末調整を1本で）。
- 保存先: `projects/dio-shotokuzei/`（`make_scenes.py` で scenes.json を生成、script.md、プレビュー）
- 演出: `"theme": "diorama"`（机の上のミニチュアの町、チルトシフトのぼかし、町の人とトラックが常に動く）、`"sub_style": "telop"`（丸ゴシック極太の縁取りテロップ）、大タイトルは Dela Gothic One。ビジュアルは `type: "dio"` の `act` で場面を指定（engine.js の B.dio）。
- 状態: **台本 v1（112.3秒・27シーン）を提示し承認待ち**。90秒を超えるのでユーザーに確認中。
- 学校シリーズ（3c）の第2回・第3回はコンテナ再起動で中断したまま。ユーザーの方針待ち（ジオラマ版に切り替える可能性が高い）。
- 写真版（画像生成AIの絵を使う方式、`type: "photo"`）も実装済み。`projects/gakko-photo-test/` に試作。

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
5. この引き継ぎメモを作成。
6. ユーザー「ファイルは保存できるようにして欲しい」→ `build.py --save` を追加し、完成動画も `projects/` に保存してコミットするルールにした。次は §3 の未決事項（A/B）の返事待ち。
