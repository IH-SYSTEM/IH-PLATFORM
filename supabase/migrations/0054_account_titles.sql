-- 勘定科目マスタ（2026-10-22 黒田さん：請求書で「地代家賃」がなかった。経理が画面から増やせるようにする）
--   name … マネーフォワードの勘定科目と同じ名前（違うと CSV の取り込みで止まる）
--   hint … AI が振り分けるときの目安（例：家賃・テナント料・駐車場代）
--   これまでプログラムに書いてあった21の勘定科目と、地代家賃を入れておく
create table if not exists account_titles (
  name text primary key check (char_length(name) between 1 and 40),
  hint text check (char_length(hint) <= 200),
  sort int not null default 100,
  active boolean not null default true,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table account_titles enable row level security;

insert into account_titles (name, hint, sort) values
  ('材料仕入', '食材・調味料・米', 10),
  ('酒類仕入', '酒・ジュース・お茶など飲み物', 20),
  ('店舗消耗品費', '店で使ってなくなるもの（ラップ・ペーパー・洗剤・割り箸・おしぼり・ゴミ袋・電池）', 30),
  ('消耗備品費', '長く使う道具・器・家電（10万円未満）', 40),
  ('事務用品費', '文房具・コピー用紙・インク', 50),
  ('衛生費', '掃除の道具・害虫対策・手洗い・消毒', 60),
  ('修繕費', '修理・部品', 70),
  ('通信費', '切手・電話・インターネット', 80),
  ('水道光熱費', 'ガス・電気・水道', 90),
  ('地代家賃', '家賃・テナント料・駐車場代（月極）・共益費', 95),
  ('車両費', 'ガソリン・駐車場（その都度）・高速', 100),
  ('旅費交通費', '電車・バス・タクシー', 110),
  ('支払手数料', '振込手数料・決済手数料', 120),
  ('広告宣伝費', 'チラシ・印刷・広告', 130),
  ('接待交際費', 'お客様・取引先との飲食・お土産', 140),
  ('会議費', '打ち合わせの飲食', 150),
  ('福利厚生費', 'スタッフへの差し入れ・まかない以外の飲食', 160),
  ('新聞図書費', '本・雑誌', 170),
  ('荷造運賃', '宅配便・送料', 180),
  ('租税公課', '収入印紙・証紙', 190),
  ('管理諸費', '管理費', 200),
  ('雑費', 'どれにも当たらないもの', 999)
on conflict (name) do nothing;
