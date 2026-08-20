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

## 5. トップページの最新記事を更新する

`index.html` の「代表の視点｜REVIA column」セクションにある `.column-latest-card` を、最新記事の内容へ更新します。

- 公開日
- 記事タイトル
- 短い紹介文
- 「続きを読む」のリンク

コラムのコーナー名、サブタイトル、「コラム一覧を見る」のリンクは通常変更しません。

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
