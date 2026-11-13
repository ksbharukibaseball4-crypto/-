# 演出ルール（enshutsu）

## 色
| 用途 | 色 |
|---|---|
| 背景 | 濃紺グラデーション（#081230 → #0E2252）＋ゆっくり動く金色の光と粒子 |
| 強調・見出し・ハイライト枠 | ゴールド #F2C248 |
| **増加** | 緑 #2ECC71（`"color": "up"`） |
| **減少** | 赤 #EB4D4B（`"color": "down"`） |
| 比較対象・補足 | グレー青 #A0B0D2（`"color": "muted"`） |

増減の色は意味で使う。増えるものを赤、減るものを緑にしない。`number` / `bills` / `graph`（`"color":"auto"`）は増減から自動で色が決まる。

## レイアウト（1080x1920）
```
y=0    ┌────┬────────────────┬────┐
y=150  │    │ [PR]            │    │
y=210  │左右│ 字幕（上部中央）  │右端│ ← x≥918 はTikTokのボタン
y=500  │対称│ メインビジュアル  │15% │
y=1100 │余白│ 人物＋吹き出し    │ 置 │ ← 吹き出しに「〇年〇月時点」と注記
y=1440 ├────┴── 床（装飾のみ）──┴────┤ ← 下部25%：キャプション
y=1920 └──────────────────────────┘
```
- **右端15%（x≥918）と下部25%（y≥1440）に重要な要素を置かない**。左にも同じ幅（162px）の余白を取り、**画面中央（x=540）基準で左右対称**にする（どのプレイヤーで見ても中央に見えるように）。
- 下部25%は床・街並みなどの装飾で埋め、空っぽに見せない。

## 人物イラスト（`chara.py`）
- 解説役 `guide`（眼鏡・ティール色のジャケット）＋相手役（セクションごとに `student` / `salary`（会社員）/ `part`（パートさん））。具体例（role=example）の相手役はパートさん。
- ポーズ: `idle, point, explain, wave, think, happy, surprise, worry, ok`。ビジュアルの種類から自動で選ぶ（例: 数字が増える→happy、減る→worry、壁→think、撤廃スタンプ→surprise）。上書きはシーンに `"chara": [{"who":"guide","pose":"point"},{"who":"part","pose":"think"}]`、人物なしは `"chara": false`。
- 字幕のチャンクが表示中は解説役の口が動く。まばたき・体の揺れ・シーン頭のジャンプで常に動かす。

## 背景
濃紺がベース。セクション（`section` ビジュアル）ごとに装飾を切り替える: `rays`（回転する光）→`city`（夜の街並み）→`grid`（遠近グリッド）→`bokeh`（玉ボケ）→`chart`（流れるローソク足）。シーンに `"bg": "city"` で指定も可。場面転換は `slide / rise / zoom / fade / slide_l` を順に使い分ける（`"transition"` で指定可）。

## 動き
- **1シーン2〜4秒**。音声長から自動で決まる（2秒未満は2秒に延長、4秒超は警告→文を分割）。
- **3秒以上止めない**: 各シーンは入場アニメ（0.22秒のスライド＋フェード）→本アニメ（シーンの約70%）→待機中も脈動・浮遊・粒子が動き続ける。`final_check.py` が freezedetect で3秒以上の静止を検出する。
- お金は**コイン・札束**で見せる（`coins`, `bills`, `hook` の周回コイン）。
- 増減は**動くグラフ**で見せる（`graph` は線が伸びる、`bars` は棒が伸びる、`number` は数字がカウントする）。

## 字幕（単語ハイライト）
- 今読んでいる文だけを表示（最大2行、文字が多いと自動で縮小）。
- 読んでいるチャンク（`/` 区切り）を**ゴールドの枠**で囲み、読み終えた語は白、まだの語はグレー。
- タイミングは `timeline.json`（`tts.py` の出力）。ずれが気になる場合は `edge` エンジンを使う、または `/` の区切りを細かくする。

## ビジュアルの種類（`scenes[].visual.type`）
| type | 用途 | 主なパラメータ |
|---|---|---|
| `hook` | 冒頭フック（周回コイン） | `big`, `sub`, `color` |
| `section` | セクション扉（①所得税 など） | `num`（①②③。数字はasof判定を避けるため丸数字）, `title`, `sub`, `icon` |
| `headline` | 見出し＋項目 | `title`, `items`（文字列 or `{"text","icon"}`、最大4） |
| `steps` | 仕組み（3ステップ以内） | `steps`, `current` |
| `checklist` | 条件チェック | `title`, `items`（最大4、順にチェックが入る） |
| `flow` | 流れ（アイコン→矢印→アイコン、コインが流れる） | `label`, `nodes[{icon,label}]`（≤3、labelは`\n`で改行可） |
| `timeline` | 期間（特例の年など） | `label`, `years`, `range`, `range_label`, `items` |
| `calendar` | 月（年末調整など） | `label`, `highlight`（月の配列）, `sub` |
| `wall` | 「〇〇の壁」（レンガが積み上がる） | `label`, `value`, `sub` |
| `stamp` | 撤廃・廃止（赤いハンコ） | `title`, `sub`, `stamp`, `date` |
| `equation` | 計算式（項が順に出る） | `title`, `terms`（例 `["178万","−","74万","=","104万"]`）, `result`, `result_color` |
| `payslip` | 給与明細（天引きは赤） | `title`, `rows[{label,value,color}]`, `footer` |
| `coins` | 積み上がるお金 | `stacks`, `labels`, `label` |
| `bills` | 札束＋金額カウント | `count`, `value_from`, `value_to`, `unit`, `label` |
| `number` | 大きな数字のカウント | `from`, `to`, `unit`, `label` |
| `graph` | 推移（線が伸びる） | `series[{name,values,color,fill}]`, `x_labels`, `unit`, `label` |
| `bars` | 比較 | `items[{label,value,color}]`, `unit`, `label` |
| `summary` | 一文まとめ・用語カード | `text`（`\n`で改行）, `tag`（既定「まとめ」、用語なら「ことば」） |
| `disclaimer` | 最後の注意書き | `text` |

アイコン（`icon`）: `receipt, house, shield, calendar, building, calculator, person, doc, clock, coin, check, piggy, plant`。
**同じ種類が続かないように**組む（同じ見た目の連続は「使い回し」に見える）。セクション扉→説明→数字→比較→図解…と変化をつける。

## 確認方法
- 1枚確認（安全領域を赤で表示）: `python3 $S/render.py out/scenes.json --out out --still 12.5` → `out/still_12.50.png`
- 全体: `out/check/sheet.jpg`（2秒ごとのサムネ）
- 新しい見せ方が必要なら `render.py` に `v_<type>` 関数を追加し `VISUALS` に登録する（色・安全領域の定数は `common.py`）。
