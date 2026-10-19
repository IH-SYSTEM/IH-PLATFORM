-- 郷彩 根っこ（NEK）の在籍スタッフ全員のパスワードを、初期パスワード 12345678 に戻す（2026-10-17 黒田さん指示）
-- 管理画面の「パスワードをリセット」と同じ結果：次のログインで本人が自分のパスワードに変える（first_login = true）
-- 対象：店が NEK・在籍中・ログインアカウントがある人（19人）

with target as (
  select s.id, s.auth_user_id
  from staff s
  join stores st on st.id = s.store_id
  where st.code = 'NEK' and s.retired = false and s.auth_user_id is not null
),
pw as (
  update auth.users u
  set encrypted_password = extensions.crypt('12345678', extensions.gen_salt('bf')),
      updated_at = now()
  from target t
  where u.id = t.auth_user_id
  returning u.id
),
flag as (
  update staff s
  set first_login = true, invited_at = now()
  from target t
  where s.id = t.id
  returning s.id
)
select (select count(*) from pw) as passwords_reset, (select count(*) from flag) as staff_flagged;
