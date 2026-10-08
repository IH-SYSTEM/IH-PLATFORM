-- LINE配信（2026-10-09 黒田さん要望「システムとLINEをつなぎ、セグメントで送れるように」）
--   手動の配信（本部の「LINE配信」画面）も、自動の通知（人件費の報告・急募・報告の承認・お知らせ）も、ここに記録する
create table if not exists line_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('manual', 'announcement', 'labor_report', 'urgent', 'report', 'other')),
  body text not null check (char_length(body) <= 5000),
  segment jsonb,                         -- 手動の配信で選んだ相手（会社・店舗・雇用区分・店長だけ）
  recipient_count int not null default 0, -- 送ろうとした人数（LINE連携済み）
  unlinked_count int not null default 0,  -- 相手に入っていたが、LINE未連携で送れなかった人数
  sent_count int not null default 0,
  status text not null default 'sent' check (status in ('sent', 'partial', 'failed', 'skipped')),
  error text,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists line_messages_created_idx on line_messages(created_at desc);

create table if not exists line_message_recipients (
  message_id uuid not null references line_messages(id) on delete cascade,
  staff_id text references staff(id) on delete set null,
  line_user_id text,
  status text not null check (status in ('sent', 'failed', 'unlinked'))
);
create index if not exists line_message_recipients_msg_idx on line_message_recipients(message_id);

alter table line_messages enable row level security;
alter table line_message_recipients enable row level security;
drop policy if exists line_messages_admin on line_messages;
create policy line_messages_admin on line_messages for select to authenticated using (is_admin());
drop policy if exists line_message_recipients_admin on line_message_recipients;
create policy line_message_recipients_admin on line_message_recipients for select to authenticated using (is_admin());
