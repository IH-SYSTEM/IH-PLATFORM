#!/bin/bash
# 東京への引っ越し ①：旧データベース（シドニー）から、構造とデータを書き出す
#   使い方：ターミナルで OLD_DB_URL を設定してから実行（パスワードを含むので、チャットには貼らない）
#     export OLD_DB_URL='postgresql://postgres.kpqiluwpdzifygbrccfy:パスワード@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
#     bash scripts/migrate/1-dump.sh
#   書き出し先：~/ih-migrate（リポジトリの外。個人情報を含むので Git に入れない）
set -euo pipefail
: "${OLD_DB_URL:?OLD_DB_URL を設定してください}"
OUT="${1:-$HOME/ih-migrate}"
mkdir -p "$OUT"

echo "構造（表・ビュー・関数・RLSの決まり）を書き出しています…"
pg_dump "$OLD_DB_URL" --schema-only --schema=public --no-owner --quote-all-identifiers -f "$OUT/schema.sql"

echo "データ（public）を書き出しています…"
pg_dump "$OLD_DB_URL" --data-only --schema=public --quote-all-identifiers -f "$OUT/data-public.sql"

echo "ログイン情報（auth.users・auth.identities。パスワードは暗号化されたまま）を書き出しています…"
pg_dump "$OLD_DB_URL" --data-only --quote-all-identifiers -t auth.users -t auth.identities -f "$OUT/data-auth.sql"

ls -la "$OUT"
echo "書き出しました：$OUT"
