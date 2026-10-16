-- マネーフォワードの「部門」の名前（2026-10-16 仕訳帳の見本に合わせる）。経費を書き出すとき、店をこの名前の部門にする。
-- 空なら店の名前を使う。見本（フードサービス）にあった部門：根っこ・obanzai・本部
alter table stores add column if not exists mf_department text check (char_length(mf_department) <= 40);
update stores set mf_department = '根っこ' where code = 'NEK' and mf_department is null;
update stores set mf_department = 'obanzai' where code = 'OBZ' and mf_department is null;
update stores set mf_department = '本部' where code = 'IH' and mf_department is null;
