-- 権限付与を「人ごと」に（2026-10-13 黒田さん指摘）。人を選んで、その人の機能を付けたり外したりする。
-- 階層・立場・担当で自動で付くもの（module_grants）はそのまま「はじめの設定」として残し、人ごとの設定があればそちらを優先する
create table if not exists staff_module_overrides (
  staff_id text not null references staff(id) on delete cascade,
  module text not null references modules(key) on delete cascade,
  allowed boolean not null,                 -- true＝付ける／false＝外す（自動で付いていても外す）
  set_by text references staff(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (staff_id, module)
);
alter table staff_module_overrides enable row level security;
-- 読み書きはサーバー（service role）が、システム担当か代表かを確かめてから

-- これまで「個人で」付けていたものを、人ごとの設定に移す
insert into staff_module_overrides (staff_id, module, allowed, set_by, set_at)
select grantee, module, true, granted_by, granted_at from module_grants where grantee_type = 'staff'
on conflict (staff_id, module) do nothing;
delete from module_grants where grantee_type = 'staff';
