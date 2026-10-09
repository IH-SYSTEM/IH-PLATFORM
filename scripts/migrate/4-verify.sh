#!/bin/bash
# 東京への引っ越し ④：旧と新で、すべての表の件数・ログインの人数・ファイルの数が同じかを照らし合わせる
#   使い方：OLD_DB_URL と NEW_DB_URL を設定してから実行。違いがあれば「違う」と出して終わる
set -euo pipefail
: "${OLD_DB_URL:?OLD_DB_URL を設定してください}"
: "${NEW_DB_URL:?NEW_DB_URL を設定してください}"

counts() {
  local q
  q=$(psql "$1" -At -c "select string_agg(format('select %L, count(*) from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname = 'public'")
  psql "$1" -At -F ' ' -c "$q union all select 'auth.users', count(*) from auth.users union all select 'auth.identities', count(*) from auth.identities union all select 'storage.objects', count(*) from storage.objects" | sort
}

counts "$OLD_DB_URL" > /tmp/ih-old-counts.txt
counts "$NEW_DB_URL" > /tmp/ih-new-counts.txt
if diff -u /tmp/ih-old-counts.txt /tmp/ih-new-counts.txt; then
  echo "すべて同じです（$(wc -l < /tmp/ih-old-counts.txt) 項目）"
else
  echo "違いがあります（上の - が旧、+ が新）"
  exit 1
fi
