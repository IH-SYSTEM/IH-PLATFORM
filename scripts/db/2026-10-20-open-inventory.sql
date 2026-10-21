-- 棚卸しシステムを、根っこ（NEK）と obanzai（OBZ）の店長にも出す（2026-10-20 黒田さん）
update stores set inventory_enabled = true where code in ('NEK', 'OBZ');
select code, name, inventory_enabled from stores where code in ('NEK', 'OBZ');
