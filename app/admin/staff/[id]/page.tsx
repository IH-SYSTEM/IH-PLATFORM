import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAFF_COLUMNS, type StaffRecord } from "@/lib/staff";
import { StaffForm } from "../staff-form";
import { TempPasswordPanel } from "../temp-password";
import { WageHistory } from "../wage-history";
import { addWage, deleteLatestWage } from "../wage-actions";
import { businessDayJST } from "@/lib/business-day";
import { saveStaff, setTempPassword } from "../actions";
import { audit } from "@/lib/audit";
import { FILE_CATEGORIES, type FileRow } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileList } from "@/app/files/file-list";
import { FileUploader } from "@/app/files/file-uploader";

export default async function StaffEditPage({ params, searchParams }: PageProps<"/admin/staff/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();

  const [{ data: staff }, { data: stores }, { data: companies }] = await Promise.all([
    supabase.from("staff").select(STAFF_COLUMNS).eq("id", id).maybeSingle<StaffRecord>(),
    supabase.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }).order("name"),
    supabase.from("companies").select("id, name").eq("is_active", true).order("sort_order"),
  ]);
  if (!staff) notFound();
  // マイナンバー・口座など個人情報を表示するページなので、開いたことを記録する
  await audit({ actor: me.id, action: "view", targetType: "staff", targetId: staff.id, subject: staff.id });
  const [{ data: wageRows }, { data: names }] = await Promise.all([
    createAdminClient().from("staff_wage_history").select("id, valid_from, valid_to, employment_type, amount, note, created_by").eq("staff_id", staff.id).order("valid_from", { ascending: false }),
    createAdminClient().from("staff").select("id, name"),
  ]);
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name]));
  const { data: files } = await createAdminClient()
    .from("files")
    .select("*")
    .eq("owner_staff_id", staff.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .returns<FileRow[]>();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/admin/staff" className="text-sm text-slate-500 hover:text-slate-800">
          ← スタッフ一覧
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {staff.name}
          {staff.retired && <span className="ml-3 rounded-full bg-slate-200 px-2.5 py-1 align-middle text-xs font-medium text-slate-600">退職</span>}
        </h1>
      </div>

      {!staff.retired && <TempPasswordPanel action={setTempPassword.bind(null, staff.id)} />}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">書類</h2>
        <p className="mt-0.5 text-xs text-slate-500">雇用契約書・源泉徴収票など。「本人のマイページに表示」にしたものは、本人も見られます。開いた記録は操作ログに残ります</p>
        <div className="mt-3">
          <FileList files={files ?? []} canDelete showVisibility />
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <FileUploader
            ownerStaffId={staff.id}
            categories={Object.entries(FILE_CATEGORIES).map(([value, c]) => ({ value, label: c.label }))}
            allowVisibilityToggle
            label="書類をアップロード"
          />
        </div>
      </section>

      {staff.attachments.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">添付書類</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {staff.attachments.map((a) => (
              <li key={a.url}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                  {a.name}
                </a>
                {a.uploadedAt && <span className="ml-2 text-xs text-slate-400">{a.uploadedAt}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <WageHistory
        rows={(wageRows ?? []).map((r) => ({ ...r, by: r.created_by ? (nameOf.get(r.created_by) ?? null) : null }))}
        today={businessDayJST()}
        add={addWage.bind(null, staff.id)}
        removeLatest={deleteLatestWage.bind(null, staff.id)}
      />

      <StaffForm
        staff={staff}
        stores={stores ?? []}
        companies={companies ?? []}
        action={saveStaff.bind(null, staff.id)}
        isSelf={staff.id === me.id}
        canGrantSuperadmin={me.permission === "superadmin"}
        createdNotice={created === "1"}
      />
    </div>
  );
}
