-- 請求書（2026-10-22 黒田さん）。経理（と代表）がアップし、AI が読んで店・勘定科目に振り分ける。経費と同じくマネーフォワードに書き出す（振込＝未払金）
--   doc_type … receipt（店のレシート）／invoice（請求書）
--   status に question を足す：AI が分からなかった点を、アップした人に聞いている（「これはどこの店の何の経費ですか？」）
--   vendor_rules：一度確かめた請求書の取引先（登録番号か名前）→ 店・勘定科目。次からは自動で振り分けて承認する（あとから直せる）
--   店・年・月のフォルダ：請求日（expense_date）と店で並べる（画面で作る。保存場所は1つ）

alter table expenses add column if not exists doc_type text not null default 'receipt' check (doc_type in ('receipt', 'invoice'));
alter table expenses add column if not exists due_date date;            -- 支払期日（請求書）
alter table expenses add column if not exists question text check (char_length(question) <= 300); -- アップした人への質問
alter table expenses add column if not exists auto_rule_id uuid;        -- 自動で振り分けたときの決まり

alter table expenses drop constraint if exists expenses_status_check;
alter table expenses add constraint expenses_status_check check (status in ('reading', 'pending', 'question', 'approved', 'rejected'));
drop index if exists expenses_status_idx;
create index if not exists expenses_status_idx on expenses(status, created_at) where status in ('reading', 'pending', 'question');
create index if not exists expenses_invoice_idx on expenses(store_id, expense_date) where doc_type = 'invoice';

create table if not exists vendor_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (char_length(key) <= 120), -- 「T1234567890123」か、取引先の名前（空白・株式会社などを除いたもの）
  vendor text check (char_length(vendor) <= 100),
  store_id text references stores(id) on delete cascade,
  account_title text check (char_length(account_title) <= 40),
  tax_rate int check (tax_rate in (0, 8, 10)),
  learned_from uuid references expenses(id) on delete set null,
  updated_by text references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table vendor_rules enable row level security;
