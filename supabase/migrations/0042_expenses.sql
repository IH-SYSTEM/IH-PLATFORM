-- 店の経費（2026-10-16 黒田さん：店で買ったものを、レシートの写真で本部に送り、本部が目で確かめて承認。最後はマネーフォワード用の CSV に）。
--   報告窓口の「経費の報告」を経理（入力・承認）か代表が承認すると、ここに入る。AI がレシートを読んで勘定科目・税率・お店の名前の案を付け、経理が直せる。
--   支払い方法：店の現金（小口現金・レジ）／会社の口座から振込（請求書。あとで払う＝未払金）
--   読み書きはサーバー（service role）が、経理の担当か代表かを確かめてから行う
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid unique references reports(id) on delete set null,
  store_id text references stores(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  reporter_id text references staff(id) on delete set null,
  receipt_file_id uuid references files(id) on delete set null,
  expense_date date not null,
  amount int not null check (amount <> 0),          -- 税込（円）
  tax_rate int check (tax_rate in (0, 8, 10)),      -- 消費税率（0＝対象外・非課税）
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  vendor text check (char_length(vendor) <= 100),    -- お店・取引先
  item text check (char_length(item) <= 200),        -- 何を買ったか
  purpose text check (char_length(purpose) <= 200),  -- 何に使ったか
  account_title text check (char_length(account_title) <= 40),   -- 勘定科目（消耗品費・仕入高 など）
  ai_note text,                                      -- AI がレシートを読んで気づいたこと（金額の食い違いなど）
  approved_by text references staff(id) on delete set null,
  approved_at timestamptz,
  exported_at timestamptz,                           -- マネーフォワード用に書き出した日時（二重に取り込まないように）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on expenses(expense_date);
create index if not exists expenses_store_idx on expenses(store_id, expense_date);
alter table expenses enable row level security;
