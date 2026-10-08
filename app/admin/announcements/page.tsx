import { KIND_LABEL, type Announcement } from "@/lib/announcements";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/shell/page-header";
import { deleteAnnouncement, postAnnouncement } from "./actions";
import { PostForm } from "./post-form";

export const metadata = { title: "お知らせ" };

const when = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// ホームに出す「会社からのお知らせ」「システムの更新」「全国ニュース」を載せる・外す
export default async function AnnouncementsPage() {
  const admin = createAdminClient();
  const [{ data: list }, { data: companies }, { data: stores }] = await Promise.all([
    admin.from("announcements").select("*").order("published_at", { ascending: false }).limit(50),
    admin.from("companies").select("id, name").eq("is_active", true).order("sort_order"),
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
  ]);
  const nameOf = new Map([...(companies ?? []), ...(stores ?? [])].map((x) => [x.id, x.name]));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="お知らせ" description="ホームの「会社からのお知らせ」「システムの更新」「全国ニュース」に載せる内容です" />
      <PostForm companies={companies ?? []} stores={stores ?? []} action={postAnnouncement} />
      <section>
        <h2 className="mb-3 text-xs font-bold tracking-[0.2em] text-slate-400">載せているもの</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200 bg-white">
          {((list ?? []) as Announcement[]).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">{KIND_LABEL[a.kind]}</span>
                  {when(a.published_at)}
                  {a.pinned && <span className="ml-2 font-bold text-accent">固定</span>}
                  <span className="ml-2">{a.audience === "all" ? "全員" : a.audience_ids.map((id) => nameOf.get(id) ?? "—").join("・")}</span>
                </p>
                <p className="mt-1 font-bold text-slate-900">{a.title}</p>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
                    {a.source ? `${a.source}：` : ""}
                    {a.url}
                  </a>
                )}
              </div>
              <form action={deleteAnnouncement.bind(null, a.id)}>
                <button className="text-xs text-slate-400 hover:text-accent">外す</button>
              </form>
            </li>
          ))}
          {!list?.length && <li className="px-4 py-6 text-center text-sm text-slate-400">まだありません</li>}
        </ul>
      </section>
    </div>
  );
}
