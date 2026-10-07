-- 会社（法人）マスタ。年末調整・源泉徴収票・法定三帳簿・経費は会社ごとに作るため、店舗をどれかの会社に紐付ける
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2,4}$'),
  name text not null,
  name_kana text,
  corporate_number text check (corporate_number ~ '^\d{13}$'),  -- 法人番号（13桁）
  representative text,       -- 代表者
  zipcode text,
  address text,
  phone text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists companies_updated_at on companies;
create trigger companies_updated_at before update on companies for each row execute function set_updated_at();

alter table companies enable row level security;
drop policy if exists companies_select on companies;
create policy companies_select on companies for select to authenticated using (true);
drop policy if exists companies_admin_write on companies;
create policy companies_admin_write on companies for all to authenticated using (is_admin()) with check (is_admin());

-- 店舗がどの会社のものか
alter table stores add column if not exists company_id uuid references companies(id) on delete restrict;

-- 年末調整を行う会社（扶養控除等申告書を出している会社）。複数の会社から給与を受けている人のため、店舗とは別に持つ。
-- 空なら所属店舗の会社とみなす
alter table staff add column if not exists tax_company_id uuid references companies(id) on delete set null;

-- ===== 初期値（2026-10-08 黒田さん確認済み） =====
insert into companies (code, name, sort_order) values
  ('IH', '株式会社一鴻ホールディングス', 1),
  ('IFS', '株式会社一鴻フードサービス', 2),
  ('IE', '株式会社一鴻エンタテイメント', 3),
  ('STY', '株式会社スタイラス', 4)
on conflict (code) do nothing;

update stores s set company_id = c.id from companies c
where s.company_id is null and (
  (c.code = 'IH'  and s.code = 'IH') or
  (c.code = 'IFS' and s.code in ('NEK', 'OBZ')) or
  (c.code = 'IE'  and s.code in ('SKC', 'CFM', 'ICH', 'IKK')) or
  (c.code = 'STY' and s.code = 'STY')
);
