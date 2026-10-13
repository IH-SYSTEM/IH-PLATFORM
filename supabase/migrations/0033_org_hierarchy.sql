-- 組織図と階層（2026-10-13 黒田さん決定）
--   グループ（社長：黒田学／部長：猿渡・経理主任：松﨑 … 全社が配下）
--   ├ IH ホールディングス ── 経理/総務（植屋）
--   ├ IE エンタテイメント ── CFM（西山＝前田貴裕）／SKC（木村）／ICH（小田）／IKU 一鴻（黒田博美）
--   ├ IF フードサービス ── NEK（黒田武志）／OBZ（戸澤翔月）
--   └ S スタイラス ── AIM AI窓口（猿渡）／PRD プロダクト（髙木雄河）／SLS 営業（なし）
--   階層：社長 ＞ 部長・経理主任 ＞ 店長・事業責任者 ＞ 正社員 ＞ アルバイト
--   お知らせは「自分より下の階層」かつ「自分の配下」の人にだけ出せる。雇用区分（給与）と立場・担当（権限）とは別に持つ

-- ===== 組織の木 =====
create table if not exists org_units (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('group', 'company', 'unit')),
  parent_id text references org_units(id) on delete restrict,
  company_id uuid references companies(id) on delete set null,
  store_id text unique references stores(id) on delete set null,   -- 事業・店のとき、所属の店舗（スタッフの所属で配下を決める）
  head_staff_ids text[] not null default '{}',                     -- 責任者（店長・事業責任者）
  sort_order int not null default 0
);
alter table org_units enable row level security;
drop policy if exists org_units_read on org_units;
create policy org_units_read on org_units for select to authenticated using (true);
-- 変えるのはサーバー（service role）が、システム担当か代表かを確かめてから

-- 社長・部長・経理主任など、グループ全体の役職（それ以外の段は、責任者と雇用区分から自動で決まる）
alter table staff add column if not exists org_title text check (org_title in ('社長', '部長', '経理主任'));

-- お知らせを出した人の段（これより下の段の人にだけ見せる）
alter table workboard_notices add column if not exists sender_level int;
alter table workboard_schedules add column if not exists sender_level int;

-- モジュールを「段」で割り当てる（grantee は段の数字。その段以上が使える）
alter table module_grants drop constraint if exists module_grants_grantee_type_check;
alter table module_grants add constraint module_grants_grantee_type_check check (grantee_type in ('position', 'duty', 'staff', 'rank'));

-- ===== 店・事業のマスタを組織図に合わせる =====
-- 一鴻のコードを IKU に
update stores set code = 'IKU' where code = 'IKK';
-- S（スタイラス）の3つの事業を作る。STYLE-US は会社名と同じなので使わない店にする
insert into stores (name, code, company_id, is_active, sort_order)
select v.name, v.code, c.id, true, v.sort
from (values ('AI窓口事業部', 'AIM', 90), ('プロダクト（制作）', 'PRD', 91), ('営業部', 'SLS', 92)) as v(name, code, sort)
cross join (select id from companies where name = '株式会社スタイラス') c
where not exists (select 1 from stores s where s.code = v.code);
update staff set store_id = (select id from stores where code = 'AIM') where id = '69psG4lVL5ae24kK1HQVp3aDnop1';  -- 猿渡隼人
update staff set store_id = (select id from stores where code = 'PRD') where id = 'UxQRfVRTunX2TtA7OwvELW3E87j2';  -- 髙木雄河
update staff set store_id = (select id from stores where code = 'IH') where id = 'W0ZKMeU5Hzfgo9slwCWDTEFfHmI2';   -- 植屋真聡
update stores set is_active = false where code = 'STY' and not exists (select 1 from staff where store_id = stores.id and not retired);

-- ===== 組織の木を入れる =====
insert into org_units (code, name, kind, sort_order) values ('GRP', '一鴻グループ', 'group', 0) on conflict (code) do nothing;
insert into org_units (code, name, kind, parent_id, company_id, sort_order)
select v.code, v.name, 'company', (select id from org_units where code = 'GRP'), c.id, v.sort
from (values ('IH', '株式会社一鴻ホールディングス', 10), ('IE', '株式会社一鴻エンタテイメント', 20), ('IF', '株式会社一鴻フードサービス', 30), ('S', '株式会社スタイラス', 40)) as v(code, name, sort)
join companies c on c.name = v.name
on conflict (code) do nothing;
insert into org_units (code, name, kind, parent_id, store_id, head_staff_ids, sort_order)
select v.code, v.name, 'unit', (select id from org_units where code = v.parent), st.id, v.heads, v.sort
from (values
  ('U-IH',  '経理/総務',    'IH', 'IH',  array['W0ZKMeU5Hzfgo9slwCWDTEFfHmI2'], 11),
  ('U-CFM', 'COOKIE for MEN', 'IE', 'CFM', array['c2wL8XncpYWnC9uJWXBtcSrcgKr2'], 21),
  ('U-SKC', 'COOKIE熊本',   'IE', 'SKC', array['CANWPqdlH0TpNZRUcTyXqzcTNkz1'], 22),
  ('U-ICH', '「一」',        'IE', 'ICH', array['19abc180-d77d-4567-a8ab-421ce453a9b7'], 23),
  ('U-IKU', '一鴻',          'IE', 'IKU', array['BQ2R1VPRKCgUo277uBsEjcSuNYm1'], 24),
  ('U-NEK', '郷彩 根っこ',   'IF', 'NEK', array['DCty0lGrPhVrnaBmJy2XfiBbwq43'], 31),
  ('U-OBZ', 'obanzai',       'IF', 'OBZ', array['a3t7j8Eh4QW1nNHT5j92AGaZ00W2'], 32),
  ('U-AIM', 'AI窓口事業部',  'S',  'AIM', array['69psG4lVL5ae24kK1HQVp3aDnop1'], 41),
  ('U-PRD', 'プロダクト（制作）', 'S', 'PRD', array['UxQRfVRTunX2TtA7OwvELW3E87j2'], 42),
  ('U-SLS', '営業部',        'S',  'SLS', array[]::text[], 43)
) as v(code, name, parent, store, heads, sort)
join stores st on st.code = v.store
on conflict (code) do nothing;

-- グループ全体の役職
update staff set org_title = '社長' where id = 'i1jaRMzCd6Re7Ij1MMbQWDfuGr83';      -- 黒田学
update staff set org_title = '部長' where id = '69psG4lVL5ae24kK1HQVp3aDnop1';      -- 猿渡隼人
update staff set org_title = '経理主任' where id = 'uTJXzIh9HqOjzU2hxF70RO1qjd92';  -- 松﨑桃子

-- ワークボードは「正社員以上」（段2以上）が使える。配下の、自分より下の段にだけ出せる
insert into module_grants (module, grantee_type, grantee) values ('workboard', 'rank', '2') on conflict do nothing;
