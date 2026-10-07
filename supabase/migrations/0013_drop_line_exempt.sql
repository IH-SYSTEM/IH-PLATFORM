-- LINE連携は例外なく全員必須（2026-10-08 黒田さん決定）。免除の欄は使わないので消す
-- ※コードが line_exempt を読まなくなってから（このPRの公開後に）実行する
alter table staff drop column if exists line_exempt;
