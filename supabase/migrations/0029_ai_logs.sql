-- AI取説の会話の記録（2026-10-10 黒田さん要望「聞かれたことをログで管理し、システムの機能向上に使う」）
--   1行＝1回の質問と答え。AIが答えの最後に付ける分類（話題・答えられたか・どこへ振ったか）も残す
create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,          -- 同じ画面での一連の会話
  staff_id text references staff(id) on delete set null,
  mode text not null check (mode in ('guide', 'sparring')),
  level text,                             -- staff / manager / admin（答えたときの権限）
  question text not null,
  answer text,
  category text,                          -- 話題（ログイン・打刻・シフト…）
  status text,                            -- answered / unknown / escalated / refused / off_topic / error
  escalate_to text,                       -- 振った先（経理・総務・システム・店長…）
  related_path text,                      -- 案内した画面
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_created_idx on ai_messages(created_at desc);
create index if not exists ai_messages_status_idx on ai_messages(mode, status);
alter table ai_messages enable row level security;
-- ポリシーなし＝サーバー（service role）からだけ読み書きする。壁打ちは代表だけが見る（画面側で確かめる）
