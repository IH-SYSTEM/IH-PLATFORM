-- 管理者かどうかは「権限（permission）」だけで決める（2026-10-08）
-- 以前は雇用区分（role）が「管理部（admin）」の人も管理者になっていたため、権限を「一般」に変えても管理者のままだった
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where auth_user_id = auth.uid()
      and retired = false
      and permission in ('admin', 'superadmin')
  )
$$;
