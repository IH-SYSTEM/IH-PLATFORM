-- 代表（社長）は、すべての担当の入力・承認ができる（2026-10-13 黒田さん：「普段はなるべく触らないが、できるようにはしておきたい」）。
-- これまでは「見るだけ＋承認だけ」。操作はすべて操作ログに残る。給与は今までどおり、自分で入力したものを自分で確定はできない
create or replace function has_duty(d text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff s
    where s.auth_user_id = auth.uid() and s.retired = false
      and s.permission in ('admin', 'superadmin')
      and (s.org_title = '社長' or exists (select 1 from staff_duties sd where sd.staff_id = s.id and sd.duty = d))
  )
$$;
