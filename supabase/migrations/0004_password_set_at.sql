-- パスワード未指定で作成した Auth ユーザーにも内部的にハッシュが入るため、
-- encrypted_password では「本人がパスワードを設定したか」を判定できない。設定日時を自前で記録する
alter table staff add column if not exists password_set_at timestamptz;

update staff s set password_set_at = h.first_at
from (
  select staff_id, min(signed_in_at) as first_at
  from login_history where source = 'supabase' group by staff_id
) h
where h.staff_id = s.id and s.password_set_at is null;

drop function if exists auth_password_set(uuid);

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
    s.password_set_at is not null,
    s.invited_at,
    u.last_sign_in_at,
    s.firebase_last_sign_in_at
  from staff s
  left join auth.users u on u.id = s.auth_user_id
  where is_admin()
$$;
