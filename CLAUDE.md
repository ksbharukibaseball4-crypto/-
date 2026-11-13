# このリポジトリについて

金融テーマの縦型解説動画を作るためのリポジトリです。

- 作業を始める前に `HANDOFF.md`（引き継ぎメモ：ユーザーの好み、進行中の動画、未決事項、環境の制約）を読むこと。
- 動画の作り方はスキル `.claude/skills/kinyu-kaisetsu-douga/` にある（`SKILL.md` から読む）。
- **ファイルは必ず保存する**: 動画ごとの入力（`scenes.json` / `script.md` / `sources.md`）と完成品（`video.mp4` / `sheet.jpg`）は、`build.py ... --save projects/<動画名>` で `projects/<動画名>/` に保存し、コミット・プッシュする。`out/` は .gitignore 対象で、セッションが終わると消える。
- 完成した動画は SendUserFile（display: attach）でもユーザーに渡し、端末に保存できるようにする。
- 台本はユーザーの承認制。承認前に動画をレンダリングしない。
