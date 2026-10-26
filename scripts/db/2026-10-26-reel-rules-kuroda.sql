-- 黒田さんの編集ルール（2026-10-26 黒田さん）
insert into reel_rules (staff_id, body, sort_order) values
  ('i1jaRMzCd6Re7Ij1MMbQWDfuGr83', '動画として完結させる（話や動作の途中で終わらない）', 1),
  ('i1jaRMzCd6Re7Ij1MMbQWDfuGr83', '見ている人に感情が伝わるフォントを使う', 2);
select body, is_active from reel_rules where staff_id = 'i1jaRMzCd6Re7Ij1MMbQWDfuGr83' order by sort_order;
