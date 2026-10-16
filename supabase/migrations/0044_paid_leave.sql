-- 有給休暇（2026-10-16 黒田さん決定）
--   ・正社員だけ。付与は入社日から法律どおり自動（半年で10日 → 1年半で11日 …… 6年半以降は毎年20日。2年で時効）
--   ・今の残高の「はじめの数字」だけは経理が入れる（paid_leave_baselines）。その日より後は自動で足し引きする
--   ・申請はポータルから。期限：1日＝2週間前、連続2〜4日＝1か月前、連続5日以上＝2か月前（過ぎても出せるが「期限後」と出る）
--   ・承認は店長。承認するとシフトに「有給」が入り、残高から引かれる
--   ・就業規則などの会社の規程は、全員がポータルから見られる（files.public_to_staff）

create table if not exists paid_leave_baselines (
  staff_id text primary key references staff(id) on delete cascade,
  as_of date not null,                       -- この日の時点の残高
  remaining numeric(5, 1) not null check (remaining >= 0),
  note text check (char_length(note) <= 200),
  set_by text references staff(id) on delete set null,
  set_at timestamptz not null default now()
);

create table if not exists paid_leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  store_id text references stores(id) on delete set null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  days int not null check (days between 1 and 60),
  reason text check (char_length(reason) <= 300),
  late boolean not null default false,       -- 申請の期限を過ぎて出した
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by text references staff(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists paid_leave_requests_staff_idx on paid_leave_requests(staff_id, start_date);
create index if not exists paid_leave_requests_pending_idx on paid_leave_requests(store_id) where status = 'pending';

alter table paid_leave_baselines enable row level security;
alter table paid_leave_requests enable row level security;

-- 会社の規程（就業規則など）を、全員がポータルの「書類」から見られるようにする印
alter table files add column if not exists public_to_staff boolean not null default false;
