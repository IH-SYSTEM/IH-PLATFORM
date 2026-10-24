-- 「ワークボード」（打刻のときのお知らせ）の正しい名前は「ワークハブ」（2026-10-23 黒田さん）。権限付与の画面に出る名前だけ変える
update modules set label = 'ワークハブ' where key = 'workboard';
select key, label from modules where key = 'workboard';
