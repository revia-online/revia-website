# LINE LP 公開用画像

公開用に保存する画像は次の2枚だけです。LPのファーストビューとOGP/Twitter画像で使用します。

| ページ | 正式採用素材 | 公開用WebP | サイズ | 容量 |
| --- | --- | --- | --- | --- |
| study-style-guide.html | LP-A_study-style_edited-suit.png | lp-a-edited-suit.webp | 960×720px | 67,310 bytes |
| test-review-guide.html | LP-B_test-review_edited-study.png | lp-b-edited-study.webp | 960×1200px | 150,250 bytes |

添付済みの加工済みPNGから比例縮小とWebP圧縮（quality 86）のみを行っています。追加のAI加工、レタッチ、トリミング、文字やCTAの焼き込みはしていません。画像表示は本来の縦横比を維持します。

## 公開しない素材のローカル保存場所

加工済みPNG原本2枚、旧JPEG原本2枚、旧WebP2枚は、公開用リポジトリ外の次のフォルダに移しました。

`~/Documents/Codex/2026-10-12/codex-implementation-instructions-md-revia-lp/outputs/REVIA_LP_非公開画像バックアップ/`

- `source/LP-A_study-style_edited-suit.png`
- `source/LP-B_test-review_edited-study.png`
- `source/lp-a-owner-photo.jpg`
- `source/lp-b-owner-photo.jpg`
- `lp-a-owner-photo.webp`
- `lp-b-owner-photo.webp`

バックアップ内の`BACKUP_MANIFEST.json`に実際の絶対パス・容量・SHA-256を記録しています。コピーのバイト一致を確認してからリポジトリ内のファイルを除外しました。

このリポジトリの`assets/line-lp/source/`は存在しません。原本・旧写真・非公開バックアップを公開用リポジトリへ戻したり、公開用ZIPに含めたりしないでください。
