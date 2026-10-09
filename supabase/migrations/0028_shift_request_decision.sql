-- アルバイトのシフト希望を、店長が表の中で「承認／却下」する（2026-10-09 黒田さん要望）
--   承認＝その日の確定シフトを作る（shift_schedule）。却下＝ここに記録して「待機」から外す
alter table shift_requests add column if not exists decision text check (decision in ('rejected'));
alter table shift_requests add column if not exists decided_by text references staff(id) on delete set null;
alter table shift_requests add column if not exists decided_at timestamptz;
