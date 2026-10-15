-- データ保管庫に入っているファイルの名前を、中身に合わせて付け直す（2026-10-15 黒田さん）。
-- 形：書類の名前_日付_会社（例：決算書_2026-03-31_一鴻フードサービス.pdf）。拡張子は元のまま。中身・種類・日付は変えない
update files f
set name = concat_ws('_', coalesce(f.doc_kind, '書類'), f.doc_date::text, replace(c.name, '株式会社', '')) || coalesce(substring(f.name from '\.[^.]+$'), '')
from companies c
where c.id = f.owner_company_id
  and f.status = 'ready'
  and f.category <> 'corp_data'
  and f.doc_kind is not null;

select json_agg(name order by name) as renamed from files where owner_company_id is not null and status = 'ready';
