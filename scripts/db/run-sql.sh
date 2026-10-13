#!/bin/bash
# IH-PLATFORM の本番データベースに、SQL のファイルを流す（Supabase の Management API 経由）。
#   使い方：bash scripts/db/run-sql.sh supabase/migrations/0033_xxx.sql
#   鍵：~/.supabase-ih-token（IH-PLATFORM のプロジェクトにだけ届く、データベースだけのトークン。本人だけが読める）
#   流す前に、必ず黒田さんに中身を見せて OK をもらう（2026-10-13 決定）
set -euo pipefail
REF="kpqiluwpdzifygbrccfy" # IH-PLATFORM 以外には流さない
FILE="${1:?SQL のファイルを指定してください}"
TOKEN_FILE="$HOME/.supabase-ih-token"
[ -s "$TOKEN_FILE" ] || { echo "トークンがありません（$TOKEN_FILE）"; exit 1; }
BODY=$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$FILE")
OUT=$(curl -sS -m 120 -w "\n%{http_code}" -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $(cat "$TOKEN_FILE")" -H "Content-Type: application/json" --data-binary "$BODY")
CODE=$(echo "$OUT" | tail -1)
echo "$OUT" | sed '$d'
[ "$CODE" = "201" ] || [ "$CODE" = "200" ] || { echo "失敗しました（HTTP $CODE）"; exit 1; }
echo "流しました：$FILE"
