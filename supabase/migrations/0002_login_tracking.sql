-- ログイン状況（パスワード設定済みか・最終ログイン）とログイン履歴
alter table staff add column if not exists firebase_last_sign_in_at timestamptz;
alter table staff add column if not exists invited_at timestamptz;

create table login_history (
  id bigserial primary key,
  staff_id text references staff(id) on delete cascade,
  auth_user_id uuid,
  signed_in_at timestamptz not null,
  source text not null default 'supabase' check (source in ('supabase', 'firebase'))
);
create unique index login_history_staff_idx on login_history(staff_id, signed_in_at, source);

alter table login_history enable row level security;
create policy login_history_admin_select on login_history for select to authenticated
  using (is_admin());

-- auth.users.last_sign_in_at はパスワードでのサインイン時のみ更新される（トークン更新では変わらない）
create or replace function record_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is not null and new.last_sign_in_at is distinct from old.last_sign_in_at then
    insert into login_history (staff_id, auth_user_id, signed_in_at)
    select id, new.id, new.last_sign_in_at from staff where auth_user_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_sign_in on auth.users;
create trigger on_auth_sign_in after update of last_sign_in_at on auth.users
  for each row execute function record_login();

-- 管理画面用：auth スキーマは直接公開しないので、管理者だけが呼べる関数で返す
create or replace function staff_login_status()
returns table (
  staff_id text,
  has_account boolean,
  password_set boolean,
  invited_at timestamptz,
  last_sign_in_at timestamptz,
  firebase_last_sign_in_at timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select
    s.id,
    u.id is not null,
    coalesce(u.encrypted_password, '') <> '',
    s.invited_at,
    u.last_sign_in_at,
    s.firebase_last_sign_in_at
  from staff s
  left join auth.users u on u.id = s.auth_user_id
  where is_admin()
$$;
revoke all on function staff_login_status() from public, anon;
grant execute on function staff_login_status() to authenticated;
