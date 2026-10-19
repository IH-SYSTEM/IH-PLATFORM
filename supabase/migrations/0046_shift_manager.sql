-- 店のシフト管理者（2026-10-19 黒田さん：管理者が店長とは限らない。店ごとに必ず1人決め、シフトの LINE はこの人に送る）
--   シフトの確定日の LINE・シフトなしの出勤／残業の承認・急募への応募・36協定の注意 は、シフト管理者に送る
--   シフト管理者は、その店のシフト確定・勤怠の承認ができる（店長と同じ範囲）
--   未設定の店や、本人の申請（自分の分は承認できない）は、これまで通り店長・責任者 → 総務・代表 に送る
alter table stores add column if not exists shift_manager_staff_id text references staff(id) on delete set null;
