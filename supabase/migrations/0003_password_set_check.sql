-- ログイン時の Firebase パスワード引き継ぎ判定用。サーバー（service_role）からのみ呼べる
create or replace function auth_password_set(p_user_id uuid) returns boolean
language sql stable security definer set search_path = auth as $$
  select coalesce(encrypted_password, '') <> '' from auth.users where id = p_user_id
$$;
revoke all on function auth_password_set(uuid) from public, anon, authenticated;
grant execute on function auth_password_set(uuid) to service_role;
