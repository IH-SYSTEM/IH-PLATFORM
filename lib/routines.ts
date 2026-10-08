import "server-only";
import type { CurrentStaff } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { currentPeriod } from "@/lib/routine-period";
import { createAdminClient } from "@/lib/supabase/admin";

export type RoutineTodo = { id: string; label: string; href: string; overdue: boolean; manual: boolean; periodStart: string };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * 定型業務のうち、いまの回でまだ終わっていないもの。
 * 担当者には自分の分を、担当でない管理者には「期限を過ぎて止まっているもの」だけを返す
 */
export async function routineTodos(me: CurrentStaff): Promise<RoutineTodo[]> {
  if (!me.isAdmin) return [];
  const admin = createAdminClient();
  const today = businessDayJST();
  const { data: routines } = await admin.from("routines").select("*").eq("is_active", true).order("sort_order");
  if (!routines?.length) return [];

  const periods = routines.map((r) => ({ r, ...currentPeriod(r, today) }));
  const oldest = periods.map((p) => p.start).sort()[0];
  const [{ data: done }, { data: imports }, { data: staff }] = await Promise.all([
    admin.from("routine_done").select("routine_id, period_start").gte("period_start", oldest),
    admin.from("pos_imports").select("store_id, created_at").gte("created_at", `${oldest}T00:00:00+09:00`),
    admin.from("staff").select("id, name"),
  ]);
  const doneKey = new Set((done ?? []).map((d) => `${d.routine_id}:${d.period_start}`));
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.name.split(/[\s　]/)[0]]));

  const out: RoutineTodo[] = [];
  for (const { r, start, due } of periods) {
    const finished =
      r.check_kind === "pos_import"
        ? (imports ?? []).some((i) => i.store_id === r.check_store_id && i.created_at >= new Date(`${start}T00:00:00+09:00`).toISOString())
        : doneKey.has(`${r.id}:${start}`);
    if (finished) continue;
    const overdue = today > due;
    const mine = (r.assignee_ids as string[]).includes(me.id);
    if (!mine && !overdue) continue;
    const who = mine ? "" : `（担当：${(r.assignee_ids as string[]).map((id) => nameOf.get(id) ?? "—").join("・")}）`;
    out.push({
      id: r.id,
      label: `${r.title}${overdue ? `　${md(due)}が期限でした` : `　${md(due)}まで`}${who}`,
      href: r.href,
      overdue,
      manual: mine && r.check_kind === "manual",
      periodStart: start,
    });
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue));
}
