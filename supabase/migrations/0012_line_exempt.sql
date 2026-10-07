-- LINE連携の必須化（2026-10-08 黒田さん決定）。最初のログインでLINE連携を求め、連携するまで先へ進めない。
-- LINEを使っていない人だけ、管理者が「免除」にできる（本人は自分を免除にできない）
alter table staff add column if not exists line_exempt boolean not null default false;
