import "server-only";
import type { CurrentStaff } from "@/lib/auth";
import { attendanceScope, inScope, loadAttendance } from "@/lib/attendance";
import { businessDayJST } from "@/lib/business-day";
import { createAdminClient } from "@/lib/supabase/admin";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 画面と CSV で共通の、表示条件の解決。範囲外の店舗やスタッフを URL で指定されても見せない
 * （店長が別の店舗の id を URL に入れても、自分の担当店舗に戻す）
 */
export async function resolveView(me: CurrentStaff, params: { store?: unknown; month?: unknown; staff?: unknown }) {
  const scope = await attendanceScope(me);
  if (!scope) return null;
  const admin = createAdminClient();

  let storesQuery = admin.from("stores").select("id, name, code").eq("is_active", true).order("sort_order", { nullsFirst: false }).order("name");
  if (!scope.all) storesQuery = storesQuery.in("id", scope.storeIds);
  const { data: storeRows } = await storesQuery;
  const stores = storeRows ?? [];

  const wanted = typeof params.store === "string" ? params.store : "";
  const store = scope.all
    ? wanted === "all" || stores.some((s) => s.id === wanted) ? wanted || "all" : "all"
    : stores.some((s) => s.id === wanted) ? wanted : (stores[0]?.id ?? "");
  const storeIds = store === "all" ? [] : [store];
  const month = typeof params.month === "string" && MONTH.test(params.month) ? params.month : businessDayJST().slice(0, 7);

  // スタッフの候補：その店舗の在籍スタッフ＋その月にその店舗で打刻した人（他店からのヘルプ）
  const monthRows = await loadAttendance({ month, storeIds });
  let staffQuery = admin.from("staff").select("id, name, furigana, store_id").eq("retired", false);
  if (storeIds.length) staffQuery = staffQuery.in("store_id", storeIds);
  const { data: members } = await staffQuery;
  const candidates = new Map((members ?? []).map((s) => [s.id, { id: s.id, name: s.name, furigana: s.furigana ?? "" }]));
  for (const r of monthRows) if (!candidates.has(r.staff_id)) candidates.set(r.staff_id, { id: r.staff_id, name: r.staff_name, furigana: "" });
  const staff = [...candidates.values()].sort((a, b) => (a.furigana || a.name).localeCompare(b.furigana || b.name, "ja"));

  const staffId = typeof params.staff === "string" && candidates.has(params.staff) ? params.staff : "";
  const rows = staffId ? monthRows.filter((r) => r.staff_id === staffId) : monthRows;

  return { scope, stores, store, storeIds, month, staff, staffId, rows, inScope: (id: string | null) => inScope(scope, id) };
}
