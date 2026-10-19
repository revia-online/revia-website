> この文書は初回のVercel向け調査記録です。現在のCloudflare検証構成・承認範囲・残作業は `cloudflare-pages-validation.md` を参照してください。旧Vercel向け設定手順を実行しないでください。

# REVIAコラム：2026年10月限定予約公開の調査・実装報告

確認日：2026年10月16日（JST）。対象：`revia-online/revia-website`。

## 結論と現在の状態

GitHub Actionsで公開可能時刻を判定し、承認済み完成HTML・一覧・トップの最新記事・sitemapを1コミットで更新し、既存のVercel Git連携を利用する案を実装した。サイトを動的アプリへ変更する必要はない。

**07:00ちょうどの公開、最大遅延時間、必ず実行されることは保証できない。** Actionsの待ち行列・起動欠落・Vercelのデプロイ時間・CDNの反映がある。公開前倒しを防ぐ時刻条件はプログラムで検査するが、基盤の時計・認証・サービス正常性を含む絶対保証ではない。

実装はローカル検証用ブランチ `codex/column-release-202610-validation` に限定。GitHub連携によるリモートブランチ作成は `403 Resource not accessible by integration` で拒否されたため、リモートブランチ・PRは未作成。パッチは既存のサイトファイルを変更しない追加ファイルのみ。承認済み原稿は未受領で、原稿・画像・Secrets・認証情報を登録していない。main・Vercel設定・本番サイト・予約処理の有効化は変更していない。

## 確認できた既存構成

| 項目 | 確認結果 |
|---|---|
| GitHub | 公開リポジトリ。既定ブランチmain、基準SHA `7d4230309d7d38860cff2c21a5a7e9dd99a8b14d` |
| サイト | 静的HTML/CSS/JavaScript。コラムは4記事 |
| 既存コラム | `column/`、`column/index.html`、トップの`.column-latest-card`、`sitemap.xml`を手動更新する運用 |
| SEO・計測 | canonical/OGP/Twitter/BlogPosting。GA4 `G-734S14C7HR` |
| 既存自動化 | 基準ツリーに`.github/workflows/`、`package.json`、`vercel.json`なし。Actions実行履歴0件。Actions利用許可設定の全項目は未確認 |
| Vercel | チーム`online-revia`、プロジェクト`revia-website`、Hobby。GitHub連携あり、mainへのpushが本番更新 |
| ビルド | Framework Other、Root Directory空欄。Build/Install/Outputのoverrideは未設定。既定の静的配信構成 |
| 本番 | `https://www.revia.website` と `revia-website-one.vercel.app`。現行デプロイ`HCRLhYNoKqTqpqWEDRUvzdQWDSTf`は基準SHAからReady |
| Cron/Hook | Cronジョブ未登録、Deploy Hookなし。新規登録していない |
| 実画面 | 本番の`/column/`に4記事が表示されることをブラウザで確認 |

参照：[リポジトリ](https://github.com/revia-online/revia-website)、[既存手順](https://github.com/revia-online/revia-website/blob/7d4230309d7d38860cff2c21a5a7e9dd99a8b14d/COLUMN_GUIDE.md)、[Vercelプロジェクト](https://vercel.com/online-revia/revia-website)。管理画面は読み取りのみ。

## GitHub ActionsとVercel Cronの比較・費用

| 方式 | 利用条件・精度 | 費用・今回の判断 |
|---|---|---|
| GitHub Actions schedule | 既定ブランチ上のworkflowが必要。混雑時に遅延し、待機中の実行が欠落する場合がある。毎時00分は混雑しやすい | 公開リポジトリの標準GitHub-hosted runnerは無料。今回ubuntu-latestを使用し、定刻と再試行を計54回以下設定。大型runner・外部有料サービス・成果物ストレージを追加しない。採用 |
| Vercel Cron Hobby | 1日1回、指定した時間帯内で実行（07:00設定なら07:00〜07:59）。UTC。Functionが必要 | Cron自体は各プランに含まれるがFunction利用枠を消費。静的ファイルを書き換えるには別途デプロイ等も必要。今回不採用 |
| Vercel Cron Pro等 | 分単位。秒単位の公開完了保証にはならない | プラン変更を前提にしないという条件のため不採用 |

仕様：[GitHubのschedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[Actionsの課金](https://docs.github.com/en/actions/concepts/billing-and-usage)、[Cronの料金・精度](https://vercel.com/docs/cron-jobs/usage-and-pricing)、[Cronの仕組み](https://vercel.com/docs/cron-jobs)。

Vercelは既存枠内で通常デプロイを行う設計で、原稿追加は最大6回。失敗時の手動再デプロイ等は別途枠を使う。他プロジェクトを含む利用量や今後の価格は保証しない。今回プランや支出上限は変更しない。

**既存プランに関する確認事項：Vercel Hobbyは公式に非商用・個人利用に限定されている。REVIAの事業サイトへの適用条件は、本番有効化前に代表側で確認が必要。** この実装ではプラン変更も課金契約も行わない。[Hobby利用条件](https://vercel.com/docs/plans/hobby)

## 公開日時と終了条件

| 記事枠 | 公開日時 JST | UTC |
|---|---|---|
| 1 | 2026-10-20（火）07:00 | 2026-10-19 22:00 |
| 2 | 2026-10-22（木）07:00 | 2026-10-21 22:00 |
| 3 | 2026-10-24（土）07:00 | 2026-10-23 22:00 |
| 4 | 2026-10-27（火）07:00 | 2026-10-26 22:00 |
| 5 | 2026-10-29（木）07:00 | 2026-10-28 22:00 |
| 6 | 2026-10-31（土）07:00 | 2026-10-30 22:00 |

判定は明示的なJST（UTC+09:00）で、対象6枠をコードに固定。年を持たないcronだけに依存しない。定刻と07:07、07:17、07:37、08:07、08:37、12:17、18:17、23:17に実行機会を設ける。遅延上限を表す時刻ではない。

6記事の本番URL検証が全て成功したら、その公開workflow自身をGitHub APIで無効化する。無効化が失敗した場合はエラーにし、手動無効化が必要と表示。6枠以外を受け付けない条件と、**2026-11-01 00:00 JST以降は公開処理を拒否する条件**も独立して存在する。したがって停止API失敗や来年のcron起動で新規公開しない。

最後の記事が10月31日中に失敗した場合も、11月へ自動持ち越ししない。11月以降の公開は代表の改めての承認を受け、既存の手動公開手順を利用する。確認のみの処理は終了後も実行できる。

## 実装と変更対象

追加ファイル：

- `.github/workflows/column-release-202610.yml`：定時実行、手動実行、排他制御、有効化条件、公開、本番検証、終了時の無効化。
- `.github/workflows/column-release-tests.yml`：秘密情報を使わない検証用CI。
- `scripts/column_release.py`：承認パッケージ検査、固定日時判定、HTML/一覧/トップ/sitemapの準備、公開済み記録、HTTP確認、私有パッケージ作成。
- `scripts/commit_column_release.py`：更新許可パスだけの1コミット、通常pushによる競合検出。
- `tests/test_column_release.py`：合成テスト原稿だけを使用する自動テスト。
- `docs/column-release-202610.md`：本報告・運用手順。

実際の公開時にのみ、新規の`column/2026-10-*.html`、必要ならパッケージ内画像`images/column-2026-10-*`、`column/index.html`、`index.html`の最新記事部分、`sitemap.xml`、公開済み記録`publication/2026-10.json`を更新する。CSS、既存記事本文、予約フォーム、既存JavaScript、GA4 IDは変更しない。既存記事への導線も維持する。

原稿HTMLは全文をそのまま保存し、既存SEO・日付・CSS・GA4の必要項目を検査する。一覧・最新カードは既存のclassと見出し階層を使う。未承認の意見・体験談・要約・画像は生成しない。紹介文や画像のaltも承認パッケージに含める。

変更を全て検証してから作業領域へ書き、許可ファイルを一括コミットする。Vercelはそのコミット全体をデプロイする。ブラウザのキャッシュや切替中の別リクエストまでを含めた全世界同時の整合性は保証しない。本番確認で混在・古い表示を検出する。

## 原稿の非公開管理と承認

このリポジトリは公開されている。draft、別ブランチ、PR、コメント、Actionsログ、artifact、Preview、Base64ファイルを含め、未公開原稿を置かない。robots/noindexや一覧から隠すだけの方法も使用しない。

6個のRepository Secrets `REVIA_ARTICLE_20261020` / `20261022` / `20261024` / `20261027` / `20261029` / `20261031`に、代表の最終承認済みパッケージだけを登録する。登録者は代表または明示的に委任された管理者。Secretsとmainを変更できる人・workflowを実行できる人が信頼境界になる。ハッシュ検査は改変検出であり、代表本人の電子署名を代替しない。

1パッケージはJSONをgzip+Base64化し、48KiB以内。本文HTML、タイトル、紹介文、カテゴリー、必要な画像、承認記録が対象。容量超過は失敗させる。画像等で超える場合は承認済みの非公開保管場所を別途決めるまで本番登録しない。公開保管へ自動フォールバックしない。[GitHub Secretsの制約](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

私有JSONの構造（値は説明用のプレースホルダー）：

```json
{
  "schema": 1,
  "slot": "2026-10-20",
  "publish_at": "2026-10-20T07:00:00+09:00",
  "article": {
    "slug": "2026-10-approved-slug",
    "title": "承認済みタイトル",
    "description": "承認済み紹介文",
    "category": "承認済みカテゴリー",
    "html": "代表が確認した完成HTMLの全文"
  },
  "assets": {},
  "approval": {
    "by": "representative",
    "at": "代表による最終承認の実日時をオフセット付きISO形式で記録",
    "sha256": "対象slot/publish_at/article/assetsの正規化JSONのSHA-256"
  }
}
```

画像付きカードの場合は`article.image`に`path`・`alt`・正の整数`width`・`height`を追加する。新規画像は`assets`のキーを`images/column-2026-10-名称.webp`等、値を画像のBase64として同梱。画像自体も承認対象。完成HTMLの相対パス、OGP画像、構造化データとの対応を事前に確認する。

正規化ハッシュは`column_release.fingerprint(payload)`を使用する。原稿の完成後に計算し、代表はその版と一覧情報を確認して承認する。承認後に変更したら再承認が必要。承認日時・ハッシュを記録した私有JSONを`pack`する：

```sh
python3 scripts/column_release.py pack --input work/private/approved-20261020.json --output work/private/20261020.secret
```

出力はローカルの権限0600で新規作成し、上書きしない。gzip+Base64は暗号化ではないので、出力も原稿同様に非公開扱いにする。Gitへ追加せず、代表がSecrets画面へ登録する。本文は標準出力へ出さない。公開処理にも原稿のecho・diff出力・artifactアップロードを入れていない。

## テストと未検証範囲

実行：`python3 -m unittest discover -s tests -p 'test_column_release.py' -v`

15テストがローカルで成功。基準SHAから取得した実際のトップ・一覧・sitemapのコピーを使い、サイトの該当部分以外のバイト保持も確認した。テスト本文は`TEST ONLY`と明示した合成文のみ。

- 全6日時の1マイクロ秒前・一致・1秒後、UTC日付変換、11月と翌年の拒否。
- 未来パッケージの未読、未承認枠のスキップ、承認者・日時・ハッシュ改変の拒否。
- 全6記事、再実行の差分ゼロ、既存記事の衝突・公開後改変・テンプレート不一致での停止。
- 遅れて承認された古い記事の一覧順と最新記事の維持。
- SEO、GA4、CSS、パス逸脱検査と非公開テキストをログへ出さないこと。
- HTTP確認の正常系・古い本文・不一致sitemap・接続失敗、容量超過、新規画像の一致・不一致。
- 一時的なローカルbare Gitを使った通常push成功と、別の更新でmainが進んだ場合のpush拒否。実リモートには接続していない。

未検証：実際のGitHub-hosted runner、Repository Secrets登録、Actionsポリシー・PAT権限、Vercelによる自動コミットの取り扱い、6記事の最終HTML/画像表示、実本番デプロイ・終了時無効化API。実原稿・本番承認がないため実施していない。API/CIが本番で動いたとみなさない。GA4スクリプトは検査するが、GA4管理画面でのイベント受信は別途実機確認が必要。

## 導入前レビューと有効化（代表承認後のみ）

1. 実リポジトリのmainが基準SHA以降に変わっていないか確認し、検証用ブランチへパッチを適用する。実際の全リポジトリで上記テストと差分レビューを行う。今回のローカルGitは読み取りに必要な4ファイルだけの基準コピーで、完全なcloneではない。
2. 合成原稿だけの検証環境で、完成HTML・画像・一覧・sitemap・GA4とVercel Git連携を確認する。未公開の実原稿をPreviewへ出して試さない。
3. Actionsが利用可能で、固定SHAのcheckout Actionと`actions: write`による自己無効化が許可されることを確認する。Secretsを使う公開workflowへの変更は必ずレビューする。
4. 代表が記事ごとの最終稿とハッシュを承認し、6個の原稿Secretsを登録する。未承認枠は空欄のままにする。
5. 代表管理のfine-grained PATを対象リポジトリ限定・Contents write・短期有効期限で用意し、`REVIA_RELEASE_TOKEN`に登録する。プログラム内にトークンを記入しない。`REVIA_RELEASE_AUTHOR_NAME` / `REVIA_RELEASE_AUTHOR_EMAIL`はVercelと連携している正しいGitHub所有者の値をRepository Variablesに設定する。今回設定・発行していない。[Vercelのコミット作者条件](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
6. 代表がこの6記事について期間中の自動コミット・本番公開を承認した後だけmainへ反映する。main反映は現在のサイト構成ではデプロイを起こすため、本番変更の承認が必要。
7. 最後に`REVIA_PUBLISH_202610_ENABLED=true`を設定する。これが未設定/falseなら自動公開しない。原稿承認と仕組みの本番有効化承認は別々に確認する。

GitHub scheduleはmain上に必要なので、検証用ブランチだけでは本番スケジュールは動作しない。main反映後も有効化変数未設定なら公開しない。[scheduleの実行条件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## 公開後確認・遅延時対応・復旧

Actionsは本番`/`、`/column/`、`/sitemap.xml`、公開済み各記事URLへHTTPアクセスする。200、予期しないリダイレクトがないこと、完成HTMLのSHA-256、sitemap、一覧・最新カードの一致を確認する。ブラウザを実行しないので確認アクセスによるGA4イベントは送らない。30秒間隔・最大16回で確認し、HTTP失敗コード、対象パス、整合性エラーを記録。ネットワーク待ちを含むため総時間は固定ではなくworkflow全体は20分で打ち切る。

正常なら`PUBLIC_VERIFIED`と`VERIFIED_URL`を出力する。prepareログの`missing_slots`と`lateness_seconds`、コミットSHA、Vercelのコミットステータス/Buildログで原因を追える。ジョブ未起動の欠落にはその実行のログ自体がなく、GitHub内部の原因を特定できるとは限らない。

| 状況 | 対応 |
|---|---|
| 予定時刻後に実行がない | Actions画面でscheduleの有効性とrun有無を確認。再試行時刻を待つか、Run workflowのmain・publishを手動実行 |
| 未承認・Secrets未登録 | 対象枠は公開されない。missing_slotsを確認し、代表承認済み版を登録後にpublishを実行。他の正常な承認済み記事は公開可能 |
| 不正パッケージ・SEO/ハッシュ不一致 | その実行ではcommitしない。私有の原稿ファイルを確認し、再承認・再登録して再実行 |
| pushの競合 | force pushせず停止。最新版mainからRun workflowを新規実行。過去runの古い作業コピーを本番へ押し込まない |
| Vercel未反映・失敗 | 公開コミットがあるか、対応デプロイがあるかを確認。Git作者・PAT・連携・Buildログを調査。既存公開コミットのRedeployを行い、verifyで確認。再度publishしても記事は増殖しない |
| 確認だけ失敗 | Run workflowをmain・verifyで実行。mainのファイルは変更しない |
| 自己無効化失敗 | ActionsのworkflowメニューでDisable workflow。固定6枠と11月の時刻ガードは残る |

07:10時点などで担当者がActionsと本番URLを確認する運用を推奨する。schedule自体が全て起動しない場合を検出する独立した監視・通知サービスは今回追加していない。GitHubの失敗通知は担当者の既存の通知設定に依存するため、必要な設定を事前に確認する。今回メール・Slack等へ通知を送っていない。

不具合時は、まず有効化変数をfalseにしてworkflowを無効化し、既に実行中のrunもキャンセルする。VercelのRollback画面で戻す対象が利用可能なら直前の正常デプロイへ戻す。利用できない場合は問題の公開コミットをrevertし、通常のGitデプロイを行う。Vercelだけを戻してmainを残すと次回デプロイで復活するため、両方を整合させる。公開済み記録と対象記事を別々に削除しない。復旧は本番変更として代表の承認下で行う。

公開済み原稿が第三者やキャッシュへ渡った後は、ロールバックで回収できない。11月以降の再公開は自動workflowで行わず、代表が内容・日時を改めて承認する。

最後の6URL確認後はworkflow無効化を確認し、有効化変数をfalseへ戻し、不要となったPATを失効・Secretsを削除する。再確認だけなら手元の承認されたcheckoutで`python3 scripts/column_release.py verify`を使用できる。無効化済みworkflowの再有効化は公開を再開する目的で行わない。
