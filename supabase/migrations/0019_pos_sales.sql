-- データ集積所：レジの売上（2026-10-09 黒田さん方針「会社の全データを集める」の第1弾）
--   pos_imports       … 取り込んだファイルの記録（原本は private-files の pos/ に保管）
--   pos_receipts      … 会計1件ごと（同じ会計を何度取り込んでも1件。店舗＋レジ＋取引No で一意）
--   pos_receipt_items … 会計の中の注文（メニュー・カテゴリー・単価・数量）
-- 営業日は 6:00 区切り（深夜0時〜6時の会計は前日の営業日）
create table if not exists pos_imports (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  source text not null check (source in ('airregi')),
  file_name text,
  file_sha256 text not null,
  file_path text,
  receipts int not null default 0,
  date_from date,
  date_to date,
  imported_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pos_imports_store_idx on pos_imports(store_id, created_at desc);

create table if not exists pos_receipts (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id),
  source text not null,
  receipt_no text not null,
  business_date date not null,
  checkout_at timestamptz,
  total int not null,            -- 税込（修正後）
  tax int,                       -- 内消費税（修正後）
  people int,
  items int,
  discount int,                  -- 割引・割増の合計（税込。割引はマイナス）
  payments jsonb not null default '{}',  -- 支払い方法ごとの金額（0 の方法は入れない）
  cashier text,
  slip text,
  import_id uuid references pos_imports(id) on delete set null,
  unique (store_id, source, receipt_no)
);
create index if not exists pos_receipts_day_idx on pos_receipts(store_id, business_date);

create table if not exists pos_receipt_items (
  id bigserial primary key,
  receipt_id uuid not null references pos_receipts(id) on delete cascade,
  category text,
  name text,
  price int,
  qty numeric,
  discount int
);
create index if not exists pos_receipt_items_receipt_idx on pos_receipt_items(receipt_id);

-- 本部（管理者）だけが読める。書き込みはサーバー（service role）から
alter table pos_imports enable row level security;
alter table pos_receipts enable row level security;
alter table pos_receipt_items enable row level security;
drop policy if exists pos_imports_admin on pos_imports;
create policy pos_imports_admin on pos_imports for select to authenticated using (is_admin());
drop policy if exists pos_receipts_admin on pos_receipts;
create policy pos_receipts_admin on pos_receipts for select to authenticated using (is_admin());
drop policy if exists pos_receipt_items_admin on pos_receipt_items;
create policy pos_receipt_items_admin on pos_receipt_items for select to authenticated using (is_admin());

-- 店舗別・日別の集計（売上の画面はこれを読む）
create or replace view pos_daily with (security_invoker = true) as
select store_id, business_date, sum(total)::bigint as sales, sum(people)::bigint as people, count(*)::int as receipts
from pos_receipts
group by store_id, business_date;
