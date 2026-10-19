# Cloudflare Pages 既存検証プロジェクト転用：安全手順（2026-10-19）

この変更は `revia-website-validation` を本番用に**条件付きで許可できるコード**を追加するだけです。適用だけで本番公開・切替にはなりません。

## 適用前に必ず確認
- 代表の作業承認と別途、本番切替承認が必要。DNS、独自ドメイン、Vercel、Google Meet GASは変更しない。
- 作業ブランチ `revia/cloudflare-validation-conversion-20261019` のみで修正・テストする。
- `_worker.js` は本番フラグを満たしても `www.revia.website` 以外を404にする。このため `pages.dev` の実公開で予約操作はできない（別途のルーティング・HTTP確認が必要）。
- 既存のPages Productionは `codex/cloudflare-pages-validation` から現在配信中。設定変更前に最新デプロイと戻し先ブランチを記録する。

## コード側の条件
本番用の静的ビルドは以下すべて一致した場合に限る。いずれか不一致ならビルド失敗。

|項目|必須値|
|---|---|
|`REVIA_PAGES_MODE`|`production`|
|`REVIA_PAGES_PRODUCTION_APPROVED`|`true`|
|`REVIA_PAGES_PRODUCTION_PROJECT`|`revia-website-validation`|
|`REVIA_PAGES_VALIDATION_REPURPOSE_APPROVED`|`true`|
|Cloudflareの組込み `CF_PAGES_BRANCH`|`main`|
|Cloudflareの組込み `CF_PAGES_URL`|`https://revia-website-validation.pages.dev` またはその正当なデプロイサブドメイン|

`CF_PAGES_BRANCH`、`CF_PAGES_URL` を手動の環境変数として登録・偽装してはならない。4つのREVIA変数は**Production環境限定**で設定し、Preview側には転用承認を設定しない。

独立した将来の `revia-website-production` は引き続き別条件として利用できる。Previewモードでの転用承認や他プロジェクトとの組み合わせは拒否する。

## 段階的な運用（別承認が必要）
1. テスト実行後に作業ブランチへCommit、Publish。PRレビュー後にmainへマージ。mainのVercelが正常か確認。
2. Cloudflareの既存検証プロジェクトのビルド条件・Build output `dist` を控える。変更予定内容をレビューする。
3. Pages Settings > Production > Variables and secretsへ4つのREVIA変数を追加する。**この時点では本番ブランチを変えない。** 変更した環境変数だけで即時デプロイが始まる場合は中断して状態を確認する。
4. Settings > Build > Branch controlのProduction branchを `main` に変更する。変更後のビルド結果・commit SHAを確認し、公式独自ドメインを紐づける**前に** `pages.dev` でHTML/CSS/JS/画像/QAルートが404/noindexとなることを検証する。
5. `www.revia.website` のカスタムドメイン登録・証明書・DNSを別個に確認し、メール・Apexリダイレクト・SEO・GA4・実GAS予約挙動について計画をレビューする。**DNS切替の明示承認までVercelを維持する。**
6. 本番失敗時は独自ドメイン/DNSを触る前なら既存の検証設定へ戻す。DNS切替後は保存済みCNAMEと旧Vercelへの復旧経路に従う。秘密値・メールのDNSを推測して変更しない。

### 注意
Cloudflare `pages.dev` はProductionビルド後も404になるよう意図的に保護。Google Meet予約/問い合わせは公式ホストだけで実動する設計で、プレビューの模擬確認だけでは本番動作を保証しない。代表承認なく予約送信・実際のメール発信をしない。
