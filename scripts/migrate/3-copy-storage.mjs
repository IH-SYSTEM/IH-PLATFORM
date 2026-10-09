// 東京への引っ越し ③：保管しているファイル（給与明細の書類・報告の写真・レジのCSV・証明書）を、旧から新へ写す
//   使い方（鍵はチャットに貼らない）：
//     export OLD_URL=https://kpqiluwpdzifygbrccfy.supabase.co OLD_SERVICE_KEY=…
//     export NEW_URL=https://新しいID.supabase.co NEW_SERVICE_KEY=…
//     node scripts/migrate/3-copy-storage.mjs
//   何度実行しても同じ（同じ場所に上書き）。途中で止まったら、もう一度実行すればよい
import { createClient } from "@supabase/supabase-js";

const BUCKET = "private-files";
const { OLD_URL, OLD_SERVICE_KEY, NEW_URL, NEW_SERVICE_KEY } = process.env;
if (!OLD_URL || !OLD_SERVICE_KEY || !NEW_URL || !NEW_SERVICE_KEY) throw new Error("OLD_URL / OLD_SERVICE_KEY / NEW_URL / NEW_SERVICE_KEY を設定してください");
if (NEW_URL.includes("kpqiluwpdzifygbrccfy")) throw new Error("NEW_URL が旧データベースを指しています");
const oldSb = createClient(OLD_URL, OLD_SERVICE_KEY);
const newSb = createClient(NEW_URL, NEW_SERVICE_KEY);

// 新しい側にバケットを作る（非公開）
const { data: buckets } = await newSb.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
  const { error } = await newSb.storage.createBucket(BUCKET, { public: false });
  if (error) throw error;
  console.log(`バケット ${BUCKET} を作りました`);
}

// フォルダをたどって、すべてのファイルの場所を集める
async function walk(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await oldSb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await walk(path))); // フォルダ
      else out.push({ path, type: item.metadata?.mimetype ?? "application/octet-stream" });
    }
    if (data.length < 1000) break;
  }
  return out;
}

const files = await walk("");
console.log(`ファイル ${files.length} 件を写します`);
let ok = 0;
for (const f of files) {
  const { data: blob, error: dlErr } = await oldSb.storage.from(BUCKET).download(f.path);
  if (dlErr) {
    console.error("読めませんでした", f.path, dlErr.message);
    continue;
  }
  const { error: upErr } = await newSb.storage.from(BUCKET).upload(f.path, Buffer.from(await blob.arrayBuffer()), { contentType: f.type, upsert: true });
  if (upErr) console.error("書けませんでした", f.path, upErr.message);
  else ok++;
}
console.log(`写し終わりました：${ok} / ${files.length} 件`);
if (ok !== files.length) process.exit(1);
