-- 店ごとに「売上をどのデータで数えるか」を決める（2026-10-09 黒田さん決定：美容室はCRMが基準）
--   null … 取り込んだものをすべて数える
--   'crm' … CRM（来店記録）だけで数える。レジ（エアレジ・ポスタス）は突き合わせにだけ使う
alter table stores add column if not exists sales_source text check (sales_source in ('airregi', 'ikkou', 'crm'));
update stores set sales_source = 'crm' where code in ('SKC', 'CFM');

create or replace view pos_daily with (security_invoker = true) as
select r.store_id, r.business_date, sum(r.total)::bigint as sales, sum(r.people)::bigint as people, count(*)::int as receipts
from pos_receipts r
join stores s on s.id = r.store_id
where s.sales_source is null or r.source = s.sales_source
group by r.store_id, r.business_date;

-- 突き合わせ用：データの出どころごとの日別合計
create or replace view pos_daily_by_source with (security_invoker = true) as
select store_id, business_date, source, sum(total)::bigint as sales, count(*)::int as receipts
from pos_receipts
group by store_id, business_date, source;

-- COOKIE熊本のエアレジCSVは「突き合わせ用」に
update routines set title = 'COOKIE熊本のエアレジCSVを取り込む（CRMとの突き合わせ用）' where title = 'COOKIE熊本のエアレジCSVを取り込む';
