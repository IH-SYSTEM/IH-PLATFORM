-- 正社員の休みの希望を2段階に・繁忙日（2026-10-21 黒田さん）
--   firmness … 希望休の強さ。fixed＝動かせない／flexible＝調整できる（予約しだいで出勤に変えてよい）
--   繁忙日（毎週の曜日・特定の日）は、正社員は出勤が必須で、希望休を出せない
--   ただし「繁忙日も希望休を出せる」人（その分、基本給が低い雇用形態）は出せる
alter table shift_requests add column if not exists firmness text check (firmness in ('fixed', 'flexible'));
alter table stores add column if not exists busy_weekdays int[] not null default '{}';
alter table stores add column if not exists busy_dates date[] not null default '{}';
alter table staff add column if not exists busy_off_allowed boolean not null default false;
