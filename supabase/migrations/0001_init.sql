-- IKKOU HOLDING SYSTEM: 給与入力 / スタッフ管理 / 労働者名簿 / 給与履歴出力 / 店舗・部署マスタ
-- 先に作成した仮テーブル（空）を破棄して作り直す
drop table if exists salary_records cascade;
drop table if exists staff cascade;
drop table if exists stores cascade;
drop table if exists departments cascade;
drop table if exists companies cascade;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ===== 店舗（= 所属部署） =====
-- id は Firestore のドキュメントIDをそのまま使う（掲示済みの打刻QRに埋め込まれているため）
create table stores (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  open_time text,
  close_time text,
  scheduled_clock_out text,
  notification_delay_min integer,
  geofence_enabled boolean not null default false,
  geofence_radius integer,
  wifi_enabled boolean not null default false,
  allowed_ips text[] not null default '{}',
  target_labor_cost_rate numeric,
  rosai_rate numeric,
  monthly_holidays integer,
  default_paid_leave integer,
  sort_order integer,
  manager_staff_ids text[] not null default '{}',
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  firestore_raw jsonb
);
create trigger stores_updated_at before update on stores
  for each row execute function set_updated_at();

-- ===== スタッフ =====
-- id は Firestore のドキュメントID。auth_user_id は Supabase Auth 移行後に紐付ける
create table staff (
  id text primary key default gen_random_uuid()::text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  firebase_uid text unique,
  email text,
  name text not null,
  furigana text,
  employee_no text,
  role text,
  permission text,
  modules jsonb not null default '{}',
  scope jsonb,
  store_id text references stores(id) on delete set null,
  department_name text,
  hire_date date,
  birthdate date,
  gender text,
  phone text,
  zipcode text,
  address text,
  emergency text,
  note text,
  bank_name text,
  bank_branch text,
  bank_type text,
  bank_number text,
  bank_holder text,
  mynumber text,
  health_insurance_no text,
  employment_insurance_no text,
  basic_pension_no text,
  welfare_pension_no text,
  line_added boolean not null default false,
  line_user_id text unique,
  line_connected_at timestamptz,
  retired boolean not null default false,
  retirement_date date,
  retirement_reason text,
  is_active boolean,
  first_login boolean not null default false,
  primary_store_id text,
  payroll_master jsonb,
  attachments jsonb not null default '[]',
  permission_updated_at timestamptz,
  permission_updated_by text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  firestore_raw jsonb
);
create index staff_store_id_idx on staff(store_id);
create index staff_email_idx on staff(lower(email));
create trigger staff_updated_at before update on staff
  for each row execute function set_updated_at();

-- ===== 給与 =====
-- (staff_id, year, month) の一意制約は、移行データの重複確認後に追加する
create table salary_records (
  id uuid primary key default gen_random_uuid(),
  firestore_id text unique,
  staff_id text not null references staff(id) on delete restrict,
  staff_name text,
  year integer not null,
  month integer not null check (month between 1 and 12),
  employment_type text,
  attendance jsonb not null default '{}',
  payment jsonb not null default '{}',
  deduction jsonb not null default '{}',
  total_payment numeric not null default 0,
  total_deduction numeric not null default 0,
  net_payment numeric not null default 0,
  memo text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  firestore_raw jsonb
);
create index salary_records_staff_period_idx on salary_records(staff_id, year, month);
create index salary_records_period_idx on salary_records(year, month);
create trigger salary_records_updated_at before update on salary_records
  for each row execute function set_updated_at();

-- ===== 旧コレクション退避（staffDepartments, payroll/* など） =====
create table firestore_legacy (
  path text primary key,
  collection text not null,
  data jsonb not null,
  imported_at timestamptz not null default now()
);

-- ===== 権限判定 =====
create or replace function current_staff_id() returns text
language sql stable security definer set search_path = public as $$
  select id from staff where auth_user_id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where auth_user_id = auth.uid()
      and retired = false
      and (permission in ('admin', 'superadmin') or role = 'admin')
  )
$$;

-- ===== RLS =====
alter table stores enable row level security;
alter table staff enable row level security;
alter table salary_records enable row level security;
alter table firestore_legacy enable row level security;

create policy stores_select on stores for select to authenticated using (true);
create policy stores_admin_write on stores for all to authenticated
  using (is_admin()) with check (is_admin());

-- 一般スタッフは自分の行だけ閲覧可（マイナンバー・口座を他人に見せない）。更新は管理者のみ
create policy staff_select on staff for select to authenticated
  using (is_admin() or auth_user_id = auth.uid());
create policy staff_admin_write on staff for all to authenticated
  using (is_admin()) with check (is_admin());

-- 一般スタッフは自分の「確定済み」給与だけ閲覧可
create policy salary_select on salary_records for select to authenticated
  using (is_admin() or (staff_id = current_staff_id() and status = 'confirmed'));
create policy salary_admin_write on salary_records for all to authenticated
  using (is_admin()) with check (is_admin());

create policy legacy_admin_select on firestore_legacy for select to authenticated
  using (is_admin());
