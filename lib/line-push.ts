import "server-only";

/**
 * IKKOU HOLDINGS NEWS（Messaging API）から個別にメッセージを送る。
 * アクセストークンが未設定なら送らずに終わる（報告や承認そのものは止めない）
 */
export async function pushLine(lineUserIds: (string | null | undefined)[], text: string): Promise<{ sent: number; skipped?: string }> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return { sent: 0, skipped: "Messaging API のアクセストークンが未設定" };
  const to = [...new Set(lineUserIds.filter((v): v is string => !!v))];
  let sent = 0;
  for (const id of to) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: id, messages: [{ type: "text", text }] }),
      });
      if (res.ok) sent += 1;
      else console.error("LINE push failed", res.status, await res.text());
    } catch (e) {
      console.error("LINE push failed", e);
    }
  }
  return { sent };
}
