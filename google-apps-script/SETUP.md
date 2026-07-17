# REVIA 無料相談予約システム 設定手順

この手順では、空き日時を1つ選ぶと予約が確定し、予約専用Zoom、Googleカレンダー、スプレッドシート、通知メールを自動作成できるようにします。

認証情報はHTML、JavaScript、`Code.gs`、GitHubへ書かないでください。Zoomの3つの認証情報と作成先ユーザーIDは、Google Apps Scriptの「スクリプトプロパティ」にだけ保存します。

## 1. Googleスプレッドシートを確認する

1. 現在予約保存に使用しているGoogleスプレッドシートを開きます。
2. シート名が `無料相談予約` であることを確認します。
3. Apps Scriptをこのスプレッドシートから開いている場合は、`Code.gs` の `spreadsheetId: ""` のままでも利用できます。
4. 保存先を明示する場合は、スプレッドシートURLの `/d/` と `/edit` の間にあるIDを、`REVIA_SETTINGS.spreadsheetId` に設定します。

既存の「第1希望」「第2希望」「第3希望」列は、過去データを守るため自動削除しません。新しい予約では使用せず、Zoom情報や面談時間の列を末尾へ追加します。

## 2. Apps Scriptのコードを貼り替える

1. Googleスプレッドシートの「拡張機能」→「Apps Script」を開きます。
2. 左側の `Code.gs` を開きます。
3. 現在の内容を、このフォルダの [Code.gs](./Code.gs) 全文へ貼り替えます。
4. 保存ボタンを押します。
5. `calendarId`、`adminEmail`、`spreadsheetId`、`sheetName` が現在の運用に合っているか確認します。

WebアプリURLは変更しません。新しいデプロイを別に作成する必要もありません。

## 3. 面談可能時間を設定する

`Code.gs` 上部の `REVIA_SETTINGS.availability` に設定がまとまっています。

- `daysAhead`: 何日先まで候補を表示するか
- `cutoffHours`: 面談開始の何時間前で締め切るか
- `bufferBeforeMinutes`: 面談前の準備時間。初期値は15分
- `bufferAfterMinutes`: 面談後の記録時間。初期値は15分
- `weeklyRanges`: 曜日ごとの受付時間
- `manualBlocks`: 手動で予約不可にする日付・時間
- `specialOpenDays`: 通常休みの日を臨時受付日にする設定

曜日は `0=日、1=月、2=火、3=水、4=木、5=金、6=土` です。

```js
weeklyRanges: {
  1: [
    { start: "10:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ],
  3: [], // 水曜は休み
}
```

終日ブロックの例:

```js
{ date: "2026-07-15", allDay: true, reason: "研修" }
```

一部時間ブロックの例:

```js
{ date: "2026-07-18", start: "13:00", end: "15:00", reason: "予定あり" }
```

利用者が選ぶ面談は30分ですが、カレンダーとZoomには前後15分を含む60分で登録されます。

## 4. Zoom Server-to-Server OAuthアプリを作成する

Zoomの公式手順は [Create a Server-to-Server OAuth app](https://developers.zoom.us/docs/internal-apps/create/) でも確認できます。

1. [Zoom App Marketplace](https://marketplace.zoom.us/) を開き、REVIAで使用するZoomアカウントでログインします。
2. 「Develop」または「Developer」から「Build App」を開きます。
3. 「Server-to-Server OAuth」を選び、「Create」を押します。
4. アプリ名は、例として `REVIA Booking` と入力します。
5. 「Information」で運営者情報と連絡先を入力します。
6. 「Scopes」で次の権限を追加します。

現在のGranular Scopesを選べる画面では、次の2つを追加してください。

- `meeting:write:meeting:admin`：予約ごとのZoomミーティング作成に使用
- `meeting:delete:meeting:admin`：途中失敗時に作成済みZoomを削除する巻き戻しに使用

Classic Scopesの画面の場合は、`meeting:write:admin` を追加します。このClassic ScopeはZoom公式上、ミーティングの作成と削除の両方に対応しています。

Zoom公式の対応表は [Meetings APIs](https://developers.zoom.us/docs/api/meetings/) と [Granular scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-granular/) で確認できます。

7. 「Activation」でアプリを有効化します。
8. 「App Credentials」で次の3つを確認します。

- Account ID
- Client ID
- Client Secret

この3つは外部へ公開しないでください。スクリーンショットやGitHubにも載せないでください。

9. ミーティングを作成するZoomユーザーの「ユーザーID」または「Zoomの登録メールアドレス」を確認します。後述の `ZOOM_USER_ID` に設定します。`me` は使用しません。

## 5. Zoom認証情報をApps Scriptへ安全に登録する

1. Apps Script画面左側の歯車アイコン「プロジェクトの設定」を開きます。
2. 「スクリプト プロパティ」まで移動します。
3. 「スクリプト プロパティを追加」を押します。
4. 次の4行を追加します。

| プロパティ | 値 |
| --- | --- |
| `ZOOM_ACCOUNT_ID` | ZoomのAccount ID |
| `ZOOM_CLIENT_ID` | ZoomのClient ID |
| `ZOOM_CLIENT_SECRET` | ZoomのClient Secret |
| `ZOOM_USER_ID` | ミーティングを作成するZoomユーザーのIDまたは登録メールアドレス |

5. 「スクリプト プロパティを保存」を押します。

4項目のうち1つでも未設定の場合、予約は確定しません。固定Zoom URLへ切り替わることもありません。`ZOOM_USER_ID` の値は `Code.gs` へ直接書かないでください。

## 6. Apps Scriptのタイムゾーンを確認する

1. Apps Scriptの「プロジェクトの設定」を開きます。
2. タイムゾーンが `（GMT+09:00）東京` になっていることを確認します。
3. `Code.gs` の `timezone` が `Asia/Tokyo` であることも確認します。

## 7. 既存Webアプリを再デプロイする

新しいWebアプリを作らず、現在のデプロイを更新します。

1. Apps Script右上の「デプロイ」→「デプロイを管理」を開きます。
2. 現在使用中のウェブアプリを選び、鉛筆アイコンを押します。
3. 「バージョン」で「新バージョン」を選びます。
4. 実行ユーザーが「自分」になっていることを確認します。
5. アクセスできるユーザーが、現在の設定どおり「全員」になっていることを確認します。
6. 「デプロイ」を押します。
7. 表示されたウェブアプリURLが、`script.js` の `REVIA_SETTINGS.bookingEndpoint` と同じであることを確認します。

初回は、カレンダー、スプレッドシート、メール送信、外部サービスへの接続についてGoogleの権限承認が求められる場合があります。

## 8. 空き時間APIを確認する

1. 現在のウェブアプリURL末尾に `?mode=availability` を付けて開きます。
2. `"ok":true` が表示されることを確認します。
3. `slots` に日付と30分の面談時間が表示されることを確認します。
4. Googleカレンダーへ予定を入れ、その予定と前後15分の確保時間が重なる枠が消えることを確認します。
5. `manualBlocks` の時間と前後15分が重なる枠も消えることを確認します。

## 9. テスト予約を行う

本番公開前に、ご自身の受信できるメールアドレスで1件テストしてください。

1. LPの無料相談フォームを開きます。
2. 日付を1つ選び、その日に表示された時間を1つ選びます。
3. テスト用の氏名・ふりがな・メールアドレス・学年・科目を入力します。
4. 「無料相談を予約する」を押します。
5. 画面に「無料相談のご予約が確定しました」と表示されることを確認します。
6. Zoom管理画面で、面談開始15分前から終了15分後までの60分のミーティングが作成されたことを確認します。
7. Googleカレンダーに同じ60分の予定が登録されたことを確認します。
8. カレンダーのタイトルには、利用者向けの30分の面談時間が表示されていることを確認します。
9. 申込者メールに、30分の面談時間と予約専用の `join_url` が届くことを確認します。
10. `revia2026.mail@gmail.com` に管理者通知が届くことを確認します。
11. スプレッドシートにZoomミーティングID、参加URL、作成日時、面談開始・終了、確保開始・終了が保存されたことを確認します。
12. 同じ時間がフォームの空き候補から消えたことを確認します。

## 10. 二重予約テスト

可能であれば、PCとスマートフォンで同じ空き時間を表示して試します。

1. 両方の画面で同じ日時を選びます。
2. 片方から先に送信し、予約を確定します。
3. もう片方から送信します。
4. 後から送信した画面に「申し訳ありません。この時間は直前に予約が入りました。別の日時を選択してください。」と表示されることを確認します。
5. 後から送信した分について、Zoom、カレンダー、シート、メールが作られていないことを確認します。

## 11. エラー時の確認

- Zoom認証情報を一時的に誤った値へ変更したテストは、本番受付時間外に行ってください。
- Zoom作成に失敗した場合、カレンダー登録、スプレッドシート保存、メール送信は行われません。
- 途中でカレンダーやシート処理が失敗した場合、作成済みデータを可能な範囲で削除します。
- 詳細な原因はApps Script左側の「実行数」から該当実行のログを確認します。
- 利用者画面には認証情報やZoom APIの詳細エラーを表示しません。

## 12. 本番反映の順番

新旧コードの食い違いを避けるため、次の順で反映してください。

1. Zoom Server-to-Server OAuthアプリを作成・有効化
2. Apps Scriptのスクリプトプロパティへ4つのZoom設定値を登録
3. Apps Scriptの `Code.gs` を貼り替え
4. 既存Webアプリを新バージョンとして再デプロイ
5. `?mode=availability` で確認
6. GitHubへ `index.html`、`script.js`、`styles.css` をアップロード
7. Vercelの自動デプロイ完了後にテスト予約

## 注意

- `start_url` はホスト専用です。コードでは保存・返信・画面表示をしません。
- 申込者へ案内するのはZoom APIの `join_url` だけです。
- Zoom認証情報はGitHubへアップロードしません。
- `Code.gs` を変更しただけでは本番Webアプリへ反映されません。必ず既存デプロイを新バージョンへ更新してください。
- Zoom APIの作成上限やGoogle Apps Scriptのメール送信上限など、各サービスの利用制限があります。
