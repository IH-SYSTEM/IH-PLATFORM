import { requireStaff } from "@/lib/auth";
import type { FileRow } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileList } from "@/app/files/file-list";

export const metadata = { title: "書類" };

// 自分の書類（雇用契約書・源泉徴収票など、会社が本人向けに公開したもの）
export default async function MyDocumentsPage() {
  const me = await requireStaff();
  const { data: files } = await createAdminClient()
    .from("files")
    .select("*")
    .eq("owner_staff_id", me.id)
    .eq("status", "ready")
    .eq("visible_to_owner", true)
    .order("created_at", { ascending: false })
    .returns<FileRow[]>();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">書類</h1>
      <p className="text-sm text-slate-500">雇用契約書・労働条件通知書・源泉徴収票など、会社から受け取った書類です</p>
      <section className="rounded-md border border-line bg-white px-4 py-2">
        <FileList files={files ?? []} />
      </section>
    </div>
  );
}
