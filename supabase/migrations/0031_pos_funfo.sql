-- obanzai（FUNFO のレジ）の売上を自動で取り込む（2026-10-13）。1日1行（日の合計）で入る
alter table pos_imports drop constraint if exists pos_imports_source_check;
alter table pos_imports add constraint pos_imports_source_check check (source in ('airregi', 'ikkou', 'crm', 'funfo'));
