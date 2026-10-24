import { requireAdmin } from "@/lib/auth";
import { MOODS, REEL_BUCKET } from "@/lib/reels";
import { createAdminClient } from "@/lib/supabase/admin";
import { BgmRow, BgmUploader } from "./forms";

export const metadata = { title: "リールのBGM" };

/** リール作成で使う BGM（本部が登録）。「おまかせ」のときは、AI が決めた雰囲気の曲から選ぶ */
export default async function ReelBgmPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: tracks } = await admin.from("reel_bgm").select("id, name, mood, path, credit, is_active").order("sort_order").order("created_at");
  const rows = await Promise.all(
    (tracks ?? []).map(async (t) => ({ ...t, url: (await admin.storage.from(REEL_BUCKET).createSignedUrl(t.path, 3600)).data?.signedUrl ?? null })),
  );
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">リールのBGM</h1>
        <p className="mt-1 text-sm text-slate-500">
          SNS 担当がリールを作るときに付ける曲です。<b>商用で使ってよいフリー音源</b>（例：DOVA-SYNDROME・甘茶の音楽工房 など。利用規約を確かめる）だけを登録してください。市販の曲は Instagram で消音・削除されることがあります。「おまかせ」は、AI が決めた雰囲気（{MOODS.join("・")}）の曲から選びます
        </p>
      </div>
      <BgmUploader />
      <div className="divide-y divide-slate-100 overflow-hidden rounded-md border border-line bg-white">
        {rows.length ? rows.map((t) => <BgmRow key={t.id} t={t} />) : <p className="p-4 text-sm text-slate-400">まだ曲がありません</p>}
      </div>
    </div>
  );
}
