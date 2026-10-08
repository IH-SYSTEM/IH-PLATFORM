-- 見た目の確認用の「偽の勤怠」（2026-10-09 黒田さん要望）。source='demo' で入れ、終わったらまとめて消す
--   消すとき: delete from attendance where source = 'demo';
alter table attendance drop constraint if exists attendance_source_check;
alter table attendance add constraint attendance_source_check check (source in ('qr', 'report', 'admin', 'demo'));
