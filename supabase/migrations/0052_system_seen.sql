-- 「システムの更新」を最後に見た時刻（2026-10-21 黒田さん：新しい更新には印を付け、2回目の表示からは消す）
alter table staff add column if not exists system_seen_at timestamptz;
