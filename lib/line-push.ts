import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * IKKOU HOLDINGS NEWS（Messaging API）から送る。送ったものはすべて line_messages に記録する。
 * アクセストークンが未設定なら送らずに「skipped」として記録する（報告や承認そのものは止めない）
 */
export type LineKind = "manual" | "announcement" | "labor_report" | "urgent" | "report" | "other";

export async function sendLine(opts: {
  kind: LineKind;
  text: string;
  recipients: { staffId?: string | null; lineUserId: string | null }[];
  segment?: unknown;
  createdBy?: string | null;
}): Promise<{ sent: number; skipped?: string; messageId?: string }> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  const linked = opts.recipients.filter((r) => r.lineUserId);
  const ids = [...new Set(linked.map((r) => r.lineUserId!))];
  let sent = 0;
  let error: string | null = token ? null : "Messaging API のアクセストークンが未設定";
  if (token) {
    // 1回で500人まで（multicast）
    for (let i = 0; i < ids.length; i += 500) {
      const to = ids.slice(i, i + 500);
      try {
        const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to, messages: [{ type: "text", text: opts.text.slice(0, 5000) }] }),
        });
        if (res.ok) sent += to.length;
        else error = `${res.status} ${(await res.text()).slice(0, 300)}`;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }
  const status = !token ? "skipped" : sent === ids.length ? "sent" : sent ? "partial" : "failed";
  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("line_messages")
    .insert({
      kind: opts.kind,
      body: opts.text.slice(0, 5000),
      segment: opts.segment ?? null,
      recipient_count: ids.length,
      unlinked_count: opts.recipients.length - linked.length,
      sent_count: sent,
      status,
      error,
      created_by: opts.createdBy ?? null,
    })
    .select("id")
    .single();
  if (msg) {
    const okAll = status === "sent";
    const rows = opts.recipients.map((r) => ({ message_id: msg.id, staff_id: r.staffId ?? null, line_user_id: r.lineUserId, status: !r.lineUserId ? "unlinked" : okAll ? "sent" : status === "skipped" ? "failed" : "failed" }));
    for (let i = 0; i < rows.length; i += 1000) await admin.from("line_message_recipients").insert(rows.slice(i, i + 1000));
  }
  if (error) console.error("LINE send", opts.kind, error);
  return { sent, skipped: token ? undefined : error ?? undefined, messageId: msg?.id };
}

/** 以前からの呼び方（LINEのIDだけ渡す）。記録の種類は kind で渡す */
export async function pushLine(lineUserIds: (string | null | undefined)[], text: string, kind: LineKind = "other") {
  return sendLine({ kind, text, recipients: lineUserIds.filter((v): v is string => !!v).map((lineUserId) => ({ lineUserId })) });
}

/** 今月の送信数と上限（プランの無料通数）。トークンがなければ null */
export async function lineQuota(): Promise<{ limit: number | null; used: number } | null> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return null;
  const h = { Authorization: `Bearer ${token}` };
  try {
    const [q, c] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers: h, cache: "no-store" }).then((r) => r.json()),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: h, cache: "no-store" }).then((r) => r.json()),
    ]);
    return { limit: q.type === "limited" ? q.value : null, used: c.totalUsage ?? 0 };
  } catch {
    return null;
  }
}
