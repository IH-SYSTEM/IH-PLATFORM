-- ファイル添付と操作ログ（領収書・控除証明書・雇用契約書・源泉徴収票などの土台）

-- ===== 非公開の保存場所 =====
-- 公開しない。ブラウザから直接は読めず、サーバーが権限を確かめてから、短時間だけ有効なURLを発行する
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-files', 'private-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
-- storage.objects にはポリシーを作らない＝ログインしたユーザーでも直接は読み書きできない（service role だけ）

-- ===== ファイルの台帳 =====
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,              -- 保存場所の中のパス
  category text not null,                 -- contract / receipt / tax_certificate / withholding_slip / other など
  owner_staff_id text references staff(id) on delete set null,   -- 誰の書類か
  name text not null,                     -- 元のファイル名（表示用）
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  visible_to_owner boolean not null default true,  -- 本人のマイページに出すか
  uploaded_by text not null references staff(id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists files_owner_idx on files(owner_staff_id, category);
alter table files enable row level security;
drop policy if exists files_select on files;
create policy files_select on files for select to authenticated
  using (is_admin() or (owner_staff_id = current_staff_id() and visible_to_owner and status = 'ready'));

-- ===== 操作ログ（追記のみ） =====
-- 誰が・いつ・何を見た／変えた／書き出したか。給与・マイナンバー・個人の書類の取り扱いの記録
create table if not exists audit_logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_staff_id text references staff(id) on delete set null,
  action text not null,         -- view / download / upload / create / update / delete / export
  target_type text not null,    -- staff / file / attendance / salary / report など
  target_id text,
  subject_staff_id text references staff(id) on delete set null,  -- 誰の情報か
  detail jsonb,
  ip text,
  user_agent text
);
create index if not exists audit_logs_at_idx on audit_logs(at desc);
create index if not exists audit_logs_subject_idx on audit_logs(subject_staff_id, at desc);
alter table audit_logs enable row level security;
drop policy if exists audit_logs_admin_select on audit_logs;
create policy audit_logs_admin_select on audit_logs for select to authenticated using (is_admin());
-- 更新・削除のポリシーは作らない（書き換えられない記録にする。書き込みは service role だけ）
