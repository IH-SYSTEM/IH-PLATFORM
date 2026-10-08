-- シフトの役割（キャッシャー・ホール・キッチンアシスタントなど）。2026-10-08 黒田さん要望
-- 役割は店ごとに違うので、店舗マスタに一覧を持たせる（増やすのにマイグレーションは要らない）。シフトには役割の名前を保存する
alter table stores add column if not exists work_roles text[] not null default '{}';
alter table shift_schedule add column if not exists work_role text check (char_length(work_role) <= 20);

-- 飲食4店の初期値（店舗マスタから変更できる）
update stores set work_roles = array['キャッシャー', 'ホール', 'キッチンアシスタント', '呼び込み', 'バッシング', 'ドリンカー']
where code in ('IKK', 'ICH', 'NEK', 'OBZ') and work_roles = '{}';
