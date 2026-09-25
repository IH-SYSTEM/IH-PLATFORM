import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAFF_COLUMNS, type StaffRecord } from "@/lib/staff";
import { StaffForm } from "../staff-form";
import { PasswordLinkPanel } from "../password-link";
import { issuePasswordLink, saveStaff } from "../actions";

export default async function StaffEditPage({ params, searchParams }: PageProps<"/admin/staff/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();

  const [{ data: staff }, { data: stores }] = await Promise.all([
    supabase.from("staff").select(STAFF_COLUMNS).eq("id", id).maybeSingle<StaffRecord>(),
    supabase.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }).order("name"),
  ]);
  if (!staff) notFound();

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

      {!staff.retired && <PasswordLinkPanel action={issuePasswordLink.bind(null, staff.id)} />}

      {staff.attachments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">添付書類</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {staff.attachments.map((a) => (
              <li key={a.url}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {a.name}
                </a>
                {a.uploadedAt && <span className="ml-2 text-xs text-slate-400">{a.uploadedAt}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <StaffForm
        staff={staff}
        stores={stores ?? []}
        action={saveStaff.bind(null, staff.id)}
        isSelf={staff.id === me.id}
        canGrantSuperadmin={me.permission === "superadmin"}
        createdNotice={created === "1"}
      />
    </div>
  );
}
