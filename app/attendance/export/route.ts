import type { NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { formatMinutes, toJSTTimeLabel } from "@/lib/business-day";
import { resolveView } from "../view";

// 勤怠の CSV。画面と同じ条件・同じ範囲（店長は担当店舗だけ）。Excel で文字化けしないよう BOM を付ける
export async function GET(request: NextRequest) {
  const me = await getCurrentStaff();
  if (!me) return new Response("ログインが必要です", { status: 401 });
  const q = request.nextUrl.searchParams;
  const view = await resolveView(me, { store: q.get("store"), month: q.get("month"), staff: q.get("staff") });
  if (!view) return new Response("勤怠を見る権限がありません", { status: 403 });

  const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = [
    ["日付", "スタッフ", "店舗", "出勤", "退勤", "休憩（分）", "実働（分）", "実働"].map(cell).join(","),
    ...view.rows.map((r) =>
      [
        r.date,
        r.staff_name,
        r.store_name,
        toJSTTimeLabel(r.checkin_time, r.date),
        r.checkout_time ? toJSTTimeLabel(r.checkout_time, r.date) : "未退勤",
        r.checkout_time ? r.break_minutes : "",
        r.worked ?? "",
        formatMinutes(r.worked),
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${view.month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
