import { businessDayJST, toJSTTimeString } from "@/lib/business-day";
import { punchStatus, verifyTicket } from "@/lib/punch";
import { createAdminClient } from "@/lib/supabase/admin";
import { PunchCard } from "../punch-card";
import { PunchButtons } from "./punch-buttons";
import { confirmPunchNotice, punch } from "./actions";
import { checklistFor, pendingNotices } from "@/lib/workboard";
import { OVERTIME_CATEGORIES, OVERTIME_MINUTES, checkInFrom, hhmmJST, shiftOn } from "@/lib/punch-rules";

export const metadata = { title: "打刻" };

// LINE で本人確認したあとの画面。名前と今の状態を出し、出勤または退勤のボタンを出す
export default async function PunchConfirmPage({ searchParams }: PageProps<"/punch/confirm">) {
  const { ticket } = await searchParams;
  const raw = typeof ticket === "string" ? ticket : "";
  const t = raw ? verifyTicket(raw) : null;
  if (!t) {
    return <PunchCard title="確認画面の有効期限が切れました" body="店内の画面のQRを、もう一度読み取ってください。" tone="error" />;
  }

  const admin = createAdminClient();
  const [{ data: staff }, { data: tok }, status] = await Promise.all([
    admin.from("staff").select("name").eq("id", t.staffId).single(),
    admin.from("punch_tokens").select("store_id, consumed_at").eq("token", t.token).eq("claimed_by", t.staffId).maybeSingle(),
    punchStatus(t.staffId),
  ]);
  const { data: store } = tok ? await admin.from("stores").select("name").eq("id", tok.store_id).single() : { data: null };
  if (!staff || !tok || tok.consumed_at) {
    return <PunchCard title="このQRはもう使えません" body="店内の画面のQRを、もう一度読み取ってください。" tone="error" />;
  }

  if (status.kind === "done") {
    return (
      <PunchCard
        store={store?.name}
        title={`${staff.name}さん、本日は退勤済みです`}
        body={`出勤 ${toJSTTimeString(status.checkinTime)} ／ 退勤 ${toJSTTimeString(status.checkoutTime)}。打刻に間違いがあれば、店長に伝えて打刻修正で直してください。`}
      />
    );
  }

  // ワークボード：この打刻の前に確かめてもらうお知らせと、退勤チェックリスト
  const mode = status.kind === "working" ? "check_out" : "check_in";
  // シフト：出勤はシフト開始の15分前から。退勤はシフトの終わりから15分以上なら残業の理由が要る（2026-10-16）
  const shiftDate = status.kind === "working" ? ((await admin.from("attendance").select("date").eq("id", status.attendanceId).single()).data?.date ?? businessDayJST()) : businessDayJST();
  const [notices, checklist, shift] = await Promise.all([
    pendingNotices({ staffId: t.staffId, storeId: tok.store_id, timing: mode, today: businessDayJST() }),
    mode === "check_out" ? checklistFor(tok.store_id) : Promise.resolve([]),
    shiftOn(t.staffId, shiftDate),
  ]);
  const from = checkInFrom(shift);
  const shiftInfo = {
    text: shift ? `今日のシフト ${shift.startText}〜${shift.endText}` : "今日はシフトがありません",
    noShift: !shift,
    checkInFrom: from !== null ? new Date(from).toISOString() : null,
    checkInFromText: from !== null ? hhmmJST(from) : null,
    overtimeFrom: shift ? new Date(shift.end + OVERTIME_MINUTES * 60_000).toISOString() : null,
    shiftEndText: shift?.endText ?? null,
  };

  return (
    <PunchCard store={store?.name} title={`${staff.name}さん`}>
      <PunchButtons
        statusLabel={status.kind === "working" ? `勤務中（出勤 ${toJSTTimeString(status.checkinTime)}）` : "まだ出勤していません"}
        mode={mode}
        checkIn={punch.bind(null, raw, "check_in")}
        checkOut={punch.bind(null, raw, "check_out")}
        notices={notices.map((n) => ({ id: n.id, title: n.title, body: n.body, importance: n.importance }))}
        checklist={checklist}
        confirm={confirmPunchNotice.bind(null, raw)}
        shift={shiftInfo}
        overtimeCategories={[...OVERTIME_CATEGORIES]}
      />
    </PunchCard>
  );
}
