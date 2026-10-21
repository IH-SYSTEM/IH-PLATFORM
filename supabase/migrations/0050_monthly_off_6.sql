-- 正社員の月の休みは6日（店休日＋希望休。2026-10-21 黒田さん）。店休日が5日ある月は希望休1日、足りない分は有給で申請
--   使っている店の「月の公休日数」を6日にする（店舗マスタで店ごとに変えられる）
update stores set monthly_holidays = 6 where is_active;
select code, name, monthly_holidays from stores where is_active order by sort_order;
