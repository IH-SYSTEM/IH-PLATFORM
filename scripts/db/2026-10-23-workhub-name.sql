-- 「ワークボード」（打刻のときのお知らせ）の正しい名前は「ワークハブ」（2026-10-23 黒田さん）。権限付与の画面に出る名前だけ変える
update modules set name = 'ワークハブ' where key = 'workboard';
select key, name from modules where key = 'workboard';
