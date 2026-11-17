# 「代表の視点｜REVIA column」記事追加手順

月1回程度の記事追加を想定した、初心者向けの確認手順です。

## 1. Codexへ用意する内容

次の内容を1つの依頼文にまとめます。

- 記事タイトル
- 公開日
- meta descriptionに入れたい要約（未指定の場合は、本文をもとに作成するよう依頼）
- 記事本文
- 参考資料の名称、URL、確認日または公開日
- 記事画像（ある場合のみ）

本文の言い回しを変えてほしくない場合は、「本文は変更せず、HTMLへ変換してください」と明記します。

## 2. ファイル名の付け方

記事ファイルは `column/` 内へ保存します。

```text
column/YYYY-MM-内容を表す短い英数字.html
```

例:

```text
column/2026-08-summer-study-reset.html
```

- 半角英数字とハイフンだけを使います。
- 空白や日本語はファイル名に使いません。
- 一度公開したファイル名は、URLが変わるため原則変更しません。

## 3. 新規記事ページで変更する場所

直前の記事HTMLを複製し、次を記事ごとに変更します。

1. `<title>`
2. `meta description`
3. canonical URL
4. OGPとTwitter Cardのタイトル、description、URL、画像
5. `article:published_time` と `article:modified_time`
6. `BlogPosting`構造化データのタイトル、description、日付、URL、画像
7. ページ内の公開日、記事タイトル、カテゴリー、本文、参考資料

`styles.css`、予約用の`script.js`、Google Apps Scriptは記事追加のたびに変更しません。

## 4. コラム一覧を更新する

`column/index.html` の `.column-card-grid` 内へ、新しい記事カードを先頭に追加します。

カードでは次を変更します。

- 第何回か
- 公開日
- カテゴリー
- 記事タイトル
- 短い紹介文
- 記事ファイルへのリンク

記事が増えても、同じ `.column-card` を複製して使います。

## 5. トップページの最新記事を同期する

トップページは「REVIA COLUMN」「代表の視点」と、最新記事1件の公開日・タイトル・記事リンク・一覧リンクだけを表示します。画像や過去記事カードを追加しません。記事情報の編集元は `column/index.html` です。トップの情報は次のコマンドで生成します。

```sh
python3 scripts/column_release.py sync-home
python3 scripts/column_release.py sync-home --apply
```

最初のコマンドは変更の有無だけを確認し、`--apply` がローカルの `index.html` を更新します。commit・push・デプロイは実行しません。

- 候補は `config/pages-public.json` の `existing_articles` と既存の公開台帳に登録され、一覧に掲載された記事だけです。下書きは公開許可リスト・一覧へ登録しないでください。`data-status="draft"` のカードも選びません。
- 一覧カードの `time[datetime]` を公開日時として、新しい順に選びます。日時はタイムゾーン付き、日付だけなら日本時間00:00として扱います。未来日時の記事は選びません。同じ日時なら記事URLの昇順を優先します。
- 新しい一般記事では、従来のHTML・画像・一覧・sitemap更新に加え、既存の配信許可リストも更新し、この同期コマンドを実行してください。トップのタイトルや日付を手入力する必要はありません。
- 既存の `prepare_november_column.py` と10月の公開準備処理は、一覧更新後に同じ同期処理を呼び出します。10月の期限・11月の対象日制限は変更していません。対象外の新記事には上記の同期コマンドを使います。
- 日時の経過だけではファイル更新・公開は実行されません。未来の予約記事を配信許可リストへ先行登録せず、公開日時以降に既存の公開手順で反映・同期・検証してください。
- 公開前に `python3 -m unittest discover -s tests -v` と既存ビルドを実行し、PC・スマホの表示を確認します。本番反映には代表の最終承認が必要です。

## 6. sitemap.xmlを更新する

`sitemap.xml` に新しい記事URLを追加します。

```xml
<url>
  <loc>https://www.revia.website/column/記事ファイル名.html</loc>
  <lastmod>YYYY-MM-DD</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.7</priority>
</url>
```

コラム一覧ページの内容を更新したときは、`https://www.revia.website/column/` の `lastmod` も最新記事の公開日に更新します。

## 7. 公開前の確認

- PCとスマホでタイトル、本文、参考資料が読みやすいか
- トップページから最新記事を開けるか
- コラム一覧から記事を開けるか
- 記事から無料診断、無料相談、コラム一覧へ移動できるか
- canonical、OGP、公開日が新しい記事の内容になっているか
- 参考資料のリンク切れがないか
- `sitemap.xml` に記事URLが入っているか
- 記事本文に意図しない書き換えがないか

確認後に、変更したファイルだけをGitHubへ反映します。
