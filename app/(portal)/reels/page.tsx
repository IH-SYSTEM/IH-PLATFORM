import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { canUse } from "@/lib/modules";
import { WEEKLY_LIMIT } from "@/lib/reel-plan";
import { madeThisWeek, resultUrls } from "@/lib/reels";
import { RulesEditor } from "./rules-editor";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { ReelMaker } from "./reel-maker";
import { DeleteReel } from "./delete-reel";

export const metadata = { title: "リール作成" };
// 送ったあと裏で AI が場面を選び、動画を書き出すので、長めに
export const maxDuration = 300;

/** リール作成（SNS 担当）：動画を上げて秒数を決めると、カット・テロップ・BGM を付けたリールができる */
export default async function ReelsPage() {
  const me = await requireStaff();
  if (!(await canUse(me, "reel"))) redirect("/");
  const admin = createAdminClient();
  const [{ data: bgm }, { data: mine }, { data: rules }, made] = await Promise.all([
    admin.from("reel_bgm").select("id, name, mood").eq("is_active", true).order("sort_order").order("created_at"),
    admin.from("reels").select("id, status, stage, error, title, target_seconds, duration, result_path, created_at").eq("staff_id", me.id).order("created_at", { ascending: false }).limit(20),
    admin.from("reel_rules").select("id, body, is_active").eq("staff_id", me.id).order("sort_order").order("created_at"),
    madeThisWeek(me.id),
  ]);
  const left = Math.max(0, WEEKLY_LIMIT - made);
  const done = await Promise.all((mine ?? []).map(async (r) => ({ ...r, urls: r.status === "done" && r.result_path ? await resultUrls(r.result_path, r.created_at) : null })));
  const jst = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(5, 16).replace("-", "/").replace("T", " ");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="リール作成" description="動画を上げて仕上がりの秒数を決め、スタートを押すと、AI が見どころを選んでカットし、テロップと BGM を付けた縦長の動画を作ります" />
      <p className="text-sm text-slate-600">
        今週あと <b className="tabular-nums text-slate-900">{left}</b> 本作れます<span className="text-xs text-slate-400">（1週間に {WEEKLY_LIMIT} 本まで・月曜にもどります）</span>
      </p>
      <ReelMaker bgm={bgm ?? []} disabled={left === 0} />
      <RulesEditor rules={rules ?? []} />
      <ul className="space-y-1 text-xs text-slate-500">
        <li>・テロップは、映像に合うキャッチコピーを AI が付けます{process.env.OPENAI_API_KEY ? "。話している動画には、話した言葉の字幕も付きます" : "（話した言葉の字幕は準備中です）"}</li>
        <li>・元の動画が仕上がりの秒数より短いときは、元の長さで作ります</li>
        <li>・お客様の顔が写る動画は、載せてよいか確かめてから使ってください</li>
      </ul>

      <section className="space-y-2">
        <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400">作ったリール</h2>
        {done.length ? (
          <div className="divide-y divide-slate-100 rounded-md border border-line bg-white">
            {done.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-800">{r.title || `${r.target_seconds}秒のリール`}</p>
                  <p className="text-xs text-slate-500">
                    {jst(r.created_at)}・{r.status === "done" ? `${Math.round(Number(r.duration ?? r.target_seconds))}秒` : r.status === "error" ? <span className="text-accent">作れませんでした：{r.error}</span> : r.stage}
                  </p>
                </div>
                {r.urls?.url && (
                  <a href={r.urls.url} target="_blank" className="shrink-0 text-xs font-bold text-brand">
                    見る
                  </a>
                )}
                {r.urls?.downloadUrl && (
                  <a href={r.urls.downloadUrl} className="shrink-0 text-xs font-bold text-brand">
                    保存
                  </a>
                )}
                <DeleteReel id={r.id} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">まだありません</p>
        )}
      </section>
    </div>
  );
}
