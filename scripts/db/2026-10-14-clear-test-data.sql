-- 本番の打刻を始める前に、テスト用のデータを全部消す（2026-10-14 黒田さん指示「テスト用のデータは今のうち全消去」）。
-- 消すもの：打刻開始前の勤怠（デモ222件＋試しの打刻1件）、10月分の給与（下書き・確定とも。10月分の本番の給与はまだない）、
--   試しの報告・シフト・シフト希望、テスト取引先、テスト用アカウント3つ（aaa・bbb・ccc）とその時給の履歴
-- 残すもの：1〜8月の給与（旧システムからの本物）、売上、スタッフ、時給の履歴（本物）、書類、操作ログ
begin;

delete from attendance;
delete from salary_records where year = 2026 and month = 10;
delete from reports;
delete from shift_schedule;
delete from shift_requests;
delete from partners where name = 'テスト取引先';

-- テスト用アカウント
create temporary table t_test on commit drop as select id, auth_user_id from staff where email in ('aaa@aaa.com', 'bbb@bbb.com', 'ccc@ccc.com');
delete from staff_wage_history where staff_id in (select id from t_test);
delete from staff_duties where staff_id in (select id from t_test);
delete from staff_module_overrides where staff_id in (select id from t_test);
update files set uploaded_by = (select id from staff where org_title = '社長' limit 1) where uploaded_by in (select id from t_test);
delete from staff where id in (select id from t_test);
delete from auth.identities where user_id in (select auth_user_id from t_test where auth_user_id is not null);
delete from auth.users where id in (select auth_user_id from t_test where auth_user_id is not null);

-- 試しで発行した証明書（報告を消したので、台帳でも消した扱いに。保管場所のファイルは別に消す）
update files set status = 'deleted', deleted_at = now() where category = 'certificate' and status <> 'deleted';

commit;

select json_build_object(
  'attendance', (select count(*) from attendance),
  'salary_oct', (select count(*) from salary_records where year = 2026 and month = 10),
  'salary_kept', (select count(*) from salary_records),
  'reports', (select count(*) from reports),
  'shifts', (select count(*) from shift_schedule),
  'test_staff', (select count(*) from staff where email in ('aaa@aaa.com', 'bbb@bbb.com', 'ccc@ccc.com')),
  'partners', (select json_agg(name) from partners)
) as after;
