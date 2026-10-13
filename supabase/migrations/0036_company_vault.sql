-- 会社の書類の保管庫（2026-10-13 黒田さん要望：定款・決算書など、会社の書類をアップロードする場所）。
-- 経理（入力・承認）と総務の担当（と代表）だけが、見る・入れる・消すことができる。開いた・入れた・消した記録は操作ログに残る。
-- ファイルの台帳（files）を会社の書類にも使う：owner_company_id があれば会社の書類

alter table files add column if not exists owner_company_id uuid references companies(id) on delete restrict;
alter table files add column if not exists doc_date date;      -- 書類の日付（決算期末・登記日・契約日など）
alter table files add column if not exists note text check (char_length(note) <= 500);
create index if not exists files_company_idx on files(owner_company_id, category) where owner_company_id is not null;

-- 会社の書類は大きいことがある（決算書のスキャンなど）ので 50MB まで。Excel・Word も入れられるようにする
alter table files drop constraint if exists files_size_bytes_check;
alter table files add constraint files_size_bytes_check check (size_bytes > 0 and size_bytes <= 52428800);
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/csv'
    ]
where id = 'private-files';

-- 会社の書類は、管理者でも経理・総務の担当（と代表）でなければ読めない
drop policy if exists files_select on files;
create policy files_select on files for select to authenticated
  using (
    (owner_company_id is null and (is_admin() or (owner_staff_id = current_staff_id() and visible_to_owner and status = 'ready')))
    or (owner_company_id is not null and (has_duty('soumu') or has_duty('keiri_input') or has_duty('keiri_approve')))
  );
