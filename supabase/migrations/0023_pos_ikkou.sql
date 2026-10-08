-- 一鴻（自社開発のレジ）の売上を、毎朝 API で取り込む（2026-10-09）
alter table pos_imports drop constraint if exists pos_imports_source_check;
alter table pos_imports add constraint pos_imports_source_check check (source in ('airregi', 'ikkou'));
