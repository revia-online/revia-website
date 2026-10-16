# Cloudflare Pages検証構成（2026-10-16）

これは本番切替の承認依頼前の検証実装。main反映・DNS/NS変更・Vercel停止・本番予約公開有効化・有料設定は未承認であり、実行しない。

## 作業状態

- 基準main: `7d4230309d7d38860cff2c21a5a7e9dd99a8b14d`。再開時にリモートmainも同SHAと確認。
- ローカルブランチ: `codex/cloudflare-pages-validation`。既存の追跡済みサイトファイルは変更せず、追加ファイルのみ。
- 代表からGitHub連携完了（対象リポジトリ1件のみ）と、Pages設定画面のプロジェクト名 `revia-website-validation`・検証ブランチ選択済み・未デプロイの報告あり。Cloudflare操作は代表が行う。
- 元15テスト、5点の拒否テスト、追加境界・暗号化・Pages出力検査を含めてローカル検証する。実環境での成功はローカル成功と区別する。

## Pagesの準備値（未適用）

Git連携のPagesプロジェクトを作成し、対象リポジトリだけを許可する。初回は `codex/cloudflare-pages-validation` を選ぶ。プロジェクトのpages.dev URLは公開検証用であり、独自ドメインは追加しない。Direct UploadプロジェクトはGit連携へ切替できないため代替として勝手に作らない。

| 設定 | 値 |
|---|---|
| Project name | `revia-website-validation` |
| Production branch（検証プロジェクト内の設定名） | `codex/cloudflare-pages-validation` |
| Framework | None |
| Build command | `python3 -m unittest discover -s tests -v && python3 scripts/build_pages.py` |
| Output directory | `dist` |
| Root directory | リポジトリルート |
| Build image | v3（Python 3.9以上、Node 20以上が必要） |
| Custom domain | 未設定 |
| Secret/有料bindings | 検証環境では不要 |
| Production approval flag | 未設定 |

`REVIA_PAGES_PRODUCTION_APPROVED=true`と`CF_PAGES_BRANCH=main`がそろう場合のみ本番向け出力になる。今回はどちらも有効にしない。検証用の全ホストに対しHTMLはWorker、静的ファイルは`_headers`で`X-Robots-Tag: noindex, nofollow, noarchive`を付ける。robots.txtは全クロール拒否。noindexはアクセス制限ではないため、非公開物の保護はdistへの非出力で行う。本番原本は保持し、検証トップの出力だけに模擬予約の注意書き・未送信の完了文を追加する。プレビュー側のCSPでGA4、外部通信、フォーム遷移、YouTube iframeを遮断する。JS出力のGAS URLを同一オリジンの模擬APIへ差替える。本番向けJSは原本と同一。YouTubeと本番GA4/GASの実動作はこのプレビューだけでは確認できない。

## URL・公開ファイルの保全

Pagesの標準HTML配信は`.html`を省略形へ転送するため、Advanced modeの`_worker.js`で既存URLを保持する。HTMLを内部`.bin`資産へ格納し、元URLから元バイト列をtext/htmlで返す。内部資産URLの直接アクセスは404。`/column`だけは`/column/`へ308。不存在URLは404で、SPAの200応答を防ぐ。

`config/pages-public.json`が既存HTML16ページ・静的47ファイルの許可リスト。公開後の台帳に記録された記事・画像だけを追加する。未承認ファイル、未来の台帳、改変された公開ファイル・画像、出力対象外への内部リンクは停止する。`google-apps-script/`、`tmp/`、バックアップHTML、scripts、tests、docs、暗号化原稿、Git情報を出力しない。これらのパス・隠しファイル・GASの`.gs`等は許可リストへの誤追加も拒否する。新しい一般ページ/共通資産を追加する際はこの許可リストのレビューも必要。

## 合成データによる検証

```sh
python3 -m unittest discover -s tests -v
python3 scripts/build_pages.py
# 既存のWrangler実行環境で、distだけを公開するローカルサーバーを起動
wrangler pages dev dist --port 8788 --compatibility-date 2026-10-12
python3 scripts/verify_pages_preview.py --origin http://127.0.0.1:8788
# Pages構築後、同じ検査を実際のpages.dev URLに向ける
python3 scripts/verify_pages_preview.py --origin https://<検証プロジェクト>.pages.dev
```

検査はHTMLのバイト一致・noindex・Content-Type、静的ファイル、robots、ソース/原稿の404、HEAD、308、模擬API、JSONP拒否、POST制限を確認。実予約やメール送信はしない。ブラウザーでは診断2種類の結果、幅390px、模擬予約完了を確認する。HTTP検査はブラウザーのGA4イベントを発火しない。

GitHub CIは検証用ブランチへのpush/PRで全ユニットテストとビルドを行う。権限はcontents:read、checkout資格情報保存なし、テスト鍵は毎回一時生成。実原稿・復号鍵・公開PATは渡さない。GitHubへの検証用push→Cloudflareの同コミットのデプロイ→上記HTTP検査の順に確認し、デプロイSHAとURLを記録する。CIのRe-run jobsとCloudflareのRetry deploymentで再実行する。これらは実GitHub連携ができるまで未検証。

## 原稿登録の削減案

推奨の試作はAES-256-GCM暗号化パッケージ。代表が完成HTMLと画像を確認し、最終版ハッシュに対する承認記録を私有JSONに残してから暗号化する。本文を生成したり、承認者を自動設定したりしない。

1. 代表管理下で32バイトのランダム鍵を作成し、パスワード管理等で保管する。チャット・コマンド引数・リポジトリに貼らない。
2. 本番有効化の別途承認後、GitHub Secret `REVIA_BUNDLE_KEY`へ一度登録する。今回未実施。Cloudflareには鍵を渡さない。
3. リポジトリ外の承認済みJSONと、環境変数で安全に渡した鍵を使い、`python3 scripts/seal_column.py --input /private/path/approved.json`を実行する。
4. `scheduled/2026-10-DD.enc.json`だけを登録する。毎記事のSecret手動更新を不要にする。更新版には再承認が必要。暗号文もdistから除外される。

1記事あたり従来Secret方式の登録・照合は5〜10分、新方式は初期鍵設定後2〜5分を見込む。いずれも原稿作成、完成HTML化、代表の内容確認を除く作業見積であり、代表による実測は未実施。現在の入力は完成HTMLを含むJSONで、非技術者が単独で登録するUIは未構築。担当者の補助を前提とする。

従来方式は48KiBのSecret値と1MiBの展開上限があり、画像込みでは不足しやすい。暗号化方式は入力JSON10MiB・暗号文16MiBに制限し、200KBの合成画像で検証。個々の公開資産はPagesの25MiB制限にも従う。どちらの形式も同時に同じ枠へ設定すると停止する。鍵漏えいで6記事すべてが復号され得るため、鍵とActions編集権限を代表管理下に置く。暗号文を公開Gitへ出した後はコピーを回収できない。

承認者名・時刻・SHAの一致は記録の検査であり、代表本人の電子署名を検証するものではない。鍵・Secrets・workflow・mainを書き換えられる管理者は承認境界の内側にいる。実原稿を登録する前に管理権限と代表の承認手順を確認する。

## 予約公開の本番設計（未有効化）

6枠は2026-10-20/22/24/27/29/31の07:00 JSTだけ。Actionsが時刻と承認・ハッシュ・SEO・参照を検査し、記事・トップ・一覧・sitemap・台帳を1コミットで更新する。Git連携でPagesが一式をビルド・デプロイする。記事原本を保持しているGitHubの公開前漏えいを防ぐため、平文原稿は公開日前のGitには置かない。

公開認証は対象リポジトリのContents writeだけを持つ短期PATを想定。GITHUB_TOKENによるpushでは後続連携の動作制限があるため、実Git→Pagesの合成検証後に確定する。PAT・Secrets・Environment保護設定は未作成。Actionsログには本文・鍵・認証ヘッダーを出さない。

同じ処理の再実行は台帳とファイルのSHAで冪等性を確保。競合pushは上書きせず停止し、最新版から新しいrunを開始する。公開後は本番URLの200・HTML/画像ハッシュ・一覧・sitemapを最大16回確認。失敗はActionsとPagesの同コミットのBuild/Deploymentログで調べ、通常のRetry/verifyを使う。11月1日JST以降は新規公開を停止し、6URLの確認後はworkflowを自己無効化する。

**07:00ちょうど・最大遅延時間・必ず起動することは保証できない。** GitHub scheduleの遅延/欠落、ビルド待ち・失敗、配信反映がある。デプロイは一式の成果物だが、全地域・全閲覧者で同時に切り替わる保証もない。07:10などに担当者が実URLを確認する手順を用意する。毎日更新への将来拡張は可能だが、今回の枠や時刻制限を拡張していない。

## 費用と本番切替の条件

Freeは月500ビルド、1同時ビルド、最大20,000ファイル、資産25MiB。日次更新自体は枠内に収まる見込みだが、検証push・再試行も集計する。[Pages制限](https://developers.cloudflare.com/pages/platform/limits/)

HTMLのURL維持にFunctionsを使うためHTMLアクセスはWorkers Freeと共通の100,000リクエスト/日を消費する。静的CSS/JS/画像はFunctions対象外にして無料配信する。Freeの範囲内で月額追加費用0円を想定し、有料プラン・KV/R2等を追加しない。無制限のHTML配信とは扱わず、Free枠超過時の可用性を受け入れられるか本番承認時に確認する。[Functions料金](https://developers.cloudflare.com/pages/functions/pricing/)

商用利用条件は前回確認したCloudflare Developer Platformの規約にVercel Hobbyの非商用限定と同等の禁止を見つけていない。契約・規約の最終判断は代表による。[Developer Platform規約](https://www.cloudflare.com/service-specific-terms-developer-platform/)

## DNS保全・復旧（案のみ、変更禁止）

前回の公開DNS記録ではNSはムームードメイン、wwwは`cname.vercel-dns.com`へのCNAME、apexはA `216.198.79.1`、MXは優先度1 `smtp.google.com`、SPFは`v=spf1 include:_spf.google.com ~all`。Googleサイト認証TXTとgoogle._domainkey公開鍵を保存済み。DMARC公開照会は空応答だったが、完全なDNSゾーン/他selectorは未確認。ムームー管理画面の全レコードを保全してから切替案を確定する。

検証中はDNS変更0件。将来の最小変更案は、Pagesでwwwのカスタムドメインを準備・HTTPS確認後、wwwのCNAMEだけを確定済み`<project>.pages.dev`へ変更する。MX/SPF/DKIM/DMARC/Google認証/NSは維持する。apexを現状維持すると非www→www転送にVercelが残るため、この段階でVercelを停止しない。完全撤退時のapex対応は別途設計・承認が必要。

復旧案はwwwのCNAMEを保存済み旧値へ戻し、必要ならCloudflareを直前の正常成果物へrollbackする。DNS TTLは記録時3600秒で、キャッシュの残存により反映は即時ではない。停止0分や1時間以内復旧を保証しない。DNS切替前の今回の作業による予定本番停止は0分。

## 10月20日までの優先残作業

1. **完了（代表報告/前ターン確認）** GitHubログイン、対象リポジトリ限定のCloudflareアプリ承認、GitHub検証用ブランチ作成。
2. **P0** Pages FreeのGit連携プロジェクトを構築し、同コミットの検証URLでHTTP・スマホ・診断・模擬予約を再検証。URLとSHAを記録。
3. **P0** GitHub Actions→Pages更新と失敗時Retryを合成データで確認。GA4の受信、本番GAS予約/メール/カレンダーの確認方法を代表と確定し、独立したテスト環境か承認されたテストで実証する。
4. **P0** 代表承認の完成原稿・画像を私有経路で受領し、最終HTML/ハッシュの承認と登録を確認。内容の創作で埋めない。
5. **P0** DNS管理画面の完全な記録、www証明書、非www転送・復旧手順を含む10項目の本番切替前報告を完成。代表のmain/DNS/本番有効化の個別承認を得る。
6. **P1** 公開用認証・権限・通知・手動担当者と07:10確認、6記事後の停止確認を設定する（本番有効化は承認後のみ）。

現段階では本番切替を推奨しない。間に合わない場合は現行本番を維持し、予約公開を有効にしない。


## P2修正（2026-10-16、検証ブランチ限定）

- HTTP検証は `REVIA-pages-validation/1.0` を全リクエストに明示する。標準Python署名では403/1010、同一ホスト・明示UAでは200を再現。Cloudflareセキュリティは変更しない。失敗時はステータス・cf-ray等を表示し、管理画面ログと照合する。特定ルール名までは未照合。
- 模擬slot IDを既存 `slotIdToGoogleDate` の期待する `2026-10-20T10:00` に統一する。表示ラベルと開始・終了ISOも同じ30分枠に揃える。NodeでWorker応答と実サイトのカレンダー関数を組み合わせた回帰検査を行う。
- 検証ビルドのトップHTMLとscript.jsの完了文だけに「実際の予約は確定していません」「メールは送信していません。Zoom参加URLも発行していません。」を設定する。送信前にも検証注意書きを表示する。本番ビルドのHTML・JSは原本一致をテストする。
- 既存HTML全件原本一致の規則は、検証トップの上記意図的変更のみ例外となる。HTTP検証は同じ変換済み期待値と比較する。
- 検証用GAS差替え、GA4遮断CSP、noindex/robots、非公開物許可リストは継続する。main、DNS、Vercel、独自ドメイン、有料設定を変更しない。
