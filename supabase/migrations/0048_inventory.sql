-- 棚卸しシステム（2026-10-20 黒田さん）。会計ではなく、おおよその原価と「何がどれだけ残っているか」を、いつでも知るためのもの
--   納品伝票（経理がスキャン・写真で取り込む）→ AI が品目ごとに読む → 経理が確かめて保存 ＝ 仕入れ
--   店のレシートのうち仕入れ（材料仕入・酒類仕入）も、金額だけ仕入れに足す（雑費などは入れない）
--   棚卸し：いつでも数えられる。原価 ＝ 期首の在庫 ＋ 期間の仕入れ − 今の在庫
--   期首確定：その時点で数えた在庫を、次の期間の期首にする。残っている品目は次の棚卸し表にも必ず出る
--   まだオープン前：店舗マスタで「棚卸しシステムを使う」を入れた店だけ、店に出す（本部は先に使える）

alter table stores add column if not exists inventory_enabled boolean not null default false;
alter table stores add column if not exists target_food_cost_rate numeric(5, 4) check (target_food_cost_rate between 0 and 1); -- 目標の原価率（買いすぎの目安）

-- 品目（店ごと）。数える単位で持つ。仕入れの単位（ケースなど）からの換算も持つ
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  category text not null default '食材' check (category in ('食材', '酒', '飲料', '調味料', '冷凍品', '乾物', '消耗品', 'その他')),
  count_unit text not null default '個' check (char_length(count_unit) <= 10),       -- 数える単位（本・kg・個・袋）
  per_purchase numeric(10, 3) not null default 1 check (per_purchase > 0),          -- 仕入れ1単位が、数える単位でいくつか（1ケース＝24本 なら 24）
  unit_cost numeric(12, 2),                                                          -- 数える単位あたりの最後の仕入れ値（税込）
  track boolean not null default true,                                               -- 棚卸しで数える（その日に使い切る野菜などは false）
  aliases text[] not null default '{}',                                              -- 伝票での書き方のゆれ（AI の当てはめに使う）
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

-- 納品伝票
create table if not exists delivery_slips (
  id uuid primary key default gen_random_uuid(),
  store_id text references stores(id) on delete set null,
  status text not null default 'reading' check (status in ('reading', 'pending', 'approved', 'rejected')),
  source text not null default 'upload' check (source in ('upload', 'drive', 'photo')),
  file_id uuid references files(id) on delete set null,
  vendor text check (char_length(vendor) <= 100),
  slip_date date,
  total int,                       -- 税込
  tax8 int,                        -- 8%の消費税
  tax10 int,                       -- 10%の消費税
  ai_note text,
  ai_error text,
  ai_read_at timestamptz,
  reviewed_by text references staff(id) on delete set null,
  reviewed_at timestamptz,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_slips_store_date_idx on delivery_slips(store_id, slip_date) where status = 'approved';
create index if not exists delivery_slips_queue_idx on delivery_slips(status, created_at) where status in ('reading', 'pending');

create table if not exists delivery_slip_lines (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null references delivery_slips(id) on delete cascade,
  sort int not null default 0,
  raw_name text not null check (char_length(raw_name) <= 100),   -- 伝票に書いてある名前
  item_id uuid references inventory_items(id) on delete set null,
  qty numeric(12, 3) not null default 1,                          -- 伝票の数量（仕入れの単位）
  unit text check (char_length(unit) <= 10),
  unit_price numeric(12, 2),
  amount int not null,                                            -- 税込の金額
  tax_rate int not null default 8 check (tax_rate in (0, 8, 10))
);
create index if not exists delivery_slip_lines_slip_idx on delivery_slip_lines(slip_id, sort);
create index if not exists delivery_slip_lines_item_idx on delivery_slip_lines(item_id);

-- 期間（期首〜期首確定）。店ごとに、開いている期間は1つ
create table if not exists inventory_periods (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id) on delete cascade,
  start_date date not null,
  end_date date,                    -- 期首確定した日（null＝今の期間）
  closed_by text references staff(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists inventory_periods_open_idx on inventory_periods(store_id) where end_date is null;

-- 期首の在庫（前の期間の期首確定で数えたもの）
create table if not exists inventory_opening (
  period_id uuid not null references inventory_periods(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  qty numeric(12, 3) not null,
  unit_cost numeric(12, 2),
  primary key (period_id, item_id)
);

-- 棚卸し（いつでも）。期首確定のときの棚卸しは closing=true
create table if not exists inventory_counts (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references stores(id) on delete cascade,
  period_id uuid not null references inventory_periods(id) on delete cascade,
  counted_on date not null,
  closing boolean not null default false,
  value int not null default 0,     -- 在庫の金額（税込の仕入れ値で）
  counted_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists inventory_count_lines (
  count_id uuid not null references inventory_counts(id) on delete cascade,
  item_id uuid not null references inventory_items(id) on delete cascade,
  qty numeric(12, 3) not null check (qty >= 0),
  unit_cost numeric(12, 2),
  primary key (count_id, item_id)
);

alter table inventory_items enable row level security;
alter table delivery_slips enable row level security;
alter table delivery_slip_lines enable row level security;
alter table inventory_periods enable row level security;
alter table inventory_opening enable row level security;
alter table inventory_counts enable row level security;
alter table inventory_count_lines enable row level security;

-- 当面は「根っこ」と「obanzai」で使う（店に出すのは、オープンするときに店舗マスタで切り替える）
