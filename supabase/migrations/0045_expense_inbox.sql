-- 経費のレシートを速く処理する（2026-10-16 黒田さん）
--   店：写真を続けて撮って、まとめて本部に送る（金額などは入れなくてよい）
--   届いたらすぐ AI が読み、お店・日付・合計・登録番号（T＋13桁）と、勘定科目×税率ごとの内訳を入れておく
--   本部：写真を見ながら直して「承認して次へ」。承認したものだけがマネーフォワードの CSV に出る
--
--   status … reading（AI が読んでいる）／pending（本部の確認待ち）／approved（承認）／rejected（差し戻し）
--   これまでの経費（報告窓口から承認したもの）は approved のまま

alter table expenses add column if not exists status text not null default 'approved' check (status in ('reading', 'pending', 'approved', 'rejected'));
alter table expenses add column if not exists batch_id uuid;                      -- 一緒に送った写真のまとまり
alter table expenses add column if not exists invoice_number text check (invoice_number ~ '^T\d{13}$'); -- 適格請求書の登録番号
alter table expenses add column if not exists staff_memo text check (char_length(staff_memo) <= 200); -- 店からのひとこと（任意）
alter table expenses add column if not exists reject_reason text check (char_length(reject_reason) <= 200);
alter table expenses add column if not exists ai_read_at timestamptz;
alter table expenses add column if not exists ai_error text;
-- 写真を送った時点では、日付・金額はまだ分からない（AI が読んでから入る）
alter table expenses alter column expense_date drop not null;
alter table expenses alter column amount drop not null;
create index if not exists expenses_status_idx on expenses(status, created_at) where status in ('reading', 'pending');

-- 内訳（1枚のレシートに、食材8%と消耗品10%が混ざるときなど）。勘定科目×税率ごとに1行。金額は税込
create table if not exists expense_lines (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  sort int not null default 0,
  account_title text check (char_length(account_title) <= 40),
  tax_rate int not null default 10 check (tax_rate in (0, 8, 10)),
  amount int not null check (amount <> 0),
  item text check (char_length(item) <= 200)
);
create index if not exists expense_lines_expense_idx on expense_lines(expense_id, sort);
alter table expense_lines enable row level security;

-- これまでの経費は、そのまま1行の内訳にする
insert into expense_lines (expense_id, sort, account_title, tax_rate, amount, item)
select e.id, 0, e.account_title, coalesce(e.tax_rate, 10), e.amount, e.item
from expenses e
where e.amount is not null and not exists (select 1 from expense_lines l where l.expense_id = e.id);
