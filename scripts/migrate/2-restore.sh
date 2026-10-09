#!/bin/bash
# 東京への引っ越し ②：新データベース（東京）に、①で書き出したものを入れる
#   使い方：
#     export NEW_DB_URL='postgresql://postgres.新しいID:パスワード@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
#     bash scripts/migrate/2-restore.sh
#   リハーサルで入れたものがあるときは、先に --reset を付けて public を空にする（auth のスタッフも消して入れ直す）
set -euo pipefail
: "${NEW_DB_URL:?NEW_DB_URL を設定してください}"
IN="$HOME/ih-migrate"
case "$NEW_DB_URL" in *kpqiluwpdzifygbrccfy*) echo "NEW_DB_URL が旧データベースを指しています。止めます"; exit 1 ;; esac

if [ "${1:-}" = "--reset" ]; then
  echo "新データベースの public と auth のユーザーを空にします（リハーサルのやり直し用）"
  psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -c "drop schema if exists public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres, service_role;" -c "delete from auth.identities; delete from auth.users;"
fi

echo "構造を入れています…"
# 新しいプロジェクトにはもともと public があるので、作り直す行と、持ち主しか書けない説明文の行は外す
grep -vE '^(CREATE SCHEMA "public";|COMMENT ON SCHEMA "public")' "$IN/schema.sql" > "$IN/schema.restore.sql"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -q -f "$IN/schema.restore.sql"

echo "ログイン情報とデータを入れています（外部キーの確認は入れ終わるまで止める）…"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction \
  -c "SET session_replication_role = replica;" \
  -f "$IN/data-auth.sql" \
  -f "$IN/data-public.sql"

echo "入れ終わりました。次は 3-copy-storage.mjs（ファイル）と 4-verify.sh（件数の照合）"
