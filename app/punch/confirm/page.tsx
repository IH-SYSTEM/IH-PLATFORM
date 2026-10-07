import { toJSTTimeString } from "@/lib/business-day";
import { punchStatus, verifyTicket } from "@/lib/punch";
import { createAdminClient } from "@/lib/supabase/admin";
import { PunchCard } from "../punch-card";
import { PunchButtons } from "./punch-buttons";
import { punch } from "./actions";

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

  return (
    <PunchCard store={store?.name} title={`${staff.name}さん`}>
      <PunchButtons
        statusLabel={status.kind === "working" ? `勤務中（出勤 ${toJSTTimeString(status.checkinTime)}）` : "まだ出勤していません"}
        mode={status.kind === "working" ? "check_out" : "check_in"}
        checkIn={punch.bind(null, raw, "check_in")}
        checkOut={punch.bind(null, raw, "check_out")}
      />
    </PunchCard>
  );
}
