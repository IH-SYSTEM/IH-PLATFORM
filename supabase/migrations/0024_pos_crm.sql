-- 美容室（COOKIE for MEN・COOKIE熊本）の自社CRMの来店記録を、毎朝取り込む（2026-10-09）
alter table pos_imports drop constraint if exists pos_imports_source_check;
alter table pos_imports add constraint pos_imports_source_check check (source in ('airregi', 'ikkou', 'crm'));
