import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StaffForm } from "../staff-form";
import { saveStaff } from "../actions";

export default async function StaffNewPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { nullsFirst: false })
    .order("name");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/admin/staff" className="text-sm text-slate-500 hover:text-slate-800">
          ← スタッフ一覧
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">スタッフを登録</h1>
        <p className="mt-1 text-sm text-slate-500">
          登録するとログインアカウントも作成されます。登録後に「パスワード設定リンク」を発行して本人に渡してください。
        </p>
      </div>
      <StaffForm
        staff={null}
        stores={stores ?? []}
        action={saveStaff.bind(null, null)}
        isSelf={false}
        canGrantSuperadmin={me.permission === "superadmin"}
        createdNotice={false}
      />
    </div>
  );
}
