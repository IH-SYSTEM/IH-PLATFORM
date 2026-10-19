-- 店の営業日と、正社員の希望休（2026-10-19 黒田さん）
--   closed_weekdays … 毎週の店休日（0=日 1=月 … 6=土）
--   closed_dates    … 臨時の店休日（年末年始・お盆など）
--   requested_off_limit … 正社員が1か月に出せる希望休の日数（店休日は数えない）。空なら上限なし。それより多く休むときは有給で申請
--   正社員のシフト希望は「休みの希望」を出す形。前の月の20日が締切、25日が確定日
alter table stores add column if not exists closed_weekdays int[] not null default '{}';
alter table stores add column if not exists closed_dates date[] not null default '{}';
alter table stores add column if not exists requested_off_limit int check (requested_off_limit between 0 and 31);
-- いまある店は、希望休 2日 から始める（「一」は1人の部署なので、希望休の仕組みを使わない）
update stores set requested_off_limit = 2 where requested_off_limit is null and is_active;
