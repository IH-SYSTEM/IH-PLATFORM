-- 公式LINE（IKKOU HOLDINGS NEWS）を友だち追加しているか。LINEでログイン・連携するたびに LINE の API で確かめて記録する
--   true＝友だち／false＝友だちでない（ブロック中も含む）／null＝確かめられない（公式LINEがログインのチャネルにリンクされていない等）
-- true（友だちと確認できた）でない人は、友だち追加の画面に移す（通知が届かないため。2026-10-08 から null も止める）
alter table staff add column if not exists line_friend boolean;
alter table staff add column if not exists line_friend_checked_at timestamptz;
