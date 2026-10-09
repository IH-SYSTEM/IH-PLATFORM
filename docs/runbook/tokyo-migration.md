# IH-PLATFORM を東京に引っ越す手順

データベース（Supabase）とサーバー（Vercel）を、シドニーから東京に移す。日本からの表示が 0.3〜1.3 秒 → 0.1〜0.3 秒ほどになる見込み。

- 旧：Supabase `kpqiluwpdzifygbrccfy`（ap-southeast-2 シドニー）／Vercel `syd1`
- 新：Supabase 新プロジェクト（ap-northeast-1 東京）／Vercel `hnd1`
- 引っ越すもの：データベース（表・ビュー・関数・RLS の決まり・データ）、ログイン情報（49人。パスワードはそのまま使える）、保管ファイル（`private-files`）
- 止める時間：本番の切り替えで 30〜60 分
- 旧プロジェクトは 2 週間は消さずに残す（戻せるように）

**大事な決まり**
- データベースのパスワードや鍵は、チャットに貼らない。ターミナルで `export` して使う
- 書き出したデータ（`~/ih-migrate`）には個人情報が入る。Git に入れない。作業が終わったら消す
- 本番の前に、必ずリハーサル（③）をする

---

## 状況（2026-10-10）

- **Supabase の Pro プランが必要**（新しいプロジェクトを作るため。Pro なら自動停止なし・毎日のバックアップつき）。支払いは法人カードで、カードの到着待ち。届いたら Pro にして ① から始める
- それまでの間も機能は作り続ける。この手順は**本番のデータベースをその時点で丸ごと書き出す**ので、待っている間に表や決まりが増えても、手順を変える必要はない（SQL を1つずつ流し直さない）
- 引っ越しの間（切り替えから2週間）は新旧2つ分の料金がかかる。旧を消せば1つ分に戻る

## ① 準備（いつでも。止めない）

1. PostgreSQL のコピー道具を入れる（Mac のターミナル）
   ```bash
   brew install libpq && brew link --force libpq
   ```
   `pg_dump --version` で 17 以上が出ればよい。
2. **東京に新しい Supabase プロジェクトを作る**（黒田さん）
   - 先に組織を **Pro プラン**にする（Billing。法人カード）
   - 今の IH-PLATFORM と同じ組織の中で「New project」
   - 名前：`IH-PLATFORM-TOKYO`、Region：**Northeast Asia (Tokyo)**、データベースのパスワードを決めてパスワード管理アプリに保存
   - 作れたら、新しいプロジェクトの ID（URL の `https://○○○.supabase.co` の ○○○）をチャットで知らせる（ID は秘密ではない）
3. 新プロジェクトの設定（Authentication → URL Configuration）
   - Site URL：`https://portal.ikkou-holdings.co.jp`
   - Redirect URLs：`https://portal.ikkou-holdings.co.jp/**` と `http://localhost:3000/**`
4. 接続の文字列を手元に用意する（どちらも Project Settings → Database → Connection string → **Session pooler**）
   ```bash
   export OLD_DB_URL='postgresql://postgres.kpqiluwpdzifygbrccfy:旧のパスワード@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
   export NEW_DB_URL='postgresql://postgres.新しいID:新しいパスワード@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
   ```

## ② メンテナンス画面の確認（いつでも）

本番を止めるときは、Vercel の環境変数 `MAINTENANCE=1` を入れて反映し直すと、全画面が「ただいまメンテナンス中です」になる（毎朝の自動取り込みも止まる）。外すときは `MAINTENANCE` を消して反映し直す。

## ③ リハーサル（止めない。本番の数日前）

旧はそのまま動かしたまま、新に一度まるごと入れて、うまく入るかを確かめる。

```bash
cd ~/ih-platform
bash scripts/migrate/1-dump.sh              # 旧から書き出す
bash scripts/migrate/2-restore.sh           # 新に入れる（2回目からは --reset を付ける）
export OLD_URL=https://kpqiluwpdzifygbrccfy.supabase.co OLD_SERVICE_KEY='旧の service_role キー'
export NEW_URL=https://新しいID.supabase.co      NEW_SERVICE_KEY='新の service_role キー'
node scripts/migrate/3-copy-storage.mjs     # ファイルを写す
bash scripts/migrate/4-verify.sh            # 件数を照らし合わせる →「すべて同じです」
```

エラーが出たら、その画面をチャットに貼る（パスワードが写っていないか確かめてから）。直してからもう一度。
リハーサルでは、新の URL・キーを使った**検証用のデプロイ**（本番とは別のURL）でログイン・給与明細・シフト・売上・証明書の表示まで確かめる。

## ④ 本番の切り替え（夜の営業後など、止めてよい時間）

| 時刻の目安 | やること | 誰が |
|---|---|---|
| 前日 | LINE配信で「◯日 ◯時〜◯時はポータルを止めます。その間の打刻は、あとで報告窓口から出勤・退勤の報告をしてください」と全員に送る | 本部 |
| 0:00 | Vercel に `MAINTENANCE=1` を入れて反映 → メンテナンス画面になったのを確かめる | Claude |
| 0:05 | `2-restore.sh --reset` → `1-dump.sh` → `2-restore.sh` → `3-copy-storage.mjs` → `4-verify.sh`（「すべて同じです」まで） | 黒田さん（ターミナル）／Claude が見守る |
| 0:25 | Vercel の環境変数を新しいものに入れ替える：`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` | 黒田さん（鍵）／Claude（手順） |
| 0:30 | `vercel.json` の regions を `hnd1` にして反映。`MAINTENANCE` を消して反映 | Claude |
| 0:35 | 確認：ログイン（パスワード・LINE）、ホーム、給与明細、シフト、勤怠、売上、データ取り込み、証明書のPDF、AI取説、毎朝の自動取り込み（`/api/cron/pos-sync` を手で1回） | Claude と黒田さん |
| 0:45 | 手元の `.env.local` の3行も新しいものに書き換える（**ほかの行は残す**） | 黒田さん |

- 切り替えると、**全員が一度ログインし直し**になる（新しいデータベースでは、ログインの合言葉が変わるため）。パスワードとLINEログインはそのまま使える。
- 店の打刻用のQR画面（iPad）は、そのまま再読み込みすれば使える（URL は変わらない）。

## ⑤ 戻すとき（切り替えのあとに大きな問題が出たら）

1. `MAINTENANCE=1` を入れて反映
2. Vercel の環境変数を旧の3つに戻し、`vercel.json` を `syd1` に戻して反映
3. `MAINTENANCE` を消して反映

切り替えのあとに新で記録されたデータ（打刻など）は旧には入らないので、戻すのは切り替えの当日中に判断する。

## ⑥ あとかたづけ（2週間後）

- 問題がなければ、旧プロジェクトを一時停止 → 削除
- `~/ih-migrate`（書き出したデータ）を消す
- メモ（project_ih_platform）の Supabase の ID を新しいものに書き換える
