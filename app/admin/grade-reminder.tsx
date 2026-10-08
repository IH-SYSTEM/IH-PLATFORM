import Link from "next/link";
import { businessDayJST } from "@/lib/business-day";
import { createAdminClient } from "@/lib/supabase/admin";

// 毎年6月1日〜9月30日に、社会保険の等級（標準報酬月額）の見直しを促す。
// 7月10日までに算定基礎届を出し、届いた決定通知の等級を9月分から使うため、今年の6月以後に等級を入れ直していない加入者を一覧にする
export async function GradeReminder() {
  const today = businessDayJST();
  const md = today.slice(5);
  if (md < "06-01" || md > "09-30") return null;
  const since = `${today.slice(0, 4)}-06-01`;

  const { data } = await createAdminClient().from("staff").select("id, name, department_name, payroll_master").eq("retired", false);
  const pending = (data ?? []).filter((s) => {
    const si = (s.payroll_master as { socialInsurance?: { enrolled?: boolean; gradeUpdatedAt?: string } } | null)?.socialInsurance;
    return si?.enrolled && (!si.gradeUpdatedAt || si.gradeUpdatedAt < since);
  });
  if (!pending.length) return null;

  return (
    <section className="rounded-md border border-amber-300 bg-amber-50 p-5">
      <h2 className="text-sm font-bold text-amber-900">社会保険の等級の見直し（定時決定）</h2>
      <p className="mt-1 text-sm text-amber-800">
        7月10日までに算定基礎届を出し、日本年金機構から届いた決定通知の等級（9月分から適用）を、スタッフ管理の「等級」に入力してください。まだ今年の等級を入れていない加入者：{pending.length}名
      </p>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {pending.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/staff/${s.id}`} className="rounded-full bg-white px-3 py-1 text-amber-900 ring-1 ring-amber-200 hover:ring-amber-500">
              {s.name}
              <span className="ml-1 text-xs text-amber-700">{s.department_name ?? ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
