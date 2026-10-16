-- 打刻とシフト（2026-10-16 黒田さん決定）
--   出勤：シフトがある日は、シフト開始の15分前から押せる（それより早くは押せない）
--         シフトがない日も押せるが「シフトなしの出勤」として記録し、店長に LINE（承認／却下）。却下した日は給与に入れない
--   退勤：シフトの終わりから15分以上たっていたら、理由（選ぶ＋書く）がないと押せない。店長に LINE（承認／却下）。
--         給与に入れる残業は、店長が承認した分だけ（承認されるまでは、シフトの終わりまでで数える）
alter table attendance add column if not exists no_shift boolean not null default false;
alter table attendance add column if not exists noshift_status text check (noshift_status in ('pending', 'approved', 'rejected'));
alter table attendance add column if not exists noshift_reviewed_by text references staff(id) on delete set null;
alter table attendance add column if not exists noshift_reviewed_at timestamptz;

alter table attendance add column if not exists overtime_minutes int check (overtime_minutes >= 0);   -- シフトの終わりから退勤までの分
alter table attendance add column if not exists overtime_category text check (char_length(overtime_category) <= 30);
alter table attendance add column if not exists overtime_reason text check (char_length(overtime_reason) <= 300);
alter table attendance add column if not exists overtime_status text check (overtime_status in ('pending', 'approved', 'rejected'));
alter table attendance add column if not exists overtime_reviewed_by text references staff(id) on delete set null;
alter table attendance add column if not exists overtime_reviewed_at timestamptz;

create index if not exists attendance_pending_idx on attendance(store_id) where noshift_status = 'pending' or overtime_status = 'pending';
