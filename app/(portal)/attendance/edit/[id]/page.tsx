import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { businessDayJST, toJSTTimeLabel, toJSTTimeString } from "@/lib/business-day";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAttendance, saveAttendance } from "../actions";
import { EDIT_REASONS } from "../reasons";
import { EditForm } from "./edit-form";

export const metadata = { title: "打刻修正" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 入力欄に入れる 'HH:MM'。打刻がなければ空（表示用の「—」を入れると保存できなくなる）
const timeValue = (iso: string | null) => (iso ? toJSTTimeString(iso) : "");

// 本部の打刻修正。id が "new" なら、打刻のない日の記録を追加する
export default async function AttendanceEditPage({ params, searchParams }: PageProps<"/attendance/edit/[id]">) {
  const me = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();
  const isNew = id === "new";

  const { data: row } = isNew
    ? { data: null }
    : await admin.from("attendance").select("id, staff_id, store_id, date, checkin_time, checkout_time, break_minutes, source").eq("id", id).maybeSingle();
  if (!isNew && !row) notFound();

  const [{ data: stores }, { data: staff }, { data: edits }] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("sort_order", { nullsFirst: false }),
    admin.from("staff").select("id, name, furigana").eq("retired", false).order("furigana"),
    row
      ? admin.from("attendance_edits").select("action, reason, note, before, after, edited_by, edited_at").eq("staff_id", row.staff_id).eq("date", row.date).order("edited_at", { ascending: false })
      : Promise.resolve({ data: [] as { action: string; reason: string; note: string | null; edited_by: string; edited_at: string }[] }),
  ]);
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));
  const editorIds = [...new Set((edits ?? []).map((e) => e.edited_by))].filter((e) => !nameOf.has(e));
  if (editorIds.length) {
    const { data: more } = await admin.from("staff").select("id, name").in("id", editorIds);
    for (const m of more ?? []) nameOf.set(m.id, m.name);
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  return (
    <div className="space-y-5">
      <Link href="/attendance" className="inline-block text-sm text-slate-500 hover:text-brand">
        ← 勤怠
      </Link>
      <div>
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
          修正者：{me.name}（ログイン中）
          <span className="font-normal text-brand/70">— 保存すると、この名前で変更履歴に残ります</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{isNew ? "打刻の記録を追加" : "打刻修正"}</h1>
        {row && (
          <p className="mt-1 text-sm text-slate-600">
            {nameOf.get(row.staff_id)}さん ／ {storeName.get(row.store_id) ?? "—"} ／ {row.date}
            （今の記録：出勤 {toJSTTimeLabel(row.checkin_time, row.date)}・退勤 {row.checkout_time ? toJSTTimeLabel(row.checkout_time, row.date) : "未退勤"}）
          </p>
        )}
      </div>

      <EditForm
        isNew={isNew}
        reasons={EDIT_REASONS}
        staff={(staff ?? []).map((s) => ({ value: s.id, label: s.name }))}
        stores={(stores ?? []).map((s) => ({ value: s.id, label: s.name }))}
        initial={{
          staff: str(sp.staff),
          store: str(sp.store),
          date: str(sp.date) || businessDayJST(),
          checkin: timeValue(row?.checkin_time ?? null),
          checkout: timeValue(row?.checkout_time ?? null),
          break_minutes: String(row?.break_minutes ?? 0),
        }}
        save={saveAttendance.bind(null, row?.id ?? null)}
        remove={row ? deleteAttendance.bind(null, row.id) : null}
      />

      {edits && edits.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">この日の変更履歴</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-white text-sm">
            {edits.map((e, i) => (
              <li key={i} className="px-4 py-2.5">
                <span className="mr-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold text-brand">修正：{nameOf.get(e.edited_by) ?? "—"}</span>
                <span className="font-medium text-slate-800">{e.reason}</span>
                <span className="ml-2 text-xs text-slate-500">{when(e.edited_at)}</span>
                {e.note && <p className="text-xs text-slate-500">メモ：{e.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
