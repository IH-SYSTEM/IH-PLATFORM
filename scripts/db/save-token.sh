#!/bin/bash
# クリップボードにコピーした Supabase のトークンを ~/.supabase-ih-token に保存する（画面には出さない）
#   使い方：Supabase でトークンを作ってコピー → bash scripts/db/save-token.sh
T=$(pbpaste | tr -d '[:space:]')
case "$T" in sbp_*) ;; *) echo "クリップボードの中身がトークン（sbp_ で始まる）ではありません"; exit 1;; esac
umask 077
printf '%s' "$T" > "$HOME/.supabase-ih-token"
chmod 600 "$HOME/.supabase-ih-token"
echo "保存しました（$(wc -c < "$HOME/.supabase-ih-token" | tr -d ' ')文字）"
