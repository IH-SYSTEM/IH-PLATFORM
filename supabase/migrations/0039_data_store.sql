-- 利用データ保管庫（2026-10-14 黒田さん：「ファイル保管庫ではなく、利用データ保管庫。何でも入れて、中を見て分析してデータとして格納。
-- カテゴリも自動で作り、一定期間ごとに整理するルーティンで」）。
--   ・入れたファイル（files）は原本として残し、AI が中身を読んで「データセット」（表）に起こす
--   ・カテゴリは AI が自動で作る（似たものは月1回の整理でまとめる）
--   ・決まった形（エアレジ・決算書）は専用の読み方で。公式の数字（売上・決算の数字）に入れるのは、人が確かめてから
--   ・使えるのは経理・総務の担当と代表だけ（会社の書類と同じ）。読み書きはすべてサーバー（service role）

create table if not exists data_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) <= 60),
  description text check (char_length(description) <= 500),
  merged_into uuid references data_categories(id) on delete set null,   -- 整理でまとめた先
  created_by_ai boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists datasets (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  category_id uuid references data_categories(id) on delete set null,
  title text not null check (char_length(title) <= 200),
  description text,                                   -- AI の説明（何のデータか・数字の意味・気づき）
  kind text not null default 'table' check (kind in ('table', 'pos_airregi', 'financials', 'document')),
  schema jsonb not null default '[]',                 -- [{key, label, type: text|number|date|money, unit}]
  company_id uuid references companies(id) on delete set null,
  store_id text references stores(id) on delete set null,
  period_from date,
  period_to date,
  row_count int not null default 0,
  stats jsonb,                                        -- 月ごとの合計など（壁打ちですぐ使えるように）
  status text not null default 'processing' check (status in ('processing', 'ready', 'needs_review', 'error')),
  review_reason text,                                 -- 人に確かめてほしい理由（店を選ぶ・決算の数字を確かめる など）
  official text check (official in ('pos', 'financials')),   -- 公式の数字に入れる先
  official_status text not null default 'none' check (official_status in ('none', 'pending', 'applied', 'rejected')),
  reviewed_by text references staff(id) on delete set null,
  reviewed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists datasets_file_idx on datasets(file_id);
create index if not exists datasets_category_idx on datasets(category_id);

create table if not exists dataset_rows (
  id bigserial primary key,
  dataset_id uuid not null references datasets(id) on delete cascade,
  row_index int not null,
  row_date date,                                      -- 行の日付（あれば。期間・月ごとの集計に使う）
  data jsonb not null
);
create index if not exists dataset_rows_dataset_idx on dataset_rows(dataset_id, row_index);
create index if not exists dataset_rows_date_idx on dataset_rows(dataset_id, row_date);

-- 決算の数字（決算書から AI が読み取る。人が確かめたら approved）
create table if not exists financial_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period_end date not null,                           -- 決算期末
  fiscal_label text,                                  -- 例：第12期
  revenue bigint, gross_profit bigint, operating_income bigint, ordinary_income bigint, net_income bigint,
  total_assets bigint, net_assets bigint, borrowings bigint, cash bigint,
  dataset_id uuid references datasets(id) on delete set null,
  approved boolean not null default false,
  approved_by text references staff(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, period_end)
);

-- 月1回の整理の記録（何をまとめ・何が足りないか）
create table if not exists data_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  summary text not null,
  actions jsonb not null default '[]'
);

alter table data_categories enable row level security;
alter table datasets enable row level security;
alter table dataset_rows enable row level security;
alter table financial_statements enable row level security;
alter table data_maintenance_runs enable row level security;
