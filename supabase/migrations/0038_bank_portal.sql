-- 取引先（銀行）用の入口（2026-10-13 黒田さん要望：銀行に ID とパスワードを出して、決算書や営業の実態を見てもらう）。
--   ・社員のログインとは別の仕組み（Supabase のログインを使わない）。社内の画面には一切入れない
--   ・担当者ごとに ID（メールアドレス）とパスワード。ログインのたびにメールで6桁の確認コード
--   ・見せるもの（会社の書類・会社ごとの月の売上）は、銀行ごとに本部が選んだものだけ。有効期限つき・見るだけ
--   ・銀行から書類を入れられる場所。入れた書類は経理・総務の担当と代表だけが見る
--   ・銀行の人がいつ何を見たかを、すべて残す
-- 読み書きはすべてサーバー（service role）が、本人の確認をしてから行う（画面から直接は読めない）

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 100),          -- 例：肥後銀行 熊本営業部
  note text check (char_length(note) <= 500),
  is_active boolean not null default true,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists partner_users (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  name text not null check (char_length(name) <= 100),
  email text not null unique check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  password_hash text not null,                                    -- scrypt（ソルトつき）。元のパスワードは残さない
  expires_on date not null,                                       -- この日まで入れる
  is_active boolean not null default true,
  failed_count int not null default 0,                            -- 続けて間違えた回数（5回で15分止める）
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 見せるもの：kind=file（会社の書類1つ）／kind=sales（その会社の月ごとの売上）
create table if not exists partner_shares (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  kind text not null check (kind in ('file', 'sales')),
  file_id uuid references files(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint partner_shares_target check ((kind = 'file' and file_id is not null) or (kind = 'sales' and company_id is not null))
);
create unique index if not exists partner_shares_file on partner_shares(partner_id, file_id) where kind = 'file';
create unique index if not exists partner_shares_sales on partner_shares(partner_id, company_id) where kind = 'sales';

-- ログインの確認コード（6桁。10分・5回まで。コードはハッシュで残す）
create table if not exists partner_login_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references partner_users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ログイン中の状態（ブラウザのクッキーには乱数だけ。ここにはそのハッシュ）。8時間で切れる。本部が止めたらすぐ切れる
create table if not exists partner_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references partner_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 銀行の人の操作の記録（ログイン・書類を開いた・売上を見た・書類を入れた）
create table if not exists partner_access_logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  partner_id uuid references partners(id) on delete set null,
  user_id uuid references partner_users(id) on delete set null,
  action text not null,                 -- login / login_failed / view_file / view_sales / upload / logout
  target text,
  ip text,
  user_agent text
);
create index if not exists partner_access_logs_partner_idx on partner_access_logs(partner_id, at desc);

-- 銀行から入れた書類（会社の書類と同じ台帳。どの銀行からか）
alter table files add column if not exists owner_partner_id uuid references partners(id) on delete set null;

alter table partners enable row level security;
alter table partner_users enable row level security;
alter table partner_shares enable row level security;
alter table partner_login_codes enable row level security;
alter table partner_sessions enable row level security;
alter table partner_access_logs enable row level security;

-- 銀行から入れた書類も、会社の書類と同じく経理・総務の担当と代表だけが読める
drop policy if exists files_select on files;
create policy files_select on files for select to authenticated
  using (
    (owner_company_id is null and owner_partner_id is null and (is_admin() or (owner_staff_id = current_staff_id() and visible_to_owner and status = 'ready')))
    or ((owner_company_id is not null or owner_partner_id is not null) and (has_duty('soumu') or has_duty('keiri_input') or has_duty('keiri_approve')))
  );
