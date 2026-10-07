-- 店舗ごとの残業の数え方（docs/payroll-rules.md 2〜5）
--   weekly_variable … 1週間単位の非定型的変形労働時間制（常時30人未満の飲食店など）。その日のシフトの時間を超えた分が残業
--   statutory       … 法定どおり。1日8時間を超えた分が残業
-- どちらも週40時間を超えた分は残業
alter table stores add column if not exists overtime_rule text not null default 'statutory';
alter table stores drop constraint if exists stores_overtime_rule_check;
alter table stores add constraint stores_overtime_rule_check check (overtime_rule in ('weekly_variable', 'statutory'));

-- 飲食店4店（2026-10-08 黒田さん回答）
update stores set overtime_rule = 'weekly_variable' where code in ('IKK', 'ICH', 'NEK', 'OBZ');
