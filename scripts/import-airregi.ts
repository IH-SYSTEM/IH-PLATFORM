// エアレジの会計明細CSVをまとめて取り込む（過去分の一括投入用。画面からの取り込みと同じ処理）
//   node --experimental-strip-types --env-file=.env.local scripts/import-airregi.ts <店舗コード> <CSVファイル>...
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseAirRegi } from "../lib/pos/airregi.ts";
import { savePosReceipts } from "../lib/pos/save.ts";

const [code, ...files] = process.argv.slice(2);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: store } = await admin.from("stores").select("id, name").eq("code", code).single();
if (!store || !files.length) {
  console.log("使い方: <店舗コード NEK など> <CSVファイル>...");
  process.exit(1);
}
for (const f of files) {
  const buf = readFileSync(f);
  const { receipts, error } = parseAirRegi(new TextDecoder("shift_jis").decode(buf));
  const r = error ? { error } : await savePosReceipts(admin, { storeId: store.id, source: "airregi", fileName: basename(f), file: buf, receipts, importedBy: null });
  console.log(store.name, basename(f), r.error ?? `${r.dateFrom}〜${r.dateTo} ${receipts.length}件 ${r.total?.toLocaleString()}円`);
}
