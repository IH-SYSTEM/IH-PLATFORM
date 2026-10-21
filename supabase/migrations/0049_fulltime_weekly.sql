-- 社員のシフトを週ごとに確定する店（2026-10-21 黒田さん：根っこは予約に合わせて社員の出勤・休みを入れ替える）
--   月の骨組み（前の月の25日に確定）は今まで通り。そのうえで、毎週水曜に翌週を確定し、社員に翌週の勤務を LINE で知らせる
--   （1週間単位の非定型的変形労働時間制の「前の週の終わりまでに知らせる」に合わせる）
alter table stores add column if not exists fulltime_weekly boolean not null default false;
update stores set fulltime_weekly = true where code = 'NEK';
